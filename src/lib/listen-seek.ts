/**
 * Pure, unit-testable seek logic shared by both listen engines.
 *
 * ONE concept serves the prerecorded narration (`LessonNarrator`'s
 * `NeuralPlayer`) and the browser speech fallback (`ListenButton`): a
 * "block index" is the position of a prose block in
 * `extractLessonBlocks(article)` — the rendered lesson's own paragraph /
 * heading / list-item / table-row order, which both engines already
 * highlight. It is a DOM-order index, not an audio offset or a chunk index,
 * so a position saved by one engine resumes correctly in the other.
 *
 * Each engine reports which blocks it can actually start at (`playable`,
 * ascending): the speech engine can start at every block; the neural engine
 * only at blocks that aligned to the recording. Everything below works on
 * that list, so clamping and next/previous behave identically everywhere.
 *
 * Nothing here touches the DOM, `Audio` or `speechSynthesis`.
 */

/** Block index meaning "before the first block" (neural title/summary). */
export const BEFORE_FIRST_BLOCK = -1;

/** Every block index of a lesson with `count` blocks, ascending. */
export function allBlocks(count: number): number[] {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return Array.from({ length: n }, (_, i) => i);
}

/**
 * Clamp any value (including garbage from storage) to a valid index in
 * `[0, count - 1]`. Non-numbers and NaN become 0; an empty lesson yields 0.
 */
export function clampBlockIndex(index: unknown, count: number): number {
  const last = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0) - 1);
  if (typeof index !== 'number' || !Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.floor(index), 0), last);
}

/**
 * Snap a requested block to one the engine can start at: the first playable
 * block at or after `index`, else the last playable block (the lesson shrank
 * or the tail has no audio). `null` when nothing is playable.
 */
export function snapToPlayable(playable: readonly number[], index: number): number | null {
  if (playable.length === 0) return null;
  const at = playable.find((b) => b >= index);
  return at ?? playable[playable.length - 1];
}

/**
 * The block one step away from `current`, or `null` at the edge (previous
 * from the first block, next from the last). `current` need not be playable
 * (a block the engine skips, or `BEFORE_FIRST_BLOCK`): next is the first
 * playable block after it, previous the last one before it.
 */
export function stepBlock(
  playable: readonly number[],
  current: number,
  delta: -1 | 1,
): number | null {
  if (delta === 1) return playable.find((b) => b > current) ?? null;
  for (let i = playable.length - 1; i >= 0; i--) {
    if (playable[i] < current) return playable[i];
  }
  return null;
}

/** Whether a step in `delta` direction would move anywhere. */
export const canStep = (
  playable: readonly number[],
  current: number,
  delta: -1 | 1,
): boolean => stepBlock(playable, current, delta) !== null;

/**
 * A saved position is only worth offering past the first block — block 0
 * (or nothing, or garbage) is just "the start".
 */
export const hasResumePoint = (saved: unknown): saved is number =>
  typeof saved === 'number' && Number.isInteger(saved) && saved > 0;

/**
 * Where "Continue from where you left off" should start: the saved block
 * clamped into today's lesson (it may have shrunk since) and snapped to a
 * block the engine can play. Falls back to the first playable block.
 */
export function resolveResumeBlock(saved: unknown, playable: readonly number[]): number | null {
  if (playable.length === 0) return null;
  if (!hasResumePoint(saved)) return playable[0];
  return snapToPlayable(playable, saved);
}

/**
 * Index of the first speech chunk of `block` (chunks are ordered by block),
 * or `null` when the block produced none. The speech engine queues one
 * utterance per chunk, so a block-level seek is "restart at its first chunk".
 */
export function firstChunkOfBlock(
  chunks: readonly { blockIndex: number }[],
  block: number,
): number | null {
  const i = chunks.findIndex((c) => c.blockIndex === block);
  return i === -1 ? null : i;
}

/** One block the neural engine can start at, and where in the audio it starts. */
export interface NeuralSeekPoint {
  /** Canonical block index (position in `extractLessonBlocks(article)`). */
  block: number;
  /** Media time of the block's first word, in seconds. */
  time: number;
}

export interface NeuralSeekMap {
  /** Startable blocks, ascending by block index. */
  points: NeuralSeekPoint[];
  /**
   * Per manifest block: its canonical block index, `BEFORE_FIRST_BLOCK` for
   * the title/summary (spoken, but not in the article), or `null` when the
   * block has no rendered counterpart.
   */
  canonicalOf: Array<number | null>;
}

/**
 * Translate the narration manifest into canonical block indices.
 *
 * `alignment[b]` is manifest block `b`'s index into the DOM list
 * `[title?, summary?, ...articleBlocks]` (see `alignBlocks`), and `headCount`
 * is how many of the leading entries are title/summary — so subtracting it
 * yields the article-relative index both engines share.
 */
export function buildNeuralSeekMap(
  blocks: readonly { words: readonly { start: number }[] }[],
  alignment: readonly (number | null)[],
  headCount: number,
): NeuralSeekMap {
  const points: NeuralSeekPoint[] = [];
  const canonicalOf = blocks.map((block, b): number | null => {
    const domIdx = alignment[b] ?? null;
    if (domIdx === null) return null;
    const canonical = domIdx - headCount;
    if (canonical < 0) return BEFORE_FIRST_BLOCK;
    if (block.words.length > 0) points.push({ block: canonical, time: block.words[0].start });
    return canonical;
  });
  points.sort((a, b) => a.block - b.block);
  return { points, canonicalOf };
}

/** Structural slice of the keydown target the shortcut guard inspects. */
export interface SeekKeyTarget {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

/** Structural slice of `KeyboardEvent` the shortcut guard inspects. */
export interface SeekKeyEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
  target: SeekKeyTarget | null;
}

/**
 * Anywhere ←/→ already mean something: text entry, sliders (the narration
 * seek bar lives in the options popover), menus and tabs, and custom scroll
 * regions (an explicit non-negative tabindex on a non-control).
 */
const OWNS_ARROWS =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), ' +
  '[role="textbox"], [role="slider"], [role="spinbutton"], [role="combobox"], ' +
  '[role="listbox"], [role="menu"], [role="menubar"], [role="radiogroup"], ' +
  '[role="tablist"], [role="tree"], [role="grid"], [tabindex]:not([tabindex="-1"])';

/**
 * Map a keydown to a paragraph step: -1 (←), +1 (→) or 0 for "not ours".
 * Never claims a key with a modifier (Alt+← is browser back, Shift+← extends
 * a selection), an auto-repeat (holding the key must not hammer the engine),
 * an IME composition, an already-handled event, or one aimed at a control
 * that uses the arrows itself.
 */
export function seekKeyDelta(e: SeekKeyEvent): -1 | 0 | 1 {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return 0;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return 0;
  if (e.repeat || e.isComposing || e.defaultPrevented) return 0;
  const t = e.target;
  if (t) {
    if (t.isContentEditable) return 0;
    const tag = t.tagName?.toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return 0;
    if (t.closest?.(OWNS_ARROWS)) return 0;
  }
  return e.key === 'ArrowLeft' ? -1 : 1;
}
