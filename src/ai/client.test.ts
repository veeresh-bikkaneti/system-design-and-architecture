import { describe, expect, it } from 'vitest';
import { deltaFromSseLine } from './client';

/**
 * deltaFromSseLine is the streaming contract every non-Anthropic provider
 * goes through: any OpenAI-compatible chat-completions endpoint (OpenAI
 * itself, a self-hosted model, a proxy) streams `data:` lines in this shape.
 * If this parser only worked for one vendor's quirks, provider-agnosticism
 * would be a fiction — so the edge cases are pinned here.
 */
describe('deltaFromSseLine', () => {
  it('extracts the text delta from a standard chunk', () => {
    expect(
      deltaFromSseLine('data: {"choices":[{"delta":{"content":"Hello"}}]}'),
    ).toBe('Hello');
  });

  it('tolerates surrounding whitespace', () => {
    expect(
      deltaFromSseLine('  data: {"choices":[{"delta":{"content":" world"}}]}  \n'),
    ).toBe(' world');
  });

  it('returns null for the stream terminator', () => {
    expect(deltaFromSseLine('data: [DONE]')).toBeNull();
  });

  it('returns null for SSE control/comment lines', () => {
    expect(deltaFromSseLine(': keep-alive')).toBeNull();
    expect(deltaFromSseLine('event: message')).toBeNull();
    expect(deltaFromSseLine('')).toBeNull();
  });

  it('returns null for malformed payloads instead of throwing', () => {
    expect(deltaFromSseLine('data: not json at all')).toBeNull();
    expect(deltaFromSseLine('data: {"choices":[]}')).toBeNull();
    expect(deltaFromSseLine('data: {"choices":[{"delta":{}}]}')).toBeNull();
    expect(deltaFromSseLine('data: {"choices":[{"delta":{"content":""}}]}')).toBeNull();
    expect(deltaFromSseLine('data: {"choices":[{"delta":{"content":42}}]}')).toBeNull();
    expect(deltaFromSseLine('data:')).toBeNull();
  });
});
