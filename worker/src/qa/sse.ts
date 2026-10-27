// P0 (course Q&A agent): Server-Sent Events helpers for /api/qa/chat.
// The frontend widget renders `message` deltas as they arrive, then
// `sources` citation chips, then `done`. Logical errors are delivered as
// `error` events (HTTP 200) so the widget has one code path to handle.

export interface QaErrorPayload {
  code: string;
  message: string;
}

/**
 * Formats one SSE event. `data` is always JSON -- the contract the
 * frontend implements against.
 */
export function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * A streaming Response whose body is the given pre-formatted SSE chunks.
 * Uses a real ReadableStream (not a pre-joined string) so the worker
 * flushes frames as they are enqueued -- P0 enqueues everything up
 * front, but later phases can enqueue per-token.
 *
 * `headers` carries the CORS allowlist entry: the widget calls this
 * endpoint cross-origin (GitHub Pages -> worker.dev), and without
 * Access-Control-Allow-Origin the browser would refuse to read the
 * stream at all.
 */
export function sseResponse(chunks: string[], status = 200, headers?: HeadersInit): Response {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  const responseHeaders = new Headers(headers);
  responseHeaders.set('content-type', 'text/event-stream; charset=utf-8');
  responseHeaders.set('cache-control', 'no-cache');
  responseHeaders.set('x-content-type-options', 'nosniff');
  return new Response(stream, { status, headers: responseHeaders });
}

/** Single `error` event stream for logical failures on the chat endpoint. */
export function sseErrorResponse(code: string, message: string, headers?: HeadersInit): Response {
  return sseResponse([formatSseEvent('error', { code, message } satisfies QaErrorPayload)], 200, headers);
}

/**
 * Splits text into a few chunks so P0's echo visibly streams as multiple
 * `message` events rather than one. Pure function -- easy to unit test.
 */
export function chunkText(text: string, maxChunks = 3): string[] {
  if (text.length === 0) return [];
  const size = Math.max(1, Math.ceil(text.length / maxChunks));
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}
