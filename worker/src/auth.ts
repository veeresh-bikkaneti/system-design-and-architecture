// Phase 3: prove ownership of an email via a magic link, then represent
// that as a session. Everything here touches D1 (and, for sending, the
// email provider), so unlike exam.ts this isn't pure/Env-free -- but it's
// kept out of index.ts as its own reviewable unit since the auth surface
// is large enough (and sensitive enough) to want that separation.

import type { Env } from './index';
import { randomToken, sha256Hex } from './crypto';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes
const EXCHANGE_CODE_TTL_MS = 60 * 1000; // 60 seconds -- see exchangeCode()
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_LINK_REQUESTS_PER_EMAIL_PER_HOUR = 5;
const MAX_LINK_REQUESTS_PER_IP_PER_HOUR = 10;

// Where the confirmed-verify step sends the browser, with a short-lived
// exchange code (never the real session -- see exchangeCode()) so the
// (HashRouter) frontend can pick it up. Hardcoded rather than read from the
// request: trusting a client-supplied redirect target on an auth completion
// step is exactly the kind of thing that becomes an open-redirect /
// token-leak bug, so this Worker only ever redirects to the one real course
// origin it's deployed for.
const COURSE_CLAIM_URL = 'https://veeresh-bikkaneti.github.io/system-design-and-architecture/#/claim';

export function normalizeEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

// `column` is a TypeScript literal union, always a hardcoded call-site
// value, never derived from a request -- same reasoning as index.ts's
// countAttemptsSince, which this otherwise duplicates (kept separate
// because it queries a different table with a different shape; the
// duplication here is a plain SQL string, not the subtle date-comparison
// logic that actually needed consolidating in Phase 2).
async function countMagicLinkRequestsSince(
  db: D1Database,
  column: 'email' | 'ip_hash',
  value: string,
  sinceIso: string,
): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) as count FROM magic_links WHERE ${column} = ? AND created_at >= ?`)
    .bind(value, sinceIso)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

interface SendResult {
  sent: boolean;
  // Populated ONLY in explicit local dev mode -- see the two-part gate in
  // sendMagicLinkEmail below. Must never reach a caller in any other state:
  // handing back a working magic link to whoever merely *asked* for one,
  // instead of the person who owns the inbox it was emailed to, would
  // completely defeat the point of proving ownership.
  devLink?: string;
}

async function sendMagicLinkEmail(env: Env, email: string, link: string): Promise<SendResult> {
  if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_ADDRESS ?? 'onboarding@resend.dev',
        to: email,
        subject: 'Your sign-in link',
        html: `<p>Click to continue: <a href="${link}">${link}</a></p><p>This link expires in 15 minutes and can only be used once.</p>`,
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend API error ${res.status}: ${await res.text()}`);
    }
    return { sent: true };
  }

  // No provider configured. This must NOT be treated as "must be local
  // dev" on its own -- an unset secret is exactly the state an incomplete
  // or misconfigured production deployment would silently be in (forgotten
  // during setup, wrong environment, a secret accidentally removed later),
  // and unlike a human operator who'd eventually notice emails aren't
  // arriving, an attacker doesn't need to wait for that: probing
  // /auth/request-link with a victim's email and reading the response is
  // enough to find and exploit a leaking devLink immediately, regardless of
  // whether any real user has tried to log in yet. So the echo path
  // requires a SECOND, explicit, positive opt-in (DEV_MODE) that a real
  // deployment's committed wrangler.toml never sets and only a developer's
  // own gitignored .dev.vars would -- absence of the provider key alone is
  // no longer sufficient. Fail closed (throw, caught by the caller into a
  // clean 'send_failed') whenever that second signal isn't also present.
  if (env.DEV_MODE === 'true') {
    // The link is handed back in the JSON response body (devLink) so a
    // developer can complete the flow locally. It is deliberately NOT
    // logged: a magic link is a bearer credential, and server logs are a
    // classic place for credentials to leak.
    return { sent: false, devLink: link };
  }

  throw new Error('Email sending is not configured (no RESEND_API_KEY, and DEV_MODE is not enabled)');
}

export type RequestLinkResult =
  | { status: 'sent'; devLink?: string }
  | { status: 'rate_limited' }
  | { status: 'send_failed' };

