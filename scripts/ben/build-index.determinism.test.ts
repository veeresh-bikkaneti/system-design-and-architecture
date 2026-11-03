import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { embedderDir } from './embedder.mjs';

/**
 * Issue #180: a chunk's vector must be a pure function of its own text.
 *
 * The q8 embedder gave a chunk different vectors depending on its batch
 * neighbours (cause INFERRED: per-tensor activation quantization). Adding one
 * chunk reshuffled the batches and moved vectors of chunks whose text did not
 * change, which flipped threshold-edge eval cases for reasons unrelated to content.
 *
 * Needs the real 23 MB model. Without it these skip and print why, unless
 * BEN_REQUIRE_MODEL=1 (CI), which turns the skip into a hard failure.
 */
const modelDir = process.env.BEN_EMBEDDER_DIR ?? embedderDir;
const hasModel = existsSync(join(modelDir, 'onnx', 'model_quantized.onnx'));
const required = process.env.BEN_REQUIRE_MODEL === '1';
const isProbe = process.env.BEN_DETERMINISM_PROBE === '1';
const missingMessage = `ben determinism tests need the model: not found at ${modelDir} (run npm run ben:index once to fetch it)`;
if (!hasModel && !required) console.warn(`ben determinism tests SKIPPED: ${missingMessage}`);

type Chunk = { id: string; slug: string; title: string; heading: string; text: string };
const state = vi.hoisted(() => ({ pick: (real: unknown[]) => real }));

vi.mock('./chunk-lessons.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('./chunk-lessons.mjs')>();
  return { ...real, chunkAllLessons: () => state.pick(real.chunkAllLessons()) };
});

const { buildIndex, BATCH } = await import('./build-index.mjs');

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

/** Build from the first `limit` real chunks, with `extra` inserted at `at`. */
async function build(extra: Chunk[], limit: number, at = 0) {
  state.pick = (real) => {
    const base = real.slice(0, limit);
    return [...base.slice(0, at), ...extra, ...base.slice(at)];
  };
  return buildIndex();
}

if (required && !hasModel) {
  it('model is present (BEN_REQUIRE_MODEL=1)', () => {
    throw new Error(`BEN_REQUIRE_MODEL=1 but ${missingMessage}`);
  });
}

describe('build-index batching is pinned to 1 (issue #180)', () => {
  it('relies on no batch size other than 1', () => {
    expect(BATCH).toBe(1);
  });
});

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

  it('inserting a chunk in the middle leaves every other vector bit-identical', { timeout: 180_000 }, async () => {
    const before = await build([], 40);
    const after = await build([fresh], 40, 20);
    const old = rows(before.chunkVectors);
    const now = rows(after.chunkVectors);
    expect(now).toHaveLength(old.length + 1);
    const moved = old.filter((row, i) => row !== now[i < 20 ? i : i + 1]).length;
    expect(moved, `${moved} of ${old.length} unchanged chunks got a different vector`).toBe(0);
  });

  it('gives a chunk the same vector alone or in a crowd', { timeout: 180_000 }, async () => {
    const alone = await build([fresh], 0);
    const crowded = await build([fresh], 40);
    expect(rows(crowded.chunkVectors)[0]).toBe(rows(alone.chunkVectors)[0]);
  });
});

// The failure path must really run: a child process with the model dir pointed
// at nothing and BEN_REQUIRE_MODEL=1 has to exit non-zero with the loud message.
describe.skipIf(isProbe)('BEN_REQUIRE_MODEL=1 fails loudly when the model is missing', () => {
  it('exits non-zero in a subprocess with no model', { timeout: 120_000 }, () => {
    const vitestBin = join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');
    const result = spawnSync(process.execPath, [vitestBin, 'run', 'scripts/ben/build-index.determinism.test.ts'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        BEN_REQUIRE_MODEL: '1',
        BEN_DETERMINISM_PROBE: '1',
        BEN_EMBEDDER_DIR: join(process.cwd(), 'definitely-not-a-model-dir'),
      },
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('BEN_REQUIRE_MODEL=1 but ben determinism tests need the model');
  });
});
