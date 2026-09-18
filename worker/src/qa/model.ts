// worker/src/qa/model.ts -- the SELF-HOSTED chat model for the course Q&A
// tutor ("Veer").
//
// Liz's locked decision: no third-party AI subscription. The model is a
// tiny open-weight instruct model (e.g. Llama 3.2 3B Q4_K_M) running on a
// machine she controls via llama.cpp's server, which speaks the
// OpenAI-compatible `/v1/chat/completions` API (including tool calling).
// This file implements the LangChain-first equivalent directly:
// `ChatSelfHosted`, a real `BaseChatModel` subclass over plain HTTPS,
// with function calling in the OpenAI tool format and SSE streaming.
//
// Wiring (all in wrangler):
//   MODEL_BASE_URL  [vars]  e.g. https://llm.example.com/v1  ("" = unwired)
//   MODEL_API_KEY   secret  shared bearer token the Worker sends; set via
//                           `wrangler secret put MODEL_API_KEY`, never in code
//   QA_MODEL_ID     [vars]  model alias served by llama.cpp (--alias);
//                           defaults to DEFAULT_QA_MODEL_ID below.
//
// Security notes:
// - The API key travels only Worker -> model server, as a Bearer header.
//   It never reaches the browser; the widget talks to /api/qa/* only.
// - The model server must NOT be open to the internet: restrict it to
//   Cloudflare's IP ranges or put it behind a Cloudflare Tunnel, and
//   require the bearer token. An open /v1 endpoint is a free GPU for
//   strangers.
// - Tool outputs are still wrapped as untrusted data (see tools.ts); the
//   self-hosted model gets the same prompt-injection boundary as any other.

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

/**
 * Default tutor model alias. Must match the `--alias` given to the
 * llama.cpp server (e.g. `llama-server -m Llama-3.2-3B-Instruct-Q4_K_M.gguf
 * --alias veer-tutor`). Overridable via the QA_MODEL_ID var.
 */
export const DEFAULT_QA_MODEL_ID = 'veer-tutor';

/**
 * Hard timeout per model call. Self-hosted CPU inference is slow (a 3B
 * quant on a few ARM cores does ~10 tok/s), so this is generous: a slow
 * model can never hang a chat turn (or the SSE stream) past this.
 */
export const QA_MODEL_TIMEOUT_MS = 120000;

/** Returns `{ signal }` -- pass into a model call for the standard timeout. */
export function withQaTimeout(): { signal: AbortSignal } {
  return { signal: AbortSignal.timeout(QA_MODEL_TIMEOUT_MS) };
}

/** One tool in the OpenAI function-calling format. */
export interface OpenAiToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ChatSelfHostedCallOptions extends BaseChatModelCallOptions {
  /** Tools in OpenAI format; set by bindTools(). */
  tools?: OpenAiToolDef[];
}

export interface ChatSelfHostedFields extends BaseChatModelParams {
  model?: string;
  /** Origin of the OpenAI-compatible API, e.g. https://llm.example.com/v1 */
  baseUrl: string;
  /** Shared bearer token for the model server. Omitted when unset. */
  apiKey?: string;
  /** fetch implementation; defaults to global fetch (stubbed in tests). */
  fetchImpl?: typeof fetch;
}

/** Convert any LangChain tool-like into the OpenAI tool definition shape. */
export function toOpenAiToolDef(tool: BindToolsInput): OpenAiToolDef {
  const openAi = convertToOpenAITool(tool as Parameters<typeof convertToOpenAITool>[0]);
  const fn = (openAi as { function?: { name?: string; description?: string; parameters?: unknown } })
    .function ?? {};
  return {
    type: 'function',
    function: {
      name: typeof fn.name === 'string' ? fn.name : 'tool',
      description: typeof fn.description === 'string' ? fn.description : '',
      parameters: (fn.parameters ?? {}) as Record<string, unknown>,
    },
  };
}

/** Parse `tool_calls` from an OpenAI chat-completion message. Tolerates the
 * legacy Workers AI `{ name, arguments }` shape too, so a provider swap
 * degrades to "no tool calls parsed" rather than a crash. `arguments` may
 * be a JSON string (OpenAI) or an already-parsed object. */
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

