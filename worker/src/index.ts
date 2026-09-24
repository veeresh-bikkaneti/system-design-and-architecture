import { EXAM_PASS_THRESHOLD, publicQuestions, scoreSubmission } from './exam';
import {
  checkMagicLink,
  checkRateLimit,
  confirmMagicLink,
  currentWindowHour,
  exchangeCode,
  isValidEmail,
  normalizeEmail,
  requestMagicLink,
  revokeSession,
  validateSession,
} from './auth';
import { sha256Hex } from './crypto';
import { handleQaChat } from './qa/routes';

export interface Env {
  DB: D1Database;
  // Course Q&A agent (P2): Workers AI binding (see [ai] in wrangler.toml).
  // Absent under plain `wrangler dev` without AI support -- routes guard on
  // this and return a clear error rather than crashing (see routes.ts).
  AI: Ai;
  // Optional model-id override; defaults to QA_DEFAULT_MODEL_ID in
  // worker/src/qa/model.ts. Set via [vars] in wrangler.toml.
  QA_MODEL_ID?: string;
  // Unset in local dev -- see auth.ts's sendMagicLinkEmail for what these
  // control. DEV_MODE must be set alongside RESEND_API_KEY being absent
  // for local testing to echo a magic link back instead of emailing it;
  // it lives only in a developer's own gitignored .dev.vars, never in the
  // committed wrangler.toml, so a real deployment can't have it by accident.
  RESEND_API_KEY?: string;
  RESEND_FROM_ADDRESS?: string;
  DEV_MODE?: string;
}

interface CredentialRow {
  id: string;
  email: string;
  course_slug: string;
  score: number;
  total_questions: number;
  issued_at: string;
  badge_status: string;
  badge_url: string | null;
}

// Exported for unit tests.
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

// A public verify page must not expose a learner's full email to any visitor
// who has the link. Show at most 2 characters of the local part, and never
// more than half of it -- a 1-2 character local part (common: initials,
// short handles) must come out fully masked, not fully exposed.
// Exported for unit tests.
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visibleCount = Math.min(2, Math.floor(local.length / 2));
  const visible = local.slice(0, visibleCount);
  return `${visible}${'*'.repeat(Math.max(local.length - visibleCount, 3))}@${domain}`;
}

// Only ever render a badge URL that is a well-formed https: link. escapeHtml
// alone stops attribute-breakout/script-tag injection but does NOT stop a
// javascript:/data: value from becoming a live, clickable link -- those
// contain none of the characters escapeHtml touches. Reject anything else.
// Exported for unit tests.
export function safeHttpsUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function page(title: string, body: string, status: number): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #f8fafc; color: #0f172a; margin: 0; padding: 2rem 1rem;
    display: flex; justify-content: center;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0f172a; color: #f1f5f9; }
    .card { background: #1e293b !important; border-color: #334155 !important; }
    .muted { color: #94a3b8 !important; }
  }
  .card {
    max-width: 32rem; width: 100%; background: #fff; border: 1px solid #e2e8f0;
    border-radius: 0.75rem; padding: 2rem; margin-top: 2rem;
  }
  h1 { font-size: 1.25rem; margin: 0 0 1rem; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 0.5rem 1rem; margin: 1rem 0; }
  dt { font-weight: 600; }
  dd { margin: 0; }
  .muted { color: #64748b; font-size: 0.875rem; }
  .badge-ok { color: #16a34a; font-weight: 600; }
  .badge-no { color: #dc2626; font-weight: 600; }
</style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // These pages are fully self-contained (no external subresources),
      // so the headers below apply unconditionally. no-referrer also keeps
      // the credential id (which lives in the page URL) from leaking to
      // the badge provider when a learner clicks "View Open Badge", and
      // DENY keeps the "Confirm it's you" sign-in step out of iframes.
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
    },
  });
}

function notFoundPage(id: string): Response {
  return page(
    'Credential not found',
    `<h1><span class="badge-no">✕</span> No credential found</h1>
     <p class="muted">No credential exists with id <code>${escapeHtml(id)}</code>. Check the link and try again.</p>`,
    404,
  );
}

