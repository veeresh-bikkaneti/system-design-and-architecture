// P2 (course Q&A tutor): tests for worker/src/qa/model.ts -- the custom
// LangChain ChatSelfHosted over a self-hosted OpenAI-compatible endpoint
// (llama.cpp server).
//
// fetch is stubbed; these tests pin the adapter contract (URL, auth
// header, OpenAI request/response shapes, tool conversion, SSE parsing,
// timeouts, error mapping). The live round-trip still needs a deployed
// Worker plus a running model server.

import { describe, expect, it } from 'vitest';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  ChatSelfHosted,
  createQaModel,
  DEFAULT_QA_MODEL_ID,
  formatOpenAiMessages,
  normalizeToolCalls,
  QA_MODEL_TIMEOUT_MS,
  toOpenAiToolDef,
  withQaTimeout,
} from './model';

interface StubResult {
  status?: number;
  json?: unknown;
  sse?: string[];
}

function stubFetch(impl: (url: string, init: RequestInit) => StubResult): typeof fetch {
  return (async (url: unknown, init?: unknown) => {
    const out = impl(String(url), (init ?? {}) as RequestInit);
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

const chatOk = (content: string, tool_calls?: unknown) => ({
  choices: [{ message: { content, tool_calls: tool_calls ?? [] } }],
});

const demoTool = new DynamicStructuredTool({
  name: 'search_lessons',
  description: 'Search the course lesson index',
  schema: z.object({ query: z.string(), top_k: z.number().int().default(5) }),
  func: async () => '[]',
});

describe('toOpenAiToolDef', () => {
  it('converts a LangChain tool to the OpenAI function shape', () => {
    const def = toOpenAiToolDef(demoTool);
    expect(def.type).toBe('function');
    expect(def.function.name).toBe('search_lessons');
    expect(def.function.description).toBe('Search the course lesson index');
    const params = def.function.parameters as { type?: string; properties?: Record<string, unknown> };
    expect(params.type).toBe('object');
    expect(params.properties).toHaveProperty('query');
    expect(params.properties).toHaveProperty('top_k');
  });
});

describe('normalizeToolCalls', () => {
  it('parses the OpenAI shape with a JSON string arguments', () => {
    const calls = normalizeToolCalls([
      { id: 'abc', type: 'function', function: { name: 'read_lesson', arguments: '{"slug":"cap-theorem"}' } },
    ]);
    expect(calls).toEqual([
      { name: 'read_lesson', args: { slug: 'cap-theorem' }, id: 'abc', type: 'tool_call' },
    ]);
  });

  it('parses the legacy {name, arguments} shape', () => {
    const calls = normalizeToolCalls([{ name: 'search_lessons', arguments: { query: 'x' } }]);
    expect(calls).toEqual([{ name: 'search_lessons', args: { query: 'x' }, id: 'call_0', type: 'tool_call' }]);
  });

  it('tolerates malformed entries and non-arrays', () => {
    expect(normalizeToolCalls([{ nope: 1 }, null, 'x'])).toEqual([]);
    expect(normalizeToolCalls([{ name: 't', arguments: 'not-json{{' }])).toEqual([
      { name: 't', args: {}, id: 'call_0', type: 'tool_call' },
    ]);
    expect(normalizeToolCalls(undefined)).toEqual([]);
    expect(normalizeToolCalls({})).toEqual([]);
  });
});

describe('formatOpenAiMessages', () => {
  it('maps LangChain messages to OpenAI roles', () => {
    const ai = new AIMessage('thinking');
    ai.tool_calls = [{ name: 'search_lessons', args: { query: 'x' }, id: 'c1', type: 'tool_call' }];
    const out = formatOpenAiMessages([
      new SystemMessage('sys'),
      new HumanMessage('hi'),
      ai,
      new ToolMessage({ content: 'result', name: 'search_lessons', tool_call_id: 'c1' }),
    ]);
    expect(out).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: 'thinking',
        tool_calls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'search_lessons', arguments: '{"query":"x"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'c1', content: 'result' },
    ]);
  });
});

describe('ChatSelfHosted', () => {
  it('invoke POSTs to /chat/completions with model, messages, auth header, and an abort signal', async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const model = new ChatSelfHosted({
      baseUrl: 'https://llm.example.com/v1/',
      apiKey: 'secret-123',
      fetchImpl: stubFetch((url, init) => {
        captured.url = url;
        captured.init = init;
        return { json: chatOk('hello') };
      }),
    });
    const result = await model.invoke([new HumanMessage('hi')]);
    expect(result.content).toBe('hello');
    expect(captured.url).toBe('https://llm.example.com/v1/chat/completions');
    const headers = captured.init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer secret-123');
    expect(headers['Content-Type']).toBe('application/json');
    expect(captured.init?.method).toBe('POST');
    expect(captured.init?.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(captured.init?.body));
    expect(body.model).toBe(DEFAULT_QA_MODEL_ID);
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(body).not.toHaveProperty('tools');
    expect(body.stream).toBe(false);
  });

  it('omits the Authorization header when no apiKey is set', async () => {
    let headers: unknown = null;
    const model = new ChatSelfHosted({
      baseUrl: 'https://llm.example.com/v1',
      fetchImpl: stubFetch((_url, init) => {
        headers = init.headers;
        return { json: chatOk('hi') };
      }),
    });
    await model.invoke([new HumanMessage('hi')]);
    expect(headers as Record<string, string>).not.toHaveProperty('Authorization');
  });

  it('invoke surfaces parsed tool calls', async () => {
    const model = new ChatSelfHosted({
      baseUrl: 'https://llm.example.com/v1',
      fetchImpl: stubFetch(() => ({
        json: chatOk('', [
          { id: 't1', type: 'function', function: { name: 'search_lessons', arguments: '{"query":"caching"}' } },
        ]),
      })),
    });
    const result = await model.invoke([new HumanMessage('hi')]);
    expect(result.tool_calls).toEqual([
      { name: 'search_lessons', args: { query: 'caching' }, id: 't1', type: 'tool_call' },
    ]);
  });

  it('bindTools forwards OpenAI tool definitions on the next call', async () => {
    let capturedBody: unknown = null;
    const model = new ChatSelfHosted({
      baseUrl: 'https://llm.example.com/v1',
      fetchImpl: stubFetch((_url, init) => {
        capturedBody = JSON.parse(String(init.body));
        return { json: chatOk('ok') };
      }),
    });
    const bound = model.bindTools([demoTool]);
    await bound.invoke([new HumanMessage('hi')]);
    const tools = (capturedBody as { tools?: Array<{ type: string; function: { name: string } }> }).tools;
    expect(tools).toHaveLength(1);
    expect(tools?.[0]?.type).toBe('function');
    expect(tools?.[0]?.function.name).toBe('search_lessons');
  });

  it('maps HTTP errors to model_http_<status>', async () => {
    const model = new ChatSelfHosted({
      baseUrl: 'https://llm.example.com/v1',
      fetchImpl: stubFetch(() => ({ status: 429, json: { error: 'slow down' } })),
    });
    await expect(model.invoke([new HumanMessage('hi')])).rejects.toThrow('model_http_429');
  });

  it('stream parses SSE delta frames into text deltas', async () => {
    const model = new ChatSelfHosted({
      baseUrl: 'https://llm.example.com/v1',
      fetchImpl: stubFetch(() => ({
        sse: [
          'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
          'data: [DONE]\n\n',
        ],
      })),
    });
    let text = '';
    for await (const chunk of await model.stream([new HumanMessage('hi')])) {
      text += chunk.text;
    }
    expect(text).toBe('Hello');
  });

  it('identifyingParams never includes the apiKey', () => {
    const model = new ChatSelfHosted({
      baseUrl: 'https://llm.example.com/v1',
      apiKey: 'super-secret',
      fetchImpl: stubFetch(() => ({})),
    });
    expect(JSON.stringify(model.identifyingParams)).not.toContain('super-secret');
  });
});

describe('model helpers', () => {
  it('withQaTimeout returns an abort signal (generous: self-hosted CPU is slow)', () => {
    expect(withQaTimeout().signal).toBeInstanceOf(AbortSignal);
    expect(QA_MODEL_TIMEOUT_MS).toBe(120000);
  });

  it('createQaModel returns null without MODEL_BASE_URL and honors QA_MODEL_ID', () => {
    expect(createQaModel({} as never)).toBeNull();
    expect(createQaModel({ MODEL_BASE_URL: '  ' } as never)).toBeNull();
    const withDefault = createQaModel({ MODEL_BASE_URL: 'https://llm.example.com/v1' } as never);
    expect(withDefault).toBeInstanceOf(ChatSelfHosted);
    expect(withDefault?.model).toBe(DEFAULT_QA_MODEL_ID);
    const overridden = createQaModel({
      MODEL_BASE_URL: 'https://llm.example.com/v1',
      QA_MODEL_ID: 'custom-alias',
      MODEL_API_KEY: 'k',
    } as never);
    expect(overridden?.model).toBe('custom-alias');
    expect(overridden?.apiKey).toBe('k');
  });
});