/** Format LangChain messages as OpenAI chat messages. */
export function formatOpenAiMessages(messages: BaseMessage[]): Record<string, unknown>[] {
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
      out.push({
        role: 'assistant',
        content: messageText(m.content) || null,
        ...(toolCalls.length > 0
          ? {
              tool_calls: toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.name, arguments: JSON.stringify(tc.args) },
              })),
            }
          : {}),
      });
    } else if (type === 'tool') {
      const tm = m as { name?: unknown; tool_call_id?: unknown };
      out.push({
        role: 'tool',
        tool_call_id: typeof tm.tool_call_id === 'string' ? tm.tool_call_id : '',
        content: messageText(m.content),
      });
    } else {
      out.push({ role: 'user', content: messageText(m.content) });
    }
  }
  return out;
}

interface OpenAiChatResponse {
  choices?: Array<{
    message?: { content?: unknown; tool_calls?: unknown };
    delta?: { content?: unknown };
  }>;
}

/**
 * A LangChain chat model over a self-hosted OpenAI-compatible endpoint
 * (llama.cpp server). Supports `invoke` (with tool calling via
 * `bindTools`) and `stream` for token streaming of the final answer.
 */
export class ChatSelfHosted extends BaseChatModel<ChatSelfHostedCallOptions> {
  static lc_name(): string {
    return 'ChatSelfHosted';
  }

  model: string;
  baseUrl: string;
  apiKey?: string;
  fetchImpl: typeof fetch;

  constructor(fields: ChatSelfHostedFields) {
    super(fields);
    this.model = fields.model ?? DEFAULT_QA_MODEL_ID;
    this.baseUrl = fields.baseUrl.replace(/\/+$/, '');
    this.apiKey = fields.apiKey;
    this.fetchImpl = fields.fetchImpl ?? fetch;
  }

  _llmType(): string {
    return 'self-hosted';
  }

  get identifyingParams(): { model: string; baseUrl: string } {
    // NOTE: apiKey deliberately excluded -- never log it.
    return { model: this.model, baseUrl: this.baseUrl };
  }

  bindTools(
    tools: BindToolsInput[],
    kwargs?: Partial<ChatSelfHostedCallOptions>,
  ): RunnableBinding<
    Parameters<BaseChatModel['invoke']>[0],
    AIMessageChunk,
    ChatSelfHostedCallOptions
  > {
    const defs = tools.map(toOpenAiToolDef);
    return new RunnableBinding({
      bound: this,
      kwargs: { ...kwargs, tools: defs },
      config: {},
    });
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    return h;
  }

  private async post(
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<Response> {
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      throw new Error(`model_http_${res.status}`);
    }
    return res;
  }

  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    _runManager?: unknown,
  ): Promise<ChatResult> {
    const signal = options.signal ?? AbortSignal.timeout(QA_MODEL_TIMEOUT_MS);
    const tools = (options as ChatSelfHostedCallOptions).tools;
    const res = await this.post(
      {
        model: this.model,
        messages: formatOpenAiMessages(messages),
        ...(tools && tools.length > 0 ? { tools } : {}),
        stream: false,
      },
      signal,
    );
    const json = (await res.json()) as OpenAiChatResponse;
    const msg = json.choices?.[0]?.message;
    const text = typeof msg?.content === 'string' ? msg.content : '';
    const toolCalls = normalizeToolCalls(msg?.tool_calls);
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
    const res = await this.post(
      {
        model: this.model,
        messages: formatOpenAiMessages(messages),
        stream: true,
      },
      signal,
    );
    if (!res.body) return;
    const reader = res.body.getReader();
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
      const delta = (parsed as OpenAiChatResponse).choices?.[0]?.delta?.content;
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
 * Build the tutor model from the Worker environment. Returns null when
 * MODEL_BASE_URL is unset (unit tests, or a Worker deployed before the
 * model server exists) -- routes.ts answers AI_UNAVAILABLE in that case
 * instead of burning quota.
 */
export function createQaModel(env: Env): ChatSelfHosted | null {
  const baseUrl = env.MODEL_BASE_URL?.trim();
  if (!baseUrl) return null;
  return new ChatSelfHosted({
    model: env.QA_MODEL_ID ?? DEFAULT_QA_MODEL_ID,
    baseUrl,
    apiKey: env.MODEL_API_KEY,
  });
}
