import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ORT_ASYNCIFY_FILES, ORT_FILES, asyncifyShipped } from './embedder.mjs';

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