function credentialPage(cred: CredentialRow): Response {
  const issuedDate = new Date(cred.issued_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const safeBadgeUrl = cred.badge_url ? safeHttpsUrl(cred.badge_url) : null;
  const badgeLine =
    cred.badge_status === 'issued' && safeBadgeUrl
      ? `<dt>Badge</dt><dd><a href="${escapeHtml(safeBadgeUrl)}">View Open Badge</a></dd>`
      : '';
  return page(
    'Credential verified',
    `<h1><span class="badge-ok">✓</span> Verified credential</h1>
     <dl>
       <dt>Course</dt><dd>${escapeHtml(cred.course_slug)}</dd>
       <dt>Holder</dt><dd>${escapeHtml(maskEmail(cred.email))}</dd>
       <dt>Score</dt><dd>${escapeHtml(String(cred.score))} / ${escapeHtml(String(cred.total_questions))}</dd>
       <dt>Issued</dt><dd>${escapeHtml(issuedDate)}</dd>
       ${badgeLine}
     </dl>
     <p class="muted">Credential id: ${escapeHtml(cred.id)}</p>`,
    200,
  );
}

const MAX_ATTEMPTS_PER_EMAIL_PER_DAY = 5;
const MAX_ATTEMPTS_PER_IP_PER_DAY = 10;

// Explicit allowlist rather than '*'. Important to be honest about what this
// does and doesn't provide: CORS is enforced by the BROWSER, and it only
// controls whether a page's JS is allowed to read the response -- it does
// NOT stop the request from reaching and being processed by this Worker.
// A page on any origin can still trigger handleExamSubmit's rate-limit
// check and DB write (e.g. via a Content-Type that keeps the browser from
// preflighting at all); this allowlist just keeps such a page from reading
// the JSON result back. Real protection against a *fraudulent credential*
// -- as opposed to a wasted rate-limit slot or a junk audit row -- comes
// from Phase 3/4 requiring a *verified* email before anything is issued,
// not from anything here.
const ALLOWED_ORIGINS = new Set([
  'https://veeresh-bikkaneti.github.io',
  'http://localhost:5173', // vite dev
  'http://localhost:4173', // vite preview
]);

export function corsHeaders(origin: string | null): HeadersInit {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// Shared by every POST JSON handler (exam submit, request-link, exchange).
// Requiring an explicit application/json content-type (rather than
// accepting whatever request.json() can parse) is what actually makes each
// handler's CORS origin allowlist meaningful for a *browser* caller:
// text/plain is one of the CORS "simple request" content-types a browser
// will send without a preflight, which would otherwise let a page on any
// origin reach the handler at all, allowlist or not. This does nothing
// against a direct, non-browser caller (curl, a script) setting this
// header themselves -- that's inherent to any public, unauthenticated
// endpoint. Also parses the body without ever throwing an uncaught
// exception into the caller. Returns the parsed body, or a ready-to-return
// Response for the caller to hand straight back.
const MAX_JSON_BODY_BYTES = 64 * 1024;

/**
 * JSON responses with `x-content-type-options: nosniff`. Browsers never
 * render application/json as HTML anyway; this closes the MIME-sniffing
 * hole for ancient/quirky clients as defense in depth.
 */
export function jsonResponse(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('x-content-type-options', 'nosniff');
  return Response.json(data, { ...init, headers });
}

export async function parseJsonBody(request: Request, cors: HeadersInit): Promise<{ body: unknown } | { errorResponse: Response }> {
  if (!(request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json')) {
    return {
      errorResponse: jsonResponse({ error: 'Content-Type must be application/json' }, { status: 415, headers: cors }),
    };
  }
  // Defense against memory/CPU exhaustion: these endpoints take small
  // payloads (answers, emails, codes), so reject anything absurd before
  // parsing. Check the declared length first, then enforce while reading
  // for chunked bodies with no Content-Length.
  const declared = request.headers.get('Content-Length');
  if (declared !== null && Number(declared) > MAX_JSON_BODY_BYTES) {
    return {
      errorResponse: jsonResponse({ error: 'Request body too large' }, { status: 413, headers: cors }),
    };
  }
  try {
    const reader = request.body?.getReader();
    if (!reader) {
      return { body: await request.json() };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        return {
          errorResponse: jsonResponse({ error: 'Request body too large' }, { status: 413, headers: cors }),
        };
      }
      chunks.push(value);
    }
    const text = new TextDecoder().decode(concatChunks(chunks, total));
    return { body: JSON.parse(text) };
  } catch {
    return { errorResponse: jsonResponse({ error: 'Invalid JSON body' }, { status: 400, headers: cors }) };
  }
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

// Not a secret -- this exists only so raw IPs aren't stored at rest (data
// minimization for the exam_attempts audit trail), not as a cryptographic
// guarantee. Phase 2 deliberately needs zero new secrets/accounts, matching
// its own scope -- identity (Phase 3) is where real secrets first show up.
const IP_HASH_PEPPER = 'sdm-exam-v1';

function hashIp(ip: string): Promise<string> {
  return sha256Hex(`${IP_HASH_PEPPER}:${ip}`);
}

// Per-IP fixed-window throttle for endpoints without their own attempt
// tables (auth verify/exchange/session/logout). Tokens are 256-bit, so
// guessing is infeasible -- this is about bounding D1 read cost under
// flood, not about token secrecy. Skips when CF-Connecting-IP is absent
// (local dev / non-edge), matching the other handlers' convention.
async function throttleByIp(
  request: Request,
  db: D1Database,
  bucket: string,
  maxPerHour: number,
  cors: HeadersInit,
): Promise<Response | null> {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return null;
  const ok = await checkRateLimit(db, `${bucket}:ip:${await hashIp(ip)}`, currentWindowHour(), maxPerHour);
  return ok
    ? null
    : jsonResponse({ error: 'Too many attempts. Try again later.' }, { status: 429, headers: cors });
}

// `column` is a TypeScript literal union, always a hardcoded call-site value,
// never derived from a request -- interpolating it is safe (there is no path
// from client input to this parameter), and this keeps the date-window fix
// below in exactly one place instead of two copies that could drift apart.
async function countAttemptsSince(
  db: D1Database,
  column: 'email' | 'ip_hash',
  value: string,
  sinceIso: string,
): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) as count FROM exam_attempts WHERE ${column} = ? AND started_at >= ?`)
    .bind(value, sinceIso)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

async function handleExamSubmit(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request.headers.get('Origin'));

  const parsed = await parseJsonBody(request, cors);
  if ('errorResponse' in parsed) return parsed.errorResponse;
  const body = parsed.body;

  // The exam is bound to a verified session: the email comes from the
  // session token, never from the client body. A client-supplied email
  // would let anyone burn a victim's daily attempt quota (5/day) or submit
  // attempts attributed to someone else's address.
  const auth = request.headers.get('Authorization') ?? '';
  const sessionToken = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
  if (!sessionToken) {
    return jsonResponse({ error: 'Missing or invalid Authorization header' }, { status: 401, headers: cors });
  }
  const sessionEmail = await validateSession(env, sessionToken);
  if (!sessionEmail) {
    return jsonResponse({ error: 'Invalid or expired session' }, { status: 401, headers: cors });
  }
  const email = sessionEmail;

  const { answers } = (body && typeof body === 'object' ? body : {}) as {
    answers?: unknown;
  };

  // CF-Connecting-IP is set by Cloudflare's edge for all genuine production
  // traffic; it's realistically only absent in local dev or non-edge
  // invocations. Rather than bucket every such caller into one shared
  // 'unknown' identity (which would let them rate-limit each other), just
  // skip the IP-based check when there's no real IP to key on -- the
  // per-email check below still applies regardless.
  const ip = request.headers.get('CF-Connecting-IP');
  const ipHash = ip ? await hashIp(ip) : null;

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [emailAttempts, ipAttempts] = await Promise.all([
    countAttemptsSince(env.DB, 'email', email, sinceIso),
    ipHash ? countAttemptsSince(env.DB, 'ip_hash', ipHash, sinceIso) : Promise.resolve(0),
  ]);

  // Known limitation: this check and the INSERT below aren't atomic (two
  // separate round-trips), so a deliberately concurrent burst of requests
  // from the same caller could each pass the check before any of their own
  // inserts land, slipping past the cap. Acceptable for a free course's
  // practice-exam abuse control today; a real fix would need a D1
  // uniqueness constraint with retry, or a Durable Object as the source of
  // truth for the counter, either of which is more machinery than this
  // deserves right now.
  if (emailAttempts >= MAX_ATTEMPTS_PER_EMAIL_PER_DAY || ipAttempts >= MAX_ATTEMPTS_PER_IP_PER_DAY) {
    return jsonResponse({ error: 'Too many attempts. Try again later.' }, { status: 429, headers: cors });
  }

  // Scored purely server-side against exam.ts's private answer key -- the
  // client-supplied `answers` are never trusted beyond "which option index
  // did they pick per question id", and only the aggregate result below
  // (never per-question correctness) is ever returned.
  const result = scoreSubmission(answers);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO exam_attempts (email, started_at, completed_at, score, total_questions, passed, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(email, now, now, result.score, result.total, result.passed ? 1 : 0, ipHash)
    .run();

  return jsonResponse(result, { headers: cors });
}

async function handleRequestLink(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request.headers.get('Origin'));

  const parsed = await parseJsonBody(request, cors);
  if ('errorResponse' in parsed) return parsed.errorResponse;

  const { email: rawEmail } = (parsed.body && typeof parsed.body === 'object' ? parsed.body : {}) as {
    email?: unknown;
  };
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    return jsonResponse({ error: 'A valid email is required' }, { status: 400, headers: cors });
  }

  const ip = request.headers.get('CF-Connecting-IP');
  const ipHash = ip ? await hashIp(ip) : null;
  const workerOrigin = new URL(request.url).origin;

  const result = await requestMagicLink(env, workerOrigin, email, ipHash);
  if (result.status === 'rate_limited') {
    return jsonResponse({ error: 'Too many attempts. Try again later.' }, { status: 429, headers: cors });
  }
  if (result.status === 'send_failed') {
    return jsonResponse({ error: 'Failed to send the email. Try again shortly.' }, { status: 502, headers: cors });
  }

  // devLink is a working sign-in link: it must never leave the machine, even
  // if DEV_MODE were ever misconfigured in production. Echo it only for
  // loopback origins; anywhere else the body is just { status: 'sent' }.
  // (auth.ts additionally gates devLink on DEV_MODE=true AND no
  // RESEND_API_KEY -- this is the second, independent gate.)
  const originHost = new URL(workerOrigin).hostname.toLowerCase();
  const isLoopbackOrigin =
    originHost === 'localhost' || originHost === '127.0.0.1' || originHost === '[::1]';
  return jsonResponse(
    { status: 'sent', ...(isLoopbackOrigin ? { devLink: result.devLink } : {}) },
    { headers: cors },
  );
}

const EXPIRED_LINK_PAGE = `<h1><span class="badge-no">✕</span> This link is invalid or has expired</h1>
   <p class="muted">Magic links are single-use and expire after 15 minutes. Request a new one.</p>`;

async function handleVerify(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request.headers.get('Origin'));
  const throttled = await throttleByIp(request, env.DB, 'auth_verify', 60, cors);
  if (throttled) return throttled;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return page(
      'Invalid link',
      `<h1><span class="badge-no">✕</span> Invalid link</h1><p class="muted">No token was provided.</p>`,
      400,
    );
  }

  // Two steps, not one: the emailed link only ever reaches the read-only
  // check below. Corporate email gateways commonly pre-fetch links in
  // incoming mail to scan them, which would silently consume a single-use
  // token before the real recipient clicks -- see checkMagicLink's comment
  // in auth.ts. The actual consumption only happens via the second link
  // rendered into THIS response's own HTML (?confirm=1), which a scanner
  // has no reason to discover or follow.
  if (url.searchParams.get('confirm') === '1') {
    const result = await confirmMagicLink(env, token);
    if (result.status === 'invalid_or_expired') {
      return page('Link expired', EXPIRED_LINK_PAGE, 400);
    }
    return new Response(null, { status: 302, headers: { Location: result.redirectUrl } });
  }

  const check = await checkMagicLink(env, token);
  if (!check.valid) {
    return page('Link expired', EXPIRED_LINK_PAGE, 400);
  }

  const confirmUrl = `${url.origin}${url.pathname}?token=${encodeURIComponent(token)}&confirm=1`;
  return page(
    'Confirm sign-in',
    `<h1>Confirm it's you</h1>
     <p class="muted">Click continue to finish signing in.</p>
     <p><a href="${escapeHtml(confirmUrl)}">Continue →</a></p>`,
    200,
  );
}

async function handleExchange(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request.headers.get('Origin'));
  const throttled = await throttleByIp(request, env.DB, 'auth_exchange', 60, cors);
  if (throttled) return throttled;

  const parsed = await parseJsonBody(request, cors);
  if ('errorResponse' in parsed) return parsed.errorResponse;

  const { code } = (parsed.body && typeof parsed.body === 'object' ? parsed.body : {}) as { code?: unknown };
  if (typeof code !== 'string' || !code) {
    return jsonResponse({ error: 'A code is required' }, { status: 400, headers: cors });
  }

  const result = await exchangeCode(env, code);
  if (result.status === 'invalid_or_expired') {
    return jsonResponse({ error: 'Invalid or expired code' }, { status: 400, headers: cors });
  }

  return jsonResponse({ sessionToken: result.sessionToken, email: result.email }, { headers: cors });
}

async function handleGetSession(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request.headers.get('Origin'));
  const throttled = await throttleByIp(request, env.DB, 'auth_session', 180, cors);
  if (throttled) return throttled;
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
  if (!token) {
    return jsonResponse({ error: 'Missing bearer token' }, { status: 401, headers: cors });
  }

  const email = await validateSession(env, token);
  if (!email) {
    return jsonResponse({ error: 'Invalid or expired session' }, { status: 401, headers: cors });
  }

  return jsonResponse({ email }, { headers: cors });
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request.headers.get('Origin'));
  const throttled = await throttleByIp(request, env.DB, 'auth_logout', 60, cors);
  if (throttled) return throttled;
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
  if (!token) {
    return jsonResponse({ error: 'Missing or invalid Authorization header' }, { status: 401, headers: cors });
  }
  // Revoke even an expired token's row: no row, no-op, same 200 either way
  // so logout can't be used to probe token validity.
  await revokeSession(env, token);
  return jsonResponse({ status: 'logged_out' }, { headers: cors });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return jsonResponse({ status: 'ok' });
    }

    // Preflight for the /exam/*, /auth/* and /api/qa/* routes below -- a cross-origin
    // POST with a JSON content-type (or, for /auth/session, an Authorization
    // header) triggers a browser preflight before the real request.
    if (request.method === 'OPTIONS' && (url.pathname.startsWith('/exam/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/qa/'))) {
      return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
    }

    if (url.pathname === '/exam/questions' && request.method === 'GET') {
      return jsonResponse(
        { questions: publicQuestions(), passThreshold: EXAM_PASS_THRESHOLD },
        { headers: corsHeaders(request.headers.get('Origin')) },
      );
    }

    if (url.pathname === '/auth/request-link' && request.method === 'POST') {
      return handleRequestLink(request, env);
    }

    if (url.pathname === '/auth/verify' && request.method === 'GET') {
      return handleVerify(request, env);
    }

    if (url.pathname === '/auth/exchange' && request.method === 'POST') {
      return handleExchange(request, env);
    }

    if (url.pathname === '/auth/session' && request.method === 'GET') {
      return handleGetSession(request, env);
    }

    if (url.pathname === '/auth/logout' && request.method === 'POST') {
      return handleLogout(request, env);
    }

    if (url.pathname === '/exam/submit' && request.method === 'POST') {
      return handleExamSubmit(request, env);
    }

    // Course Q&A agent (Veer): a pure, stateless proxy. See
    // worker/src/qa/routes.ts for the contract.
    if (url.pathname === '/api/qa/chat' && request.method === 'POST') {
      return handleQaChat(request, env);
    }

    const verifyMatch = url.pathname.match(/^\/verify\/([A-Za-z0-9_-]+)$/);
    if (verifyMatch) {
      const id = verifyMatch[1] as string;
      const cred = await env.DB.prepare(
        `SELECT id, email, course_slug, score, total_questions, issued_at, badge_status, badge_url
         FROM credentials WHERE id = ?`,
      )
        .bind(id)
        .first<CredentialRow>();

      return cred ? credentialPage(cred) : notFoundPage(id);
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
