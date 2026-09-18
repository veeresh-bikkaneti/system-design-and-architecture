// P0 (course Q&A agent): tests for the qa/ modules.
//
// There is no D1 in unit tests, so this file ships a minimal in-memory
// FakeD1 that understands exactly the SQL statements the qa/ modules
// emit. If a module starts emitting a new statement shape, the fake
// throws -- that is intentional: it keeps the fake honest about what it
// actually covers.

import { describe, expect, it } from 'vitest';
import workerDefault, { type Env } from '../index';
import { deleteCheckpoint, loadCheckpoint, saveCheckpoint } from './checkpointer';
import { MAX_TRANSCRIPT_TURNS, runQaTurn } from './graph';
import {
  QA_DAILY_QUESTION_LIMIT,
  QA_MAX_MESSAGE_CHARS,
  QA_P0_ECHO_PREFIX,
  handleQaChat,
  handleQaCreateSession,
  handleQaDeleteSession,
  handleQaQuota,
  isValidUuid,
} from './routes';
import { chunkText, formatSseEvent, sseErrorResponse, sseResponse } from './sse';

type Row = Record<string, string | number | null>;

/** In-memory stand-in for D1Database covering only qa/* SQL shapes. */
class FakeD1 {
  sessions = new Map<string, Row>();
  messages: Row[] = [];
  checkpoints = new Map<string, Row>();
  counters = new Map<string, number>();
  private nextMessageId = 1;

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql);
  }

  allocMessageId(): number {
    return this.nextMessageId++;
  }
}

class FakeStatement {
  private params: unknown[] = [];
  constructor(
    private db: FakeD1,
    private sql: string,
  ) {}

  bind(...params: unknown[]): FakeStatement {
    this.params = params;
    return this;
  }

  private normalized(): string {
    return this.sql.replace(/\s+/g, ' ').trim().toUpperCase();
  }

  private p(i: number): string {
    const v = this.params[i];
    if (typeof v !== 'string') throw new Error(`FakeD1: expected string param ${i}, got ${typeof v}`);
    return v;
  }

  async first<T>(): Promise<T | null> {
    const sql = this.normalized();
    if (sql.startsWith('SELECT ID, CREATED_AT, EXPIRES_AT FROM QA_SESSIONS WHERE ID = ?')) {
      return (this.db.sessions.get(this.p(0)) as T | undefined) ?? null;
    }
    if (sql.startsWith('SELECT COUNT(*) AS COUNT FROM QA_MESSAGES')) {
      const count = this.db.messages.filter(
        (m) => m['session_id'] === this.params[0] && m['role'] === 'user' && (m['created_at'] as string) >= (this.params[1] as string),
      ).length;
      return { count } as T;
    }
    if (sql.startsWith('SELECT STATE, UPDATED_AT FROM QA_CHECKPOINTS WHERE THREAD_ID = ?')) {
      return (this.db.checkpoints.get(this.p(0)) as T | undefined) ?? null;
    }
    if (sql.startsWith('INSERT INTO RATE_LIMIT_COUNTERS')) {
      const key = `${this.params[0]}|${this.params[1]}`;
      const count = (this.db.counters.get(key) ?? 0) + 1;
      this.db.counters.set(key, count);
      return { count } as T;
    }
    throw new Error(`FakeD1.first: unsupported SQL: ${this.sql}`);
  }

  async all<T>(): Promise<{ results: T[] }> {
    throw new Error(`FakeD1.all: unsupported SQL: ${this.sql}`);
  }

  async run(): Promise<{ success: boolean }> {
    const sql = this.normalized();
    if (sql.startsWith('INSERT INTO QA_SESSIONS')) {
      this.db.sessions.set(this.p(0), { id: this.p(0), created_at: this.p(1), expires_at: this.p(2) });
      return { success: true };
    }
    if (sql.startsWith('DELETE FROM QA_SESSIONS WHERE ID = ?')) {
      this.db.sessions.delete(this.p(0));
      return { success: true };
    }
    if (sql.startsWith('INSERT INTO QA_MESSAGES')) {
      this.db.messages.push({
        id: this.db.allocMessageId(),
        session_id: this.p(0),
        role: this.p(1),
        content: this.p(2),
        created_at: this.p(3),
      });
      return { success: true };
    }
    if (sql.startsWith('DELETE FROM QA_MESSAGES WHERE SESSION_ID = ?')) {
      this.db.messages = this.db.messages.filter((m) => m['session_id'] !== this.params[0]);
      return { success: true };
    }
    if (sql.startsWith('INSERT INTO QA_CHECKPOINTS')) {
      this.db.checkpoints.set(this.p(0), {
        thread_id: this.p(0),
        state: this.p(1),
        updated_at: this.p(2),
      });
      return { success: true };
    }
    if (sql.startsWith('DELETE FROM QA_CHECKPOINTS WHERE THREAD_ID = ?')) {
      this.db.checkpoints.delete(this.p(0));
      return { success: true };
    }
    throw new Error(`FakeD1.run: unsupported SQL: ${this.sql}`);
  }
}

