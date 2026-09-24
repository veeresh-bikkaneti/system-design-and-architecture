import { afterEach, describe, expect, it, vi } from 'vitest';
import { QaApiError, readQaStream, streamChat, type QaStreamEvent } from './qaApi';

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

describe('streamChat', () => {
  it('posts the full message array and delivers parsed events to onEvent in order', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'event: message\ndata: {"delta":"A"}\n\n' +
          'event: sources\ndata: {"lessons":[]}\n\n' +
          'event: done\ndata: {}\n\n',
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const seen: QaStreamEvent[] = [];
    const messages = [
      { role: 'user' as const, content: 'earlier turn' },
      { role: 'assistant' as const, content: 'earlier reply' },
      { role: 'user' as const, content: 'hi' },
    ];
    await streamChat({ messages, onEvent: (e) => seen.push(e) });
    expect(seen).toEqual([
      { type: 'delta', delta: 'A' },
      { type: 'sources', lessons: [] },
      { type: 'done' },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/qa/chat');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ messages }));
  });

  it('throws QaApiError carrying the server code on HTTP errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ code: 'rate_limited', message: 'Slow down' }, 429)),
    );
    const err = await streamChat({
      messages: [{ role: 'user', content: 'hi' }],
      onEvent: () => {},
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QaApiError);
    expect(err).toMatchObject({ code: 'rate_limited', status: 429 });
  });

  it('falls back to http_<status> when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
    await expect(
      streamChat({ messages: [{ role: 'user', content: 'hi' }], onEvent: () => {} }),
    ).rejects.toMatchObject({ code: 'http_500', status: 500 });
  });
});
