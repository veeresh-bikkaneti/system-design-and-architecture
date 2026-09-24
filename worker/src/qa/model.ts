// P2 (course Q&A agent): the model interface + Workers AI implementation.
//
// The agent loop (graph.ts) talks to a `QaModel`, never directly to
// `env.AI`. That keeps the loop unit-testable (tests inject a scripted
// fake) and keeps the provider pluggable: Workers AI today, another
// OpenAI-compatible endpoint tomorrow, without touching the graph.
//
// Cost note: Workers AI bills per token to the Cloudflare account -- no API
// key travels with the request, so there is no secret to store. The binding
// is `[ai] binding = "AI"` in wrangler.toml.

/** One tool the model may call, as JSON Schema the model understands. */
export interface QaToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface QaModelToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface QaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** For assistant messages that called tools (round-trip fidelity). */
  toolCalls?: QaModelToolCall[];
  /** For tool messages: which call this result answers. */
  toolCallId?: string;
  /** For tool messages: which tool produced this result. */
  toolName?: string;
}

export interface QaCompleteRequest {
  system: string;
  messages: QaChatMessage[];
  tools: QaToolDefinition[];
  /** Hard ceiling on the reply length (cost/latency guard). */
  maxTokens?: number;
}

export interface QaModelResult {
  text: string;
  toolCalls: QaModelToolCall[];
}

export interface QaModel {
  /** One chat turn: may return text, tool calls, or both. */
  complete(request: QaCompleteRequest): Promise<QaModelResult>;
}

/** Default model: Llama 3.1 8B instruct (fp8), tool-calling capable. */
export const QA_DEFAULT_MODEL_ID = '@cf/meta/llama-3.1-8b-instruct-fp8';
/**
 * Per-call wall clock. A hung model aborts fast and the turn falls back
 * gracefully -- a Worker cannot afford to wait out a 60s provider stall.
 */
export const QA_MODEL_TIMEOUT_MS = 15_000;

function parseToolCall(raw: { name?: unknown; arguments?: unknown }, index: number): QaModelToolCall | null {
  if (typeof raw.name !== 'string' || raw.name.length === 0) return null;
  let args: Record<string, unknown> = {};
  const a = raw.arguments;
  if (typeof a === 'string' && a.length > 0) {
    try {
      const parsed: unknown = JSON.parse(a);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      // Unparseable arguments: the loop reports a tool error, never crashes.
    }
  } else if (a && typeof a === 'object' && !Array.isArray(a)) {
    args = a as Record<string, unknown>;
  }
  return { id: `tc-${index}`, name: raw.name, args };
}

/** Production model: Workers AI text-generation with tool calling. */
export class WorkersAiModel implements QaModel {
  private readonly ai: Ai;
  private readonly modelId: string;

  constructor(ai: Ai, modelId: string = QA_DEFAULT_MODEL_ID) {
    this.ai = ai;
    this.modelId = modelId;
  }

  private async runWithTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QA_MODEL_TIMEOUT_MS);
    try {
      return await fn(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  async complete(request: QaCompleteRequest): Promise<QaModelResult> {
    const messages: Array<Record<string, unknown>> = [{ role: 'system', content: request.system }];
    for (const m of request.messages) {
      if (m.role === 'tool') {
        messages.push({ role: 'tool', content: m.content, name: m.toolName ?? 'tool' });
      } else if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.args) },
          })),
        });
      } else {
        messages.push({ role: m.role, content: m.content });
      }
    }
    const out = (await this.runWithTimeout((signal) =>
      this.ai.run(
        this.modelId as keyof AiModels,
        {
          messages: messages as AiTextGenerationInput['messages'],
          tools: request.tools.map((t) => ({
            type: 'function' as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: {
                type: 'object' as const,
                properties: t.parameters.properties,
                required: t.parameters.required ?? [],
              },
            },
          })),
          max_tokens: request.maxTokens ?? 1024,
          temperature: 0.2,
        },
        { signal },
      ),
    )) as unknown as {
      response?: unknown;
      tool_calls?: Array<{ name?: unknown; arguments?: unknown }>;
    };
    const text = typeof out.response === 'string' ? out.response : '';
    const toolCalls: QaModelToolCall[] = [];
    const rawCalls = out.tool_calls;
    if (Array.isArray(rawCalls)) {
      rawCalls.forEach((rc, i) => {
        const parsed = parseToolCall(rc ?? {}, i);
        if (parsed) toolCalls.push(parsed);
      });
    }
    return { text, toolCalls };
  }
}
