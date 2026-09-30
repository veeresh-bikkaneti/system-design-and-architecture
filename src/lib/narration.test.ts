import { describe, expect, it } from 'vitest';

import {
  alignBlocks,
  expandPunctWithMap,
  expandTokens,
  findActiveWordIndex,
  flattenWords,
  isValidManifest,
  loadAccentPreference,
  narrationAudioUrl,
  narrationJsonUrl,
  normalizeWordToken,
  planWordSpans,
  saveAccentPreference,
  speakablePunct,
  tokenizeWords,
  type FlatWord,
  type NarrationManifest,
} from './narration';

/* ------------------------------------------------------------------ */
/* tokenizeWords / normalizeWordToken — the cross-language contract     */
/* ------------------------------------------------------------------ */

describe('tokenizeWords', () => {
  // Cross-language parity: this exact sample is also asserted in
  // scripts/tts/test_align.py (TokenizerParityTest). The build-time Python
  // extractor and this TS rule must produce the same sequence, or the DOM
  // tagger consumes the wrong words. If you change tokenization, change
  // both.
  const PARITY_SAMPLE = "The cache sits in front of the database, and it doesn't blink.";
  const PARITY_EXPECTED = [
    'The', 'cache', 'sits', 'in', 'front', 'of', 'the',
    'database', 'and', 'it', "doesn't", 'blink',
  ];

  it('matches the Python extractor on the parity sample', () => {
    expect(tokenizeWords(PARITY_SAMPLE)).toEqual(PARITY_EXPECTED);
  });

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

  it('skips zero-length words instead of sticking on them', () => {
    // Real manifests contain clamped zero-length words (overlapped spans).
    // At t=0.2 neither the zero-length word [0.2,0.2] nor "there" [0.2,0.5]
    // is *strictly* active for the zero-length one: binary search lands on
    // the last word with start <= t, then requires t < end.
    const flat = flatOf(
      manifest([{ text: 'Hi dropped there', times: [[0, 0.2], [0.2, 0.2], [0.2, 0.5]] }]),
    );
    expect(findActiveWordIndex(flat, 0.1)).toBe(0);
    expect(findActiveWordIndex(flat, 0.2)).toBe(2); // not stuck on the zero-length word
    expect(findActiveWordIndex(flat, 0.3)).toBe(2);
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

describe('expandPunctWithMap', () => {
  it('attributes inserted words to the replaced symbol range', () => {
    const { expanded, origOf } = expandPunctWithMap('~10');
    expect(expanded).toBe(' about 10');
    // "about" (expanded[1,6)) derives from "~" (original[0,1)).
    expect(origOf[1]).toBe(0);
    expect(origOf[5]).toBe(0);
    // "10" derives from itself.
    expect(origOf[7]).toBe(1);
    expect(origOf[8]).toBe(2);
  });

  it('maps multi-char symbols to their full original range', () => {
    const { expanded, origOf } = expandPunctWithMap('a->b');
    expect(expanded).toBe('a to b');
    // "to" (expanded[2,4)) derives from "->" (original[1,3)).
    expect(origOf[2]).toBe(1);
    expect(origOf[3]).toBe(2);
  });

  it('only expands % after a digit', () => {
    expect(expandPunctWithMap('100%').expanded).toBe('100 percent');
    expect(expandPunctWithMap('100 %').expanded).toBe('100 %');
  });
});

describe('expandTokens', () => {
  it('tokenizes the spoken form while remembering written origins', () => {
    const tokens = expandTokens('~10x of R&D');
    expect(tokens.map((t) => t.text)).toEqual(['about', '10x', 'of', 'R', 'and', 'D']);
    // Spans resolve to the written text: "~" for "about", "&" for "and".
    const written = (t: { origStart: number; origEnd: number }): string =>
      '~10x of R&D'.slice(t.origStart, t.origEnd);
    expect(tokens.map(written)).toEqual(['~', '10x', 'of', 'R', '&', 'D']);
  });

  it('is the identity when nothing expands', () => {
    const tokens = expandTokens('plain words');
    expect(tokens).toEqual([
      { text: 'plain', origStart: 0, origEnd: 5 },
      { text: 'words', origStart: 6, origEnd: 11 },
    ]);
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

  it('matches spoken expansions against the written symbols', () => {
    // Manifest words are spoken-form ("about"); the DOM holds "~". The
    // word parts keep the written text so the "~" is what gets wrapped.
    const plan = planWordSpans('~10x of traffic', ['about', '10x', 'of', 'traffic']);
    expect(plan).not.toBeNull();
    expect(plan!.consumed).toBe(4);
    expect(plan!.parts).toEqual([
      { kind: 'word', text: '~' },
      { kind: 'word', text: '10x' },
      { kind: 'gap', text: ' ' },
      { kind: 'word', text: 'of' },
      { kind: 'gap', text: ' ' },
      { kind: 'word', text: 'traffic' },
    ]);
  });
});


/* ------------------------------------------------------------------ */
/* isValidManifest                                                    */
/* ------------------------------------------------------------------ */

const word = (text: string, start: number, end: number): unknown => ({
  text,
  start,
  end,
});

const valid = (): Record<string, unknown> => ({
  slug: 'demo',
  voice: 'af_heart',
  sampleRate: 24000,
  duration: 12.5,
  audio: 'narration.opus',
  contentHash: 'abc123',
  blocks: [
    {
      kind: 'prose',
      text: 'Hello world',
      words: [word('Hello', 0, 0.5), word('world', 0.5, 1.0)],
    },
  ],
});

describe('isValidManifest', () => {
  it('accepts a well-formed manifest, with or without contentHash', () => {
    expect(isValidManifest(valid())).toBe(true);
    const legacy = valid();
    delete legacy.contentHash;
    expect(isValidManifest(legacy)).toBe(true);
  });

  it('rejects non-objects and missing fields', () => {
    expect(isValidManifest(null)).toBe(false);
    expect(isValidManifest('nope')).toBe(false);
    expect(isValidManifest({})).toBe(false);
    const noAudio = valid();
    delete noAudio.audio;
    expect(isValidManifest(noAudio)).toBe(false);
  });

  it('rejects non-positive or non-finite durations', () => {
    for (const duration of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValidManifest({ ...valid(), duration })).toBe(false);
    }
  });

  it('constrains audio to a plain .opus filename (no path traversal)', () => {
    for (const audio of [
      '../../config',
      '/etc/passwd.opus',
      'sub/narration.opus',
      'narration.mp3',
      '',
    ]) {
      expect(isValidManifest({ ...valid(), audio })).toBe(false);
    }
    expect(isValidManifest({ ...valid(), audio: 'narration.v2.opus' })).toBe(true);
  });

  it('rejects malformed words', () => {
    const withWords = (words: unknown): boolean =>
      isValidManifest({
        ...valid(),
        blocks: [{ kind: 'prose', text: 'Hi', words }],
      });
    // NaN start
    expect(withWords([word('Hi', Number.NaN, 0.5)])).toBe(false);
    // start after end
    expect(withWords([word('Hi', 0.9, 0.5)])).toBe(false);
    // negative start
    expect(withWords([word('Hi', -0.1, 0.5)])).toBe(false);
    // non-numeric end
    expect(withWords([{ text: 'Hi', start: 0, end: '0.5' }])).toBe(false);
    // missing text
    expect(withWords([{ start: 0, end: 0.5 }])).toBe(false);
    // zero-length spans are legal (clamped overlaps)
    expect(withWords([word('Hi', 0.5, 0.5)])).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* asset URLs                                                         */
/* ------------------------------------------------------------------ */

describe('narration asset URLs', () => {
  it('builds the per-accent manifest URL', () => {
    expect(narrationJsonUrl('scaling-web-service', 'us')).toBe(
      '/audio/scaling-web-service/us/narration.json',
    );
    expect(narrationJsonUrl('scaling-web-service', 'uk')).toBe(
      '/audio/scaling-web-service/uk/narration.json',
    );
  });

  it('builds the per-accent audio URL from the manifest file name', () => {
    const m = manifest([]);
    expect(narrationAudioUrl('scaling-web-service', 'us', m)).toBe(
      '/audio/scaling-web-service/us/narration.opus',
    );
    expect(narrationAudioUrl('scaling-web-service', 'uk', m)).toBe(
      '/audio/scaling-web-service/uk/narration.opus',
    );
  });
});

describe('accent preference persistence', () => {
  it('defaults to us and tolerates missing storage', () => {
    expect(loadAccentPreference()).toBe('us');
    expect(() => saveAccentPreference('uk')).not.toThrow();
    // Without a DOM there is no localStorage: save is a no-op and the
    // default holds. (In a browser, jsdom-style tests would round-trip.)
    expect(['us', 'uk']).toContain(loadAccentPreference());
  });
});

describe('isValidManifest accent field', () => {
  it('accepts manifests with and without the accent field', () => {
    const base = manifest([]);
    expect(isValidManifest({ ...base, accent: 'us' })).toBe(true);
    expect(isValidManifest({ ...base, accent: 'uk' })).toBe(true);
    const { accent: _drop, ...noAccent } = { ...base, accent: 'us' };
    expect(isValidManifest(noAccent)).toBe(true);
  });

  it('rejects manifests with an unknown accent', () => {
    const base = manifest([]);
    expect(isValidManifest({ ...base, accent: 'au' })).toBe(false);
    expect(isValidManifest({ ...base, accent: '' })).toBe(false);
  });
});
