/**
 * Ben's embedding model: fetched once, verified by SHA-256, served by the site.
 *
 * The files land in `public/models/all-MiniLM-L6-v2/` (gitignored) so Vite copies
 * them into `dist/` and the browser loads them from the course's own origin.
 * Set `BEN_EMBEDDER_DIR` to a local copy of the Hugging Face repo to skip the
 * download (offline machines, sandboxes). Either way, a file whose hash does not
 * match the pin below is refused.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { repoRoot } from '../seo/lesson-meta.mjs';

export const EMBEDDER_REPO = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDER_NAME = 'all-MiniLM-L6-v2';
export const EMBEDDER_DTYPE = 'q8';
export const EMBEDDER_DIMS = 384;

/** Pinned SHA-256 of every file the runtime reads. */
export const EMBEDDER_FILES = {
  'config.json': '7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7',
  'tokenizer.json': 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0',
  'tokenizer_config.json': '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3',
  'special_tokens_map.json': 'b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3',
  'onnx/model_quantized.onnx': 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1',
};

/** Where the site serves the model from. */
export const embedderDir = join(repoRoot, 'public', 'models', EMBEDDER_NAME);

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function isPinned(path, expected) {
  return existsSync(path) && sha256(readFileSync(path)) === expected;
}

async function readSource(file) {
  const local = process.env.BEN_EMBEDDER_DIR;
  if (local) return readFileSync(join(local, file));
  const url = `https://huggingface.co/${EMBEDDER_REPO}/resolve/main/${file}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Make sure every pinned file is present and verified. Returns the model directory. */
export async function ensureEmbedder() {
  for (const [file, expected] of Object.entries(EMBEDDER_FILES)) {
    const target = join(embedderDir, file);
    if (isPinned(target, expected)) continue;
    const buffer = await readSource(file);
    const actual = sha256(buffer);
    if (actual !== expected) {
      throw new Error(
        `${EMBEDDER_REPO}/${file}: SHA-256 ${actual} does not match the pin ${expected}. ` +
          'Refusing to ship an unverified model file.',
      );
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, buffer);
    console.log(`ben: fetched ${file} (${(buffer.length / 1e6).toFixed(1)} MB)`);
  }
  return embedderDir;
}

/**
 * The ONNX runtime's WASM files, served by the site from `ort/` (gitignored).
 * Copied from the exact onnxruntime-web the bundled Transformers.js resolves,
 * so the JS glue and the binary always match.
 */
export const ORT_FILES = [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
];

/**
 * The WebGPU half of `ORT_FILES`. The asyncify WASM is 25.6 MiB, past the
 * 25 MiB per-asset cap a Cloudflare Worker enforces on static assets, so a
 * Workers Builds artifact ships without it and WebGPU devices fall back to
 * the plain build there (`wasmPaths()` in `src/ai/local/runtime.ts`).
 * GitHub Pages, the deploy target of record, has no such cap and keeps it.
 */
export const ORT_ASYNCIFY_FILES = [
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
];

/**
 * Whether `ort/` holds the whole asyncify pair. `vite.config.ts` bakes this
 * into the bundle so the page never requests a runtime this build did not
 * ship. It asks the folder rather than re-reading `WORKERS_CI`, so what is
 * shipped and what is requested cannot disagree.
 */
export function asyncifyShipped(ortDir = join(repoRoot, 'public', 'ort')) {
  return ORT_ASYNCIFY_FILES.every((file) => existsSync(join(ortDir, file)));
}

/** The folder of the installed package `name` that `from` resolves. */
function packageDir(name, from) {
  let dir = dirname(createRequire(from).resolve(name));
  while (!dir.endsWith(join('node_modules', name))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`ben: cannot locate the ${name} package`);
    dir = parent;
  }
  return dir;
}

export function copyRuntimeAssets(target = join(repoRoot, 'public', 'ort')) {
  const transformersDir = packageDir('@huggingface/transformers', import.meta.url);
  const ortDist = join(packageDir('onnxruntime-web', join(transformersDir, 'package.json')), 'dist');
  mkdirSync(target, { recursive: true });
  // Cloudflare Workers Builds sets WORKERS_CI=1. The asyncify pair is over
  // that host's per-asset cap, so leave it out there (see ORT_ASYNCIFY_FILES)
  // and delete any copy an earlier build left behind, so the artifact is the
  // same whether or not `public/ort/` was already populated.
  const skipAsyncify = Boolean(process.env.WORKERS_CI);
  for (const file of ORT_FILES) {
    if (skipAsyncify && ORT_ASYNCIFY_FILES.includes(file)) {
      rmSync(join(target, file), { force: true });
      continue;
    }
    copyFileSync(join(ortDist, file), join(target, file));
  }
  return target;
}

let pipePromise = null;

/** A Node feature-extraction pipeline over the verified local files. */
export async function loadNodeEmbedder() {
  if (!pipePromise) {
    pipePromise = (async () => {
      const dir = await ensureEmbedder();
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      // A filesystem path is not a valid Hub id, so the files are read as-is.
      const pipe = await pipeline('feature-extraction', dir, { dtype: EMBEDDER_DTYPE });
      return async (texts) => {
        const output = await pipe(texts, { pooling: 'mean', normalize: true });
        return output.tolist();
      };
    })();
  }
  return pipePromise;
}
