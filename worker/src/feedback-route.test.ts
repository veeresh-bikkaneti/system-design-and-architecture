import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';

const WEBHOOK = 'https://discord.com/api/webhooks/123456/abcdef';
const PAGES_ORIGIN = 'https://veeresh-bikkaneti.github.io';
const MIRROR_ORIGIN = 'https://systemdesignandarchitecture.knowledgetest.workers.dev';

// Fresh counter store per env() call, so each test starts with empty
// buckets. The fake mimics checkRateLimit's INSERT ... ON CONFLICT
// increment: every call bumps the bucket's count and returns it.
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

const env = (over: Partial<Env> = {}): Env => ({
  DB: makeDb(),
  DB_QA: {} as D1Database,
  DISCORD_FEEDBACK_WEBHOOK_URL: WEBHOOK,
  TURNSTILE_SECRET_KEY: 'test-secret',
  ...over,
});

// Unique IP per test by default, so tests never share a rate-limit bucket
// by accident. Tests that exercise the cap pass one IP explicitly.
let ipCounter = 0;
const nextIp = () => `10.0.0.${++ipCounter}`;

const post = (
  body: unknown,
  headers: Record<string, string> = { 'Content-Type': 'application/json' },
  ip?: string,
) =>
  new Request('https://worker.example/api/feedback', {
    method: 'POST',
    headers: { ...headers, ...(ip ? { 'CF-Connecting-IP': ip } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const validBody = (over: Record<string, unknown> = {}) => ({
  category: 'bug',
  message: 'The caching lesson has a broken diagram link.',
  turnstileToken: 'token-1',
  startedAt: Date.now() - 10_000,
  ...over,
});

type SiteverifyBehavior =
  | { success: boolean; hostname?: string }
  | 'throw'
  | 'nonjson';

function stubFetch(
  siteverify: SiteverifyBehavior = { success: true, hostname: 'veeresh-bikkaneti.github.io' },
  webhookStatus: number | 'throw' = 204,
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes('siteverify')) {
        if (siteverify === 'throw') throw new Error('socket hang up');
        if (siteverify === 'nonjson') return new Response('not json', { status: 200 });
        return new Response(
          JSON.stringify({
            success: siteverify.success,
            ...(siteverify.hostname !== undefined ? { hostname: siteverify.hostname } : {}),
          }),
        );
      }
      if (url === WEBHOOK) {
        if (webhookStatus === 'throw') throw new Error('socket hang up');
        return new Response(null, { status: webhookStatus });
      }
      return new Response('not found', { status: 404 });
    }),
  );
  return calls;
}

const webhookBodyOf = async (calls: Array<{ url: string; init?: RequestInit }>) => {
  const call = calls.find((c) => c.url === WEBHOOK);
  expect(call).toBeDefined();
  const parsed = JSON.parse(String(call!.init?.body)) as {
    content: string;
    embeds: Array<{
      description: string;
      fields: Array<{ name: string; value: string }>;
    }>;
    allowed_mentions: unknown;
  };
  expect(parsed.embeds).toHaveLength(1);
  const embed = parsed.embeds[0];
  if (!embed) throw new Error('webhook body has no embed');
  return { content: parsed.content, embed, allowed_mentions: parsed.allowed_mentions };
};

afterEach(() => vi.unstubAllGlobals());

