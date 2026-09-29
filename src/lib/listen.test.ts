import { describe, expect, it } from 'vitest';

import {
  chunkBlocks,
  extractLessonBlocks,
  extractLessonText,
  rankVoices,
  splitSentences,
  type RankableVoice,
} from './listen';

/* ------------------------------------------------------------------ */
/* rankVoices                                                          */
/* ------------------------------------------------------------------ */

const v = (name: string, lang: string, def = false): RankableVoice => ({
  name,
  lang,
  default: def,
});

describe('rankVoices', () => {
  const voices = [
    v('Microsoft David - English (United States)', 'en-US'),
    v('Microsoft Aria Online (Natural) - English (United States)', 'en-US'),
    v('Google US English', 'en_US'),
    v('Microsoft Libby Online (Natural) - English (United Kingdom)', 'en-GB'),
    v('Google UK English Female', 'en-GB'),
    v('Amélie', 'fr-FR'),
  ];

  it('returns null for an empty list instead of crashing', () => {
    expect(rankVoices([], 'auto')).toBeNull();
    expect(rankVoices([], 'uk')).toBeNull();
  });

  it('auto prefers a US natural voice', () => {
    expect(rankVoices(voices, 'auto')?.name).toBe(
      'Microsoft Aria Online (Natural) - English (United States)',
    );
  });

  it('us prefers the US natural voice over plain and Google voices', () => {
    expect(rankVoices(voices, 'us')?.name).toBe(
      'Microsoft Aria Online (Natural) - English (United States)',
    );
  });

  it('uk prefers the UK natural voice', () => {
    expect(rankVoices(voices, 'uk')?.name).toBe(
      'Microsoft Libby Online (Natural) - English (United Kingdom)',
    );
  });

  it('uk falls back to US English when no British voice exists', () => {
    const usOnly = voices.filter((x) => !x.lang.includes('GB'));
    expect(rankVoices(usOnly, 'uk')?.name).toBe(
      'Microsoft Aria Online (Natural) - English (United States)',
    );
  });

  it('prefers Google voices over generic ones when no natural voice exists', () => {
    const plain = [
      v('Microsoft David - English (United States)', 'en-US'),
      v('Google US English', 'en_US'),
    ];
    expect(rankVoices(plain, 'us')?.name).toBe('Google US English');
  });

  it('returns null when no English voice exists (caller falls back to browser default)', () => {
    expect(rankVoices([v('Amélie', 'fr-FR')], 'auto')).toBeNull();
  });

  it('breaks naturalness ties by OS default flag, then input order (deterministic)', () => {
    const tied = [
      v('Voice A', 'en-US'),
      v('Voice B', 'en-US', true),
      v('Voice C', 'en-US'),
    ];
    expect(rankVoices(tied, 'us')?.name).toBe('Voice B');
    const untied = [v('Voice A', 'en-US'), v('Voice C', 'en-US')];
    expect(rankVoices(untied, 'us')?.name).toBe('Voice A');
    // same input twice → same answer
    expect(rankVoices(untied, 'us')).toBe(rankVoices(untied, 'us'));
  });

  it('normalizes underscore locales (en_US)', () => {
    expect(rankVoices([v('Google US English', 'en_US')], 'us')?.name).toBe(
      'Google US English',
    );
  });
});

/* ------------------------------------------------------------------ */
/* extractLessonText — minimal fake DOM (no jsdom in this repo)        */
/* ------------------------------------------------------------------ */

class FakeEl {
  readonly tagName: string;
  readonly children: FakeEl[];
  private readonly attrs: Record<string, string>;
  private readonly text: string;

  constructor(
    tag: string,
    text = '',
    attrs: Record<string, string> = {},
    children: FakeEl[] = [],
  ) {
    this.tagName = tag.toUpperCase();
    this.text = text;
    this.attrs = attrs;
    this.children = children;
  }

  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join(' ');
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
}

const asElement = (el: FakeEl): Element => el as unknown as Element;

