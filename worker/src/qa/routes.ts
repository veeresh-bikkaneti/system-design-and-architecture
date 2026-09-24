// P2 (course Q&A agent): HTTP handler for /api/qa/chat.
//
// Anonymous Session architecture: the Worker is a pure, stateless proxy.
// No database, no session id, no server-side memory. The frontend persists
// the full conversation to localStorage and sends the complete transcript
// on every request; this handler runs the graph once against exactly what
// it was given and returns the answer. Nothing is read or written after
// the response is sent -- there is nothing here that outlives one request.
//
// Contract (the frontend widget implements against this -- do not deviate):
//   POST /api/qa/chat
//     body: {"messages":[{"role":"user"|"assistant","content":"..."}, ...]}
//           (newest message last; must end with a "user" turn)
//   -> 200 text/event-stream; `message` deltas, then `sources`
//      {"lessons":[{"slug","title"}]}, then `done`. Logical errors arrive
//      as `error` events.

import type { Env } from '../index';
import { corsHeaders, parseJsonBody } from '../index';
import { runQaTurn, type ChatTurn } from './graph';
import { QA_DEFAULT_MODEL_ID, WorkersAiModel } from './model';
import { QA_INDEX } from './qa-index';
import { titleForSlug } from './retrieval';
import { chunkText, formatSseEvent, sseErrorResponse, sseResponse } from './sse';

export const QA_MAX_MESSAGE_CHARS = 2000;
/** Hard cap on how much history a client can send in one request. */
export const QA_MAX_MESSAGES = 41; // MAX_TRANSCRIPT_TURNS*2 + 1, generous headroom

interface RawMessage {
  role?: unknown;
  content?: unknown;
}

function parseMessages(value: unknown): ChatTurn[] | { error: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: 'messages must be a non-empty array' };
  }
  if (value.length > QA_MAX_MESSAGES) {
    return { error: `messages must have at most ${QA_MAX_MESSAGES} entries` };
  }
  const out: ChatTurn[] = [];
  for (const raw of value as RawMessage[]) {
    const role = raw?.role;
    const content = raw?.content;
    if (role !== 'user' && role !== 'assistant') {
      return { error: 'each message must have role "user" or "assistant"' };
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
      return { error: 'each message must have non-empty string content' };
    }
    if (content.length > QA_MAX_MESSAGE_CHARS) {
      return { error: `each message must be at most ${QA_MAX_MESSAGE_CHARS} characters` };
    }
    out.push({ role, content });
  }
  if (out[out.length - 1]?.role !== 'user') {
    return { error: 'the last message must have role "user"' };
  }
  return out;
}

/**
 * POST /api/qa/chat -- run one agent turn over the client-supplied
 * transcript and stream the answer as SSE. All logical failures (bad
 * input, model unavailable) are delivered as `error` events on a 200
 * stream, per the widget contract. Only an unparseable body gets a plain
 * HTTP 400.
 */
export async function handleQaChat(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request.headers.get('Origin'));
  const parsed = await parseJsonBody(request, cors);
  if ('errorResponse' in parsed) return parsed.errorResponse;
  const { messages: rawMessages } = (parsed.body && typeof parsed.body === 'object' ? parsed.body : {}) as {
    messages?: unknown;
  };

  const messages = parseMessages(rawMessages);
  if ('error' in messages) {
    return sseErrorResponse('INVALID_MESSAGES', messages.error, cors);
  }

  // The agent loop needs the Workers AI binding. Under plain `wrangler dev`
  // without AI support env.AI is unset -- fail with a clear error event
  // instead of crashing mid-turn.
  if (!env.AI || typeof env.AI.run !== 'function') {
    return sseErrorResponse(
      'AI_UNAVAILABLE',
      'The course tutor is not available in this environment (Workers AI binding missing).',
      cors,
    );
  }

  let finalAnswer: string;
  let sources: string[];
  try {
    ({ finalAnswer, sources } = await runQaTurn(
      new WorkersAiModel(env.AI, env.QA_MODEL_ID ?? QA_DEFAULT_MODEL_ID),
      messages,
    ));
  } catch {
    return sseErrorResponse('INTERNAL_ERROR', 'Something went wrong. Try again.', cors);
  }

  const chunks: string[] = chunkText(finalAnswer).map((delta) =>
    formatSseEvent('message', { delta }),
  );
  // P1: sources are lesson slugs from retrieval; the frontend renders
  // citation chips from {slug, title} pairs (see QaSource in qaApi.ts).
  const lessons = sources.map((slug) => ({ slug, title: titleForSlug(QA_INDEX, slug) ?? slug }));
  chunks.push(formatSseEvent('sources', { lessons }));
  chunks.push(formatSseEvent('done', {}));
  return sseResponse(chunks, 200, cors);
}