describe('POST /api/feedback — happy path', () => {
  it('accepts an anonymous submission and posts exactly one embed', async () => {
    const calls = stubFetch();
    const res = await worker.fetch(post(validBody(), undefined, nextIp()), env());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    const siteverifyCalls = calls.filter((c) => c.url.includes('siteverify'));
    const webhookCalls = calls.filter((c) => c.url === WEBHOOK);
    expect(siteverifyCalls).toHaveLength(1);
    expect(webhookCalls).toHaveLength(1);
    // Turnstile is verified BEFORE any Discord call.
    expect(
      calls.findIndex((c) => c.url.includes('siteverify')),
    ).toBeLessThan(calls.findIndex((c) => c.url === WEBHOOK));
    const body = await webhookBodyOf(calls);
    expect(body.content).toBe('');
    
    expect(body.embed.description).toBe('The caching lesson has a broken diagram link.');
    expect(body.embed.fields.map((f) => f.name)).toContain('Category');
    expect(body.embed.fields.map((f) => f.name)).not.toContain('Name');
    expect(body.embed.fields.map((f) => f.name)).not.toContain('Email');
    expect(body.embed.fields.map((f) => f.name)).not.toContain('Lesson');
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });

  it('includes lesson, name, and email only when given', async () => {
    const calls = stubFetch();
    const res = await worker.fetch(
      post(
        validBody({ lesson: 'caching-strategies', name: 'Ada', email: 'ada@example.com' }),
        undefined,
        nextIp(),
      ),
      env(),
    );
    expect(res.status).toBe(200);
    const body = await webhookBodyOf(calls);
    const fields = Object.fromEntries(body.embed.fields.map((f) => [f.name, f.value]));
    expect(fields['Lesson']).toBe('caching-strategies');
    expect(fields['Name']).toBe('Ada');
    expect(fields['Email']).toBe('ada@example.com');
  });

  it('neutralizes @everyone/@here/user mentions via allowed_mentions', async () => {
    const calls = stubFetch();
    const res = await worker.fetch(
      post(validBody({ message: '@everyone @here <@123> look here' }), undefined, nextIp()),
      env(),
    );
    expect(res.status).toBe(200);
    const body = await webhookBodyOf(calls);
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });

  it('escapes Discord markdown so links cannot spoof', async () => {
    const calls = stubFetch();
    const res = await worker.fetch(
      post(validBody({ message: 'see [the lesson](https://evil.example) now' }), undefined, nextIp()),
      env(),
    );
    expect(res.status).toBe(200);
    const body = await webhookBodyOf(calls);
    expect(body.embed.description).not.toContain('[the lesson](https://evil.example)');
    expect(body.embed.description).toContain('\\[the lesson\\]\\(https://evil.example\\)');
  });

  it('never puts the IP, user-agent, or webhook URL in the Discord body', async () => {
    const calls = stubFetch();
    const ip = nextIp();
    const res = await worker.fetch(
      post(validBody(), { 'Content-Type': 'application/json', 'User-Agent': 'test-agent-marker' }, ip),
      env(),
    );
    expect(res.status).toBe(200);
    const call = calls.find((c) => c.url === WEBHOOK)!;
    const serialized = String(call.init?.body);
    expect(serialized).not.toContain(ip);
    expect(serialized).not.toContain('test-agent-marker');
    expect(serialized).not.toContain(WEBHOOK);
  });
});

