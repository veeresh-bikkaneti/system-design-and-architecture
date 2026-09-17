// P0 (course Q&A agent): HTTP handlers for /api/qa/*.
//
// Contract (the frontend widget implements against this -- do not deviate):
//   POST   /api/qa/session  -> 200 {"sessionId":"<uuid>"}
//   POST   /api/qa/chat     -> 200 text/event-stream; `message` deltas,
//                               then `sources` {"lessons":[]}, then `done`.
//                               Logical errors arrive as `error` events.
//   DELETE /api/qa/session  -> 200 {"ok":true} (body: {"sessionId"})
//   GET    /api/qa/quota?sessionId=... -> 200 {"limit":50,"remaining":N,"resetAt":"<iso>"}
//
// Quotas: 50 questions per session per UTC day, counted from the
// qa_messages audit trail. Sessions expire 30 days after creation; expired
// sessions are rejected (and lazily cleaned up on contact).

import type { Env } from '../index';
import { corsHeaders, jsonResponse, parseJsonBody } from '../index';
import { checkRateLimit, currentWindowHour } from '../auth';
import { sha256Hex } from '../crypto';
import { deleteCheckpoint } from './checkpointer';
import { runQaTurn } from './graph';
import { chunkText, formatSseEvent, sseErrorResponse, sseResponse } from './sse';

export const QA_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const QA_MAX_MESSAGE_CHARS = 2000;
export const QA_DAILY_QUESTION_LIMIT = 50;
// P0 stub copy -- P1/P2 replace the echo text in graph.ts's reasonActNode.
export const QA_P0_ECHO_PREFIX = 'P0 stub \u2014 you said: ';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Not a secret -- same data-minimization rationale as index.ts's
// IP_HASH_PEPPER: raw IPs are never stored at rest.
const QA_IP_PEPPER = 'sdm-qa-v1';

