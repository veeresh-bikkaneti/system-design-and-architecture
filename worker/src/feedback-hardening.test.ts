import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';

const WEBHOOK = 'https://discord.com/api/webhooks/123456/abcdef';
const HOST_OK = JSON.stringify({ success: true, hostname: 'veeresh-bikkaneti.github.io' });

// Counts rows like D1 would: INSERT..RETURNING goes through first(), the
// refund UPDATE through run(). refundThrows lets a test break the refund.
function makeDb(opts: { refundThrows?: boolean } = {}) {
  const counts = new Map<string, number>();
  const db = {
    prepare: (sql: string) => ({
      bind: (bucketKey: string, windowHour: string) => ({
        first: async () => {
          const key = `${bucketKey}|${windowHour}`;
          const next = (counts.get(key) ?? 0) + 1;
          counts.set(key, next);
          return { count: next };
        },
        run: async () => {
          if (!/UPDATE rate_limit_counters/i.test(sql)) throw new Error('unexpected run');
          if (opts.refundThrows) throw new Error('d1 down');
          const key = `${bucketKey}|${windowHour}`;
          const cur = counts.get(key) ?? 0;
          if (cur > 0) counts.set(key, cur - 1);
          return { meta: { changes: 1 } };
        },
      }),
    }),
  } as unknown as D1Database;
  return { counts, db };
}

const mkEnv = (db: D1Database): Env => ({
  DB: db,
  DB_QA: {} as D1Database,
  DISCORD_FEEDBACK_WEBHOOK_URL: WEBHOOK,
  TURNSTILE_SECRET_KEY: 'test-secret',
});

const post = (body: unknown, ip: string | null) =>
  new Request('https://worker.example/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ip ? { 'CF-Connecting-IP': ip } : {}) },
    body: JSON.stringify(body),
  });

const validBody = (over: Record<string, unknown> = {}) => ({
  category: 'bug',
  message: 'The caching lesson has a broken diagram link.',
  turnstileToken: 'token-1',
  startedAt: Date.now() - 10_000,
  ...over,
});

