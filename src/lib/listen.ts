/**
 * Pure, unit-testable helpers for the "Listen to this lesson" feature.
 *
 * Tier 1 of the course's listen-along plan: the browser Web Speech API only.
 * No network, no API keys, no backend, no audio files — the learner's own
 * device does the speaking. Nothing in this module touches
 * `window.speechSynthesis`; the component owns all side effects, so this
 * file is safe to import anywhere (including the build-time prerender).
 */

export type VoicePreference = 'auto' | 'us' | 'uk';

/** Minimum voice surface needed for ranking. `SpeechSynthesisVoice` satisfies this. */
export interface RankableVoice {
  readonly name: string;
  readonly lang: string;
  readonly default?: boolean;
}

const normLang = (lang: string): string => lang.toLowerCase().replace(/_/g, '-');

const isEnglish = (v: RankableVoice): boolean => normLang(v.lang).startsWith('en');

const regionOf = (v: RankableVoice): string => {
  const m = /^en-([a-z]{2})/.exec(normLang(v.lang));
  return m ? m[1] : '';
};

/**
 * Heuristic "how natural does this voice sound" score. Browsers don't expose
 * voice quality, so we read the nameplate:
 * - Edge's best voices are literally called "… (Natural) …"
 * - Chrome ships "Google US English" / "Google UK English Female|Male"
 * - some platforms tag neural voices in the name
 */
function naturalness(name: string): number {
  const n = name.toLowerCase();
  let score = 0;
  if (n.includes('natural')) score += 3;
  if (n.includes('neural')) score += 2;
  if (/^google (us|uk) english/.test(n)) score += 2;
  else if (n.includes('google')) score += 1;
  return score;
}

/**
 * Pick the best voice for a preference, or `null` when there is nothing to
 * rank (the caller then simply doesn't set `utterance.voice` and the browser
 * falls back to its own default — never crash, never strand the learner
 * voiceless).
 *
 * Deterministic: the same device and preference always yield the same voice.
 * `auto` prefers US English, then UK English, then any English — the two
 * regions with the deepest natural-voice inventories.
 */
export function rankVoices<T extends RankableVoice>(
  voices: readonly T[],
  preference: VoicePreference = 'auto',
): T | null {
  if (voices.length === 0) return null;

  // Filter by preference, relaxing step by step so a missing region falls
  // back gracefully instead of failing.
  let pool: T[] = [];
  if (preference === 'us' || preference === 'auto') {
    pool = voices.filter((v) => isEnglish(v) && regionOf(v) === 'us');
  }
  if (pool.length === 0 && (preference === 'uk' || preference === 'auto')) {
    pool = voices.filter((v) => isEnglish(v) && regionOf(v) === 'gb');
  }
  // Cross-region fallback: a UK learner on a US-only device (and vice versa)
  // still gets an English voice rather than silence.
  if (pool.length === 0) {
    pool = voices.filter((v) => isEnglish(v) && regionOf(v) === 'us');
  }
  if (pool.length === 0) {
    pool = voices.filter((v) => isEnglish(v) && regionOf(v) === 'gb');
  }
  if (pool.length === 0) {
    pool = voices.filter(isEnglish);
  }
  if (pool.length === 0) return null;

  const ranked = pool.map((voice, index) => ({ voice, index }));
  ranked.sort((a, b) => {
    const nat = naturalness(b.voice.name) - naturalness(a.voice.name);
    if (nat !== 0) return nat;
    const def = Number(b.voice.default ?? false) - Number(a.voice.default ?? false);
    if (def !== 0) return def;
    return a.index - b.index;
  });
  return ranked[0].voice;
}

/** Smallest DOM surface the extractor touches (keeps unit tests dependency-free). */
export interface TextDomNode {
  readonly tagName: string;
  readonly textContent: string | null;
  readonly children: ArrayLike<TextDomNode>;
  getAttribute(name: string): string | null;
}

/** Elements whose prose we read aloud, outermost-first (no double reading). */
const BLOCK_TAGS = new Set([
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'P', 'LI', 'BLOCKQUOTE', 'FIGCAPTION', 'DT', 'DD', 'TD', 'TH',
]);

/** Never speak these: code, diagrams-as-text, widgets, media, forms. */
const SKIP_TAGS = new Set([
  'PRE', 'CODE', 'SCRIPT', 'STYLE', 'NAV', 'BUTTON', 'TEXTAREA',
  'SELECT', 'INPUT', 'SVG', 'VIDEO', 'AUDIO', 'IFRAME', 'CANVAS', 'FORM',
]);