describe('POST /api/feedback — validation', () => {
  // Bodies are thunks: time-sensitive cases (too-fast) must be built at
  // run time, not at collection time, or the 3s window lapses first.
  it.each([
    ['unknown category', () => validBody({ category: 'feature' })],
    ['case-sensitive category', () => validBody({ category: 'Bug' })],
    ['empty message', () => validBody({ message: '' })],
    ['whitespace-only message', () => validBody({ message: '   ' })],
    ['message over 2000 chars', () => validBody({ message: 'x'.repeat(2001) })],
    ['name over 100 chars', () => validBody({ name: 'n'.repeat(101) })],
    ['email without @', () => validBody({ email: 'no-at' })],
    ['email without dot in domain', () => validBody({ email: 'a@b' })],
    ['email without domain', () => validBody({ email: 'a@' })],
    ['lesson over 100 chars', () => validBody({ lesson: 'l'.repeat(101) })],
    ['filled honeypot', () => validBody({ honeypot: 'http://spam.example' })],
    ['missing startedAt', () => { const b = validBody(); delete (b as Record<string, unknown>)['startedAt']; return b; }],
    ['too-fast submit', () => validBody({ startedAt: Date.now() })],
    ['future startedAt', () => validBody({ startedAt: Date.now() + 60_000 })],
    ['missing turnstile token', () => validBody({ turnstileToken: '' })],
    ['six links', () => validBody({ message: 'a https://a.example b https://b.example c https://c.example d https://d.example e https://e.example f https://f.example' })],
  ])('rejects %s with a generic 400', async (_label, makeBody) => {
    const calls = stubFetch();
    const res = await worker.fetch(post(makeBody(), undefined, nextIp()), env());
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Invalid submission');
    expect(calls.filter((c) => c.url === WEBHOOK)).toHaveLength(0);
  });

  it('accepts boundary values: 1-char message, 2000 chars, 5 links, 100-char name', async () => {
    const calls = stubFetch();
    const links = 'https://a.example https://b.example www.c.example [d](https://d.example) https://e.example';
    const res = await worker.fetch(
      post(validBody({ message: links, name: 'n'.repeat(100) }), undefined, nextIp()),
      env(),
    );
    expect(res.status).toBe(200);
    expect(calls.filter((c) => c.url === WEBHOOK)).toHaveLength(1);
  });

  it('accepts a 1-character message', async () => {
    stubFetch();
    const res = await worker.fetch(post(validBody({ message: '!' }), undefined, nextIp()), env());
    expect(res.status).toBe(200);
  });

  it('counts each markdown link once, not twice', async () => {
    stubFetch();
    // 5 markdown links = 5 links, not 10 (target + bare URL inside it).
    const five = Array.from({ length: 5 }, (_, i) => `[l${i}](https://x${i}.example)`).join(' ');
    const res = await worker.fetch(post(validBody({ message: five }), undefined, nextIp()), env());
    expect(res.status).toBe(200);
  });

  it('rejects a non-JSON content-type with 415 and unparseable JSON with 400', async () => {
    stubFetch();
    expect(
      (await worker.fetch(post('category=bug', { 'Content-Type': 'text/plain' }, nextIp()), env()))
        .status,
    ).toBe(415);
    expect(
      (await worker.fetch(post('{not json', undefined, nextIp()), env())).status,
    ).toBe(400);
  });

  it('rejects an oversize body with 413 before parsing', async () => {
    stubFetch();
    const res = await worker.fetch(
      post(validBody({ message: 'x'.repeat(20_000) }), undefined, nextIp()),
      env(),
    );
    expect(res.status).toBe(413);
  });

  it('never echoes an email back in any response', async () => {
    stubFetch();
    const res = await worker.fetch(
      post(validBody({ email: 'ada@example.com', category: 'nope' }), undefined, nextIp()),
      env(),
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).not.toContain('ada@example.com');
  });
});

describe('POST /api/feedback — rate limit', () => {
  it('allows 5 then returns 429 with the pinned message', async () => {
    stubFetch();
    const ip = nextIp();
    const e = env();
    for (let i = 0; i < 5; i++) {
      expect((await worker.fetch(post(validBody(), undefined, ip), e)).status).toBe(200);
    }
    const res = await worker.fetch(post(validBody(), undefined, ip), e);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'too many messages, try later' });
  });

  it('throttles header-less callers on the shared dev key', async () => {
    stubFetch();
    const e = env();
    for (let i = 0; i < 5; i++) {
      expect((await worker.fetch(post(validBody()), e)).status).toBe(200);
    }
    expect((await worker.fetch(post(validBody()), e)).status).toBe(429);
  });

  it('does not share buckets across IPs', async () => {
    stubFetch();
    const e = env();
    for (let i = 0; i < 5; i++) {
      await worker.fetch(post(validBody(), undefined, nextIp()), e);
    }
    expect((await worker.fetch(post(validBody(), undefined, nextIp()), e)).status).toBe(200);
  });
});

