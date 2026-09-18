// worker/src/qa/model.ts — the Workers AI chat model for the course Q&A tutor.
//
// NOTE on @langchain/cloudflare: version 1.1.0 (the latest on npm) exports
// only `ChatCloudflareWorkersAI`, a REST client that needs a Cloudflare
// account id + API token. It has NO Workers AI *binding* support and NO tool
// calling. The locked architecture for the tutor is the `[ai]` binding
// (`env.AI.run`) -- zero secrets, runs on the edge -- so this file
// implements the LangChain-first equivalent directly: `ChatWorkersAI`, a
// real `BaseChatModel` subclass over the binding, with function calling in
// Workers AI's documented tool format and SSE streaming. `bindTools` works
// like any other LangChain chat model.
//
// What was verified against sources (not memory):
// - Binding request/response shapes from the Workers AI function-calling
//   docs: `tools: [{ name, description, parameters }]` in, top-level
//   `tool_calls: [{ name, arguments }]` out; `stream: true` returns an SSE
//   ReadableStream of `data: {...}` lines ending in `data: [DONE]`.
// - `AiOptions.signal` exists in @cloudflare/workers-types, so per-call
//   timeouts ride on the binding call itself.
// - `RunnableBinding` merges `kwargs` (our converted tools) into the call
//   options that reach `_generate`, per @langchain/core's implementation.
//
// NOT verifiable without a deployed Worker (no credentials in this
// environment): the live round-trip, including whether this exact model id
// honors `tools` on the binding. If it doesn't, the failure surfaces as
// "no tool_calls, text-only answers" -- never a crash -- and the graph's
// retrieve-node context still grounds the answer.

import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  type ToolCall,
} from '@langchain/core/messages';
import {
  BaseChatModel,
  type BaseChatModelCallOptions,
  type BaseChatModelParams,
  type BindToolsInput,
} from '@langchain/core/language_models/chat_models';
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs';
import { RunnableBinding } from '@langchain/core/runnables';
import { convertToOpenAITool } from '@langchain/core/utils/function_calling';
import type { Env } from '../index';

/** Default tutor model: small open-weight instruct model on Workers AI. */
export const DEFAULT_QA_MODEL_ID = '@cf/meta/llama-3.1-8b-instruct-fp8';

/**
 * Hard timeout per model call. The binding accepts an AbortSignal, so a
 * slow model can never hang a chat turn (or the SSE stream) past this.
 */
export const QA_MODEL_TIMEOUT_MS = 15000;

/** Returns `{ signal }` -- pass into a model call for the standard timeout. */
export function withQaTimeout(): { signal: AbortSignal } {
  return { signal: AbortSignal.timeout(QA_MODEL_TIMEOUT_MS) };
}

/**
 * The minimal surface of the Workers AI binding this model needs. `Env['AI']`
 * satisfies it structurally (the fallback `Ai.run` overload takes a plain
 * string model id and `Record<string, unknown>` inputs).
 */
export interface WorkersAiBinding {
  run(
    model: string,
    inputs: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<unknown>;
}

/** One tool in Workers AI's documented function-calling format. */
export interface WorkersAiToolDef {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface ChatWorkersAICallOptions extends BaseChatModelCallOptions {
  /** Tools in Workers AI format; set by bindTools(). */
  tools?: WorkersAiToolDef[];
}

export interface ChatWorkersAIFields extends BaseChatModelParams {
  model?: string;
  binding: WorkersAiBinding;
}

/** Convert any LangChain tool-like into Workers AI's tool definition shape. */
export function toWorkersAiToolDef(tool: BindToolsInput): WorkersAiToolDef {
  const openAi = convertToOpenAITool(tool as Parameters<typeof convertToOpenAITool>[0]);
  const fn = (openAi as { function?: { name?: string; description?: string; parameters?: unknown } })
    .function ?? {};
  return {
    name: typeof fn.name === 'string' ? fn.name : 'tool',
    description: typeof fn.description === 'string' ? fn.description : '',
    parameters: (fn.parameters ?? {}) as Record<string, unknown>,
  };
}

/** Parse `tool_calls` from a Workers AI response, tolerating both the legacy
 * `{ name, arguments }` shape and the OpenAI-style
 * `{ id, function: { name, arguments } }` shape. `arguments` may already be
 * an object (binding) or a JSON string (REST-style). */
export function normalizeToolCalls(raw: unknown): ToolCall[] {
  if (!Array.isArray(raw)) return [];
  const out: ToolCall[] = [];
  raw.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) return;
    const rec = item as Record<string, unknown>;
    let name: unknown;
    let args: unknown;
    let id: unknown = rec['id'];
    const fn = rec['function'];
    if (typeof fn === 'object' && fn !== null) {
      const fnRec = fn as Record<string, unknown>;
      name = fnRec['name'];
      args = fnRec['arguments'];
    } else {
      name = rec['name'];
      args = rec['arguments'];
    }
    if (typeof name !== 'string' || name.length === 0) return;
    let parsedArgs: Record<string, unknown> = {};
    if (typeof args === 'string') {
      try {
        const decoded = JSON.parse(args) as unknown;
        if (typeof decoded === 'object' && decoded !== null) {
          parsedArgs = decoded as Record<string, unknown>;
        }
      } catch {
        parsedArgs = {};
      }
    } else if (typeof args === 'object' && args !== null) {
      parsedArgs = args as Record<string, unknown>;
    }
    out.push({
      name,
      args: parsedArgs,
      id: typeof id === 'string' && id.length > 0 ? id : `call_${index}`,
      type: 'tool_call',
    });
  });
  return out;
}

