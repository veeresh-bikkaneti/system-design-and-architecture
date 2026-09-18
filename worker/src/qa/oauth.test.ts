// P2 (course Q&A tutor): tests for worker/src/qa/oauth.ts.
//
// Covers: OAuth start (state minting + storage of the hash only), the
// callback (single-use state, expiry, wrong state, mocked GitHub token
// exchange + /user fetch, session cookie flags, popup postMessage page),
// status (never 401s), logout revocation, and session lookup incl. expiry
// and multi-cookie parsing. GitHub is reached only through a stubbed
// global fetch; no real network.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentWindowHour } from '../auth';
import { sha256Hex } from '../crypto';
import type { Env } from '../index';
import { asD1, FakeD1 } from './fake-d1';
import {
  DEFAULT_PUBLIC_SITE_ORIGIN,
  getQaUser,
  handleQaAuthCallback,
  handleQaAuthLogout,
  handleQaAuthStart,
  handleQaAuthStatus,
  parseCookies,
  QA_OAUTH_STATE_TTL_MS,
} from './oauth';

function makeEnv(db: D1Database, overrides: Partial<Env> = {}): Env {
  return {
    DB: db,
    GITHUB_CLIENT_ID: 'test-client-id',
    GITHUB_CLIENT_SECRET: 'test-client-secret',
    PUBLIC_SITE_ORIGIN: 'https://veeresh-bikkaneti.github.io',
    ...overrides,
  } as unknown as Env;
}

const req = (url: string, init?: RequestInit) => new Request(url, init);

afterEach(() => {
  vi.unstubAllGlobals();
});

function expiredIso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

/** Seed an OAuth state row and return the raw state the browser would send back. */
async function seedState(fake: FakeD1, state: string, expiresAt?: string): Promise<string> {
  const hash = await sha256Hex(state);
  fake.oauthStates.set(hash, {
    state_hash: hash,
    created_at: new Date().toISOString(),
    expires_at: expiresAt ?? expiredIso(QA_OAUTH_STATE_TTL_MS),
  });
  return state;
}