function stubFetch(verify: () => Response = () => new Response(HOST_OK)) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes('siteverify')) return verify();
      if (url === WEBHOOK) return new Response(null, { status: 204 });
      return new Response('nf', { status: 404 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const total = (counts: Map<string, number>) => [...counts.values()].reduce((a, b) => a + b, 0);

describe('rate limit keying and refund', () => {
  it('buckets two addresses inside one IPv6 /64 together', async () => {
    stubFetch();
    const { db } = makeDb();
    const e = mkEnv(db);
    for (let i = 0; i < 5; i++) {
      const r = await worker.fetch(post(validBody(), `2001:db8:aa:bb::${i + 1}`), e);
      expect(r.status).toBe(200);
    }
    const sixth = await worker.fetch(post(validBody(), '2001:db8:aa:bb:ffff::9'), e);
    expect(sixth.status).toBe(429);
    const other64 = await worker.fetch(post(validBody(), '2001:db8:aa:cc::1'), e);
    expect(other64.status).toBe(200);
  });

  it('still throttles before calling siteverify (order: validation, limit, Turnstile)', async () => {
    const calls = stubFetch();
    const { db } = makeDb();
    const e = mkEnv(db);
    for (let i = 0; i < 5; i++) await worker.fetch(post(validBody(), '198.51.100.9'), e);
    const before = calls.filter((c) => c.url.includes('siteverify')).length;
    const r = await worker.fetch(post(validBody(), '198.51.100.9'), e);
    expect(r.status).toBe(429);
    expect(calls.filter((c) => c.url.includes('siteverify')).length).toBe(before);
  });

  it('refunds the slot when siteverify answers 5xx', async () => {
    stubFetch(() => new Response('oops', { status: 503 }));
    const { db, counts } = makeDb();
    const r = await worker.fetch(post(validBody(), '198.51.100.20'), mkEnv(db));
    expect(r.status).toBe(502);
    expect(total(counts)).toBe(0);
  });

  it('refunds the slot when siteverify throws (network error or timeout)', async () => {
    stubFetch(() => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    const { db, counts } = makeDb();
    const r = await worker.fetch(post(validBody(), '198.51.100.21'), mkEnv(db));
    expect(r.status).toBe(502);
    expect(total(counts)).toBe(0);
  });

  it('does NOT refund on Turnstile success:false', async () => {
    stubFetch(() => new Response(JSON.stringify({ success: false })));
    const { db, counts } = makeDb();
    const r = await worker.fetch(post(validBody(), '198.51.100.22'), mkEnv(db));
    expect(r.status).toBe(400);
    expect(total(counts)).toBe(1);
  });

  it('does NOT refund on a hostname mismatch', async () => {
    stubFetch(() => new Response(JSON.stringify({ success: true, hostname: 'evil.example' })));
    const { db, counts } = makeDb();
    const r = await worker.fetch(post(validBody(), '198.51.100.23'), mkEnv(db));
    expect(r.status).toBe(400);
    expect(total(counts)).toBe(1);
  });

  it('keeps the slot burned and still answers 502 when the refund itself fails', async () => {
    stubFetch(() => new Response('oops', { status: 500 }));
    const { db, counts } = makeDb({ refundThrows: true });
    const r = await worker.fetch(post(validBody(), '198.51.100.24'), mkEnv(db));
    expect(r.status).toBe(502);
    expect(total(counts)).toBe(1);
  });
});

describe('upstream timeouts', () => {
  it('passes an AbortSignal to siteverify and to Discord', async () => {
    const calls = stubFetch();
    const { db } = makeDb();
    const r = await worker.fetch(post(validBody(), '198.51.100.30'), mkEnv(db));
    expect(r.status).toBe(200);
    expect(calls.length).toBe(2);
    for (const c of calls) expect(c.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('answers 502 when Discord times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('siteverify')) return new Response(HOST_OK);
        throw new DOMException('timed out', 'TimeoutError');
      }),
    );
    const { db } = makeDb();
    const r = await worker.fetch(post(validBody(), '198.51.100.31'), mkEnv(db));
    expect(r.status).toBe(502);
  });
});

describe('body size cap', () => {
  // The real body is tiny, so only the declared-length check can produce the 413.
  const streamReq = (declared: number, flag: { read: boolean }) =>
    new Request('https://worker.example/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(declared), 'CF-Connecting-IP': '198.51.100.40' },
      body: new ReadableStream({
        pull(c) {
          flag.read = true;
          c.close();
        },
      }),
      duplex: 'half',
    } as RequestInit);

  it('rejects declared 16385 with 413 even though the real body is tiny (declared length checked first)', async () => {
    stubFetch();
    const flag = { read: false };
    const { db } = makeDb();
    const r = await worker.fetch(streamReq(16385, flag), mkEnv(db));
    expect(r.status).toBe(413);
  });

  it('does not 413 at declared 16384', async () => {
    stubFetch();
    const flag = { read: false };
    const { db } = makeDb();
    const r = await worker.fetch(streamReq(16384, flag), mkEnv(db));
    expect(r.status).not.toBe(413);
  });

  it('rejects an actual body of 16385 bytes', async () => {
    stubFetch();
    const { db } = makeDb();
    const big = new Request('https://worker.example/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.41' },
      body: ' '.repeat(16385),
    });
    expect((await worker.fetch(big, mkEnv(db))).status).toBe(413);
  });
});

describe('embed escaping', () => {
  type Sent = { embeds: Array<{ description: string; fields: Array<{ name: string; value: string }> }> };
  async function embedFor(over: Record<string, unknown>, ip: string): Promise<Sent> {
    let sent: Sent | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes('siteverify')) return new Response(HOST_OK);
        sent = JSON.parse(String(init?.body)) as Sent;
        return new Response(null, { status: 204 });
      }),
    );
    const { db } = makeDb();
    const r = await worker.fetch(post(validBody(over), ip), mkEnv(db));
    expect(r.status).toBe(200);
    return sent!;
  }
  const field = (s: Sent, n: string) => s.embeds[0]!.fields.find((f) => f.name === n)?.value;

  it('escapes * _ @ in name, lesson and email', async () => {
    const s = await embedFor({ name: 'a*b_c@d', lesson: 'x*y_z@w', email: 'a_b*c@d.example' }, '203.0.113.50');
    expect(field(s, 'Name')).toBe('a\\*b\\_c\\@d');
    expect(field(s, 'Lesson')).toBe('x\\*y\\_z\\@w');
    expect(field(s, 'Email')).toBe('a\\_b\\*c\\@d.example');
  });

  it('escapes < and collapses newlines in name and lesson', async () => {
    const s = await embedFor({ name: 'Eve\n# fake heading\r\n<@123>', lesson: 'l1\n\nl2 <#9>' }, '203.0.113.51');
    expect(field(s, 'Name')).toBe('Eve \\# fake heading \\<\\@123\\>');
    expect(field(s, 'Lesson')).toBe('l1 l2 \\<\\#9\\>');
  });
});
