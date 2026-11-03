import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { embedderDir } from './embedder.mjs';

/**
 * Issue #180: a chunk's vector must be a pure function of its own text.
 *
 * The q8 embedder quantizes activations per tensor, so a chunk embedded in a
 * batch borrows its neighbours' value ranges. Adding one chunk reshuffles the
 * batches and moves vectors of chunks whose text did not change, which flips
 * threshold-edge eval cases for reasons unrelated to content.
 *
 * Needs the real 23 MB model. Without it these skip (they never download it);
 * the reason is printed so a skip is never mistaken for a pass.
 */
const modelDir = process.env.BEN_EMBEDDER_DIR ?? embedderDir;
const hasModel = existsSync(join(modelDir, 'onnx', 'model_quantized.onnx'));
if (!hasModel) {
  console.warn(`ben determinism tests SKIPPED: model not found at ${modelDir} (run npm run ben:index once to fetch it)`);
}

type Chunk = { id: string; slug: string; title: string; heading: string; text: string };
const state = vi.hoisted(() => ({ extra: [] as unknown[], limit: 0 }));

vi.mock('./chunk-lessons.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('./chunk-lessons.mjs')>();
  return {
    ...real,
    chunkAllLessons: () => [...state.extra, ...real.chunkAllLessons().slice(0, state.limit)],
  };
});

const { buildIndex } = await import('./build-index.mjs');

const fresh: Chunk = {
  id: 'zz-new#0',
  slug: 'zz-new',
  title: 'Brand new lesson',
  heading: 'A very different section',
  text: 'Quorum reads and writes, hinted handoff, and why a Dynamo-style ring keeps accepting writes during a partition. '.repeat(6),
};

type Packed = { data: string; scales: number[] };
const dims = 384;
function rows({ data, scales }: Packed) {
  const bytes = Buffer.from(data, 'base64');
  return scales.map((scale, r) => `${scale}|${bytes.subarray(r * dims, (r + 1) * dims).toString('base64')}`);
}

async function build(extra: Chunk[], limit: number) {
  state.extra = extra;
  state.limit = limit;
  return buildIndex();
}

describe.skipIf(!hasModel)('build-index determinism (issue #180)', () => {
  it('two builds of the same content are byte-identical', { timeout: 180_000 }, async () => {
    const a = await build([], 40);
    const b = await build([], 40);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('adding a chunk leaves every other vector bit-identical', { timeout: 180_000 }, async () => {
    const before = await build([], 40);
    const after = await build([fresh], 40);
    const old = rows(before.chunkVectors);
    const now = rows(after.chunkVectors);
    expect(now).toHaveLength(old.length + 1);
    const moved = old.filter((row, i) => row !== now[i + 1]).length;
    expect(moved, `${moved} of ${old.length} unchanged chunks got a different vector`).toBe(0);
    expect(rows(after.intentVectors)).toEqual(rows(before.intentVectors));
  });

  it('gives a chunk the same vector alone or in a crowd', { timeout: 180_000 }, async () => {
    const alone = await build([fresh], 0);
    const crowded = await build([fresh], 40);
    expect(rows(crowded.chunkVectors)[0]).toBe(rows(alone.chunkVectors)[0]);
  });
});
