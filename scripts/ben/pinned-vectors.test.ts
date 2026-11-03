import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as mod from './build-index.mjs';

/**
 * Issues #180 / #198, phase 1: the pinned vector artifact (content/ben/vectors.json).
 *
 * ben:index reads committed int8 vectors instead of embedding on whatever CPU
 * the runner happens to be, and `--check` proves the artifact still matches the
 * lessons. None of these tests loads the model: the check embeds nothing.
 * They are RED until the fix lands (the exports below do not exist yet).
 */
const api = mod as unknown as Record<string, any>;
const need = (name: string) => {
  if (typeof api[name] !== 'function') throw new Error(`build-index.mjs must export function ${name}() (pinned vectors, issue #198)`);
  return api[name];
};

type Chunk = { id: string; slug: string; title: string; heading: string; text: string };
const chunks: Chunk[] = [
  { id: 'a#0', slug: 'a', title: 'A', heading: 'H0', text: 'one\ntwo' },
  { id: 'a#1', slug: 'a', title: 'A', heading: 'H1', text: 'three' },
];
const exemplars = [{ intent: 'course', text: 'what is a CDN' }];
const DIMS = 384;
const rowsOf = (n: number) => Array.from({ length: n }, (_, r) => Array.from({ length: DIMS }, (_, d) => Math.sin(r * 7 + d)));

/** A pin for the fixture above, built from the public API only. */
function makePin(key: string) {
  return {
    version: 1,
    key,
    model: 'Xenova/all-MiniLM-L6-v2',
    dims: DIMS,
    chunkVectors: api.encodeVectors(rowsOf(chunks.length)),
    intentVectors: api.encodeVectors(rowsOf(exemplars.length)),
  };
}
function writePin(pin: unknown) {
  const path = join(mkdtempSync(join(tmpdir(), 'ben-pin-')), 'vectors.json');
  writeFileSync(path, JSON.stringify(pin));
  return path;
}

describe('pin key (content hash + model SHA + embedder version)', () => {
  it('exports an embedder version', () => {
    expect(api.EMBEDDER_VERSION, 'EMBEDDER_VERSION must be exported').toBeDefined();
  });
  it('is stable, and changes with chunk text, exemplar text, model SHA and embedder version', () => {
    const contentKey = need('contentKey');
    const base = contentKey(chunks, exemplars);
    expect(contentKey(chunks, exemplars)).toBe(base);
    expect(contentKey([{ ...chunks[0], text: 'edited' }, chunks[1]], exemplars)).not.toBe(base);
    expect(contentKey(chunks, [{ ...exemplars[0], text: 'what is a DNS' }])).not.toBe(base);
    expect(contentKey(chunks, exemplars, { ...api.EMBEDDER_FILES, 'onnx/model_quantized.onnx': '0'.repeat(64) })).not.toBe(base);
    expect(contentKey(chunks, exemplars, api.EMBEDDER_FILES, 'bumped')).not.toBe(base);
  });
  it('ignores Windows line endings (a CRLF checkout must not read as stale)', () => {
    const contentKey = need('contentKey');
    const crlf = chunks.map((c) => ({ ...c, text: c.text.replace(/\n/g, '\r\n') }));
    expect(contentKey(crlf, exemplars)).toBe(contentKey(chunks, exemplars));
  });
});

describe('checkPinned (embeds nothing)', () => {
  it('passes for a fresh pin', () => {
    const path = writePin(makePin(need('contentKey')(chunks, exemplars)));
    expect(need('checkPinned')({ chunks, exemplars, path }).ok).toBe(true);
  });
  it('fails a stale pin and names the exact command to run', () => {
    const path = writePin(makePin('0000000000000000'));
    const result = need('checkPinned')({ chunks, exemplars, path });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('npm run ben:pin');
  });
  it('fails a missing file with the same command', () => {
    const result = need('checkPinned')({ chunks, exemplars, path: join(tmpdir(), 'no-such-ben-pin.json') });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('npm run ben:pin');
  });
  it('fails when the row count does not match the chunks (hand-edited or merge-damaged file)', () => {
    const pin = makePin(need('contentKey')(chunks, exemplars));
    pin.chunkVectors = api.encodeVectors(rowsOf(chunks.length + 1));
    expect(need('checkPinned')({ chunks, exemplars, path: writePin(pin) }).ok).toBe(false);
  });
});

describe('buildIndex reads the pin instead of embedding', () => {
  it('returns the pinned vectors byte for byte and never loads the model', async () => {
    const pin = makePin(need('contentKey')(chunks, exemplars));
    const index = await api.buildIndex({ chunks, exemplars, pinned: pin });
    expect(index.chunkVectors).toEqual(pin.chunkVectors);
    expect(index.intentVectors).toEqual(pin.intentVectors);
    expect(index.chunks.map((c: { id: string }) => c.id)).toEqual(['a#0', 'a#1']);
  });
  it('refuses a stale pin loudly', async () => {
    need('contentKey'); // fail fast: today buildIndex ignores the pin and would try to fetch the model
    await expect(api.buildIndex({ chunks, exemplars, pinned: makePin('0000000000000000') })).rejects.toThrow(/npm run ben:pin/);
  });
});

describe('the committed artifact', () => {
  const file = join(process.cwd(), 'content', 'ben', 'vectors.json');
  it('exists', () => {
    expect(existsSync(file), 'content/ben/vectors.json is not committed; run npm run ben:pin').toBe(true);
  });
  it('matches the current lessons and exemplars (the stale-artifact gate)', () => {
    const result = need('checkPinned')({});
    expect(result.ok, result.message).toBe(true);
  });
  it('stays under the size ceiling (about 513 KB today; 800 KB flags runaway growth)', () => {
    expect(statSync(file).size).toBeLessThan(800 * 1024);
  });
});

describe('CLI and wiring', () => {
  it('`build-index.mjs --check` exits 1 on a stale pin, prints the fix, and needs no model', () => {
    const path = writePin(makePin('0000000000000000'));
    const result = spawnSync(process.execPath, [join(process.cwd(), 'scripts', 'ben', 'build-index.mjs'), '--check'], {
      encoding: 'utf8',
      env: { ...process.env, BEN_PINNED_PATH: path, BEN_EMBEDDER_DIR: join(tmpdir(), 'definitely-not-a-model-dir') },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('npm run ben:pin');
  });
  it('package.json defines ben:pin and ben:check', () => {
    const scripts = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).scripts;
    expect(scripts['ben:pin']).toMatch(/build-index\.mjs --pin/);
    expect(scripts['ben:check']).toMatch(/build-index\.mjs --check/);
  });
  it.each(['deploy.yml', 'pr-gates.yml', 'pr-ben-eval.yml'])('%s runs npm run ben:check', (name) => {
    const yml = readFileSync(join(process.cwd(), '.github', 'workflows', name), 'utf8');
    expect(yml).toContain('npm run ben:check');
  });
});
