/**
 * One Transformers.js runtime for both of Ben's models, served by the site.
 *
 * Transformers.js keeps its file-source settings (`allowLocalModels`,
 * `allowRemoteModels`) in one global `env` that it reads on every file fetch.
 * Ben loads two models from different places: the embedder from the site's own
 * origin, Qwen from the Hugging Face Hub. Loading them at the same time with
 * different settings would let one fetch files from the wrong place, so model
 * loads run one at a time, each with its source set explicitly.
 *
 * The runtime is a lazy chunk of this site, and the ONNX WASM files are copied
 * to `ort/` by `npm run ben:index`. Nothing executable comes from a third party,
 * so the page CSP keeps `script-src 'self'` (plus `'wasm-unsafe-eval'`, which
 * browsers require to compile WASM at all).
 */

export interface TransformersRuntime {
  pipeline: (task: string, model: string, options: Record<string, unknown>) => Promise<unknown>;
  env: {
    allowLocalModels: boolean;
    allowRemoteModels: boolean;
    useWasmCache: boolean;
    backends: { onnx: { wasm?: { wasmPaths?: unknown } } };
  };
}

/**
 * WebGPU needs the asyncify WASM build (27 MB). Devices without WebGPU, most
 * phones among them, get the plain build (14 MB). Only one is ever downloaded.
 */
export const HAS_WEBGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;

function wasmPaths(): { mjs: string; wasm: string } {
  const suffix = HAS_WEBGPU ? '.asyncify' : '';
  const base = new URL(`${import.meta.env.BASE_URL ?? '/'}ort/`, window.location.href).href;
  return {
    mjs: `${base}ort-wasm-simd-threaded${suffix}.mjs`,
    wasm: `${base}ort-wasm-simd-threaded${suffix}.wasm`,
  };
}

export type ModelSource = 'site' | 'hub';

let runtimePromise: Promise<TransformersRuntime> | null = null;
let queue: Promise<unknown> = Promise.resolve();

export function loadRuntime(): Promise<TransformersRuntime> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('The local models only run in the browser.'));
  }
  if (!runtimePromise) {
    runtimePromise = (import('@huggingface/transformers') as unknown as Promise<TransformersRuntime>)
      .then((runtime) => {
        const wasm = runtime.env.backends.onnx.wasm;
        if (wasm) wasm.wasmPaths = wasmPaths();
        // The WASM cache loads the ONNX factory from a blob: URL, which the CSP
        // forbids. The browser's HTTP cache still keeps the files.
        runtime.env.useWasmCache = false;
        return runtime;
      })
      .catch((error: unknown) => {
        runtimePromise = null;
        throw error;
      });
  }
  return runtimePromise;
}

/**
 * Build a pipeline with its files read from `source`, never both.
 * `site` models are addressed by a same-origin path (not a Hub id), so they are
 * fetched from the course itself; `hub` models by their Hub id.
 */
export function loadPipeline<T>(
  source: ModelSource,
  task: string,
  model: string,
  options: Record<string, unknown>,
): Promise<T> {
  const run = queue.then(async () => {
    const runtime = await loadRuntime();
    runtime.env.allowLocalModels = source === 'site';
    runtime.env.allowRemoteModels = source === 'hub';
    return (await runtime.pipeline(task, model, options)) as T;
  });
  // A failed load must not wedge the queue for the next one.
  queue = run.catch(() => undefined);
  return run;
}
