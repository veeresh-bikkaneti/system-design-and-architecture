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

let ipCounter = 0;
const nextIp = () => `10.2.0.${++ipCounter}`;

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
  const calls: Array<{ url: string }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push({ url });
      if (url.includes('siteverify')) {
        return new Response(JSON.stringify({ success: true, hostname: 'veeresh-bikkaneti.github.io' }));
      }
      if (url === WEBHOOK) return new Response(null, { status: 204 });
      return new Response('not found', { status: 404 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('POST /api/feedback rate limit vs validation', () => {
  it('does not let invalid or too-fast 400s burn the 5/hour cap', async () => {
    stubFetch();
    const ip = nextIp();
    const e = env();

    for (let i = 0; i < 5; i++) {
      const bad = await worker.fetch(post(validBody({ category: 'nope' }), ip), e);
      expect(bad.status).toBe(400);
      const tooFast = await worker.fetch(post(validBody({ startedAt: Date.now() }), ip), e);
      expect(tooFast.status).toBe(400);
    }

    for (let i = 0; i < 5; i++) {
      expect((await worker.fetch(post(validBody(), ip), e)).status).toBe(200);
    }
    const capped = await worker.fetch(post(validBody(), ip), e);
    expect(capped.status).toBe(429);
    expect(await capped.json()).toEqual({ error: 'too many messages, try later' });
  });

  it('does not call siteverify for a too-fast or invalid body', async () => {
    const calls = stubFetch();
    const e = env();
    expect((await worker.fetch(post(validBody({ category: 'nope' }), nextIp()), e)).status).toBe(400);
    expect((await worker.fetch(post(validBody({ startedAt: Date.now() }), nextIp()), e)).status).toBe(400);
    expect(calls.filter((c) => c.url.includes('siteverify'))).toHaveLength(0);
  });
});
