import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations, like scripts/ben helpers
import { countLessonSources, parseSourcesEntries } from './coverage.mjs';

const FIXTURE = `# Lesson

## Takeaways

- Not a source entry; must not be counted.

## Sources & further reading

- Jane Doe, *Some Book* (Publisher, 2001) — unlinked entry.
- John Roe, ["Some Paper"](https://example.org/paper), Journal 2020 — linked entry.
- A bare https://example.org/not-a-markdown-link reference — not linked by the census method.
- Multi-line entry starts here
  and continues on an indented line (not a new entry).

## Appendix

- Also not a source entry; the section has ended.
`;

describe('sources coverage counter (Phase 1 census method)', () => {
  it('counts only `- ` bullets inside the Sources section', () => {
    expect(parseSourcesEntries(FIXTURE)).toHaveLength(4);
  });

  it('counts an entry as linked only when it carries a markdown http(s) link', () => {
    expect(countLessonSources(FIXTURE)).toEqual({ total: 4, linked: 1, unlinked: 3 });
  });

  it('returns zeroes for a lesson with no Sources section', () => {
    expect(countLessonSources('# Lesson\n\nNo tail sections.\n')).toEqual({
      total: 0,
      linked: 0,
      unlinked: 0,
    });
  });

  it('counts every entry in an all-linked fixture as linked', () => {
    const allLinked = [
      '## Sources & further reading',
      '',
      '- A, ["One"](https://a.example/1) — x.',
      '- B, ["Two"](http://b.example/2) — y.',
    ].join('\n');
    expect(countLessonSources(allLinked)).toEqual({ total: 2, linked: 2, unlinked: 0 });
  });
});
