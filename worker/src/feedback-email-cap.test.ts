import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';

const WEBHOOK = 'https://discord.com/api/webhooks/123456/abcdef';

function makeDb() {
  const counts = new Map<string, number>();
  return {
    prepare: () => ({
      bind: (bucketKey: string, windowHour: string) => ({
        first: async () => {
          const key = `${bucketKey}|${windowHour}`;
          const next = (counts.get(key) ?? 0) + 1;
          counts.set(key, next);
          return { count: next };
        },
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

const post = (body: unknown, ip: string) =>
  new Request('https://worker.example/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  });

const validBody = (over: Record<string, unknown> = {}) => ({
  category: 'bug',
  message: 'The caching lesson has a broken diagram link.',
  turnstileToken: 'token-1',
  startedAt: Date.now() - 10_000,
  ...over,
});

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

const emailOfLength = (length: number) => `${'a'.repeat(length - '@example.com'.length)}@example.com`;

afterEach(() => vi.unstubAllGlobals());

describe('POST /api/feedback email length', () => {
  it('rejects a regex-valid email over 254 characters before siteverify or Discord', async () => {
    const calls = stubFetch();
    const email = emailOfLength(255);
    expect(email.length).toBe(255);
    expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)).toBe(true);

    const res = await worker.fetch(post(validBody({ email }), '10.1.0.1'), env());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid submission' });
    expect(calls.filter((c) => c.url.includes('siteverify'))).toHaveLength(0);
    expect(calls.filter((c) => c.url === WEBHOOK)).toHaveLength(0);
  });

  it('accepts an email of exactly 254 characters', async () => {
    const calls = stubFetch();
    const email = emailOfLength(254);
    expect(email.length).toBe(254);

    const res = await worker.fetch(post(validBody({ email }), '10.1.0.2'), env());
    expect(res.status).toBe(200);
    const webhook = calls.find((c) => c.url === WEBHOOK);
    expect(webhook).toBeDefined();
    expect(String(webhook?.init?.body)).toContain(email);
  });
});
