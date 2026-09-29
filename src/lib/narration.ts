/**
 * Pure, unit-testable helpers for neural lesson narration ("listen" tier 2).
 *
 * Tier 2 works like this: at build time every lesson's prose is synthesized
 * with Kokoro into `public/audio/<slug>/narration.opus`, plus a
 * `narration.json` manifest carrying per-word timestamps. At runtime this
 * module maps `audio.currentTime` to the word being spoken so the component
 * can karaoke-highlight the prose. Nothing here touches the DOM, `Audio`,
 * or `fetch` — the component owns all side effects, so this file is safe to
 * import anywhere (including the build-time prerender).
 *
 * Word identity contract (CRITICAL): the build-time synthesizer
 * (`scripts/tts/synthesize.py`) tokenizes each block with
 * `r"[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*"` and writes the resulting words
 * into the manifest in order. `tokenizeWords` below MUST produce the same
 * sequence for the same text — the DOM tagger consumes the manifest's word
 * list against the rendered text with this exact rule, and any divergence
 * degrades that block to whole-block highlighting.
 */

export interface NarrationWord {
  /** Surface form of the word as spoken, e.g. "don't". */
  text: string;
  /** Start time in seconds (media time of the opus file). */
  start: number;
  /** End time in seconds (media time of the opus file). */
  end: number;
}

export interface NarrationBlock {
  kind: 'title' | 'summary' | 'prose';
  /** Plain prose of the block (markdown stripped at build time). */
  text: string;
  words: NarrationWord[];
}

export interface NarrationManifest {
  slug: string;
  /** Kokoro voice id used at build time, e.g. "af_heart". */
  voice: string;
  sampleRate: number;
  /** Total duration in seconds. */
  duration: number;
  /** Audio file name inside `public/audio/<slug>/`, e.g. "narration.opus". */
  audio: string;
  blocks: NarrationBlock[];
}

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

/**
 * Canonical word tokenizer. Must stay in lockstep with the build-time
 * tokenizer in `scripts/tts/synthesize.py` (see module docstring).
 */
export function tokenizeWords(text: string): string[] {
  WORD_RE.lastIndex = 0;
  return text.match(WORD_RE) ?? [];
}

/** Fuzzy word comparison for aligning manifest words with rendered text. */
export function normalizeWordToken(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

const baseUrl = (): string => {
  const b =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.BASE_URL as string | undefined)
      : undefined;
  return b && b.length > 0 ? b : '/';
};

/** URL of the timing manifest, e.g. `/<base>/audio/<slug>/narration.json`. */
export function narrationJsonUrl(slug: string): string {
  return `${baseUrl()}audio/${slug}/narration.json`;
}

/** URL of the audio file described by a loaded manifest. */
export function narrationAudioUrl(slug: string, manifest: NarrationManifest): string {
  return `${baseUrl()}audio/${slug}/${manifest.audio}`;
}

export interface FlatWord {
  /** Index into `manifest.blocks`. */
  block: number;
  /** Index of the word inside its block. */
  index: number;
  text: string;
  start: number;
  end: number;
}

/** Flatten all block words into one time-ordered array for binary search. */
export function flattenWords(manifest: NarrationManifest): FlatWord[] {
  const flat: FlatWord[] = [];
  manifest.blocks.forEach((block, b) => {
    block.words.forEach((w, i) => {
      flat.push({ block: b, index: i, text: w.text, start: w.start, end: w.end });
    });
  });
  return flat;
}

/**
 * Binary search: index of the word active at media time `t`, i.e. the last
 * word with `start <= t < end`. Returns -1 when nothing is spoken at `t`
 * (before the first word, or at/past the end).
 */
export function findActiveWordIndex(
  flat: readonly FlatWord[],
  t: number,
): number {
  let lo = 0;
  let hi = flat.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = flat[mid];
    if (w.start <= t) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best === -1) return -1;
  return t < flat[best].end ? best : -1;
}

const normBlockText = (s: string): string =>
  s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Align manifest blocks to rendered DOM blocks by normalized text equality.
 * Returns, per manifest block, the index of the first still-unclaimed DOM
 * block with identical text, or `null` when no DOM block matches (the audio
 * still plays; that block just gets no word highlighting).
 */
export function alignBlocks(
  manifestBlocks: readonly { text: string }[],
  domTexts: readonly string[],
): (number | null)[] {
  const claimed = new Set<number>();
  return manifestBlocks.map((mb) => {
    const want = normBlockText(mb.text);
    for (let d = 0; d < domTexts.length; d++) {
      if (claimed.has(d)) continue;
      if (normBlockText(domTexts[d]) === want) {
        claimed.add(d);
        return d;
      }
    }
    return null;
  });
}

export interface WordSpanPart {
  kind: 'gap' | 'word';
  text: string;
}

export interface WordSpanPlan {
  parts: WordSpanPart[];
  /** How many manifest words were consumed from the front of the queue. */
  consumed: number;
}

/**
 * Pure core of the DOM word tagger: given one text node's raw text and the
 * remaining expected words (front of queue), decide how to split the node
 * into gap/word spans. Returns `null` when the node's word tokens don't
 * match the expected words — the caller then abandons word-level tagging
 * for that block and falls back to whole-block highlighting.
 *
 * Matching is fuzzy (`normalizeWordToken`) so typographic quotes or case
 * differences between build-time text and rendered text don't break it.
 */
export function planWordSpans(
  text: string,
  words: readonly string[],
): WordSpanPlan | null {
  const parts: WordSpanPart[] = [];
  let consumed = 0;

  // Walk word tokens in order; everything between them is a gap.
  const tokenRe = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
  let m: RegExpExecArray | null;
  let lastEnd = 0;
  let ok = true;
  while ((m = tokenRe.exec(text)) !== null) {
    if (m.index > lastEnd) {
      parts.push({ kind: 'gap', text: text.slice(lastEnd, m.index) });
    }
    const expected = words[consumed];
    if (
      expected === undefined ||
      normalizeWordToken(m[0]) !== normalizeWordToken(expected)
    ) {
      ok = false;
      break;
    }
    parts.push({ kind: 'word', text: m[0] });
    consumed += 1;
    lastEnd = m.index + m[0].length;
  }
  if (!ok) return null;
  if (lastEnd < text.length) {
    parts.push({ kind: 'gap', text: text.slice(lastEnd) });
  } else if (parts.length === 0) {
    parts.push({ kind: 'gap', text });
  }
  return { parts, consumed };
}
