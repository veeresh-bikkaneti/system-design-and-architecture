import { describe, expect, it } from 'vitest';
import { escapeHtml, maskEmail, safeHttpsUrl } from './index';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml('<script>alert("x") & \'y\'</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;',
    );
  });

  it('leaves plain text alone', () => {
    expect(escapeHtml('hello world 123')).toBe('hello world 123');
  });
});

describe('maskEmail', () => {
  it('shows at most 2 chars of the local part', () => {
    expect(maskEmail('longname@example.com')).toBe('lo******@example.com');
  });

  it('fully masks 1-2 character local parts instead of exposing them', () => {
    expect(maskEmail('ab@example.com')).toBe('a***@example.com');
    expect(maskEmail('a@example.com')).toBe('***@example.com');
  });

  it('handles malformed input without throwing', () => {
    expect(maskEmail('no-at-sign')).toBe('***');
    expect(maskEmail('')).toBe('***');
  });
});

describe('safeHttpsUrl', () => {
  it('passes well-formed https URLs through', () => {
    expect(safeHttpsUrl('https://example.com/badge/123')).toBe(
      'https://example.com/badge/123',
    );
  });

  it('rejects non-https schemes that escapeHtml cannot stop', () => {
    expect(safeHttpsUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpsUrl('data:text/html,<h1>x</h1>')).toBeNull();
    expect(safeHttpsUrl('http://example.com/badge')).toBeNull();
  });

  it('rejects garbage', () => {
    expect(safeHttpsUrl('not a url')).toBeNull();
    expect(safeHttpsUrl('')).toBeNull();
  });
});
