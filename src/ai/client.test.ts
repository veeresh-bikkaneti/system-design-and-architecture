import { describe, expect, it } from 'vitest';
import { assertSafeBaseUrl, deltaFromSseLine } from './client';

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

/**
 * assertSafeBaseUrl guards the user's API key: it travels in the
 * Authorization header, so a plaintext http:// endpoint would broadcast it.
 * https: always passes; http: only for loopback (local dev servers).
 */
describe('assertSafeBaseUrl', () => {
  it('accepts https endpoints', () => {
    expect(() => assertSafeBaseUrl('https://api.openai.com/v1')).not.toThrow();
    expect(() => assertSafeBaseUrl('https://llm.example.com:8443/v1/')).not.toThrow();
  });

  it('accepts http only for loopback hosts', () => {
    expect(() => assertSafeBaseUrl('http://localhost:11434/v1')).not.toThrow();
    expect(() => assertSafeBaseUrl('http://127.0.0.1:1234/v1')).not.toThrow();
    expect(() => assertSafeBaseUrl('http://[::1]:11434/v1')).not.toThrow();
  });

  it('rejects plaintext http to remote hosts', () => {
    expect(() => assertSafeBaseUrl('http://evil.example.com/v1')).toThrow(/https/);
    expect(() => assertSafeBaseUrl('http://192.168.1.10/v1')).toThrow(/https/);
  });

  it('rejects non-URL input', () => {
    expect(() => assertSafeBaseUrl('not a url')).toThrow();
  });
});
