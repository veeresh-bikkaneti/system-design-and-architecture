// worker/src/qa/oauth.ts — GitHub OAuth login for the course Q&A tutor.
//
// Abuse/DDoS protection for the Workers AI model: /api/qa/chat is
// login-gated, so every chat call costs a GitHub identity (interactive
// OAuth) plus a per-user daily quota. This gates ONLY the tutor (/api/qa/*
// + the Veer widget); lessons, /exam/*, /auth/* and /verify/* are untouched.
//
// SECURITY NOTES (read before changing anything here):
// - SameSite=None (not Lax): the widget runs on github.io and calls a
//   workers.dev API -- cross-site. A Lax cookie would never be sent with
//   those fetches, so SameSite=None + Secure is REQUIRED for the session
//   cookie to work at all. This widens CSRF exposure in theory, but every
//   state-changing chat endpoint requires `Content-Type: application/json`
//   (see parseJsonBody in index.ts), which browsers only send after a CORS
//   preflight -- a simple cross-site <form> POST can't reach them, and the
//   preflight will not carry the victim's cookies to an allowlisted origin
//   check that fails closed. Cookie-tossing / session-fixation are
//   mitigated by 256-bit random tokens that are single-use minted here.
// - Raw tokens are NEVER stored: only SHA-256 hashes (same convention as
//   auth.ts). GITHUB_CLIENT_SECRET lives in `wrangler secret put`, never in
//   wrangler.toml, and never leaves the Worker (server-side exchange only).
// - The callback answers with an HTML page that postMessages the result to
//   the opener (the widget uses a popup). It does NOT 302 to the Pages
//   site: the widget couldn't read a cross-site result otherwise. The
//   postMessage target origin comes from PUBLIC_SITE_ORIGIN and the payload
//   is JSON-encoded; `<` is escaped so no error string can break out of
//   the script block.

import type { Env } from '../index';
import { jsonResponse } from '../index';
import { randomToken, sha256Hex } from '../crypto';
import { qaCorsHeaders, qaThrottleByIp } from './routes';

export const QA_SESSION_COOKIE = 'qa_session';
export const QA_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const QA_OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const DEFAULT_PUBLIC_SITE_ORIGIN = 'https://veeresh-bikkaneti.github.io';

interface QaUserRow {
  github_id: string;
  login: string;
}

interface QaSessionLookupRow {
  github_id: string;
  expires_at: string;
  login: string;
}

interface OauthStateRow {
  state_hash: string;
  expires_at: string;
}

/** Parse a Cookie header into a name->value map (tolerates `=` in values). */
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name && !(name in out)) out[name] = value;
  }
  return out;
}

function sessionCookie(token: string, maxAge: number): string {
  // See the module header: SameSite=None + Secure is required because the
  // widget (github.io) calls this API (workers.dev) cross-site.
  return (
    `${QA_SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; ` +
    'HttpOnly; Secure; SameSite=None'
  );
}

/**
 * The postMessage target origin for the OAuth popup result page. The value
 * comes from a Worker env var, but it still has to be a real https origin:
 * a value like `*` would broadcast the result to any opener, and a
 * non-URL value would break postMessage delivery. Anything that is not a
 * plain https://host[:port] origin falls back to the default.
 */
function publicSiteOrigin(env: Env): string {
  const origin = (env.PUBLIC_SITE_ORIGIN ?? '').trim();
  return /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin) ? origin : DEFAULT_PUBLIC_SITE_ORIGIN;
}

/**
 * Validate the tutor session cookie. Returns the GitHub user, or null when
 * there is no cookie, the token is unknown, or the session expired (expired
 * rows are lazily deleted).
 */
export async function getQaUser(
  db: D1Database,
  request: Request,
): Promise<QaUserRow | null> {
  const token = parseCookies(request.headers.get('Cookie'))[QA_SESSION_COOKIE];
  if (!token || token.length === 0 || token.length > 256) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT s.github_id AS github_id, s.expires_at AS expires_at, u.login AS login
       FROM qa_sessions s JOIN qa_users u ON u.github_id = s.github_id
       WHERE s.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<QaSessionLookupRow>();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await db.prepare('DELETE FROM qa_sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  return { github_id: row.github_id, login: row.login };
}

/** GET /api/qa/auth/github -- start the GitHub OAuth flow (302 to github.com). */
export async function handleQaAuthStart(request: Request, env: Env): Promise<Response> {
  const cors = qaCorsHeaders(request.headers.get('Origin'));
  if (!(await qaThrottleByIp(request, env.DB_QA, 'qa_oauth_start', 30))) {
    return jsonResponse({ error: 'Too many attempts. Try again later.' }, { status: 429, headers: cors });
  }
  const clientId = (env.GITHUB_CLIENT_ID ?? '').trim();
  if (!clientId) {
    return jsonResponse({ error: 'GitHub sign-in is not configured.' }, { status: 500, headers: cors });
  }
  const state = randomToken();
  const stateHash = await sha256Hex(state);
  const now = new Date();
  await env.DB_QA.prepare(
    'INSERT INTO qa_oauth_states (state_hash, created_at, expires_at) VALUES (?, ?, ?)',
  )
    .bind(stateHash, now.toISOString(), new Date(now.getTime() + QA_OAUTH_STATE_TTL_MS).toISOString())
    .run();
  const workerOrigin = new URL(request.url).origin;
  const authorizeUrl =
    'https://github.com/login/oauth/authorize' +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(`${workerOrigin}/api/qa/auth/github/callback`)}` +
    `&scope=${encodeURIComponent('read:user')}` +
    `&state=${encodeURIComponent(state)}`;
  return new Response(null, { status: 302, headers: { ...cors, Location: authorizeUrl } });
}

/** The popup result page: postMessages to the opener, then closes itself. */
function oauthResultPage(env: Env, ok: boolean, error?: string): Response {
  const payload = JSON.stringify(
    ok ? { type: 'qa-auth', ok: true } : { type: 'qa-auth', ok: false, error: error ?? 'sign_in_failed' },
  ).replace(/</g, '\\u003c');
  const origin = JSON.stringify(publicSiteOrigin(env)).replace(/</g, '\\u003c');
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><title>Sign in</title></head>' +
    `<body><script>window.opener.postMessage(${payload},${origin});window.close();</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff' },
  });
}