export async function requestMagicLink(
  env: Env,
  workerOrigin: string,
  email: string,
  ipHash: string | null,
): Promise<RequestLinkResult> {
  const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [emailCount, ipCount] = await Promise.all([
    countMagicLinkRequestsSince(env.DB, 'email', email, sinceIso),
    ipHash ? countMagicLinkRequestsSince(env.DB, 'ip_hash', ipHash, sinceIso) : Promise.resolve(0),
  ]);
  // Known limitation, disclosed rather than silently accepted (same shape
  // as the exam endpoint's documented gap, but higher-priority to actually
  // fix given the stakes here are real: a deliberately concurrent burst
  // could over-send actual emails to a real inbox, not just game an
  // internal counter). Not fixed in this phase -- a proper fix needs an
  // atomic counter (its own table with an UPSERT-and-check, or a Durable
  // Object), which is more schema/machinery than the rest of Phase 3
  // warrants blocking on right now.
  if (emailCount >= MAX_LINK_REQUESTS_PER_EMAIL_PER_HOUR || ipCount >= MAX_LINK_REQUESTS_PER_IP_PER_HOUR) {
    return { status: 'rate_limited' };
  }

  const rawToken = randomToken();
  const link = `${workerOrigin}/auth/verify?token=${rawToken}`;

  // Send BEFORE inserting the magic_links row, not after: a failed send
  // (outage, misconfiguration, a transient network error) must not still
  // consume the caller's hourly quota -- a row that was never actually
  // delivered is useless to them, so persisting it anyway would mean a
  // legitimate retry-after-a-transient-failure gets rate-limited instead
  // of just working once the underlying problem clears.
  let sendResult: SendResult;
  try {
    sendResult = await sendMagicLinkEmail(env, email, link);
  } catch (err) {
    // A network-level fetch failure, a non-OK Resend response, and the
    // fail-closed "not configured" throw all land here. Never let any of
    // them reach the caller as an uncaught exception: that would leak a
    // stack trace (internal file paths) in the response body, and the
    // network-failure case is realistic in production too, not just this
    // sandbox's own egress restrictions -- a real Resend outage, a DNS
    // hiccup, or a timeout would hit this exact path.
    console.error('sendMagicLinkEmail failed:', err);
    return { status: 'send_failed' };
  }

  const tokenHash = await sha256Hex(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_MS);
  await env.DB.prepare(
    `INSERT INTO magic_links (token_hash, email, created_at, expires_at, ip_hash) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(tokenHash, email, now.toISOString(), expiresAt.toISOString(), ipHash)
    .run();

  return sendResult.sent ? { status: 'sent' } : { status: 'sent', devLink: sendResult.devLink };
}

export type CheckLinkResult = { valid: true } | { valid: false };

// Read-only: does NOT consume the token. Corporate email gateways commonly
// pre-fetch links in incoming mail to scan them (Microsoft Defender Safe
// Links, Proofpoint URL Defense, etc.) -- if the emailed link itself
// consumed a single-use token on a bare GET, the scanner would silently
// burn it before the real recipient ever clicks, and login would fail
// deterministically for everyone behind such a gateway. So the emailed
// link only ever reaches this check; the actual consumption in
// confirmMagicLink() below happens on a second link that exists only
// inside this response's own HTML, which link-scanners don't discover or
// follow (they scan the received message, not pages that link points to).
export async function checkMagicLink(env: Env, rawToken: string): Promise<CheckLinkResult> {
  const tokenHash = await sha256Hex(rawToken);
  const nowIso = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT 1 FROM magic_links WHERE token_hash = ? AND consumed_at IS NULL AND expires_at >= ?`,
  )
    .bind(tokenHash, nowIso)
    .first();
  return { valid: row !== null };
}

export type ConfirmResult = { status: 'confirmed'; redirectUrl: string } | { status: 'invalid_or_expired' };

export async function confirmMagicLink(env: Env, rawToken: string): Promise<ConfirmResult> {
  const tokenHash = await sha256Hex(rawToken);
  const nowIso = new Date().toISOString();

  // A single UPDATE...RETURNING, not a SELECT followed by a separate
  // UPDATE: the WHERE clause (unconsumed, unexpired) can only be true for
  // one winner among any concurrent callers racing the same token, so the
  // affected-row-count *is* the atomic "did I win" check, with no window
  // for two requests to both see 'not yet consumed' and both proceed.
  const consumed = await env.DB.prepare(
    `UPDATE magic_links SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL AND expires_at >= ? RETURNING email`,
  )
    .bind(nowIso, tokenHash, nowIso)
    .first<{ email: string }>();

  if (!consumed) {
    return { status: 'invalid_or_expired' };
  }

  // Mint a short-lived, single-use EXCHANGE CODE, not the real session --
  // the redirect below puts this in a URL, and a URL ends up in browser
  // history. The real session (7 days) must never sit there for its whole
  // validity window; only this 60-second, single-use code does, and by the
  // time anyone could read it from history it's already expired or
  // consumed. The frontend exchanges it for the real session via a POST
  // body (exchangeCode() below), which never touches a URL.
  const exchangeToken = randomToken();
  const exchangeHash = await sha256Hex(exchangeToken);
  const exchangeExpiresAt = new Date(Date.now() + EXCHANGE_CODE_TTL_MS).toISOString();

  await env.DB.prepare(`INSERT INTO exchange_codes (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(exchangeHash, consumed.email, nowIso, exchangeExpiresAt)
    .run();

  return { status: 'confirmed', redirectUrl: `${COURSE_CLAIM_URL}?code=${exchangeToken}` };
}

export type ExchangeResult = { status: 'exchanged'; sessionToken: string; email: string } | { status: 'invalid_or_expired' };

export async function exchangeCode(env: Env, rawCode: string): Promise<ExchangeResult> {
  const codeHash = await sha256Hex(rawCode);
  const nowIso = new Date().toISOString();

  // Same atomic UPDATE...RETURNING pattern as confirmMagicLink, for the
  // same reason: this is the step that actually mints the long-lived
  // session, so it must be exactly-once even under concurrent exchange
  // attempts for the same code.
  const consumed = await env.DB.prepare(
    `UPDATE exchange_codes SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL AND expires_at >= ? RETURNING email`,
  )
    .bind(nowIso, codeHash, nowIso)
    .first<{ email: string }>();

  if (!consumed) {
    return { status: 'invalid_or_expired' };
  }

  const sessionToken = randomToken();
  const sessionHash = await sha256Hex(sessionToken);
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await env.DB.prepare(`INSERT INTO sessions (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(sessionHash, consumed.email, nowIso, sessionExpiresAt)
    .run();

  return { status: 'exchanged', sessionToken, email: consumed.email };
}

export async function validateSession(env: Env, rawSessionToken: string): Promise<string | null> {
  const tokenHash = await sha256Hex(rawSessionToken);
  const row = await env.DB.prepare(`SELECT email, expires_at FROM sessions WHERE token_hash = ?`)
    .bind(tokenHash)
    .first<{ email: string; expires_at: string }>();

  if (!row || row.expires_at < new Date().toISOString()) return null;
  return row.email;
}
