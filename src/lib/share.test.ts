import { describe, expect, it } from 'vitest';

import { linkedInIntentUrl, xIntentUrl } from './share';

describe('xIntentUrl', () => {
  it('builds a tweet intent URL whose params round-trip the url and text', () => {
    const pageUrl =
      'https://veeresh-bikkaneti.github.io/system-design-and-architecture/lesson/cap-theorem/';
    const text = 'The CAP Theorem | System Design Mastery';
    const parsed = new URL(xIntentUrl(pageUrl, text));
    expect(parsed.origin + parsed.pathname).toBe('https://twitter.com/intent/tweet');
    expect(parsed.searchParams.get('url')).toBe(pageUrl);
    expect(parsed.searchParams.get('text')).toBe(text);
  });

  it('keeps ampersands and hashes inside the text parameter', () => {
    const parsed = new URL(xIntentUrl('https://example.com/lesson/', 'Q&A #1: scaling & caching'));
    expect(parsed.searchParams.get('text')).toBe('Q&A #1: scaling & caching');
    expect(parsed.searchParams.get('url')).toBe('https://example.com/lesson/');
  });
});

describe('linkedInIntentUrl', () => {
  it('builds a share-offsite URL whose url param round-trips', () => {
    const pageUrl =
      'https://veeresh-bikkaneti.github.io/system-design-and-architecture/lesson/cap-theorem/';
    const parsed = new URL(linkedInIntentUrl(pageUrl));
    expect(parsed.origin + parsed.pathname).toBe(
      'https://www.linkedin.com/sharing/share-offsite/',
    );
    expect(parsed.searchParams.get('url')).toBe(pageUrl);
  });
});
