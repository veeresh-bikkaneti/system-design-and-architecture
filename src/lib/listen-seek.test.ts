/**
 * Unit tests for lib/listen-seek.ts — the block-index concept both listen
 * engines (browser speech and prerecorded narration) share. Pure functions,
 * no DOM: clamping, stepping, resume resolution, the narration manifest ->
 * block-index map, and the ←/→ shortcut guard.
 */
import { describe, expect, it } from 'vitest';

import {
  allBlocks,
  BEFORE_FIRST_BLOCK,
  buildNeuralSeekMap,
  canStep,
  clampBlockIndex,
  firstChunkOfBlock,
  hasResumePoint,
  resolveResumeBlock,
  seekKeyDelta,
  snapToPlayable,
  stepBlock,
  type SeekKeyEvent,
} from './listen-seek';

describe('allBlocks', () => {
  it('lists 0..count-1', () => {
    expect(allBlocks(4)).toEqual([0, 1, 2, 3]);
  });
  it('tolerates empty and garbage counts', () => {
    expect(allBlocks(0)).toEqual([]);
    expect(allBlocks(-3)).toEqual([]);
    expect(allBlocks(Number.NaN)).toEqual([]);
  });
});

describe('clampBlockIndex', () => {
  it('passes in-range integers through', () => {
    expect(clampBlockIndex(3, 10)).toBe(3);
  });
  it('clamps to the last block when the lesson shrank', () => {
    expect(clampBlockIndex(42, 10)).toBe(9);
  });
  it('clamps negatives to 0', () => {
    expect(clampBlockIndex(-5, 10)).toBe(0);
  });
  it('floors fractions', () => {
    expect(clampBlockIndex(2.9, 10)).toBe(2);
  });
  it('turns garbage into 0', () => {
    for (const bad of [undefined, null, 'x', NaN, Infinity, {}, []]) {
      expect(clampBlockIndex(bad, 10)).toBe(0);
    }
  });
  it('yields 0 for an empty lesson', () => {
    expect(clampBlockIndex(7, 0)).toBe(0);
  });
});

describe('snapToPlayable', () => {
  const playable = [1, 2, 5, 6];
  it('returns the block itself when playable', () => {
    expect(snapToPlayable(playable, 5)).toBe(5);
  });
  it('snaps forward over a gap', () => {
    expect(snapToPlayable(playable, 3)).toBe(5);
  });
  it('snaps to the first playable from before it', () => {
    expect(snapToPlayable(playable, 0)).toBe(1);
  });
  it('falls back to the last playable past the end', () => {
    expect(snapToPlayable(playable, 99)).toBe(6);
  });
  it('is null when nothing is playable', () => {
    expect(snapToPlayable([], 3)).toBeNull();
  });
});

describe('stepBlock / canStep', () => {
  const all = allBlocks(4);
  it('moves one block each way', () => {
    expect(stepBlock(all, 1, 1)).toBe(2);
    expect(stepBlock(all, 2, -1)).toBe(1);
  });
  it('stops at the edges instead of wrapping', () => {
    expect(stepBlock(all, 3, 1)).toBeNull();
    expect(stepBlock(all, 0, -1)).toBeNull();
    expect(canStep(all, 3, 1)).toBe(false);
    expect(canStep(all, 0, -1)).toBe(false);
    expect(canStep(all, 1, 1)).toBe(true);
    expect(canStep(all, 1, -1)).toBe(true);
  });
  it('steps over blocks the engine cannot play', () => {
    const gappy = [0, 2, 5];
    expect(stepBlock(gappy, 0, 1)).toBe(2);
    expect(stepBlock(gappy, 2, 1)).toBe(5);
    expect(stepBlock(gappy, 5, -1)).toBe(2);
  });
  it('handles a current block that is itself unplayable', () => {
    const gappy = [0, 2, 5];
    expect(stepBlock(gappy, 3, 1)).toBe(5);
    expect(stepBlock(gappy, 3, -1)).toBe(2);
  });
  it('enters the first block from the title/summary', () => {
    expect(stepBlock(all, BEFORE_FIRST_BLOCK, 1)).toBe(0);
    expect(stepBlock(all, BEFORE_FIRST_BLOCK, -1)).toBeNull();
  });
  it('cannot step in an empty lesson', () => {
    expect(stepBlock([], 0, 1)).toBeNull();
    expect(stepBlock([], 0, -1)).toBeNull();
  });
});

describe('hasResumePoint / resolveResumeBlock', () => {
  it('only offers resume past the first block', () => {
    expect(hasResumePoint(4)).toBe(true);
    expect(hasResumePoint(1)).toBe(true);
    for (const no of [0, -1, 1.5, NaN, '3', null, undefined]) {
      expect(hasResumePoint(no)).toBe(false);
    }
  });
  it('resumes at the saved block', () => {
    expect(resolveResumeBlock(4, allBlocks(10))).toBe(4);
  });
  it('clamps into a lesson that shrank', () => {
    expect(resolveResumeBlock(40, allBlocks(10))).toBe(9);
  });
  it('snaps to a playable block', () => {
    expect(resolveResumeBlock(3, [0, 2, 5])).toBe(5);
  });
  it('falls back to the first block for no/garbage saved value', () => {
    expect(resolveResumeBlock(undefined, allBlocks(5))).toBe(0);
    expect(resolveResumeBlock('x', [2, 3])).toBe(2);
  });
  it('is null when nothing is playable', () => {
    expect(resolveResumeBlock(3, [])).toBeNull();
  });
});

