// P2 (course Q&A tutor): tests for worker/src/qa/routes.ts (chat/quota/delete),
// worker/src/qa/checkpointer.ts and worker/src/qa/sse.ts.
//
// Chat is GitHub-login gated: every test authenticates via a session row in
// the shared FakeD1 unless the case under test is the unauthenticated path.
// The "model" is the real ChatSelfHosted over a stubbed fetch --
// no real model calls, no real network.

import { afterEach, describe, expect, it } from 'vitest';
import { sha256Hex, randomToken } from '../crypto';
import type { Env } from '../index';
import { asD1, FakeD1 } from './fake-d1';
import { deleteCheckpoint, loadCheckpoint, saveCheckpoint } from './checkpointer';
import { qaThreadId, type QaGraphState } from './graph';
import { formatSseEvent, sseErrorResponse, sseResponse } from './sse';
import {
  QA_DAILY_QUESTION_LIMIT,
  QA_MAX_MESSAGE_CHARS,
  handleQaChat,
  handleQaDeleteSession,
  handleQaQuota,
} from './routes';

const ISO_NOW = () => new Date().toISOString();
const ISO_FUTURE = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

function baseEnv(fake: FakeD1, withModel = false): Env {
  const env = { DB: asD1(fake) } as unknown as Record<string, unknown>;
  if (withModel) {
    env['MODEL_BASE_URL'] = 'https://model.test/v1';
    env['MODEL_API_KEY'] = 'test-key';
    // Default stub: short text answers, empty SSE stream. Tests that need
    // tool calls install their own stubModelFetch after calling baseEnv.
    stubModelFetch((body) =>
      body['stream'] ? { sse: ['data: [DONE]\n\n'] } : { json: chatJson('Hello! I am Veer.') },
    );
  }
  return env as unknown as Env;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface ModelStubResult {
  status?: number;
  json?: unknown;
  sse?: string[];
}

/**
 * Install a stub for the model server's OpenAI-compatible endpoint.
 * `impl` receives the decoded JSON request body and returns either a JSON
 * payload or SSE frames. The real fetch is restored after each test.
 */
function stubModelFetch(impl: (body: Record<string, unknown>) => ModelStubResult): void {
  globalThis.fetch = (async (_url: unknown, init?: unknown) => {
    const body = JSON.parse(String((init as RequestInit)?.body ?? '{}')) as Record<
      string,
      unknown
    >;
    const out = impl(body);
    const status = out.status ?? 200;
    if (out.sse) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (const f of out.sse!) controller.enqueue(encoder.encode(f));
          controller.close();
        },
      });
      return new Response(stream, {
        status,
        headers: { 'content-type': 'text/event-stream' },
      });
    }
    return new Response(JSON.stringify(out.json ?? {}), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

const chatJson = (content: string) => ({ choices: [{ message: { content } }] });

/** Sign a GitHub user in directly (mirrors what the OAuth callback stores). */
async function signIn(fake: FakeD1, githubId = '123', login = 'octocat'): Promise<string> {
  fake.users.set(githubId, {
    github_id: githubId,
    login,
    avatar_url: null,
    created_at: ISO_NOW(),
    last_seen_at: ISO_NOW(),
  });
  const token = randomToken();
  const hash = await sha256Hex(token);
  fake.sessions.set(hash, {
    token_hash: hash,
    github_id: githubId,
    created_at: ISO_NOW(),
    expires_at: ISO_FUTURE(),
  });
  return `qa_session=${token}`;
}

const chatReq = (cookie: string, body: unknown) =>
  new Request('https://worker.test/api/qa/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });

interface SseEvent {
  event: string;
  data: unknown;
}

function firstEvent(events: SseEvent[]): SseEvent {
  const e = events[0];
  if (!e) throw new Error('expected at least one SSE event');
  return e;
}

function emptyQaState(summary = ''): QaGraphState {
  return {
    messages: [],
    summary,
    inScope: true,
    triageKind: 'in-scope',
    sources: [],
    retrieved: [],
    draft: '',
    finalAnswer: '',
  };
}

function parseSseEvents(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const block of text.split('\n\n')) {
    if (!block.trim()) continue;
    let event = '';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice('event: '.length);
      else if (line.startsWith('data: ')) data += line.slice('data: '.length);
    }
    events.push({ event, data: JSON.parse(data) });
  }
  return events;
}