function makeEnv(db: FakeD1): Env {
  return { DB: db as unknown as D1Database };
}

function jsonRequest(path: string, method: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

interface SseEvent {
  event: string;
  data: unknown;
}

async function readSseEvents(res: Response): Promise<SseEvent[]> {
  const text = await res.text();
  return text
    .split('\n\n')
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .map((block) => {
      const lines = block.split('\n');
      const event = (lines[0] ?? '').replace(/^event:\s*/, '');
      const dataText = lines
        .slice(1)
        .map((l) => l.replace(/^data:\s?/, ''))
        .join('\n');
      return { event, data: JSON.parse(dataText) as unknown };
    });
}

async function createSession(env: Env): Promise<string> {
  const res = await handleQaCreateSession(jsonRequest('/api/qa/session', 'POST', {}), env);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { sessionId: string };
  expect(isValidUuid(body.sessionId)).toBe(true);
  return body.sessionId;
}

async function chat(env: Env, sessionId: string, message: string): Promise<Response> {
  return handleQaChat(jsonRequest('/api/qa/chat', 'POST', { sessionId, message }), env);
}

describe('sse helpers', () => {
  it('formats a well-formed SSE event with JSON data', () => {
    expect(formatSseEvent('message', { delta: 'hi' })).toBe('event: message\ndata: {"delta":"hi"}\n\n');
  });

  it('sseResponse sets the event-stream content type', async () => {
    const res = sseResponse([formatSseEvent('done', {})]);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(await res.text()).toBe('event: done\ndata: {}\n\n');
  });

  it('sseErrorResponse emits a single error event', async () => {
    const events = await readSseEvents(sseErrorResponse('NOPE', 'bad'));
    expect(events).toEqual([{ event: 'error', data: { code: 'NOPE', message: 'bad' } }]);
  });

  it('chunkText splits into at most maxChunks non-empty pieces that rejoin', () => {
    const text = 'abcdefghijklmnopqrstuvwxyz';
    const chunks = chunkText(text, 3);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(3);
    expect(chunks.join('')).toBe(text);
    expect(chunkText('')).toEqual([]);
  });
});

describe('isValidUuid', () => {
  it('accepts canonical uuids (any version, case-insensitive)', () => {
    expect(isValidUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isValidUuid('ABCDEF12-3456-7890-ABCD-EF1234567890')).toBe(true);
  });

  it('rejects non-uuids and non-strings', () => {
    for (const bad of ['', 'not-a-uuid', '123e4567-e89b-12d3-a456', 42, null, undefined, {}, []]) {
      expect(isValidUuid(bad)).toBe(false);
    }
  });
});

describe('D1 checkpointer', () => {
  it('round-trips graph state per thread id', async () => {
    const db = new FakeD1();
    expect(await loadCheckpoint(db as unknown as D1Database, 't1')).toBeNull();
    const state = {
      messages: [{ role: 'user' as const, content: 'hello' }],
      inScope: true,
      sources: [],
      draft: 'd',
      finalAnswer: 'f',
    };
    await saveCheckpoint(db as unknown as D1Database, 't1', state);
    const loaded = await loadCheckpoint(db as unknown as D1Database, 't1');
    expect(loaded?.state).toEqual(state);
    // Threads are isolated.
    expect(await loadCheckpoint(db as unknown as D1Database, 't2')).toBeNull();
  });

  it('treats corrupt state as missing instead of wedging the session', async () => {
    const db = new FakeD1();
    db.checkpoints.set('t1', { thread_id: 't1', state: 'not-json{{{', updated_at: 'x' });
    expect(await loadCheckpoint(db as unknown as D1Database, 't1')).toBeNull();
  });

  it('deleteCheckpoint removes the row', async () => {
    const db = new FakeD1();
    const d1 = db as unknown as D1Database;
    await saveCheckpoint(d1, 't1', { messages: [], inScope: true, sources: [], draft: '', finalAnswer: '' });
    await deleteCheckpoint(d1, 't1');
    expect(await loadCheckpoint(d1, 't1')).toBeNull();
  });
});

describe('graph two-turn memory', () => {
  it('persists the transcript across turns via the D1 checkpoint', async () => {
    const db = new FakeD1();
    const d1 = db as unknown as D1Database;
    const sessionId = '123e4567-e89b-12d3-a456-426614174000';

    const turn1 = await runQaTurn(d1, sessionId, 'what is the CAP theorem?');
    expect(turn1.finalAnswer).toBe(`${QA_P0_ECHO_PREFIX}what is the CAP theorem?`);
    // P1: retrieval now attaches real lesson slugs as sources.
    expect(turn1.sources).toContain('cap-theorem');

    const turn2 = await runQaTurn(d1, sessionId, 'and how does it relate to consistency?');
    expect(turn2.finalAnswer).toBe(`${QA_P0_ECHO_PREFIX}and how does it relate to consistency?`);

    // The checkpointer -- not the caller -- carried the transcript.
    const checkpoint = await loadCheckpoint(d1, sessionId);
    expect(checkpoint).not.toBeNull();
    const transcript = checkpoint?.state.messages ?? [];
    expect(transcript).toHaveLength(4);
    expect(transcript[0]).toEqual({ role: 'user', content: 'what is the CAP theorem?' });
    expect(transcript[1]?.role).toBe('assistant');
    expect(transcript[2]).toEqual({ role: 'user', content: 'and how does it relate to consistency?' });
    expect(transcript[3]?.role).toBe('assistant');
  });

  it('trims the transcript window to a bounded size', async () => {
    const db = new FakeD1();
    const d1 = db as unknown as D1Database;
    const sessionId = '123e4567-e89b-12d3-a456-426614174000';
    // MAX_TRANSCRIPT_TURNS/2 turns + 1 more forces a trim.
    const turns = MAX_TRANSCRIPT_TURNS / 2 + 1;
    for (let i = 0; i < turns; i++) {
      await runQaTurn(d1, sessionId, `question ${i}`);
    }
    const checkpoint = await loadCheckpoint(d1, sessionId);
    expect((checkpoint?.state.messages.length ?? 0)).toBeLessThanOrEqual(MAX_TRANSCRIPT_TURNS);
  });
});

describe('worker fetch wiring', () => {
  it('serves /api/qa/* through the default export', async () => {
    const env = makeEnv(new FakeD1());
        const created = await workerDefault.fetch(jsonRequest('/api/qa/session', 'POST', {}), env);
    expect(created.status).toBe(200);
    const { sessionId } = (await created.json()) as { sessionId: string };

    const chatRes = await workerDefault.fetch(
      jsonRequest('/api/qa/chat', 'POST', { sessionId, message: 'wired?' }),
      env,
    );
    expect(chatRes.status).toBe(200);
    const events = await readSseEvents(chatRes);
    expect(events[events.length - 1]).toEqual({ event: 'done', data: {} });

    const quota = await workerDefault.fetch(
      new Request(`http://localhost/api/qa/quota?sessionId=${sessionId}`),
      env,
    );
    expect(quota.status).toBe(200);

    const deleted = await workerDefault.fetch(
      jsonRequest('/api/qa/session', 'DELETE', { sessionId }),
      env,
    );
    expect((await deleted.json()) as { ok: boolean }).toEqual({ ok: true });

    const unknown = await workerDefault.fetch(new Request('http://localhost/api/qa/nope'), env);
    expect(unknown.status).toBe(404);
  });
});

describe('POST /api/qa/session', () => {
  it('mints a uuid session and stores it', async () => {
    const db = new FakeD1();
    const env = makeEnv(db);
    const sessionId = await createSession(env);
    const row = db.sessions.get(sessionId);
    expect(row).toBeDefined();
    // 30-day TTL.
    const ttlMs = new Date(row?.['expires_at'] as string).getTime() - new Date(row?.['created_at'] as string).getTime();
    expect(ttlMs).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('POST /api/qa/chat', () => {
  it('streams an echo: message deltas, then sources, then done', async () => {
    const env = makeEnv(new FakeD1());
    const sessionId = await createSession(env);
    // Gibberish retrieves nothing, so the sources event is honestly empty.
    const res = await chat(env, sessionId, 'zxqv wjbmpl kzx');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const events = await readSseEvents(res);
    const messageEvents = events.filter((e) => e.event === 'message');
    expect(messageEvents.length).toBeGreaterThanOrEqual(1);
    const joined = messageEvents.map((e) => (e.data as { delta: string }).delta).join('');
    expect(joined).toBe(`${QA_P0_ECHO_PREFIX}zxqv wjbmpl kzx`);

    expect(events).toContainEqual({ event: 'sources', data: { lessons: [] } });
    expect(events[events.length - 1]).toEqual({ event: 'done', data: {} });
  });

  it('streams real citations for a course question (P1 retrieval)', async () => {
    const env = makeEnv(new FakeD1());
    const sessionId = await createSession(env);
    const res = await chat(env, sessionId, 'What is the CAP theorem?');
    const events = await readSseEvents(res);
    const sources = events.find((e) => e.event === 'sources');
    expect(sources).toBeDefined();
    const lessons = (sources?.data as { lessons: Array<{ slug: string; title: string }> }).lessons;
    // Citation shape matches the frontend QaSource contract {slug, title}.
    expect(lessons[0]).toEqual({ slug: 'cap-theorem', title: 'The CAP Theorem' });
  });

  it('writes user and assistant turns to the qa_messages audit trail', async () => {
    const db = new FakeD1();
    const env = makeEnv(db);
    const sessionId = await createSession(env);
    await chat(env, sessionId, 'first question');
    expect(db.messages).toHaveLength(2);
    expect(db.messages[0]?.['role']).toBe('user');
    expect(db.messages[0]?.['content']).toBe('first question');
    expect(db.messages[1]?.['role']).toBe('assistant');
    expect(db.messages[1]?.['content']).toBe(`${QA_P0_ECHO_PREFIX}first question`);
  });

  it('rejects a malformed sessionId with INVALID_SESSION_ID', async () => {
    const env = makeEnv(new FakeD1());
    const events = await readSseEvents(await chat(env, 'not-a-uuid', 'hi'));
    expect(events).toEqual([
      { event: 'error', data: { code: 'INVALID_SESSION_ID', message: 'sessionId must be a uuid' } },
    ]);
  });

  it('rejects empty and over-long messages', async () => {
    const env = makeEnv(new FakeD1());
    const sessionId = await createSession(env);

    const empty = await readSseEvents(await chat(env, sessionId, '   '));
    expect(empty[0]?.event).toBe('error');
    expect((empty[0]?.data as { code: string }).code).toBe('MESSAGE_EMPTY');

    const long = await readSseEvents(await chat(env, sessionId, 'x'.repeat(QA_MAX_MESSAGE_CHARS + 1)));
    expect((long[0]?.data as { code: string }).code).toBe('MESSAGE_TOO_LONG');

    const nonString = await handleQaChat(
      jsonRequest('/api/qa/chat', 'POST', { sessionId, message: 42 }),
      env,
    );
    expect(((await readSseEvents(nonString))[0]?.data as { code: string }).code).toBe('INVALID_MESSAGE');
  });

  it('rejects unknown sessions with SESSION_NOT_FOUND', async () => {
    const env = makeEnv(new FakeD1());
    const events = await readSseEvents(await chat(env, '123e4567-e89b-12d3-a456-426614174000', 'hi'));
    expect((events[0]?.data as { code: string }).code).toBe('SESSION_NOT_FOUND');
  });

  it('rejects expired sessions with SESSION_EXPIRED and cleans them up', async () => {
    const db = new FakeD1();
    const env = makeEnv(db);
    const sessionId = '123e4567-e89b-12d3-a456-426614174000';
    db.sessions.set(sessionId, {
      id: sessionId,
      created_at: '2020-01-01T00:00:00.000Z',
      expires_at: '2020-01-31T00:00:00.000Z',
    });
    const events = await readSseEvents(await chat(env, sessionId, 'hi'));
    expect((events[0]?.data as { code: string }).code).toBe('SESSION_EXPIRED');
    expect(db.sessions.has(sessionId)).toBe(false);
  });

  it('enforces the 50-question daily cap with QUOTA_EXCEEDED', async () => {
    const db = new FakeD1();
    const env = makeEnv(db);
    const sessionId = await createSession(env);
    // Seed 50 user questions today directly -- faster than 50 graph turns.
    const today = new Date().toISOString();
    for (let i = 0; i < QA_DAILY_QUESTION_LIMIT; i++) {
      db.messages.push({
        id: i + 1,
        session_id: sessionId,
        role: 'user',
        content: `q${i}`,
        created_at: today,
      });
    }
    const events = await readSseEvents(await chat(env, sessionId, 'one more'));
    expect((events[0]?.data as { code: string }).code).toBe('QUOTA_EXCEEDED');
  });

  it('rejects a non-JSON content type with HTTP 400', async () => {
    const env = makeEnv(new FakeD1());
    const req = new Request('http://localhost/api/qa/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hello',
    });
    const res = await handleQaChat(req, env);
    expect(res.status).toBe(415);
  });

  it('reflects an allowlisted Origin on the SSE stream (cross-origin widget)', async () => {
    const env = makeEnv(new FakeD1());
    const sessionId = await createSession(env);
    const req = new Request('http://localhost/api/qa/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://veeresh-bikkaneti.github.io',
      },
      body: JSON.stringify({ sessionId, message: 'cors check' }),
    });
    const res = await handleQaChat(req, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://veeresh-bikkaneti.github.io');

    const evil = new Request('http://localhost/api/qa/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example.com',
      },
      body: JSON.stringify({ sessionId, message: 'cors check' }),
    });
    const evilRes = await handleQaChat(evil, env);
    expect(evilRes.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('GET /api/qa/quota', () => {
  it('reports limit, remaining and resetAt', async () => {
    const env = makeEnv(new FakeD1());
    const sessionId = await createSession(env);
    const res = await handleQaQuota(
      new Request(`http://localhost/api/qa/quota?sessionId=${sessionId}`),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { limit: number; remaining: number; resetAt: string };
    expect(body.limit).toBe(QA_DAILY_QUESTION_LIMIT);
    expect(body.remaining).toBe(QA_DAILY_QUESTION_LIMIT);
    expect(new Date(body.resetAt).getTime()).toBeGreaterThan(Date.now());

    await chat(env, sessionId, 'one question');
    const res2 = await handleQaQuota(
      new Request(`http://localhost/api/qa/quota?sessionId=${sessionId}`),
      env,
    );
    const body2 = (await res2.json()) as { remaining: number };
    expect(body2.remaining).toBe(QA_DAILY_QUESTION_LIMIT - 1);
  });

  it('400s on a malformed sessionId and 404s on an unknown one', async () => {
    const env = makeEnv(new FakeD1());
    const bad = await handleQaQuota(new Request('http://localhost/api/qa/quota?sessionId=nope'), env);
    expect(bad.status).toBe(400);
    const missing = await handleQaQuota(
      new Request('http://localhost/api/qa/quota?sessionId=123e4567-e89b-12d3-a456-426614174000'),
      env,
    );
    expect(missing.status).toBe(404);
  });
});

describe('DELETE /api/qa/session', () => {
  it('wipes session rows, messages and checkpoint; chat afterwards fails', async () => {
    const db = new FakeD1();
    const env = makeEnv(db);
    const sessionId = await createSession(env);
    await chat(env, sessionId, 'remember me');
    expect(db.checkpoints.has(sessionId)).toBe(true);

    const del = await handleQaDeleteSession(
      jsonRequest('/api/qa/session', 'DELETE', { sessionId }),
      env,
    );
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ ok: true });
    expect(db.sessions.has(sessionId)).toBe(false);
    expect(db.checkpoints.has(sessionId)).toBe(false);
    expect(db.messages.filter((m) => m['session_id'] === sessionId)).toHaveLength(0);

    const events = await readSseEvents(await chat(env, sessionId, 'hi again'));
    expect((events[0]?.data as { code: string }).code).toBe('SESSION_NOT_FOUND');
  });

  it('is idempotent and 400s on a malformed sessionId', async () => {
    const env = makeEnv(new FakeD1());
    const again = await handleQaDeleteSession(
      jsonRequest('/api/qa/session', 'DELETE', { sessionId: '123e4567-e89b-12d3-a456-426614174000' }),
      env,
    );
    expect(await again.json()).toEqual({ ok: true });

    const bad = await handleQaDeleteSession(jsonRequest('/api/qa/session', 'DELETE', { sessionId: 'nope' }), env);
    expect(bad.status).toBe(400);
  });
});
