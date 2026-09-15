import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider } from '../store/aiSettings';

export interface TutorMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamTutorReplyOptions {
  apiKey: string;
  provider: AIProvider;
  /** Endpoint base URL, e.g. https://api.openai.com/v1 */
  baseUrl: string;
  model: string;
  systemPrompt: string;
  messages: TutorMessage[];
  onDelta: (textChunk: string) => void;
  signal?: AbortSignal;
}

/**
 * Streams a tutor reply directly from the browser (BYOK - the user's own key
 * never leaves their machine except to talk to the provider's API).
 * Anthropic goes through the Anthropic SDK; OpenAI and custom endpoints go
 * through the OpenAI-compatible chat-completions SSE protocol with plain
 * fetch, so no extra SDK dependency is needed. Throws a plain `Error` with a
 * short, user-facing message on failure.
 */
export async function streamTutorReply(opts: StreamTutorReplyOptions): Promise<void> {
  if (opts.provider === 'anthropic') {
    return streamAnthropic(opts);
  }
  return streamOpenAICompatible(opts);
}

async function streamAnthropic(opts: StreamTutorReplyOptions): Promise<void> {
  const { apiKey, baseUrl, model, systemPrompt, messages, onDelta, signal } = opts;

  const client = new Anthropic({
    apiKey,
    baseURL: baseUrl.trim() || undefined,
    dangerouslyAllowBrowser: true,
  });

  try {
    const stream = client.messages.stream(
      {
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
      },
      { signal },
    );

    stream.on('text', (textDelta) => {
      if (signal?.aborted) return;
      onDelta(textDelta);
    });

    // Await the final message so any error surfaces (and the stream is
    // fully drained) before we return.
    await stream.finalMessage();
  } catch (err) {
    throw new Error(mapAnthropicError(err));
  }
}

async function streamOpenAICompatible(opts: StreamTutorReplyOptions): Promise<void> {
  const { apiKey, baseUrl, model, systemPrompt, messages, onDelta, signal } = opts;

  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) {
    throw new Error('Set an endpoint URL in AI Tutor settings first.');
  }

  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      }),
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    throw new Error('Network/CORS error reaching the API.');
  }

  if (!res.ok) {
    throw new Error(mapHttpStatus(res.status));
  }
  if (!res.body) {
    throw new Error('The provider returned an empty response.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (signal?.aborted) return;
      const delta = deltaFromSseLine(line);
      if (delta) onDelta(delta);
    }
  }
  // A final data line without a trailing newline would otherwise be dropped.
  const tail = deltaFromSseLine(buffer);
  if (tail) onDelta(tail);
}

/**
 * Extracts the text delta from one SSE `data:` line of an OpenAI-compatible
 * stream. Returns null for control lines, `[DONE]`, empty deltas, and
 * malformed payloads. Pure and exported for unit tests.
 */
export function deltaFromSseLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;
  const data = trimmed.slice(5).trim();
  if (!data || data === '[DONE]') return null;
  try {
    const json = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: unknown } }>;
    };
    const content = json.choices?.[0]?.delta?.content;
    return typeof content === 'string' && content ? content : null;
  } catch {
    return null;
  }
}

function mapHttpStatus(status: number): string {
  if (status === 400) return 'Bad request — check the model name and endpoint URL.';
  if (status === 401) return 'Invalid API key.';
  if (status === 429) return 'Rate limited by the provider — try again shortly.';
  if (status === 404) return 'Endpoint or model not found — check the endpoint URL and model name.';
  return `Provider error (HTTP ${status}).`;
}

function mapAnthropicError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return 'Invalid API key.';
  }
  if (err instanceof Anthropic.RateLimitError) {
    return 'Rate limited by the provider — try again shortly.';
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return 'Network/CORS error reaching the API.';
  }
  if (err instanceof Anthropic.APIError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'Something went wrong talking to the AI tutor.';
}
