/**
 * Client for the course Q&A Worker API (`/api/qa/*`).
 *
 * The browser is an untrusted client: it holds no secrets. Tutor access is
 * gated by GitHub OAuth -- the Worker owns the session lifecycle in an
 * HttpOnly `qa_session` cookie, so every request here uses
 * `credentials: 'include'` and never touches a token. All model access,
 * memory, and rate limits live server-side. This module is DOM-free (popup
 * handling lives in useQaAuth.ts) so the streaming parser and error handling
 * are unit-testable under plain vitest.
 */

const API_BASE: string = import.meta.env.VITE_QA_API_BASE ?? '';

export interface QaSource {
  slug: string;
  title: string;
}

export type QaStreamEvent =
  | { type: 'delta'; delta: string }
  | { type: 'sources'; lessons: QaSource[] }
  | { type: 'done' }
  | { type: 'error'; code: string; message: string };

export interface QaQuota {
  limit: number;
  remaining: number;
  resetAt: string;
}

export interface QaAuthStatus {
  authenticated: boolean;
  login?: string;
}

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

/** Origin of the Worker API, for validating the OAuth popup's postMessage. */
export function qaApiOrigin(): string {
  return new URL(API_BASE).origin;
}

/**
 * Whether the Q&A backend is configured. The Worker URL comes from the
 * VITE_QA_API_BASE build variable; when it's empty the backend hasn't been
 * deployed/wired into the Pages build yet, and the widget must not attempt
 * any requests — they'd hit the static host instead (GitHub Pages answers
 * POST with 405). The widget renders Veer's "getting ready" state instead,
 * and starts working with zero UI changes once the variable is set.
 */
export function isQaBackendConfigured(): boolean {
  return API_BASE !== '';
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

/** The OAuth start URL -- the sign-in popup navigates here (server 302s to GitHub). */
export function oauthStartUrl(): string {
  return apiUrl('/api/qa/auth/github');
}

/**
 * Whether the visitor holds a live tutor session. Never 401s: the backend
 * answers `{ authenticated: false }` for signed-out visitors.
 */
export async function getAuthStatus(signal?: AbortSignal): Promise<QaAuthStatus> {
  const res = await fetch(apiUrl('/api/qa/auth/status'), {
    credentials: 'include',
    signal,
  });
  await throwIfNotOk(res);
  const body = (await res.json()) as { authenticated?: unknown; login?: unknown };
  if (typeof body.authenticated !== 'boolean') {
    throw new QaApiError('bad_response', 'The server returned an invalid auth status.');
  }
  return {
    authenticated: body.authenticated,
    login: typeof body.login === 'string' ? body.login : undefined,
  };
}

/** Revoke the tutor session server-side and clear the cookie. */
export async function logout(signal?: AbortSignal): Promise<void> {
  const res = await fetch(apiUrl('/api/qa/auth/logout'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
    credentials: 'include',
    signal,
  });
  await throwIfNotOk(res);
}

/** Wipe the tutor memory (transcript + summary) for the signed-in user. Best-effort. */
export async function deleteSession(signal?: AbortSignal): Promise<void> {
  const res = await fetch(apiUrl('/api/qa/session'), {
    method: 'DELETE',
    credentials: 'include',
    signal,
  });
  await throwIfNotOk(res);
}

/** Remaining questions for the signed-in user. Drives the "N left today" badge. */
export async function getQuota(signal?: AbortSignal): Promise<QaQuota> {
  const res = await fetch(apiUrl('/api/qa/quota'), {
    credentials: 'include',
    signal,
  });
  await throwIfNotOk(res);
  const body = (await res.json()) as {
    limit?: unknown;
    remaining?: unknown;
    resetAt?: unknown;
  };
  if (
    typeof body.limit !== 'number' ||
    typeof body.remaining !== 'number' ||
    typeof body.resetAt !== 'string'
  ) {
    throw new QaApiError('bad_response', 'The server returned an invalid quota.');
  }
  return { limit: body.limit, remaining: body.remaining, resetAt: body.resetAt };
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
  message: string;
  signal?: AbortSignal;
  onEvent: (event: QaStreamEvent) => void;
}

/** POST a chat turn and stream the SSE events. Throws QaApiError on HTTP errors. */
export async function streamChat({ message, signal, onEvent }: StreamChatArgs): Promise<void> {
  const res = await fetch(apiUrl('/api/qa/chat'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
    credentials: 'include',
    signal,
  });
  await throwIfNotOk(res);
  for await (const event of readQaStream(res)) {
    onEvent(event);
  }
}
