// P2 (course Q&A tutor): tests for worker/src/qa/model.ts -- the custom
// LangChain ChatWorkersAI over the Workers AI [ai] binding.
//
// The binding itself is stubbed; these tests pin the adapter contract
// (request shape, tool conversion, tool-call parsing, SSE parsing,
// timeouts). The live round-trip still needs a deployed Worker.

import { describe, expect, it } from 'vitest';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  ChatWorkersAI,
  createQaModel,
  DEFAULT_QA_MODEL_ID,
  formatWorkersAiMessages,
  normalizeToolCalls,
  QA_MODEL_TIMEOUT_MS,
  toWorkersAiToolDef,
  withQaTimeout,
  type WorkersAiBinding,
} from './model';

type RunFn = (
  model: string,
  input: Record<string, unknown>,
  options?: { signal?: AbortSignal },
) => Promise<unknown>;

function bindingFor(impl: RunFn): WorkersAiBinding {
  return { run: impl };
}

function sseStream(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f));
      controller.close();
    },
  });
}

const demoTool = new DynamicStructuredTool({
  name: 'search_lessons',
  description: 'Search the course lesson index',
  schema: z.object({ query: z.string(), top_k: z.number().int().default(5) }),
  func: async () => '[]',
});

describe('toWorkersAiToolDef', () => {
  it('converts a LangChain tool to the Workers AI tool shape', () => {
    const def = toWorkersAiToolDef(demoTool);
    expect(def.name).toBe('search_lessons');
    expect(def.description).toBe('Search the course lesson index');
    const params = def.parameters as { type?: string; properties?: Record<string, unknown> };
    expect(params.type).toBe('object');
    expect(params.properties).toHaveProperty('query');
    expect(params.properties).toHaveProperty('top_k');
  });
});

describe('normalizeToolCalls', () => {
  it('parses the legacy {name, arguments} shape', () => {
    const calls = normalizeToolCalls([{ name: 'search_lessons', arguments: { query: 'x' } }]);
    expect(calls).toEqual([{ name: 'search_lessons', args: { query: 'x' }, id: 'call_0', type: 'tool_call' }]);
  });

  it('parses the OpenAI-style shape with a JSON string arguments', () => {
    const calls = normalizeToolCalls([
      { id: 'abc', function: { name: 'read_lesson', arguments: '{"slug":"cap-theorem"}' } },
    ]);
    expect(calls).toEqual([
      { name: 'read_lesson', args: { slug: 'cap-theorem' }, id: 'abc', type: 'tool_call' },
    ]);
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

describe('formatWorkersAiMessages', () => {
  it('maps LangChain messages to binding roles', () => {
    const ai = new AIMessage('thinking');
    ai.tool_calls = [{ name: 'search_lessons', args: { query: 'x' }, id: 'c1', type: 'tool_call' }];
    const out = formatWorkersAiMessages([
      new SystemMessage('sys'),
      new HumanMessage('hi'),
      ai,
      new ToolMessage({ content: 'result', name: 'search_lessons', tool_call_id: 'c1' }),
    ]);
    expect(out).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'thinking', tool_call: 'search_lessons' },
      { role: 'tool', name: 'search_lessons', content: 'result' },
    ]);
  });
});

describe('ChatWorkersAI', () => {
  it('invoke sends the model id, formatted messages, and an abort signal', async () => {
    const captured: {
      model?: string;
      input?: Record<string, unknown>;
      options?: { signal?: AbortSignal };
    } = {};
    const model = new ChatWorkersAI({
      binding: bindingFor(async (m, input, options) => {
        captured.model = m;
        captured.input = input;
        captured.options = options;
        return { response: 'hello' };
      }),
    });
    const result = await model.invoke([new HumanMessage('hi')]);
    expect(result.content).toBe('hello');
    expect(captured.model).toBe(DEFAULT_QA_MODEL_ID);
    expect(captured.input?.['messages']).toEqual([{ role: 'user', content: 'hi' }]);
    expect(captured.options?.signal).toBeInstanceOf(AbortSignal);
    expect(captured.input).not.toHaveProperty('tools');
  });

  it('invoke surfaces parsed tool calls', async () => {
    const model = new ChatWorkersAI({
      binding: bindingFor(async () => ({
        response: '',
        tool_calls: [{ name: 'search_lessons', arguments: { query: 'caching' } }],
      })),
    });
    const result = await model.invoke([new HumanMessage('hi')]);
    expect(result.tool_calls).toEqual([
      { name: 'search_lessons', args: { query: 'caching' }, id: 'call_0', type: 'tool_call' },
    ]);
  });

  it('bindTools forwards Workers AI tool definitions on the next call', async () => {
    let capturedInput: unknown = null;
    const model = new ChatWorkersAI({
      binding: bindingFor(async (_m, input) => {
        capturedInput = input;
        return { response: 'ok' };
      }),
    });
    const bound = model.bindTools([demoTool]);
    await bound.invoke([new HumanMessage('hi')]);
    const tools = (capturedInput as { tools?: Array<{ name: string }> }).tools;
    expect(tools).toHaveLength(1);
    expect(tools?.[0]?.name).toBe('search_lessons');
  });

  it('stream parses SSE data frames into text deltas', async () => {
    const model = new ChatWorkersAI({
      binding: bindingFor(async () =>
        sseStream([
          'data: {"response":"Hel"}\n\n',
          'data: {"response":"lo"}\n\n',
          'data: [DONE]\n\n',
        ]),
      ),
    });
    let text = '';
    for await (const chunk of await model.stream([new HumanMessage('hi')])) {
      text += chunk.text;
    }
    expect(text).toBe('Hello');
  });
});

describe('model helpers', () => {
  it('withQaTimeout returns an abort signal', () => {
    expect(withQaTimeout().signal).toBeInstanceOf(AbortSignal);
    expect(QA_MODEL_TIMEOUT_MS).toBe(15000);
  });

  it('createQaModel returns null without the binding and honors QA_MODEL_ID', () => {
    expect(createQaModel({} as never)).toBeNull();
    const withDefault = createQaModel({ AI: { run: async () => ({}) } } as never);
    expect(withDefault).toBeInstanceOf(ChatWorkersAI);
    expect(withDefault?.model).toBe(DEFAULT_QA_MODEL_ID);
    const overridden = createQaModel({ AI: { run: async () => ({}) }, QA_MODEL_ID: 'custom' } as never);
    expect(overridden?.model).toBe('custom');
  });
});
