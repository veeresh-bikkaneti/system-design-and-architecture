/**
 * Client for the course Q&A Worker API (`/api/qa/chat`).
 *
 * Anonymous Session architecture: the Worker is a pure, stateless proxy.
 * The browser holds the entire conversation (persisted to localStorage by
 * useQaHistory) and sends the complete transcript on every request; the
 * Worker has no session id, no database, and no memory of its own. This
 * module is DOM-free so the streaming parser and error handling are
 * unit-testable under plain vitest.
 */

const API_BASE: string = import.meta.env.VITE_QA_API_BASE ?? '';

export interface QaChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface QaSource {
  slug: string;
  title: string;
}

export type QaStreamEvent =
  | { type: 'delta'; delta: string }
  | { type: 'sources'; lessons: QaSource[] }
  | { type: 'done' }
  | { type: 'error'; code: string; message: string };

export class QaApiError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'QaApiError';
    this.code = code;
    this.status = status;
  }
}

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function readErrorBody(res: Response): Promise<{ code: string; message: string }> {
  try {
    const body = (await res.json()) as { code?: unknown; message?: unknown };
    return {
      code: typeof body.code === 'string' ? body.code : `http_${res.status}`,
      message:
        typeof body.message === 'string' ? body.message : `Request failed (${res.status})`,
    };
  } catch {
    return { code: `http_${res.status}`, message: `Request failed (${res.status})` };
  }
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (res.ok) return;
  const { code, message } = await readErrorBody(res);
  throw new QaApiError(code, message, res.status);
}

function isQaSource(value: unknown): value is QaSource {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as QaSource).slug === 'string' &&
    typeof (value as QaSource).title === 'string'
  );
}

/**
 * Convert one raw SSE event into a typed Q&A event. Malformed payloads are
 * dropped (return null) so one bad chunk can never kill the stream — except
 * an unreadable `error` event, which surfaces as a generic error so the UI
 * doesn't hang waiting for `done`.
 */
function parseQaEvent(eventType: string, data: string): QaStreamEvent | null {
  switch (eventType) {
    case 'message': {
      if (!data) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        return null;
      }
      const delta = (parsed as { delta?: unknown }).delta;
      return typeof delta === 'string' && delta.length > 0 ? { type: 'delta', delta } : null;
    }
    case 'sources': {
      let parsed: unknown = {};
      try {
        parsed = data ? JSON.parse(data) : {};
      } catch {
        parsed = {};
      }
      const lessons = (parsed as { lessons?: unknown }).lessons;
      const clean: QaSource[] = Array.isArray(lessons)
        ? lessons.filter(isQaSource).map((l) => ({ slug: l.slug, title: l.title }))
        : [];
      return { type: 'sources', lessons: clean };
    }
    case 'done':
      return { type: 'done' };
    case 'error': {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = null;
      }
      const code =
        parsed !== null && typeof (parsed as { code?: unknown }).code === 'string'
          ? (parsed as { code: string }).code
          : 'unknown';
      const message =
        parsed !== null && typeof (parsed as { message?: unknown }).message === 'string'
          ? (parsed as { message: string }).message
          : 'Something went wrong.';
      return { type: 'error', code, message };
    }
    default:
      return null;
  }
}

/**
 * Incrementally parse a `text/event-stream` response body into typed events.
 * Handles chunk splits mid-line, comment/keep-alive lines, and a final event
 * without a trailing blank line.
 */
export async function* readQaStream(response: Response): AsyncGenerator<QaStreamEvent> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buf = '';
  let eventType = '';
  let dataLines: string[] = [];

  const dispatch = function* (): Generator<QaStreamEvent> {
    if (dataLines.length === 0 && eventType === '') return;
    const event = parseQaEvent(eventType || 'message', dataLines.join('\n'));
    eventType = '';
    dataLines = [];
    if (event) yield event;
  };

  const consumeLine = function* (raw: string): Generator<QaStreamEvent> {
    const line = raw.replace(/\r$/, '');
    if (line === '') {
      yield* dispatch();
    } else if (line.startsWith(':')) {
      // SSE comment / keep-alive — ignore.
    } else if (line.startsWith('event:')) {
      eventType = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      let value = line.slice('data:'.length);
      if (value.startsWith(' ')) value = value.slice(1); // spec: strip one leading space
      dataLines.push(value);
    }
    // Other fields (id:, retry:) are ignored.
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        yield* consumeLine(line);
      }
    }
    buf += decoder.decode();
    if (buf.length > 0) {
      yield* consumeLine(buf);
      yield* dispatch();
    } else {
      yield* dispatch();
    }
  } finally {
    reader.releaseLock();
  }
}

export interface StreamChatArgs {
  /** Full conversation so far, including the newest user turn last. */
  messages: QaChatTurn[];
  signal?: AbortSignal;
  onEvent: (event: QaStreamEvent) => void;
}

/** POST the full transcript and stream the SSE events. Throws QaApiError on HTTP errors. */
export async function streamChat({ messages, signal, onEvent }: StreamChatArgs): Promise<void> {
  const res = await fetch(apiUrl('/api/qa/chat'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });
  await throwIfNotOk(res);
  for await (const event of readQaStream(res)) {
    onEvent(event);
  }
}