interface QaSessionRow {
  id: string;
  created_at: string;
  expires_at: string;
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function utcDayStartIso(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function nextUtcMidnightIso(now: Date = new Date()): string {
  return new Date(new Date(utcDayStartIso(now)).getTime() + 24 * 60 * 60 * 1000).toISOString();
}

// Per-IP fixed-window throttle, same shape as index.ts's throttleByIp.
// Returns true when the request may proceed. Skips when CF-Connecting-IP
// is absent (local dev / non-edge), matching the existing convention.
async function qaThrottleByIp(
  request: Request,
  db: D1Database,
  bucket: string,
  maxPerHour: number,
): Promise<boolean> {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return true;
  return checkRateLimit(db, `${bucket}:ip:${await sha256Hex(`${QA_IP_PEPPER}:${ip}`)}`, currentWindowHour(), maxPerHour);
}

async function countQuestionsToday(db: D1Database, sessionId: string, now: Date): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM qa_messages
       WHERE session_id = ? AND role = 'user' AND created_at >= ?`,
    )
    .bind(sessionId, utcDayStartIso(now))
    .first<{ count: number }>();
  return row?.count ?? 0;
}

async function loadSession(db: D1Database, sessionId: string): Promise<QaSessionRow | null> {
  return db
    .prepare('SELECT id, created_at, expires_at FROM qa_sessions WHERE id = ?')
    .bind(sessionId)
    .first<QaSessionRow>();
}

async function insertMessage(
  db: D1Database,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  now: Date,
): Promise<void> {
  await db
    .prepare('INSERT INTO qa_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)')
    .bind(sessionId, role, content, now.toISOString())
    .run();
}

/** POST /api/qa/session -- mint an anonymous session id. */
export async function handleQaCreateSession(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request.headers.get('Origin'));
  if (!(await qaThrottleByIp(request, env.DB, 'qa_session_create', 30))) {
    return jsonResponse({ error: 'Too many attempts. Try again later.' }, { status: 429, headers: cors });
  }
  const sessionId = crypto.randomUUID();
  const now = new Date();
  await env.DB.prepare('INSERT INTO qa_sessions (id, created_at, expires_at) VALUES (?, ?, ?)')
    .bind(sessionId, now.toISOString(), new Date(now.getTime() + QA_SESSION_TTL_MS).toISOString())
    .run();
  return jsonResponse({ sessionId }, { headers: cors });
}

/** DELETE /api/qa/session -- wipe a session's rows and its checkpoint. */
export async function handleQaDeleteSession(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request.headers.get('Origin'));
  const parsed = await parseJsonBody(request, cors);
  if ('errorResponse' in parsed) return parsed.errorResponse;
  const { sessionId } = (parsed.body && typeof parsed.body === 'object' ? parsed.body : {}) as {
    sessionId?: unknown;
  };
  if (!isValidUuid(sessionId)) {
    return jsonResponse({ error: 'sessionId must be a uuid' }, { status: 400, headers: cors });
  }
  // Idempotent: deleting a missing session is still {"ok":true} so the
  // widget's "New topic" button can't get stuck on a retry.
  await env.DB.prepare('DELETE FROM qa_messages WHERE session_id = ?').bind(sessionId).run();
  await deleteCheckpoint(env.DB, sessionId);
  await env.DB.prepare('DELETE FROM qa_sessions WHERE id = ?').bind(sessionId).run();
  return jsonResponse({ ok: true }, { headers: cors });
}

/** GET /api/qa/quota?sessionId=... -- visible quota for the widget. */
export async function handleQaQuota(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request.headers.get('Origin'));
  const sessionId = new URL(request.url).searchParams.get('sessionId');
  if (!isValidUuid(sessionId)) {
    return jsonResponse({ error: 'sessionId must be a uuid' }, { status: 400, headers: cors });
  }
  const session = await loadSession(env.DB, sessionId);
  if (!session) {
    return jsonResponse({ error: 'Unknown session' }, { status: 404, headers: cors });
  }
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return jsonResponse({ error: 'Session expired' }, { status: 410, headers: cors });
  }
  const now = new Date();
  const used = await countQuestionsToday(env.DB, sessionId, now);
  return jsonResponse(
    {
      limit: QA_DAILY_QUESTION_LIMIT,
      remaining: Math.max(0, QA_DAILY_QUESTION_LIMIT - used),
      resetAt: nextUtcMidnightIso(now),
    },
    { headers: cors },
  );
}

/**
 * POST /api/qa/chat -- run one agent turn and stream the answer as SSE.
 * All logical failures (bad input, unknown/expired session, quota, rate
 * limit) are delivered as `error` events on a 200 stream, per the widget
 * contract. Only an unparseable body gets a plain HTTP 400.
 */
export async function handleQaChat(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request.headers.get('Origin'));
  const parsed = await parseJsonBody(request, cors);
  if ('errorResponse' in parsed) return parsed.errorResponse;
  const { sessionId, message } = (parsed.body && typeof parsed.body === 'object' ? parsed.body : {}) as {
    sessionId?: unknown;
    message?: unknown;
  };

  if (!isValidUuid(sessionId)) {
    return sseErrorResponse('INVALID_SESSION_ID', 'sessionId must be a uuid', cors);
  }
  if (typeof message !== 'string') {
    return sseErrorResponse('INVALID_MESSAGE', 'message must be a string', cors);
  }
  if (message.trim().length === 0) {
    return sseErrorResponse('MESSAGE_EMPTY', 'message must not be empty', cors);
  }
  if (message.length > QA_MAX_MESSAGE_CHARS) {
    return sseErrorResponse(
      'MESSAGE_TOO_LONG',
      `message must be at most ${QA_MAX_MESSAGE_CHARS} characters`,
      cors,
    );
  }

  if (!(await qaThrottleByIp(request, env.DB, 'qa_chat', 120))) {
    return sseErrorResponse('RATE_LIMITED', 'Too many requests. Try again later.', cors);
  }

  const session = await loadSession(env.DB, sessionId);
  if (!session) {
    return sseErrorResponse('SESSION_NOT_FOUND', 'Unknown session', cors);
  }
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    // Lazy cleanup: an expired session the client still holds is dead
    // weight -- remove it so it can't be retried forever.
    await env.DB.prepare('DELETE FROM qa_messages WHERE session_id = ?').bind(sessionId).run();
    await deleteCheckpoint(env.DB, sessionId);
    await env.DB.prepare('DELETE FROM qa_sessions WHERE id = ?').bind(sessionId).run();
    return sseErrorResponse('SESSION_EXPIRED', 'Session expired. Start a new topic.', cors);
  }

  const now = new Date();
  const used = await countQuestionsToday(env.DB, sessionId, now);
  if (used >= QA_DAILY_QUESTION_LIMIT) {
    return sseErrorResponse('QUOTA_EXCEEDED', 'Daily question limit reached. Try again tomorrow.', cors);
  }

  await insertMessage(env.DB, sessionId, 'user', message, now);

  let finalAnswer: string;
  let sources: string[];
  try {
    ({ finalAnswer, sources } = await runQaTurn(env.DB, sessionId, message));
  } catch {
    return sseErrorResponse('INTERNAL_ERROR', 'Something went wrong. Try again.', cors);
  }

  await insertMessage(env.DB, sessionId, 'assistant', finalAnswer, new Date());

  const chunks: string[] = chunkText(finalAnswer).map((delta) =>
    formatSseEvent('message', { delta }),
  );
  chunks.push(formatSseEvent('sources', { lessons: sources }));
  chunks.push(formatSseEvent('done', {}));
  return sseResponse(chunks, 200, cors);
}