function setSessionCookieHeader(response: Response, token: string): void {
  response.headers.append('Set-Cookie', sessionCookie(token, QA_SESSION_TTL_MS / 1000));
}

interface GithubTokenResponse {
  access_token?: unknown;
  error?: unknown;
}

interface GithubUserResponse {
  id?: unknown;
  login?: unknown;
  avatar_url?: unknown;
}

/** GET /api/qa/auth/github/callback -- exchange code, mint session, popup result. */
export async function handleQaAuthCallback(request: Request, env: Env): Promise<Response> {
  if (!(await qaThrottleByIp(request, env.DB_QA, 'qa_oauth_callback', 30))) {
    return oauthResultPage(env, false, 'rate_limited');
  }
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return oauthResultPage(env, false, 'invalid_request');
  }

  // Single-use state: must exist, must not be expired, then deleted.
  const stateHash = await sha256Hex(state);
  const stateRow = await env.DB_QA.prepare(
    'SELECT state_hash, expires_at FROM qa_oauth_states WHERE state_hash = ?',
  )
    .bind(stateHash)
    .first<OauthStateRow>();
  await env.DB_QA.prepare('DELETE FROM qa_oauth_states WHERE state_hash = ?').bind(stateHash).run();
  if (!stateRow || new Date(stateRow.expires_at).getTime() <= Date.now()) {
    return oauthResultPage(env, false, 'invalid_state');
  }

  const clientId = (env.GITHUB_CLIENT_ID ?? '').trim();
  const clientSecret = env.GITHUB_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret) {
    return oauthResultPage(env, false, 'not_configured');
  }

  // Server-side token exchange: the client secret never leaves the Worker.
  let accessToken: string;
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tokenBody = (await tokenRes.json()) as GithubTokenResponse;
    if (!tokenRes.ok || typeof tokenBody.access_token !== 'string' || !tokenBody.access_token) {
      return oauthResultPage(env, false, 'token_exchange_failed');
    }
    accessToken = tokenBody.access_token;
  } catch {
    return oauthResultPage(env, false, 'token_exchange_failed');
  }

  let githubId: string;
  let login: string;
  let avatarUrl: string | null;
  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'system-design-qa',
        Accept: 'application/vnd.github+json',
      },
    });
    const userBody = (await userRes.json()) as GithubUserResponse;
    if (
      !userRes.ok ||
      (typeof userBody.id !== 'number' && typeof userBody.id !== 'string') ||
      typeof userBody.login !== 'string' ||
      !userBody.login
    ) {
      return oauthResultPage(env, false, 'user_fetch_failed');
    }
    githubId = String(userBody.id);
    login = userBody.login;
    avatarUrl = typeof userBody.avatar_url === 'string' ? userBody.avatar_url : null;
  } catch {
    return oauthResultPage(env, false, 'user_fetch_failed');
  }

  const now = new Date().toISOString();
  await env.DB_QA.prepare(
    `INSERT INTO qa_users (github_id, login, avatar_url, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (github_id) DO UPDATE SET
       login = excluded.login,
       avatar_url = excluded.avatar_url,
       last_seen_at = excluded.last_seen_at`,
  )
    .bind(githubId, login, avatarUrl, now, now)
    .run();

  const sessionToken = randomToken();
  const tokenHash = await sha256Hex(sessionToken);
  await env.DB_QA.prepare(
    'INSERT INTO qa_sessions (token_hash, github_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  )
    .bind(tokenHash, githubId, now, new Date(Date.now() + QA_SESSION_TTL_MS).toISOString())
    .run();

  const response = oauthResultPage(env, true);
  setSessionCookieHeader(response, sessionToken);
  return response;
}

/** GET /api/qa/auth/status -- {authenticated, login?}. Never 401s; the widget polls this. */
export async function handleQaAuthStatus(request: Request, env: Env): Promise<Response> {
  const cors = qaCorsHeaders(request.headers.get('Origin'));
  const user = await getQaUser(env.DB_QA, request);
  if (!user) {
    return jsonResponse({ authenticated: false }, { headers: cors });
  }
  return jsonResponse({ authenticated: true, login: user.login }, { headers: cors });
}

/** POST /api/qa/auth/logout -- revoke the session row and clear the cookie. */
export async function handleQaAuthLogout(request: Request, env: Env): Promise<Response> {
  const cors = qaCorsHeaders(request.headers.get('Origin'));
  // Logout is state-changing and the session cookie is SameSite=None, so a
  // cross-site simple POST (plain HTML form) must not be able to fire it.
  // Requiring application/json forces a CORS preflight, which the attacker's
  // origin cannot pass -- the same gate parseJsonBody applies to /api/qa/chat.
  if (!(request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json' }, { status: 415, headers: cors });
  }
  const token = parseCookies(request.headers.get('Cookie'))[QA_SESSION_COOKIE];
  if (token) {
    const tokenHash = await sha256Hex(token);
    await env.DB_QA.prepare('DELETE FROM qa_sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  const response = jsonResponse({ ok: true }, { headers: cors });
  response.headers.append('Set-Cookie', sessionCookie('', 0));
  return response;
}