/**
 * Class hooks for embedded lesson widgets. `not-prose` wraps Quiz, VideoCard
 * and other interactive embeds; `mermaid-diagram` / `diagram-panel` wrap
 * diagrams (their source text would read as gibberish aloud).
 */
const SKIP_CLASS_PARTS = ['not-prose', 'mermaid-diagram', 'diagram-panel'];

function hasCodeDescendant(node: TextDomNode): boolean {
  const kids = node.children;
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    const tag = child.tagName.toUpperCase();
    if (tag === 'PRE' || tag === 'CODE') return true;
    if (hasCodeDescendant(child)) return true;
  }
  return false;
}

function shouldSkip(node: TextDomNode): boolean {
  const tag = node.tagName.toUpperCase();
  if (SKIP_TAGS.has(tag)) return true;
  const cls = (node.getAttribute('class') ?? '').toLowerCase();
  if (SKIP_CLASS_PARTS.some((part) => cls.includes(part))) return true;
  if (node.getAttribute('aria-hidden') === 'true') return true;
  // Comparison tables read fine; tables *of code* don't.
  if (tag === 'TABLE' && hasCodeDescendant(node)) return true;
  return false;
}

const clean = (s: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Chrome stalls on very long utterances (~15s+), so prose is split into
 * sentence-boundary chunks of at most ~400 characters (~25s of speech).
 */
const MAX_CHUNK = 400;

/**
 * A speakable prose block together with the DOM element it came from.
 * The element handle lets callers highlight the block being read aloud.
 */
export interface LessonBlock {
  element: Element;
  text: string;
}

/**
 * Walk a lesson article element and return speakable prose blocks: headings,
 * paragraphs, list items, blockquotes, table cells. Skips code blocks,
 * mermaid diagrams, quizzes and other embeds, nav/buttons, and tables that
 * contain code. Outermost-first so nested elements are never read twice.
 */
export function extractLessonBlocks(root: Element): LessonBlock[] {
  const blocks: LessonBlock[] = [];

  const walk = (node: TextDomNode): void => {
    if (shouldSkip(node)) return;
    if (BLOCK_TAGS.has(node.tagName.toUpperCase())) {
      // textContent already includes nested inline content — don't descend,
      // or nested elements would be read twice.
      const text = clean(node.textContent);
      if (text) blocks.push({ element: node as unknown as Element, text });
      return;
    }
    const kids = node.children;
    for (let i = 0; i < kids.length; i++) walk(kids[i]);
  };

  walk(root as unknown as TextDomNode);
  return blocks;
}

/**
 * Split prose into sentences at sentence boundaries. Shared by the
 * chunker below and the sentence-level highlighter in the fallback player.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * A speakable chunk that remembers where it came from: which DOM block it
 * belongs to and which sentence range inside that block it covers. The
 * fallback player uses this to highlight the exact sentence being spoken.
 */
export interface BlockChunk {
  blockIndex: number;
  text: string;
  /** Index of the chunk's first sentence within its block. */
  sentenceStart: number;
  sentenceCount: number;
}

/**
 * Chunk every block's sentences (at most ~400 chars per chunk, ending at a
 * sentence boundary) while tracking each chunk's sentence range per block.
 */
export function chunkBlocks(blocks: readonly { text: string }[]): BlockChunk[] {
  const out: BlockChunk[] = [];
  blocks.forEach((block, blockIndex) => {
    const sentences = splitSentences(block.text);
    let current: string[] = [];
    let currentLen = 0;
    let sentenceStart = 0;
    const flush = () => {
      if (current.length > 0) {
        out.push({
          blockIndex,
          text: current.join(' '),
          sentenceStart,
          sentenceCount: current.length,
        });
        sentenceStart += current.length;
        current = [];
        currentLen = 0;
      }
    };
    sentences.forEach((sentence) => {
      const nextLen = currentLen === 0 ? sentence.length : currentLen + 1 + sentence.length;
      if (nextLen > MAX_CHUNK && current.length > 0) flush();
      current.push(sentence);
      currentLen = currentLen === 0 ? sentence.length : currentLen + 1 + sentence.length;
    });
    flush();
  });
  return out;
}

/**
 * Walk a lesson article element and return speakable prose chunks: headings,
 * paragraphs, list items, blockquotes, table cells. Skips code blocks,
 * mermaid diagrams, quizzes and other embeds, nav/buttons, and tables that
 * contain code. Each chunk ends at a sentence boundary.
 */
export function extractLessonText(root: Element): string[] {
  return chunkBlocks(extractLessonBlocks(root)).map((c) => c.text);
}
