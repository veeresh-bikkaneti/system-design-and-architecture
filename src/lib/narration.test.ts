import { describe, expect, it } from 'vitest';

import {
  alignBlocks,
  findActiveWordIndex,
  flattenWords,
  narrationAudioUrl,
  narrationJsonUrl,
  normalizeWordToken,
  planWordSpans,
  speakablePunct,
  tokenizeWords,
  type FlatWord,
  type NarrationManifest,
} from './narration';

/* ------------------------------------------------------------------ */
/* tokenizeWords / normalizeWordToken — the cross-language contract     */
/* ------------------------------------------------------------------ */

describe('tokenizeWords', () => {
  it('splits on whitespace and punctuation, keeping contractions whole', () => {
    expect(tokenizeWords("Don't stop read-along highlighting!")).toEqual([
      "Don't",
      'stop',
      'read',
      'along',
      'highlighting',
    ]);
  });

  it('handles curly apostrophes and unicode words', () => {
    expect(tokenizeWords('l’cache über-cool 3x')).toEqual([
      'l’cache',
      'über',
      'cool',
      '3x',
    ]);
  });

  it('returns [] for empty input', () => {
    expect(tokenizeWords('')).toEqual([]);
  });
});

describe('normalizeWordToken', () => {
  it('is case-insensitive and ignores punctuation', () => {
    expect(normalizeWordToken('“Hello!”')).toBe('hello');
    expect(normalizeWordToken('HELLO')).toBe('hello');
  });
});

/* ------------------------------------------------------------------ */
/* flattenWords + findActiveWordIndex                                   */
/* ------------------------------------------------------------------ */

const manifest = (blocks: { text: string; times: [number, number][] }[]): NarrationManifest => ({
  slug: 'demo',
  voice: 'af_heart',
  sampleRate: 24000,
  duration: 3,
  audio: 'narration.opus',
  blocks: blocks.map((b, bi) => ({
    kind: bi === 0 ? ('title' as const) : ('prose' as const),
    text: b.text,
    words: b.times.map(([start, end], i) => ({
      text: b.text.split(' ')[i] ?? `w${i}`,
      start,
      end,
    })),
  })),
});

const flatOf = (m: NarrationManifest): FlatWord[] => flattenWords(m);

describe('flattenWords', () => {
  it('flattens in block order with block/word indexes', () => {
    const flat = flatOf(
      manifest([
        { text: 'Hi there', times: [[0, 0.2], [0.2, 0.5]] },
        { text: 'Bye', times: [[1, 1.4]] },
      ]),
    );
    expect(flat.map((w) => [w.block, w.index, w.start, w.end])).toEqual([
      [0, 0, 0, 0.2],
      [0, 1, 0.2, 0.5],
      [1, 0, 1, 1.4],
    ]);
  });
});

describe('findActiveWordIndex', () => {
  const flat = flatOf(
    manifest([
      { text: 'Hi there', times: [[0, 0.2], [0.2, 0.5]] },
      { text: 'Bye', times: [[1, 1.4]] },
    ]),
  );

  it('finds the word active at a given media time', () => {
    expect(findActiveWordIndex(flat, 0)).toBe(0);
    expect(findActiveWordIndex(flat, 0.3)).toBe(1);
    expect(findActiveWordIndex(flat, 1.2)).toBe(2);
  });

  it('returns -1 in gaps, before the start, and at/past the end', () => {
    expect(findActiveWordIndex(flat, -0.1)).toBe(-1);
    expect(findActiveWordIndex(flat, 0.7)).toBe(-1); // gap between words
    expect(findActiveWordIndex(flat, 1.4)).toBe(-1); // exactly at end
    expect(findActiveWordIndex(flat, 99)).toBe(-1);
  });

  it('returns -1 for an empty word list', () => {
    expect(findActiveWordIndex([], 1)).toBe(-1);
  });
});

/* ------------------------------------------------------------------ */
/* alignBlocks                                                         */
/* ------------------------------------------------------------------ */

describe('alignBlocks', () => {
  it('matches blocks by normalized text, first-come-first-served', () => {
    const result = alignBlocks(
      [{ text: 'Hello  world' }, { text: 'Second' }, { text: 'Missing' }],
      ['hello world', 'Hello world', 'second'],
    );
    expect(result).toEqual([0, 2, null]);
  });

  it('returns nulls when nothing matches', () => {
    expect(alignBlocks([{ text: 'a' }], ['b'])).toEqual([null]);
  });

  it('matches spoken expansions against their written form', () => {
    // The manifest holds the spoken form (extractor's _speakable_punct);
    // the DOM holds the written form. Both sides must still align.
    const result = alignBlocks(
      [
        { text: 'about 120 requests/second' },
        { text: 'go from a to b' },
        { text: 'research and development' },
        { text: '50 percent faster' },
      ],
      ['~120 requests/second', 'go from a -> b', 'research & development', '50% faster'],
    );
    expect(result).toEqual([0, 1, 2, 3]);
  });
});

describe('speakablePunct', () => {
  it('mirrors the extractor expansions', () => {
    expect(speakablePunct('~10× average')).toBe(' about 10× average');
    expect(speakablePunct('a -> b')).toBe('a  to  b');
    expect(speakablePunct('R&D')).toBe('R and D');
    expect(speakablePunct('50% of 100')).toBe('50 percent of 100');
    // No-op when nothing needs expanding.
    expect(speakablePunct('plain words')).toBe('plain words');
  });
});

/* ------------------------------------------------------------------ */
/* planWordSpans                                                       */
/* ------------------------------------------------------------------ */

describe('planWordSpans', () => {
  it('plans gap/word spans consuming the expected words in order', () => {
    const plan = planWordSpans('Hello, brave world!', ['Hello', 'brave', 'world']);
    expect(plan).not.toBeNull();
    expect(plan!.consumed).toBe(3);
    expect(plan!.parts).toEqual([
      { kind: 'word', text: 'Hello' },
      { kind: 'gap', text: ', ' },
      { kind: 'word', text: 'brave' },
      { kind: 'gap', text: ' ' },
      { kind: 'word', text: 'world' },
      { kind: 'gap', text: '!' },
    ]);
  });

  it('matches fuzzily across case/punctuation differences', () => {
    const plan = planWordSpans('“HELLO”', ['hello']);
    expect(plan?.consumed).toBe(1);
  });

  it('returns null on the first mismatched word', () => {
    expect(planWordSpans('Hello mars', ['Hello', 'world'])).toBeNull();
  });

  it('returns null when the text has more words than expected', () => {
    expect(planWordSpans('Hello world extra', ['Hello', 'world'])).toBeNull();
  });

  it('handles a text node with no words as a pure gap', () => {
    const plan = planWordSpans(' … ', []);
    expect(plan).not.toBeNull();
    expect(plan!.consumed).toBe(0);
    expect(plan!.parts).toEqual([{ kind: 'gap', text: ' … ' }]);
  });
});

/* ------------------------------------------------------------------ */
/* asset URLs                                                         */
/* ------------------------------------------------------------------ */

describe('narration asset URLs', () => {
  it('builds the manifest URL under the audio dir', () => {
    expect(narrationJsonUrl('scaling-web-service')).toBe(
      '/audio/scaling-web-service/narration.json',
    );
  });

  it('builds the audio URL from the manifest file name', () => {
    const m = manifest([]);
    expect(narrationAudioUrl('scaling-web-service', m)).toBe(
      '/audio/scaling-web-service/narration.opus',
    );
  });
});
