import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  QaApiError,
  deleteSession,
  getAuthStatus,
  getQuota,
  logout,
  oauthStartUrl,
  readQaStream,
  streamChat,
  type QaStreamEvent,
} from './qaApi';

function sseResponse(chunks: string[], status = 200): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

async function collect(res: Response): Promise<QaStreamEvent[]> {
  const events: QaStreamEvent[] = [];
  for await (const event of readQaStream(res)) events.push(event);
  return events;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('readQaStream', () => {
  it('parses a multi-event stream: deltas, sources, done', async () => {
    const res = sseResponse([
      'event: message\n' +
        'data: {"delta":"Hello"}\n' +
        '\n' +
        'event: message\n' +
        'data: {"delta":" world"}\n' +
        '\n' +
        'event: sources\n' +
        'data: {"lessons":[{"slug":"cap-theorem","title":"CAP Theorem"}]}\n' +
        '\n' +
        'event: done\n' +
        'data: {}\n' +
        '\n',
    ]);
    await expect(collect(res)).resolves.toEqual([
      { type: 'delta', delta: 'Hello' },
      { type: 'delta', delta: ' world' },
      { type: 'sources', lessons: [{ slug: 'cap-theorem', title: 'CAP Theorem' }] },
      { type: 'done' },
    ]);
  });

  it('surfaces error events with code and message', async () => {
    const res = sseResponse([
      'event: error\n' + 'data: {"code":"rate_limited","message":"Slow down"}\n' + '\n',
    ]);
    await expect(collect(res)).resolves.toEqual([
      { type: 'error', code: 'rate_limited', message: 'Slow down' },
    ]);
  });

  it('surfaces the UNAUTHENTICATED event the backend emits without a session', async () => {
    const res = sseResponse([
      'event: error\n' +
        'data: {"code":"UNAUTHENTICATED","message":"Sign in with GitHub to chat with Veer."}\n' +
        '\n',
    ]);
    await expect(collect(res)).resolves.toEqual([
      {
        type: 'error',
        code: 'UNAUTHENTICATED',
        message: 'Sign in with GitHub to chat with Veer.',
      },
    ]);
  });

  it('drops malformed JSON, unknown events, and comments without killing the stream', async () => {
    const res = sseResponse([
      ': keep-alive\n' +
        '\n' +
        'event: message\n' +
        'data: not json at all\n' +
        '\n' +
        'event: frobnicate\n' +
        'data: {"x":1}\n' +
        '\n' +
        'event: message\n' +
        'data: {"delta":""}\n' +
        '\n' +
        'event: message\n' +
        'data: {"delta":"ok"}\n' +
        '\n',
    ]);
    await expect(collect(res)).resolves.toEqual([{ type: 'delta', delta: 'ok' }]);
  });

  it('handles chunk splits mid-line and a missing trailing blank line', async () => {
    const res = sseResponse([
      'event: mess',
      'age\ndata: {"delta":"Hel',
      'lo"}\n\nevent: done\ndata: {}',
    ]);
    await expect(collect(res)).resolves.toEqual([
      { type: 'delta', delta: 'Hello' },
      { type: 'done' },
    ]);
  });

  it('treats a data line without an event line as a message', async () => {
    const res = sseResponse(['data: {"delta":"hi"}\n\n']);
    await expect(collect(res)).resolves.toEqual([{ type: 'delta', delta: 'hi' }]);
  });

  it('turns an unreadable error event into a generic error so the UI never hangs', async () => {
    const res = sseResponse(['event: error\ndata: garbage\n\n']);
    await expect(collect(res)).resolves.toEqual([
      { type: 'error', code: 'unknown', message: 'Something went wrong.' },
    ]);
  });

  it('sanitizes malformed source entries instead of passing them through', async () => {
    const res = sseResponse([
      'event: sources\n' +
        'data: {"lessons":[{"slug":"a","title":"A"},{"slug":42},{"nope":true}]}\n' +
        '\n',
    ]);
    await expect(collect(res)).resolves.toEqual([
      { type: 'sources', lessons: [{ slug: 'a', title: 'A' }] },
    ]);
  });
});

describe('getAuthStatus', () => {
  it('returns the signed-in state with the GitHub login', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ authenticated: true, login: 'octocat' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getAuthStatus()).resolves.toEqual({ authenticated: true, login: 'octocat' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/qa/auth/status');
    expect(init.credentials).toBe('include');
  });

  it('returns authenticated:false without a login for signed-out visitors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ authenticated: false })));
    await expect(getAuthStatus()).resolves.toEqual({ authenticated: false, login: undefined });
  });

  it('throws QaApiError when the shape is wrong', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ nope: true })));
    await expect(getAuthStatus()).rejects.toMatchObject({ code: 'bad_response' });
  });
});

describe('oauthStartUrl', () => {
  it('points at the Worker OAuth start route', () => {
    expect(oauthStartUrl()).toContain('/api/qa/auth/github');
  });
});

describe('logout', () => {
  it('POSTs JSON with credentials so the preflight-gated route accepts it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await logout();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/qa/auth/logout');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
    expect(init.credentials).toBe('include');
  });
});

describe('deleteSession', () => {
  it('sends a credentialed DELETE with no session id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await deleteSession();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/qa/session');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe('include');
  });
});

describe('getQuota', () => {
  it('parses limit, remaining, and resetAt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ limit: 50, remaining: 49, resetAt: '2026-09-18T00:00:00Z' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(getQuota()).resolves.toEqual({
      limit: 50,
      remaining: 49,
      resetAt: '2026-09-18T00:00:00Z',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/qa/quota');
    expect(url).not.toContain('sessionId');
    expect(init.credentials).toBe('include');
  });

  it('throws QaApiError on a malformed quota body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ limit: 50 })));
    await expect(getQuota()).rejects.toMatchObject({ code: 'bad_response' });
  });
});

describe('streamChat', () => {
  it('posts only the message with credentials and delivers events in order', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'event: message\ndata: {"delta":"A"}\n\n' +
          'event: sources\ndata: {"lessons":[]}\n\n' +
          'event: done\ndata: {}\n\n',
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const seen: QaStreamEvent[] = [];
    await streamChat({ message: 'hi', onEvent: (e) => seen.push(e) });
    expect(seen).toEqual([
      { type: 'delta', delta: 'A' },
      { type: 'sources', lessons: [] },
      { type: 'done' },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/qa/chat');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
    expect(init.body).toBe(JSON.stringify({ message: 'hi' }));
    expect(init.credentials).toBe('include');
  });

  it('throws QaApiError carrying the server code on HTTP errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ code: 'rate_limited', message: 'Slow down' }, 429)),
    );
    const err = await streamChat({ message: 'hi', onEvent: () => {} }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(QaApiError);
    expect(err).toMatchObject({ code: 'rate_limited', status: 429 });
  });

  it('falls back to http_<status> when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
    await expect(
      streamChat({ message: 'hi', onEvent: () => {} }),
    ).rejects.toMatchObject({ code: 'http_500', status: 500 });
  });
});