describe('firstChunkOfBlock', () => {
  const chunks = [
    { blockIndex: 0 },
    { blockIndex: 1 },
    { blockIndex: 1 },
    { blockIndex: 3 },
  ];
  it('finds the first chunk of a multi-chunk block', () => {
    expect(firstChunkOfBlock(chunks, 1)).toBe(1);
    expect(firstChunkOfBlock(chunks, 3)).toBe(3);
  });
  it('is null for a block with no chunks', () => {
    expect(firstChunkOfBlock(chunks, 2)).toBeNull();
    expect(firstChunkOfBlock([], 0)).toBeNull();
  });
});

describe('buildNeuralSeekMap', () => {
  const word = (start: number) => ({ start });
  // manifest: title, summary, p0, (words-less), p2 (unaligned), p3
  const blocks = [
    { words: [word(0)] },
    { words: [word(2)] },
    { words: [word(5), word(6)] },
    { words: [] },
    { words: [word(20)] },
    { words: [word(30)] },
  ];
  // DOM list: [title, summary, a0, a1, a2, a3] -> manifest block 4 is unaligned
  const alignment = [0, 1, 2, 3, null, 5];

  it('maps manifest blocks to article-relative indices', () => {
    const { canonicalOf } = buildNeuralSeekMap(blocks, alignment, 2);
    expect(canonicalOf).toEqual([BEFORE_FIRST_BLOCK, BEFORE_FIRST_BLOCK, 0, 1, null, 3]);
  });

  it('exposes only blocks with audio, with their start times', () => {
    const { points } = buildNeuralSeekMap(blocks, alignment, 2);
    expect(points).toEqual([
      { block: 0, time: 5 },
      { block: 3, time: 30 },
    ]);
  });

  it('works when the page has no title/summary elements', () => {
    const { points, canonicalOf } = buildNeuralSeekMap(
      [{ words: [word(1)] }, { words: [word(4)] }],
      [0, 1],
      0,
    );
    expect(canonicalOf).toEqual([0, 1]);
    expect(points.map((p) => p.block)).toEqual([0, 1]);
  });

  it('sorts points by block even if the manifest order differs', () => {
    const { points } = buildNeuralSeekMap(
      [{ words: [word(1)] }, { words: [word(4)] }],
      [1, 0],
      0,
    );
    expect(points.map((p) => p.block)).toEqual([0, 1]);
  });

  it('yields nothing when no block aligned', () => {
    const { points } = buildNeuralSeekMap(blocks, blocks.map(() => null), 2);
    expect(points).toEqual([]);
  });
});

describe('seekKeyDelta', () => {
  const ev = (over: Partial<SeekKeyEvent> = {}): SeekKeyEvent => ({
    key: 'ArrowRight',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: { tagName: 'BODY', closest: () => null },
    ...over,
  });

  it('maps ← and → to -1 / +1', () => {
    expect(seekKeyDelta(ev({ key: 'ArrowLeft' }))).toBe(-1);
    expect(seekKeyDelta(ev({ key: 'ArrowRight' }))).toBe(1);
  });
  it('ignores other keys', () => {
    expect(seekKeyDelta(ev({ key: 'ArrowUp' }))).toBe(0);
    expect(seekKeyDelta(ev({ key: 'a' }))).toBe(0);
  });
  it('ignores any modifier', () => {
    for (const mod of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const) {
      expect(seekKeyDelta(ev({ [mod]: true }))).toBe(0);
    }
  });
  it('ignores auto-repeat, IME composition and handled events', () => {
    expect(seekKeyDelta(ev({ repeat: true }))).toBe(0);
    expect(seekKeyDelta(ev({ isComposing: true }))).toBe(0);
    expect(seekKeyDelta(ev({ defaultPrevented: true }))).toBe(0);
  });
  it('ignores text-entry targets', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'input']) {
      expect(seekKeyDelta(ev({ target: { tagName } }))).toBe(0);
    }
    expect(seekKeyDelta(ev({ target: { tagName: 'DIV', isContentEditable: true } }))).toBe(0);
  });
  it('ignores targets inside widgets that own the arrow keys', () => {
    const inside = { tagName: 'BUTTON', closest: () => ({}) };
    expect(seekKeyDelta(ev({ target: inside }))).toBe(0);
  });
  it('still fires from a plain button or link', () => {
    expect(
      seekKeyDelta(ev({ target: { tagName: 'BUTTON', closest: () => null } })),
    ).toBe(1);
  });
  it('fires when there is no target (document-level dispatch)', () => {
    expect(seekKeyDelta(ev({ target: null }))).toBe(1);
  });
});
