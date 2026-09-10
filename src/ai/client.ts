import Anthropic from '@anthropic-ai/sdk';

export interface TutorMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamTutorReplyOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: TutorMessage[];
  onDelta: (textChunk: string) => void;
  signal?: AbortSignal;
}

/**
 * Streams a tutor reply from the Anthropic Messages API directly from the
 * browser (BYOK - the user's own key never leaves their machine except to
 * talk to Anthropic's API). Throws a plain `Error` with a short, user-facing
 * message on failure.
 */
export async function streamTutorReply(opts: StreamTutorReplyOptions): Promise<void> {
  const { apiKey, model, systemPrompt, messages, onDelta, signal } = opts;

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

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