describe('POST /api/feedback — Turnstile', () => {
  it('rejects a failed verification with 400 and zero Discord calls', async () => {
    const calls = stubFetch({ success: false });
    const res = await worker.fetch(post(validBody(), undefined, nextIp()), env());
    expect(res.status).toBe(400);
    expect(calls.filter((c) => c.url === WEBHOOK)).toHaveLength(0);
  });

  it('maps a siteverify throw and non-JSON to 502 without leaking details', async () => {
    for (const behavior of ['throw', 'nonjson'] as const) {
      const calls = stubFetch(behavior);
      const res = await worker.fetch(post(validBody(), undefined, nextIp()), env());
      expect(res.status).toBe(502);
      expect(JSON.stringify(await res.json())).not.toContain('socket');
      expect(calls.filter((c) => c.url === WEBHOOK)).toHaveLength(0);
    }
  });

  it('rejects a hostname outside the two hosts', async () => {
    const calls = stubFetch({ success: true, hostname: 'evil.example' });
    const res = await worker.fetch(post(validBody(), undefined, nextIp()), env());
    expect(res.status).toBe(400);
    expect(calls.filter((c) => c.url === WEBHOOK)).toHaveLength(0);
  });

  it('accepts the mirror hostname', async () => {
    stubFetch({ success: true, hostname: 'systemdesignandarchitecture.knowledgetest.workers.dev' });
    const res = await worker.fetch(post(validBody(), undefined, nextIp()), env());
    expect(res.status).toBe(200);
  });

  it('returns 503 with zero fetch calls when a secret is unset', async () => {
    const calls = stubFetch();
    const noWebhook = await worker.fetch(
      post(validBody(), undefined, nextIp()),
      env({ DISCORD_FEEDBACK_WEBHOOK_URL: undefined }),
    );
    expect(noWebhook.status).toBe(503);
    const noTurnstile = await worker.fetch(
      post(validBody(), undefined, nextIp()),
      env({ TURNSTILE_SECRET_KEY: undefined }),
    );
    expect(noTurnstile.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it('fails closed when the webhook secret is not a Discord webhook URL', async () => {
    const calls = stubFetch();
    const res = await worker.fetch(
      post(validBody(), undefined, nextIp()),
      env({ DISCORD_FEEDBACK_WEBHOOK_URL: 'https://evil.example/hook' }),
    );
    expect(res.status).toBe(503);
    expect(calls.filter((c) => c.url === WEBHOOK)).toHaveLength(0);
  });

  it('uses redirect:manual on both server fetches', async () => {
    const calls = stubFetch();
    await worker.fetch(post(validBody(), undefined, nextIp()), env());
    for (const call of calls) {
      expect(call.init?.redirect).toBe('manual');
    }
  });
});

describe('POST /api/feedback — Discord', () => {
  it('maps a Discord non-2xx and a throw to 502 with exactly one attempt', async () => {
    for (const webhook of [500, 'throw'] as const) {
      // Hostname must be present: the handler rejects a success response
      // without a recognized hostname, so the stub must supply one.
      const calls = stubFetch({ success: true, hostname: 'veeresh-bikkaneti.github.io' }, webhook);
      const res = await worker.fetch(post(validBody(), undefined, nextIp()), env());
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: 'could not send, try again' });
      expect(calls.filter((c) => c.url === WEBHOOK)).toHaveLength(1);
    }
  });
});

describe('/api/feedback — CORS and routing', () => {
  it('answers the preflight with 204 and headers for a listed origin', async () => {
    const res = await worker.fetch(
      new Request('https://worker.example/api/feedback', {
        method: 'OPTIONS',
        headers: { Origin: PAGES_ORIGIN },
      }),
      env(),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PAGES_ORIGIN);
  });

  it('echoes listed origins and gives unlisted origins no headers without changing status', async () => {
    for (const origin of [PAGES_ORIGIN, MIRROR_ORIGIN, 'http://localhost:5173', 'http://localhost:4173']) {
      const res = await worker.fetch(
        post(validBody({ category: 'nope' }), { 'Content-Type': 'application/json', Origin: origin }, nextIp()),
        env(),
      );
      expect(res.status).toBe(400);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    }
    const res = await worker.fetch(
      post(validBody({ category: 'nope' }), { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, nextIp()),
      env(),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('returns 404 for non-POST methods on /api/feedback', async () => {
    const res = await worker.fetch(
      new Request('https://worker.example/api/feedback', { method: 'GET' }),
      env(),
    );
    expect(res.status).toBe(404);
  });
});
