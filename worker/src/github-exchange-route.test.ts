import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';

// No CF-Connecting-IP header, so the IP throttle returns early and the D1
// binding is never touched; a stub is enough.
const env = (over: Partial<Env> = {}): Env => ({
  DB: {} as D1Database,
  GITHUB_CLIENT_ID: 'id',
  GITHUB_CLIENT_SECRET: 'secret',
  ...over,
});

const post = (body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
  new Request('https://worker.example/auth/github/exchange', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

afterEach(() => vi.unstubAllGlobals());

describe('POST /auth/github/exchange', () => {
  it('returns 503 when the OAuth app is not configured', async () => {
    const res = await worker.fetch(post({ code: 'abc' }), env({ GITHUB_CLIENT_SECRET: undefined }));
    expect(res.status).toBe(503);
  });

  it('requires a JSON body with a code', async () => {
    expect((await worker.fetch(post({}), env())).status).toBe(400);
    expect((await worker.fetch(post({ code: 42 }), env())).status).toBe(400);
    expect((await worker.fetch(post('code=abc', { 'Content-Type': 'text/plain' }), env())).status).toBe(415);
  });

  it('exchanges a valid code and never caches the token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('access_token')
          ? new Response(JSON.stringify({ access_token: 'gho_test' }))
          : new Response(JSON.stringify({ login: 'veer' })),
      ),
    );
    const res = await worker.fetch(post({ code: 'abc' }), env());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ accessToken: 'gho_test', login: 'veer' });
  });

  it('maps a rejected code to 400', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'bad_verification_code' }))),
    );
    const res = await worker.fetch(post({ code: 'nope' }), env());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid or expired code' });
  });

  it('maps an upstream failure to 502 without leaking details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('socket hang up'); }));
    const res = await worker.fetch(post({ code: 'abc' }), env());
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('socket');
  });

  it('answers the CORS preflight', async () => {
    const res = await worker.fetch(
      new Request('https://worker.example/auth/github/exchange', { method: 'OPTIONS' }),
      env(),
    );
    expect(res.status).toBe(204);
  });
});
