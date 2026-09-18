// Course Q&A agent ("Veer"): HTTP handlers for /api/qa/*.
//
// Contract (the frontend widget implements against this -- do not deviate):
//   POST   /api/qa/chat     -> 200 text/event-stream; `message` deltas,
//                               then `sources` {"lessons":[{"slug","title"}]},
//                               then `done`. Logical errors arrive as
//                               `error` events.
//   DELETE /api/qa/session  -> 200 {"ok":true} (empty body; cookie auth)
//   GET    /api/qa/quota    -> 200 {"limit":50,"remaining":N,"resetAt":"<iso>"}
//                               (cookie auth; 401 JSON when signed out)
//
// AUTH: every endpoint here requires the GitHub-login session cookie (see
// oauth.ts). Anonymous access to the tutor does not exist -- the model calls
// cost money and the login is the abuse/DDoS gate. Quotas are per GitHub
// user per UTC day (50), counted from the qa_messages audit trail keyed by
// github_id. Checkpoints are per-user (thread `qa:user:<github_id>`).
//
// NOTE on the routes <-> oauth import cycle: oauth.ts imports qaThrottleByIp
// from here, and this module imports getQaUser from oauth.ts. Both are
// function declarations used only at request time, so the cycle is benign.

import type { Env } from '../index';
import { corsHeaders, jsonResponse, parseJsonBody } from '../index';
import { checkRateLimit, currentWindowHour } from '../auth';
import { sha256Hex } from '../crypto';
import { deleteCheckpoint } from './checkpointer';
import { qaThreadId, runQaTurn } from './graph';
import { createQaModel } from './model';
import { getQaUser } from './oauth';
import { formatSseEvent, sseErrorResponse } from './sse';

export const QA_DAILY_QUESTION_LIMIT = 50; // per GitHub user, per UTC day
export const QA_MAX_MESSAGE_CHARS = 2000;

// Not a secret -- same data-minimization rationale as index.ts's
// IP_HASH_PEPPER: raw IPs are never stored at rest.
const QA_IP_PEPPER = 'sdm-qa-v1';

/**
 * CORS headers for /api/qa/*: the allowlisted origin (echoed exactly, or
 * nothing) PLUS Access-Control-Allow-Credentials. The widget calls these
 * endpoints cross-site (github.io -> workers.dev) with credentials:'include'
 * so the HttpOnly session cookie is sent; without ACA-Credentials the
 * browser would strip the cookie. The origin allowlist still applies --
 * a non-allowlisted Origin gets no ACAO header at all.
 */
export function qaCorsHeaders(origin: string | null): HeadersInit {
  const headers = new Headers(corsHeaders(origin));
  headers.set('Access-Control-Allow-Credentials', 'true');
  return headers;
}

// Per-IP fixed-window throttle, same shape as index.ts's throttleByIp.
// Returns true when the request may proceed. Skips when CF-Connecting-IP
// is absent (local dev / non-edge), matching the existing convention.
export async function qaThrottleByIp(
  request: Request,
  db: D1Database,
  bucket: string,
  maxPerHour: number,
): Promise<boolean> {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return true;
  return checkRateLimit(db, `${bucket}:ip:${await sha256Hex(`${QA_IP_PEPPER}:${ip}`)}`, currentWindowHour(), maxPerHour);
}

