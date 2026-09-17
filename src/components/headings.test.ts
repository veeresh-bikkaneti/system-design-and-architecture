import { describe, expect, it } from 'vitest';
import { slugifyHeading } from './headings';

describe('slugifyHeading', () => {
  it('lowercases and dasherizes', () => {
    expect(slugifyHeading('Hello World')).toBe('hello-world');
  });

  it('strips punctuation', () => {
    expect(slugifyHeading('CAP Theorem: What?!')).toBe('cap-theorem-what');
  });

  it('trims and collapses whitespace and dashes', () => {
    expect(slugifyHeading('  a   b---c  ')).toBe('a-b-c');
  });

  it('falls back to "section" for empty or symbol-only headings', () => {
    expect(slugifyHeading('')).toBe('section');
    expect(slugifyHeading('!!!')).toBe('section');
  });
});
