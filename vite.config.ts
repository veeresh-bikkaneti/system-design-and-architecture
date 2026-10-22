import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import mdx from '@mdx-js/rollup'
import remarkGfm from 'remark-gfm'
import { asyncifyShipped } from './scripts/ben/embedder.mjs'

/**
 * Drop the duplicate ONNX WASM that Rollup emits into `assets/`.
 *
 * `onnxruntime-web`'s own bundle carries a literal
 * `new URL('ort-wasm-simd-threaded.asyncify.wasm', import.meta.url)`, which
 * Vite resolves and emits as a hashed asset — 25.6 MiB of it. ORT only reads
 * that URL when the page leaves `env.backends.onnx.wasm.wasmPaths` unset, and
 * `src/ai/local/runtime.ts` always sets it to the copy `npm run ben:index`
 * puts in `ort/`. So the emitted asset is never fetched; it was dead weight
 * in every deploy (the cost docs/adr/0001-ben-semantic-routing.md records as
 * "a duplicate asyncify WASM that Vite emits"), and it is over the 25 MiB
 * per-asset cap a Cloudflare Worker enforces, which failed that deploy.
 */
function dropDuplicateOrtWasm(): Plugin {
  return {
    name: 'drop-duplicate-ort-wasm',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const [fileName, output] of Object.entries(bundle)) {
        // The trailing `-<hash>` is what makes this an emitted asset. Files
        // copied verbatim out of `public/ort/` keep their plain names and
        // never pass this test, so the runtime the page actually fetches is
        // safe even if Vite ever routes publicDir through this hook.
        if (output.type === 'asset' && /(^|\/)ort-wasm-[^/]*-[\w-]{8}\.wasm$/.test(fileName)) {
          delete bundle[fileName]
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  define: {
    /* Whether `public/ort/` holds the 25.6 MiB asyncify WASM. Cloudflare
     * Workers Builds leaves it out (copyRuntimeAssets() in
     * scripts/ben/embedder.mjs), so WebGPU devices use the plain build there.
     * Read by src/ai/local/runtime.ts. Asked of the folder, not of
     * WORKERS_CI, so the page only requests what this build shipped. */
    'import.meta.env.VITE_ORT_ASYNCIFY': JSON.stringify(asyncifyShipped() ? '1' : '0'),
  },
  plugins: [
    { enforce: 'pre', ...mdx({ remarkPlugins: [remarkGfm], providerImportSource: '@mdx-js/react' }) },
    react({ include: /\.(jsx|js|mdx|md|tsx|ts)$/ }),
    tailwindcss(),
    dropDuplicateOrtWasm(),
  ],
})