describe('POST /api/qa/chat', () => {
  it('rejects unauthenticated callers with a UNAUTHENTICATED error event (HTTP 200) and writes no audit row', async () => {
    const fake = new FakeD1();
    const res = await handleQaChat(chatReq('', { message: 'What is a load balancer?' }), baseEnv(fake));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const events = parseSseEvents(await res.text());
    expect(events).toHaveLength(1);
    expect(firstEvent(events).event).toBe('error');
    expect(firstEvent(events).data).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(fake.messages).toHaveLength(0);
  });

  it('returns AI_UNAVAILABLE before the audit write when MODEL_BASE_URL is missing', async () => {
    const fake = new FakeD1();
    const cookie = await signIn(fake);
    const res = await handleQaChat(chatReq(cookie, { message: 'What is a load balancer?' }), baseEnv(fake));
    expect(res.status).toBe(200);
    const events = parseSseEvents(await res.text());
    expect(firstEvent(events)).toMatchObject({ event: 'error', data: { code: 'AI_UNAVAILABLE' } });
    expect(fake.messages).toHaveLength(0);
  });

  it('validates the message: non-string, empty, too long', async () => {
    const fake = new FakeD1();
    const cookie = await signIn(fake);
    const env = baseEnv(fake, true);

    for (const [body, code] of [
      [{ message: 42 }, 'INVALID_MESSAGE'],
      [{ message: '   ' }, 'MESSAGE_EMPTY'],
      [{ message: 'x'.repeat(QA_MAX_MESSAGE_CHARS + 1) }, 'MESSAGE_TOO_LONG'],
    ] as const) {
      const res = await handleQaChat(chatReq(cookie, body), env);
      const events = parseSseEvents(await res.text());
      expect(firstEvent(events)).toMatchObject({ event: 'error', data: { code } });
      expect(fake.messages).toHaveLength(0);
    }
  });

  it('enforces the per-user daily quota with isolation between users', async () => {
    const fake = new FakeD1();
    const cookieA = await signIn(fake, '111', 'alice');
    const cookieB = await signIn(fake, '222', 'bob');
    // Alice is at her limit; Bob has asked nothing.
    for (let i = 0; i < QA_DAILY_QUESTION_LIMIT; i++) {
      fake.messages.push({ github_id: '111', role: 'user', content: `q${i}`, created_at: ISO_NOW() });
    }
    const env = baseEnv(fake, true);

    const resA = await handleQaChat(chatReq(cookieA, { message: 'hi' }), env);
    const eventsA = parseSseEvents(await resA.text());
    expect(eventsA[0]).toMatchObject({ event: 'error', data: { code: 'QUOTA_EXCEEDED' } });
    expect(fake.messages.filter((m) => m['github_id'] === '111')).toHaveLength(QA_DAILY_QUESTION_LIMIT);

    // Bob (different GitHub user) is unaffected.
    const resB = await handleQaChat(chatReq(cookieB, { message: 'hi' }), env);
    const eventsB = parseSseEvents(await resB.text());
    expect(eventsB.map((e) => e.event)).toEqual(['message', 'sources', 'done']);
    expect(fake.messages.filter((m) => m['github_id'] === '222' && m['role'] === 'user')).toHaveLength(1);
  });

  it('streams a turn (message deltas -> sources -> done) and audits both sides', async () => {
    const fake = new FakeD1();
    const cookie = await signIn(fake);
    const env = baseEnv(fake, true);

    const res = await handleQaChat(chatReq(cookie, { message: 'hello' }), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const events = parseSseEvents(await res.text());
    expect(events.map((e) => e.event)).toEqual(['message', 'sources', 'done']);
    expect((firstEvent(events).data as { delta: string }).delta).toContain("I'm Veer");
    expect(((events[1] as SseEvent).data as { lessons: unknown[] }).lessons).toEqual([]);

    const roles = fake.messages.map((m) => m['role']);
    expect(roles).toEqual(['user', 'assistant']);
    const firstMessage = fake.messages[0]!;
    expect(firstMessage['content']).toBe('hello');
    expect(firstMessage['github_id']).toBe('123');
  });

  it('degrades gracefully when retrieval throws: the turn still completes', async () => {
    const fake = new FakeD1(); // FakeD1.all throws on the FTS query -> tools degrade
    const cookie = await signIn(fake);
    const env = baseEnv(fake, true);
    let calls = 0;
    stubModelFetch((body) => {
      calls++;
      if (body['stream']) {
        const text = 'Based on the retrieved context, here is the answer.';
        return {
          sse: [
            `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
            'data: [DONE]\n\n',
          ],
        };
      }
      if (calls === 1) {
        return {
          json: {
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    {
                      id: 't1',
                      type: 'function',
                      function: {
                        name: 'search_lessons',
                        arguments: JSON.stringify({ query: 'caching', top_k: 3 }),
                      },
                    },
                  ],
                },
              },
            ],
          },
        };
      }
      return { json: chatJson('second round text') };
    });
    const res = await handleQaChat(chatReq(cookie, { message: 'How does caching work?' }), env);
    const events = parseSseEvents(await res.text());
    expect(events.map((e) => e.event)).toEqual(['message', 'sources', 'done']);
    expect((firstEvent(events).data as { delta: string }).delta).toContain('Based on the retrieved context');
  });
});

describe('GET /api/qa/quota', () => {
  it('401s (JSON) when signed out', async () => {
    const fake = new FakeD1();
    const res = await handleQaQuota(
      new Request('https://worker.test/api/qa/quota'),
      baseEnv(fake),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Sign in with GitHub to chat with Veer.' });
  });

  it('reports limit/remaining/resetAt per GitHub user', async () => {
    const fake = new FakeD1();
    const cookie = await signIn(fake);
    const env = baseEnv(fake);
    const first = await handleQaQuota(
      new Request('https://worker.test/api/qa/quota', { headers: { Cookie: cookie } }),
      env,
    );
    expect(await first.json()).toMatchObject({
      limit: QA_DAILY_QUESTION_LIMIT,
      remaining: QA_DAILY_QUESTION_LIMIT,
    });
    fake.messages.push({ github_id: '123', role: 'user', content: 'q', created_at: ISO_NOW() });
    const second = await handleQaQuota(
      new Request('https://worker.test/api/qa/quota', { headers: { Cookie: cookie } }),
      env,
    );
    expect(await second.json()).toMatchObject({ remaining: QA_DAILY_QUESTION_LIMIT - 1 });
  });
});

describe('DELETE /api/qa/session', () => {
  it('401s (JSON) when signed out', async () => {
    const fake = new FakeD1();
    const res = await handleQaDeleteSession(
      new Request('https://worker.test/api/qa/session', { method: 'DELETE' }),
      baseEnv(fake),
    );
    expect(res.status).toBe(401);
  });

  it('wipes the user memory (messages + checkpoint) but keeps the login session', async () => {
    const fake = new FakeD1();
    const cookie = await signIn(fake);
    fake.messages.push({ github_id: '123', role: 'user', content: 'q', created_at: ISO_NOW() });
    await saveCheckpoint(asD1(fake), qaThreadId('123'), emptyQaState('prior context'));
    expect(fake.sessions.size).toBe(1);

    const res = await handleQaDeleteSession(
      new Request('https://worker.test/api/qa/session', { method: 'DELETE', headers: { Cookie: cookie } }),
      baseEnv(fake),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fake.messages).toHaveLength(0);
    expect(await loadCheckpoint(asD1(fake), qaThreadId('123'))).toBeNull();
    // Login session untouched: the user is still signed in.
    expect(fake.sessions.size).toBe(1);
  });
});

describe('qa checkpointer', () => {
  it('round-trips state and deletes cleanly', async () => {
    const fake = new FakeD1();
    const db = asD1(fake);
    expect(await loadCheckpoint(db, 'qa:user:123')).toBeNull();
    await saveCheckpoint(db, 'qa:user:123', emptyQaState('s'));
    const loaded = await loadCheckpoint(db, 'qa:user:123');
    expect(loaded?.state).toMatchObject({ summary: 's' });
    await deleteCheckpoint(db, 'qa:user:123');
    expect(await loadCheckpoint(db, 'qa:user:123')).toBeNull();
  });
});

describe('qa sse helpers', () => {
  it('formats events and error responses', async () => {
    const text = formatSseEvent('message', { delta: 'hi' });
    expect(text).toBe('event: message\ndata: {"delta":"hi"}\n\n');

    const res = sseErrorResponse('QUOTA_EXCEEDED', 'Daily question limit reached.', {
      'Access-Control-Allow-Origin': 'https://veeresh-bikkaneti.github.io',
    });
    expect(res.status).toBe(200);
    const events = parseSseEvents(await res.text());
    expect(events).toEqual([
      { event: 'error', data: { code: 'QUOTA_EXCEEDED', message: 'Daily question limit reached.' } },
    ]);
  });

  it('sseResponse emits a chunked stream', async () => {
    const res = sseResponse(['chunk1', 'chunk2'], 200, { 'Access-Control-Allow-Origin': 'x' });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    // sseResponse enqueues the given chunks verbatim (callers pre-format
    // with formatSseEvent); it does not add framing itself.
    expect(await res.text()).toBe('chunk1chunk2');
  });
});
