// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `wasmPaths()` picks which ONNX runtime the browser downloads: the asyncify
 * build (25.6 MiB, for WebGPU) or the plain one (13.6 MiB). A Cloudflare
 * Workers artifact ships without asyncify, because 25.6 MiB is over that
 * host's 25 MiB per-asset cap — so choosing it there would point Ben at a file
 * that was never deployed. The embedder would fail to load and routing would
 * quietly drop to keywords: a working-looking site with a dumber tutor.
 *
 * Every other gate over this path (`ben:index`, `eval:ben`, the e2e specs)
 * needs the Hugging Face download, so none of them runs without network.
 * These assertions do, by faking the Transformers.js module.
 */

/** A stand-in for the Transformers.js module namespace `loadRuntime()` awaits. */
function fakeTransformers() {
  return {
    env: {
      allowLocalModels: false,
      allowRemoteModels: false,
      useWasmCache: true,
      backends: { onnx: { wasm: {} as { wasmPaths?: { mjs: string; wasm: string } } } },
    },
    pipeline: vi.fn(),
  };
}

/**
 * Import `runtime.ts` fresh with WebGPU presence and the build flag fixed.
 * Both are read at module scope, so they have to be set before the import.
 */
async function loadWith({ webgpu, asyncifyFlag }: { webgpu: boolean; asyncifyFlag?: string }) {
  if (webgpu) {
    Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
  } else {
    Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'gpu');
  }
  // Unset is the GitHub Pages / dev case: asyncify is assumed present.
  if (asyncifyFlag === undefined) vi.unstubAllEnvs();
  else vi.stubEnv('VITE_ORT_ASYNCIFY', asyncifyFlag);

  const transformers = fakeTransformers();
  vi.resetModules();
  vi.doMock('@huggingface/transformers', () => transformers);
  const { loadRuntime } = await import('./runtime.ts');
  await loadRuntime();
  return transformers.env;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock('@huggingface/transformers');
  Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'gpu');
});

describe('loadRuntime wasmPaths', () => {
  it('asks for the asyncify build on WebGPU when this build shipped it', async () => {
    const env = await loadWith({ webgpu: true });
    expect(env.backends.onnx.wasm.wasmPaths).toEqual({
      mjs: 'http://localhost:3000/ort/ort-wasm-simd-threaded.asyncify.mjs',
      wasm: 'http://localhost:3000/ort/ort-wasm-simd-threaded.asyncify.wasm',
    });
  });

  it('asks for the plain build on WebGPU when asyncify was left out of the build', async () => {
    // The Cloudflare Workers artifact. Requesting asyncify here would 404.
    const env = await loadWith({ webgpu: true, asyncifyFlag: '0' });
    expect(env.backends.onnx.wasm.wasmPaths).toEqual({
      mjs: 'http://localhost:3000/ort/ort-wasm-simd-threaded.mjs',
      wasm: 'http://localhost:3000/ort/ort-wasm-simd-threaded.wasm',
    });
  });

  it('asks for the plain build without WebGPU, as phones already do', async () => {
    const env = await loadWith({ webgpu: false });
    expect(env.backends.onnx.wasm.wasmPaths).toEqual({
      mjs: 'http://localhost:3000/ort/ort-wasm-simd-threaded.mjs',
      wasm: 'http://localhost:3000/ort/ort-wasm-simd-threaded.wasm',
    });
  });

  it('never points at a hashed asset/ copy, whatever the flag says', async () => {
    for (const asyncifyFlag of [undefined, '0', '1']) {
      const env = await loadWith({ webgpu: true, asyncifyFlag });
      const paths = env.backends.onnx.wasm.wasmPaths;
      expect(paths?.wasm).toContain('/ort/');
      expect(paths?.wasm).not.toContain('/assets/');
    }
  });

  it('leaves the blob-URL WASM cache off, which the CSP requires', async () => {
    const env = await loadWith({ webgpu: true });
    expect(env.useWasmCache).toBe(false);
  });
});