describe('extractLessonText', () => {
  it('collects headings, paragraphs and list items', () => {
    const root = new FakeEl('div', '', {}, [
      new FakeEl('h2', 'Why caching matters'),
      new FakeEl('p', 'A cache trades stale data for speed.'),
      new FakeEl('ul', '', {}, [
        new FakeEl('li', 'It sits close to the reader.'),
        new FakeEl('li', 'It absorbs repeat traffic.'),
      ]),
    ]);
    expect(extractLessonText(asElement(root))).toEqual([
      'Why caching matters',
      'A cache trades stale data for speed.',
      'It sits close to the reader.',
      'It absorbs repeat traffic.',
    ]);
  });

  it('skips pre/code blocks', () => {
    const root = new FakeEl('div', '', {}, [
      new FakeEl('p', 'First paragraph.'),
      new FakeEl('pre', 'const x = cache.get(k);'),
      new FakeEl('p', 'Second paragraph.'),
    ]);
    expect(extractLessonText(asElement(root))).toEqual([
      'First paragraph.',
      'Second paragraph.',
    ]);
  });

  it('skips mermaid diagram containers and quiz embeds', () => {
    const root = new FakeEl('div', '', {}, [
      new FakeEl('p', 'Before the diagram.'),
      new FakeEl('div', '', { class: 'mermaid-diagram my-2' }, [
        new FakeEl('p', 'graph TD; A-->B;'),
      ]),
      new FakeEl('div', '', { class: 'not-prose my-10' }, [
        new FakeEl('h3', 'Check your understanding'),
        new FakeEl('p', 'Which cache eviction policy…'),
      ]),
      new FakeEl('p', 'After the embeds.'),
    ]);
    expect(extractLessonText(asElement(root))).toEqual([
      'Before the diagram.',
      'After the embeds.',
    ]);
  });

  it('skips tables containing code but reads plain tables cell by cell', () => {
    const root = new FakeEl('div', '', {}, [
      new FakeEl('table', '', {}, [
        new FakeEl('tr', '', {}, [
          new FakeEl('td', 'LRU'),
          new FakeEl('td', 'Evicts least recently used.'),
        ]),
      ]),
      new FakeEl('table', '', {}, [
        new FakeEl('tr', '', {}, [
          new FakeEl('td', '', {}, [new FakeEl('code', 'cache.get(k)')]),
        ]),
      ]),
    ]);
    const chunks = extractLessonText(asElement(root));
    expect(chunks).toContain('LRU');
    expect(chunks).toContain('Evicts least recently used.');
    expect(chunks.join(' ')).not.toContain('cache.get(k)');
  });

  it('skips aria-hidden content', () => {
    const root = new FakeEl('div', '', {}, [
      new FakeEl('p', 'Visible prose.'),
      new FakeEl('p', 'Decorative duplicate.', { 'aria-hidden': 'true' }),
    ]);
    expect(extractLessonText(asElement(root))).toEqual(['Visible prose.']);
  });

  it('splits long paragraphs into sentence-boundary chunks of at most ~400 chars', () => {
    const sentence = 'This is a reasonably long sentence about caching. ';
    const root = new FakeEl('div', '', {}, [new FakeEl('p', sentence.repeat(20))]);
    const chunks = extractLessonText(asElement(root));
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(400);
      expect(c).toMatch(/[.!?…]$/);
    }
    // no text lost in the split
    expect(chunks.join(' ').replace(/\s+/g, ' ').trim()).toBe(
      sentence.repeat(20).replace(/\s+/g, ' ').trim(),
    );
  });

  it('returns an empty array when there is no speakable prose', () => {
    const root = new FakeEl('div', '', {}, [
      new FakeEl('pre', 'only code here'),
    ]);
    expect(extractLessonText(asElement(root))).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* extractLessonBlocks / splitSentences / chunkBlocks                   */
/* ------------------------------------------------------------------ */

describe('extractLessonBlocks', () => {
  it('returns blocks with their DOM elements in document order', () => {
    const h2 = new FakeEl('h2', 'Why caching matters');
    const p = new FakeEl('p', 'A cache trades stale data for speed.');
    const root = new FakeEl('div', '', {}, [h2, p]);
    const blocks = extractLessonBlocks(asElement(root));
    expect(blocks.map((b) => b.text)).toEqual([
      'Why caching matters',
      'A cache trades stale data for speed.',
    ]);
    expect(blocks[0].element).toBe(asElement(h2));
    expect(blocks[1].element).toBe(asElement(p));
  });

  it('skips code and widget subtrees like extractLessonText does', () => {
    const root = new FakeEl('div', '', {}, [
      new FakeEl('p', 'Kept.'),
      new FakeEl('div', '', { class: 'not-prose' }, [new FakeEl('p', 'Dropped.')]),
    ]);
    expect(extractLessonBlocks(asElement(root)).map((b) => b.text)).toEqual(['Kept.']);
  });
});

describe('splitSentences', () => {
  it('splits at sentence boundaries', () => {
    expect(splitSentences('First. Second! Third? Yes…')).toEqual([
      'First.',
      'Second!',
      'Third?',
      'Yes…',
    ]);
  });

  it('returns [] for blank input', () => {
    expect(splitSentences('   ')).toEqual([]);
  });
});

describe('chunkBlocks', () => {
  it('tracks block index and sentence ranges per chunk', () => {
    const chunks = chunkBlocks([
      { text: 'Alpha. Beta.' },
      { text: 'Gamma.' },
    ]);
    expect(chunks).toEqual([
      { blockIndex: 0, text: 'Alpha. Beta.', sentenceStart: 0, sentenceCount: 2 },
      { blockIndex: 1, text: 'Gamma.', sentenceStart: 0, sentenceCount: 1 },
    ]);
  });

  it('splits long blocks at sentence boundaries like the old chunker', () => {
    const long = `${'a'.repeat(200)}. ${'b'.repeat(200)}.`;
    const chunks = chunkBlocks([{ text: long }]);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ blockIndex: 0, sentenceStart: 0, sentenceCount: 1 });
    expect(chunks[1]).toMatchObject({ blockIndex: 0, sentenceStart: 1, sentenceCount: 1 });
    // Joined chunk texts equal the old extractLessonText output.
    const root = new FakeEl('div', '', {}, [new FakeEl('p', long)]);
    expect(chunks.map((c) => c.text)).toEqual(extractLessonText(asElement(root)));
  });
});
