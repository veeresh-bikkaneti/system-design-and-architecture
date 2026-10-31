import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';

const WEBHOOK = 'https://discord.com/api/webhooks/123456/abcdef';

function makeDb() {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => ({ count: 1 }),
      }),
    }),
  } as unknown as D1Database;
}

const env = (): Env => ({
  DB: makeDb(),
  DB_QA: {} as D1Database,
  DISCORD_FEEDBACK_WEBHOOK_URL: WEBHOOK,
  TURNSTILE_SECRET_KEY: 'test-secret',
});

const body = {
  category: 'bug',
  message: 'The caching lesson has a broken diagram link.',
  turnstileToken: 'token-1',
  startedAt: Date.now() - 10_000,
};

function stubFetch() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes('siteverify')) {
        return new Response(JSON.stringify({ success: true, hostname: 'veeresh-bikkaneti.github.io' }));
      }
      if (url === WEBHOOK) return new Response(null, { status: 204 });
      return new Response('not found', { status: 404 });
    }),
  );
  return calls;
}

const siteverifyBody = (calls: Array<{ url: string; init?: RequestInit }>) => {
  const call = calls.find((c) => c.url.includes('siteverify'));
  expect(call).toBeDefined();
  return JSON.parse(String(call?.init?.body)) as { secret?: string; response?: string; remoteip?: string };
};

afterEach(() => vi.unstubAllGlobals());

describe('POST /api/feedback Turnstile remoteip', () => {
  it('sends CF-Connecting-IP as remoteip when the header is present', async () => {
    const calls = stubFetch();
    const res = await worker.fetch(
      new Request('https://worker.example/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
        body: JSON.stringify(body),
      }),
      env(),
    );
    expect(res.status).toBe(200);
    expect(siteverifyBody(calls)).toEqual({
      secret: 'test-secret',
      response: 'token-1',
      remoteip: '203.0.113.9',
    });
  });

  it('omits remoteip when CF-Connecting-IP is absent', async () => {
    const calls = stubFetch();
    const res = await worker.fetch(
      new Request('https://worker.example/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      env(),
    );
    expect(res.status).toBe(200);
    const parsed = siteverifyBody(calls);
    expect(parsed.secret).toBe('test-secret');
    expect(parsed.response).toBe('token-1');
    expect(parsed).not.toHaveProperty('remoteip');
  });
});
