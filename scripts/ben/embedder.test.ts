import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs build script, no type declarations
import { ORT_ASYNCIFY_FILES, ORT_FILES } from './embedder.mjs';

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
  const ort = ORT_FILES as string[];
  const asyncify = ORT_ASYNCIFY_FILES as string[];

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