function utcDayStartIso(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function nextUtcMidnightIso(now: Date = new Date()): string {
  return new Date(new Date(utcDayStartIso(now)).getTime() + 24 * 60 * 60 * 1000).toISOString();
}

async function countQuestionsToday(db: D1Database, githubId: string, now: Date): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM qa_messages
       WHERE github_id = ? AND role = 'user' AND created_at >= ?`,
    )
    .bind(githubId, utcDayStartIso(now))
    .first<{ count: number }>();
  return row?.count ?? 0;
}

async function insertMessage(
  db: D1Database,
  githubId: string,
  role: 'user' | 'assistant',
  content: string,
  now: Date,
): Promise<void> {
  await db
    .prepare('INSERT INTO qa_messages (github_id, role, content, created_at) VALUES (?, ?, ?, ?)')
    .bind(githubId, role, content, now.toISOString())
    .run();
}

/**
 * DELETE /api/qa/session -- wipe the signed-in user's tutor memory
 * (transcript audit + LangGraph checkpoint). "New topic" forgets the
 * conversation; it does NOT sign the user out (see /api/qa/auth/logout).
 * Idempotent: always {"ok":true} so the widget's button can't get stuck.
 */
export async function handleQaDeleteSession(request: Request, env: Env): Promise<Response> {
  const cors = qaCorsHeaders(request.headers.get('Origin'));
  const user = await getQaUser(env.DB, request);
  if (!user) {
    return jsonResponse({ error: 'Sign in with GitHub to chat with Veer.' }, { status: 401, headers: cors });
  }
  await env.DB.prepare('DELETE FROM qa_messages WHERE github_id = ?').bind(user.github_id).run();
  await deleteCheckpoint(env.DB, qaThreadId(user.github_id));
  return jsonResponse({ ok: true }, { headers: cors });
}

/** GET /api/qa/quota -- visible quota for the widget (cookie auth). */
export async function handleQaQuota(request: Request, env: Env): Promise<Response> {
  const cors = qaCorsHeaders(request.headers.get('Origin'));
  const user = await getQaUser(env.DB, request);
  if (!user) {
    return jsonResponse({ error: 'Sign in with GitHub to chat with Veer.' }, { status: 401, headers: cors });
  }
  const now = new Date();
  const used = await countQuestionsToday(env.DB, user.github_id, now);
  return jsonResponse(
    {
      limit: QA_DAILY_QUESTION_LIMIT,
      remaining: Math.max(0, QA_DAILY_QUESTION_LIMIT - used),
      resetAt: nextUtcMidnightIso(now),
    },
    { headers: cors },
  );
}

function sseStreamHeaders(cors: HeadersInit): Headers {
  const headers = new Headers(cors);
  headers.set('content-type', 'text/event-stream; charset=utf-8');
  headers.set('cache-control', 'no-cache');
  headers.set('x-content-type-options', 'nosniff');
  return headers;
}

/**
 * POST /api/qa/chat -- run one agent turn and stream the answer as SSE.
 * Login-gated: unauthenticated callers get an `error` event (HTTP 200),
 * never an anonymous turn. All other logical failures (bad input, quota,
 * rate limit, AI unavailable) are likewise `error` events on a 200 stream,
 * per the widget contract. Only an unparseable body gets a plain HTTP 4xx.
 */
export async function handleQaChat(request: Request, env: Env): Promise<Response> {
  const cors = qaCorsHeaders(request.headers.get('Origin'));

  // Gate 1: GitHub login. Anonymous chat must not exist -- this is the
  // abuse/DDoS boundary for the Workers AI model.
  const user = await getQaUser(env.DB, request);
  if (!user) {
    return sseErrorResponse('UNAUTHENTICATED', 'Sign in with GitHub to chat with Veer.', cors);
  }

  const parsed = await parseJsonBody(request, cors);
  if ('errorResponse' in parsed) return parsed.errorResponse;
  const { message } = (parsed.body && typeof parsed.body === 'object' ? parsed.body : {}) as {
    message?: unknown;
  };

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

  // Gate 2: per-IP throttle stays as a second layer (pre-auth scraping,
  // NAT-shared flooding, auth-endpoint abuse).
  if (!(await qaThrottleByIp(request, env.DB, 'qa_chat', 120))) {
    return sseErrorResponse('RATE_LIMITED', 'Too many requests. Try again later.', cors);
  }

  // The tutor backend isn't wired up (no [ai] binding): fail BEFORE the
  // audit write so unavailable requests consume neither quota nor rows.
  const model = createQaModel(env);
  if (!model) {
    return sseErrorResponse(
      'AI_UNAVAILABLE',
      'The course tutor is not connected yet. Please try again later.',
      cors,
    );
  }

  const now = new Date();
  const used = await countQuestionsToday(env.DB, user.github_id, now);
  if (used >= QA_DAILY_QUESTION_LIMIT) {
    return sseErrorResponse('QUOTA_EXCEEDED', 'Daily question limit reached. Try again tomorrow.', cors);
  }

  await insertMessage(env.DB, user.github_id, 'user', message, now);

  // Real token streaming: the graph's onToken fans model tokens into
  // batched `message` events; `sources` then `done` close the turn.
  const responseHeaders = sseStreamHeaders(cors);
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let batch = '';
      let emittedAny = false;
      const flushBatch = (force: boolean) => {
        if (batch.length === 0) return;
        if (!force && batch.length < 200) return;
        controller.enqueue(encoder.encode(formatSseEvent('message', { delta: batch })));
        batch = '';
        emittedAny = true;
      };
      try {
        const { finalAnswer, sources } = await runQaTurn(env.DB, user.github_id, message, {
          model,
          onToken: (token) => {
            batch += token;
            flushBatch(false);
          },
        });
        flushBatch(true);
        // Deterministic answers (small-talk, refusal, no-model fallback)
        // never pass through onToken -- still deliver them as one message
        // event so the widget always has something to render.
        if (!emittedAny && finalAnswer.length > 0) {
          controller.enqueue(encoder.encode(formatSseEvent('message', { delta: finalAnswer })));
        }
        controller.enqueue(encoder.encode(formatSseEvent('sources', { lessons: sources })));
        controller.enqueue(encoder.encode(formatSseEvent('done', {})));
        // Audit after the turn: a failed insert must not un-send an answer
        // the learner already received.
        try {
          await insertMessage(env.DB, user.github_id, 'assistant', finalAnswer, new Date());
        } catch {
          // Audit-only failure; the turn itself succeeded.
        }
      } catch {
        controller.enqueue(
          encoder.encode(formatSseEvent('error', { code: 'INTERNAL_ERROR', message: 'Something went wrong. Try again.' })),
        );
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { status: 200, headers: responseHeaders });
}
