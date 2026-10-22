import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfigFromFile } from 'vite';

/**
 * `drop-duplicate-ort-wasm` deletes a file from the build output by filename
 * pattern, so a pattern that is too loose deletes the wrong file silently.
 * It was: the "hash" it looked for was any 8 word characters, and
 * `ort-wasm-simd-threaded.wasm` ends in `-threaded.wasm`, so the plain runtime
 * the page fetches matched too. It stayed safe only because Vite copies
 * `public/` outside the bundle hook. This pins the pattern itself, against the
 * real plugin from the real config.
 */
type Hook = (this: unknown, options: unknown, bundle: Record<string, unknown>) => void;

async function dropDuplicate(): Promise<Hook> {
  const loaded = await loadConfigFromFile(
    { command: 'build', mode: 'production' },
    resolve(import.meta.dirname, 'vite.config.ts'),
  );
  const plugins = [loaded?.config.plugins ?? []].flat(Infinity) as Array<{ name?: string; generateBundle?: Hook | { handler: Hook } }>;
  const plugin = plugins.find((p) => p && p.name === 'drop-duplicate-ort-wasm');
  if (!plugin?.generateBundle) throw new Error('drop-duplicate-ort-wasm plugin not found in vite.config.ts');
  return typeof plugin.generateBundle === 'function' ? plugin.generateBundle : plugin.generateBundle.handler;
}

/** What survives a pass of the plugin over a bundle holding exactly these files. */
async function survivors(files: Array<[name: string, type: 'asset' | 'chunk']>): Promise<string[]> {
  const hook = await dropDuplicate();
  const bundle = Object.fromEntries(files.map(([name, type]) => [name, { type, fileName: name }]));
  hook.call({}, {}, bundle);
  return Object.keys(bundle);
}

describe('drop-duplicate-ort-wasm', () => {
  it('drops the hashed duplicate Rollup emits from onnxruntime-web', async () => {
    const kept = await survivors([['assets/ort-wasm-simd-threaded.asyncify-CxOG5pUO.wasm', 'asset']]);
    expect(kept).toEqual([]);
  });

  it('keeps the plain runtime the page fetches', async () => {
    const plain = 'ort/ort-wasm-simd-threaded.wasm';
    expect(await survivors([[plain, 'asset']])).toEqual([plain]);
    expect(await survivors([['ort-wasm-simd-threaded.wasm', 'asset']])).toEqual(['ort-wasm-simd-threaded.wasm']);
  });

  it('keeps the asyncify runtime Pages serves to WebGPU devices', async () => {
    const asyncify = 'ort/ort-wasm-simd-threaded.asyncify.wasm';
    expect(await survivors([[asyncify, 'asset']])).toEqual([asyncify]);
  });

  it('keeps a hash-shaped wasm that is not onnxruntime\'s, and anything that is not an asset', async () => {
    const files: Array<[string, 'asset' | 'chunk']> = [
      ['assets/other-ABCDEFGH.wasm', 'asset'],
      ['assets/ort-wasm-simd-threaded.asyncify-CxOG5pUO.wasm', 'chunk'],
    ];
    expect(await survivors(files)).toEqual(files.map(([name]) => name));
  });
});
