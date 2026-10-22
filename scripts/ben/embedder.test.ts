import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ORT_ASYNCIFY_FILES, ORT_FILES, asyncifyShipped, copyRuntimeAssets } from './embedder.mjs';

/**
 * `copyRuntimeAssets()` leaves the asyncify pair out of a Cloudflare Workers
 * artifact by testing `ORT_ASYNCIFY_FILES.includes(file)` while it walks
 * `ORT_FILES` — an exact string match between two hand-written lists. Rename
 * a file in one list only and the skip silently stops matching, which puts a
 * 25.6 MiB asset back into a build whose host caps assets at 25 MiB. That
 * failure surfaces as a Cloudflare deploy that dies with no error line, so
 * pin the invariant here instead.
 */
describe('ORT runtime file lists', () => {
  const ort = ORT_FILES;
  const asyncify = ORT_ASYNCIFY_FILES;

  it('lists every asyncify file as one of the ORT files', () => {
    for (const file of asyncify) expect(ort).toContain(file);
  });

  it('keeps a non-asyncify runtime, so a build without asyncify still works', () => {
    const plain = ort.filter((file) => !asyncify.includes(file));
    expect(plain).toContain('ort-wasm-simd-threaded.mjs');
    expect(plain).toContain('ort-wasm-simd-threaded.wasm');
  });

  it('pairs each runtime with its own JS glue', () => {
    for (const wasm of ort.filter((file) => file.endsWith('.wasm'))) {
      expect(ort).toContain(wasm.replace(/\.wasm$/, '.mjs'));
    }
  });
});

/**
 * `vite.config.ts` tells the browser bundle whether asyncify exists by asking
 * `asyncifyShipped()`, not by re-reading `WORKERS_CI`. Two independent reads of
 * one environment variable can disagree (a stale `public/ort/`, a build run
 * without the variable), and the failure is silent: WebGPU devices request a
 * file that was never deployed, the embedder fails to load, and Ben quietly
 * falls back to keywords. Asking the filesystem makes "what we ship" and "what
 * the page requests" the same fact.
 */
describe('asyncifyShipped', () => {
  const dirs: string[] = [];
  const ortDir = (files: string[]) => {
    const dir = mkdtempSync(join(tmpdir(), 'ort-'));
    dirs.push(dir);
    for (const file of files) writeFileSync(join(dir, file), '');
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('is true when the whole asyncify pair is present', () => {
    expect(asyncifyShipped(ortDir(ORT_FILES))).toBe(true);
  });

  it('is false for a plain-only artifact, as a Workers build ships', () => {
    const plain = ORT_FILES.filter((f) => !ORT_ASYNCIFY_FILES.includes(f));
    expect(asyncifyShipped(ortDir(plain))).toBe(false);
  });

  it('is false when only half of the pair is there, since half cannot load', () => {
    const [glue] = ORT_ASYNCIFY_FILES;
    expect(asyncifyShipped(ortDir([glue]))).toBe(false);
  });

  it('is false when the folder does not exist yet', () => {
    const missing = join(ortDir([]), 'never-created');
    mkdirSync(join(missing, '..'), { recursive: true });
    expect(asyncifyShipped(missing)).toBe(false);
  });
});

/**
 * The fix itself: under `WORKERS_CI` the asyncify pair must not be copied, so a
 * Cloudflare Workers artifact has nothing over its 25 MiB per-asset cap. The
 * tests above only check that the two file lists agree; nothing ran the copy.
 * It copies the real files (~40 MB) into a temp folder, so it checks the sizes
 * that matter and not a stand-in.
 */
describe('copyRuntimeAssets', () => {
  const WORKERS_CAP = 25 * 1024 * 1024;
  const dirs: string[] = [];
  const target = () => {
    const dir = mkdtempSync(join(tmpdir(), 'ort-copy-'));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('ships all four runtime files on a normal build', () => {
    vi.stubEnv('WORKERS_CI', '');
    const dir = target();
    copyRuntimeAssets(dir);
    expect(readdirSync(dir).sort()).toEqual([...ORT_FILES].sort());
  });

  it('leaves the asyncify pair out under WORKERS_CI, so nothing is over the Workers cap', () => {
    vi.stubEnv('WORKERS_CI', '1');
    const dir = target();
    copyRuntimeAssets(dir);
    const plain = ORT_FILES.filter((file) => !ORT_ASYNCIFY_FILES.includes(file));
    expect(readdirSync(dir).sort()).toEqual([...plain].sort());
    for (const file of readdirSync(dir)) expect(statSync(join(dir, file)).size).toBeLessThanOrEqual(WORKERS_CAP);
  });

  it('removes a stale asyncify copy an earlier non-Workers build left behind', () => {
    vi.stubEnv('WORKERS_CI', '1');
    const dir = target();
    for (const file of ORT_ASYNCIFY_FILES) writeFileSync(join(dir, file), 'stale');
    copyRuntimeAssets(dir);
    for (const file of ORT_ASYNCIFY_FILES) expect(readdirSync(dir)).not.toContain(file);
  });
});