function messageText(content: BaseMessage['content']): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

/**
 * Format LangChain messages for the Workers AI binding. Tool-call rounds
 * follow the binding's documented function-calling pattern: the assistant
 * message carries `tool_call: <name>`, each tool result is a
 * `{ role: 'tool', name, content }` message.
 */
export function formatWorkersAiMessages(messages: BaseMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of messages) {
    const type = m.getType();
    if (type === 'system') {
      out.push({ role: 'system', content: messageText(m.content) });
    } else if (type === 'human') {
      out.push({ role: 'user', content: messageText(m.content) });
    } else if (type === 'ai') {
      const ai = m as AIMessage;
      const toolCalls = ai.tool_calls ?? [];
      if (toolCalls.length === 0) {
        out.push({ role: 'assistant', content: messageText(m.content) });
      } else {
        // One assistant+tool pair per call, in order -- the direct
        // generalization of the documented single-call example. The actual
        // tool result messages arrive as separate ToolMessages and are
        // appended below; here we only mark which tool was called.
        for (const tc of toolCalls) {
          out.push({ role: 'assistant', content: messageText(m.content), tool_call: tc.name });
        }
      }
    } else if (type === 'tool') {
      const name =
        typeof (m as { name?: unknown }).name === 'string' &&
        ((m as { name?: string }).name?.length ?? 0) > 0
          ? (m as { name: string }).name
          : 'tool';
      out.push({ role: 'tool', name, content: messageText(m.content) });
    } else {
      out.push({ role: 'user', content: messageText(m.content) });
    }
  }
  return out;
}

/**
 * A LangChain chat model over the Workers AI `[ai]` binding. Supports
 * `invoke` (with tool calling via `bindTools`), and `stream` for token
 * streaming of the final answer.
 */
export class ChatWorkersAI extends BaseChatModel<ChatWorkersAICallOptions> {
  static lc_name(): string {
    return 'ChatWorkersAI';
  }

  model: string;
  binding: WorkersAiBinding;

  constructor(fields: ChatWorkersAIFields) {
    super(fields);
    this.model = fields.model ?? DEFAULT_QA_MODEL_ID;
    this.binding = fields.binding;
  }

  _llmType(): string {
    return 'workers-ai';
  }

  get identifyingParams(): { model: string } {
    return { model: this.model };
  }

  bindTools(
    tools: BindToolsInput[],
    kwargs?: Partial<ChatWorkersAICallOptions>,
  ): RunnableBinding<
    Parameters<BaseChatModel['invoke']>[0],
    AIMessageChunk,
    ChatWorkersAICallOptions
  > {
    const defs = tools.map(toWorkersAiToolDef);
    return new RunnableBinding({
      bound: this,
      kwargs: { ...kwargs, tools: defs },
      config: {},
    });
  }

  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    _runManager?: unknown,
  ): Promise<ChatResult> {
    const signal = options.signal ?? AbortSignal.timeout(QA_MODEL_TIMEOUT_MS);
    const tools = (options as ChatWorkersAICallOptions).tools;
    const raw = (await this.binding.run(
      this.model,
      {
        messages: formatWorkersAiMessages(messages),
        ...(tools && tools.length > 0 ? { tools } : {}),
      },
      { signal },
    )) as { response?: unknown; tool_calls?: unknown } | null;
    const text = typeof raw?.response === 'string' ? raw.response : '';
    const toolCalls = normalizeToolCalls(raw?.tool_calls);
    const message = new AIMessage(text);
    if (toolCalls.length > 0) {
      message.tool_calls = toolCalls;
      message.invalid_tool_calls = [];
    }
    return { generations: [{ text, message }] };
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    _runManager?: unknown,
  ): AsyncGenerator<ChatGenerationChunk> {
    const signal = options.signal ?? AbortSignal.timeout(QA_MODEL_TIMEOUT_MS);
    const stream = (await this.binding.run(
      this.model,
      { messages: formatWorkersAiMessages(messages), stream: true },
      { signal },
    )) as ReadableStream<Uint8Array>;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const emitLine = function* (line: string): Generator<ChatGenerationChunk> {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }
      const delta = (parsed as { response?: unknown }).response;
      if (typeof delta === 'string' && delta.length > 0) {
        yield new ChatGenerationChunk({
          text: delta,
          message: new AIMessageChunk({ content: delta }),
        });
      }
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const eventText = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of eventText.split('\n')) {
            yield* emitLine(line);
          }
        }
      }
      buf += decoder.decode();
      for (const line of buf.split('\n')) {
        yield* emitLine(line);
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/**
 * Build the tutor model from the Worker environment. Returns null when the
 * AI binding is absent (unit tests, or a Worker deployed without `[ai]`) --
 * routes.ts answers AI_UNAVAILABLE in that case instead of burning quota.
 */
export function createQaModel(env: Env): ChatWorkersAI | null {
  if (!env.AI) return null;
  return new ChatWorkersAI({
    model: env.QA_MODEL_ID ?? DEFAULT_QA_MODEL_ID,
    binding: env.AI,
  });
}