/** Stub global fetch with canned GitHub token + user responses. */
function stubGithub(tokenOk = true, userOk = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === 'https://github.com/login/oauth/access_token') {
        const body = tokenOk ? { access_token: 'gho_test_token' } : { error: 'bad_verification_code' };
        return new Response(JSON.stringify(body), {
          status: tokenOk ? 200 : 400,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://api.github.com/user') {
        const body = userOk
          ? { id: 12345, login: 'octocat', avatar_url: 'https://avatars.example/u/12345' }
          : { message: 'Bad credentials' };
        return new Response(JSON.stringify(body), {
          status: userOk ? 200 : 401,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch in test: ${url}`);
    }),
  );
}

async function bodyText(res: Response): Promise<string> {
  return res.text();
}

describe('handleQaAuthStart', () => {
  it('302s to github.com with client_id, scope, state; stores only the state hash', async () => {
    const fake = new FakeD1();
    const res = await handleQaAuthStart(
      req('https://worker.test/api/qa/auth/github', { headers: { 'CF-Connecting-IP': '1.2.3.4' } }),
      makeEnv(asD1(fake)),
    );
    expect(res.status).toBe(302);
    const location = res.headers.get('Location') ?? '';
    expect(location).toContain('https://github.com/login/oauth/authorize');
    const params = new URL(location).searchParams;
    expect(params.get('client_id')).toBe('test-client-id');
    expect(params.get('scope')).toBe('read:user');
    const state = params.get('state') ?? '';
    expect(state.length).toBeGreaterThan(32);
    // Only the hash is stored -- the raw state must not be recoverable from D1.
    expect(fake.oauthStates.size).toBe(1);
    const stored = [...fake.oauthStates.values()][0]!;
    expect(stored['state_hash']).toBe(await sha256Hex(state));
    expect(stored['state_hash']).not.toBe(state);
  });

  it('returns 500 when the OAuth client id is not configured', async () => {
    const fake = new FakeD1();
    const res = await handleQaAuthStart(
      req('https://worker.test/api/qa/auth/github'),
      makeEnv(asD1(fake), { GITHUB_CLIENT_ID: '' }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'GitHub sign-in is not configured.' });
  });

  it('rate-limits repeated starts per IP (429 after 30/hour)', async () => {
    const fake = new FakeD1();
    const ipHash = await sha256Hex('sdm-qa-v1:1.2.3.4');
    fake.counters.set(`qa_oauth_start:ip:${ipHash}|${currentWindowHour()}`, 30);
    const res = await handleQaAuthStart(
      req('https://worker.test/api/qa/auth/github', { headers: { 'CF-Connecting-IP': '1.2.3.4' } }),
      makeEnv(asD1(fake)),
    );
    expect(res.status).toBe(429);
  });
});

describe('handleQaAuthCallback', () => {
  it('posts ok:false for a missing code/state', async () => {
    const fake = new FakeD1();
    const res = await handleQaAuthCallback(
      req('https://worker.test/api/qa/auth/github/callback'),
      makeEnv(asD1(fake)),
    );
    expect(res.status).toBe(200);
    const html = await bodyText(res);
    expect(html).toContain('"ok":false');
    expect(html).toContain('invalid_request');
  });

  it('rejects an unknown state and never calls GitHub', async () => {
    const fake = new FakeD1();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await handleQaAuthCallback(
      req('https://worker.test/api/qa/auth/github/callback?code=c&state=nope'),
      makeEnv(asD1(fake)),
    );
    expect(await bodyText(res)).toContain('invalid_state');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an expired state and deletes it (single-use)', async () => {
    const fake = new FakeD1();
    const state = await seedState(fake, 'old-state', expiredIso(-1000));
    const res = await handleQaAuthCallback(
      req(`https://worker.test/api/qa/auth/github/callback?code=c&state=${state}`),
      makeEnv(asD1(fake)),
    );
    expect(await bodyText(res)).toContain('invalid_state');
    expect(fake.oauthStates.size).toBe(0);
  });

  it('on success: deletes the state (single-use), stores the user, sets a SameSite=None session cookie, posts ok:true to the Pages origin', async () => {
    const fake = new FakeD1();
    const state = await seedState(fake, 'good-state');
    stubGithub();
    const res = await handleQaAuthCallback(
      req(`https://worker.test/api/qa/auth/github/callback?code=abc&state=${state}`),
      makeEnv(asD1(fake)),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    // Single-use: the state row is gone even though it was valid.
    expect(fake.oauthStates.size).toBe(0);

    // User upserted.
    const user = fake.users.get('12345');
    expect(user?.['login']).toBe('octocat');

    // Session stored as a hash only; the cookie carries the raw token.
    const setCookie = res.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toMatch(/^qa_session=[0-9a-f]{64}; /);
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Max-Age=2592000');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=None');
    const rawToken = setCookie.match(/^qa_session=([0-9a-f]+);/)?.[1] ?? '';
    expect(fake.sessions.has(await sha256Hex(rawToken))).toBe(true);
    expect(fake.sessions.has(rawToken)).toBe(false);

    // Popup result page: postMessage to the configured Pages origin, then close.
    const html = await bodyText(res);
    expect(html).toContain('window.opener.postMessage');
    expect(html).toContain('{"type":"qa-auth","ok":true}');
    expect(html).toContain(JSON.stringify('https://veeresh-bikkaneti.github.io'));
    expect(html).toContain('window.close()');
  });

  it('posts ok:false when the token exchange fails (no session minted)', async () => {
    const fake = new FakeD1();
    const state = await seedState(fake, 'good-state');
    stubGithub(false, true);
    const res = await handleQaAuthCallback(
      req(`https://worker.test/api/qa/auth/github/callback?code=abc&state=${state}`),
      makeEnv(asD1(fake)),
    );
    const html = await bodyText(res);
    expect(html).toContain('"ok":false');
    expect(html).toContain('token_exchange_failed');
    expect(fake.sessions.size).toBe(0);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('posts ok:false when the /user fetch fails', async () => {
    const fake = new FakeD1();
    const state = await seedState(fake, 'good-state');
    stubGithub(true, false);
    const res = await handleQaAuthCallback(
      req(`https://worker.test/api/qa/auth/github/callback?code=abc&state=${state}`),
      makeEnv(asD1(fake)),
    );
    expect(await bodyText(res)).toContain('user_fetch_failed');
    expect(fake.sessions.size).toBe(0);
  });

  it('defaults the postMessage origin when PUBLIC_SITE_ORIGIN is unset', () => {
    expect(DEFAULT_PUBLIC_SITE_ORIGIN).toBe('https://veeresh-bikkaneti.github.io');
  });

  it.each([
    ['https://tutor.example.com', 'https://tutor.example.com'],
    ['https://tutor.example.com:8443', 'https://tutor.example.com:8443'],
    ['*', DEFAULT_PUBLIC_SITE_ORIGIN],
    ['javascript:alert(1)', DEFAULT_PUBLIC_SITE_ORIGIN],
    ['https://evil.example/x', DEFAULT_PUBLIC_SITE_ORIGIN],
    ['', DEFAULT_PUBLIC_SITE_ORIGIN],
  ])('postMessage target origin for %j is %j', async (configured, expected) => {
    const fake = new FakeD1();
    const state = await seedState(fake, 'good-state');
    stubGithub();
    const res = await handleQaAuthCallback(
      req(`https://worker.test/api/qa/auth/github/callback?code=abc&state=${state}`),
      makeEnv(asD1(fake), { PUBLIC_SITE_ORIGIN: configured }),
    );
    expect(res.status).toBe(200);
    expect(await bodyText(res)).toContain(`postMessage({"type":"qa-auth","ok":true},"${expected}")`);
  });
});

describe('handleQaAuthStatus', () => {
  it('returns authenticated:false (not 401) when signed out', async () => {
    const fake = new FakeD1();
    const res = await handleQaAuthStatus(
      req('https://worker.test/api/qa/auth/status'),
      makeEnv(asD1(fake)),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: false });
  });

  it('returns authenticated:true with the login when signed in', async () => {
    const fake = new FakeD1();
    const state = await seedState(fake, 'good-state');
    stubGithub();
    const callbackRes = await handleQaAuthCallback(
      req(`https://worker.test/api/qa/auth/github/callback?code=abc&state=${state}`),
      makeEnv(asD1(fake)),
    );
    const cookie = (callbackRes.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
    const res = await handleQaAuthStatus(
      req('https://worker.test/api/qa/auth/status', { headers: { Cookie: cookie } }),
      makeEnv(asD1(fake)),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: true, login: 'octocat' });
  });
});

describe('handleQaAuthLogout', () => {
  it('revokes the session row and clears the cookie', async () => {
    const fake = new FakeD1();
    const state = await seedState(fake, 'good-state');
    stubGithub();
    const callbackRes = await handleQaAuthCallback(
      req(`https://worker.test/api/qa/auth/github/callback?code=abc&state=${state}`),
      makeEnv(asD1(fake)),
    );
    const cookie = (callbackRes.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
    expect(fake.sessions.size).toBe(1);

    const res = await handleQaAuthLogout(
      req('https://worker.test/api/qa/auth/logout', {
        method: 'POST',
        headers: { Cookie: cookie, 'content-type': 'application/json' },
      }),
      makeEnv(asD1(fake)),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fake.sessions.size).toBe(0);
    const cleared = res.headers.get('Set-Cookie') ?? '';
    expect(cleared).toContain('Max-Age=0');
    expect(cleared).toContain('SameSite=None');

    // Status now reports signed out.
    const status = await handleQaAuthStatus(
      req('https://worker.test/api/qa/auth/status', { headers: { Cookie: cookie } }),
      makeEnv(asD1(fake)),
    );
    expect(await status.json()).toEqual({ authenticated: false });
  });

  it('is idempotent with no cookie', async () => {
    const fake = new FakeD1();
    const res = await handleQaAuthLogout(
      req('https://worker.test/api/qa/auth/logout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
      makeEnv(asD1(fake)),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rejects a non-JSON content type so plain cross-site forms cannot log the user out', async () => {
    const fake = new FakeD1();
    const res = await handleQaAuthLogout(
      req('https://worker.test/api/qa/auth/logout', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
      }),
      makeEnv(asD1(fake)),
    );
    expect(res.status).toBe(415);
  });
});

describe('getQaUser', () => {
  it('parses multi-cookie headers and ignores an overlong token', async () => {
    const fake = new FakeD1();
    const state = await seedState(fake, 'good-state');
    stubGithub();
    const callbackRes = await handleQaAuthCallback(
      req(`https://worker.test/api/qa/auth/github/callback?code=abc&state=${state}`),
      makeEnv(asD1(fake)),
    );
    const sessionCookie = (callbackRes.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';

    const user = await getQaUser(
      asD1(fake),
      req('https://worker.test/api/qa/chat', {
        headers: { Cookie: `other=1; ${sessionCookie}; theme=dark` },
      }),
    );
    expect(user).toEqual({ github_id: '12345', login: 'octocat' });

    expect(
      await getQaUser(
        asD1(fake),
        req('https://worker.test/api/qa/chat', { headers: { Cookie: `qa_session=${'x'.repeat(257)}` } }),
      ),
    ).toBeNull();
  });

  it('lazily deletes expired sessions and returns null', async () => {
    const fake = new FakeD1();
    const tokenHash = await sha256Hex('expired-token');
    fake.sessions.set(tokenHash, {
      token_hash: tokenHash,
      github_id: '9',
      created_at: expiredIso(-86400000),
      expires_at: expiredIso(-1000),
    });
    fake.users.set('9', {
      github_id: '9',
      login: 'ghost',
      avatar_url: null,
      created_at: expiredIso(-86400000),
      last_seen_at: expiredIso(-86400000),
    });
    const user = await getQaUser(
      asD1(fake),
      req('https://worker.test/api/qa/chat', { headers: { Cookie: 'qa_session=expired-token' } }),
    );
    expect(user).toBeNull();
    expect(fake.sessions.has(tokenHash)).toBe(false);
  });

  it('returns null for an unknown token', async () => {
    const fake = new FakeD1();
    expect(
      await getQaUser(asD1(fake), req('https://worker.test/api/qa/chat', { headers: { Cookie: 'qa_session=nope' } })),
    ).toBeNull();
    expect(await getQaUser(asD1(fake), req('https://worker.test/api/qa/chat'))).toBeNull();
  });
});

describe('parseCookies', () => {
  it('handles values containing = and ignores junk', () => {
    expect(parseCookies('a=1; qa_session=abc==; b=; ; noeq')).toEqual({
      a: '1',
      qa_session: 'abc==',
      b: '',
    });
  });
});
