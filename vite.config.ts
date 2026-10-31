import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import mdx from '@mdx-js/rollup'
import remarkGfm from 'remark-gfm'
import { VitePWA } from 'vite-plugin-pwa'
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
        // Anchored on the whole runtime stem plus a `-<hash>` that must come
        // after it. Matching only `ort-wasm-…-<8 chars>.wasm` also hit the
        // plain runtime, since `-threaded.wasm` is 8 word characters; that file
        // survived only because Vite copies `public/` outside this hook.
        if (output.type === 'asset' && /(^|\/)ort-wasm-simd-threaded[^/]*-[\w-]{8}\.wasm$/.test(fileName)) {
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
    // T-PWA-2 (Chair PASS): service worker LAST, so its precache manifest is
    // computed on the final bundle after dropDuplicateOrtWasm runs.
    // Precache = dist/assets JS/CSS + 404.html ONLY (<=20 MB gate, FT-SW1).
    // No runtime caching in v1: no audio/ort/models/og, no gist, no
    // worker/auth routes. registerType 'prompt' = non-auto update: no
    // skipWaiting, no auto-reload (the prompt is T-PWA-3). manifest: false
    // preserves the static T-PWA-1 manifest — the plugin must never
    // generate, merge, or overwrite it (FT-SW2 blocks on any overwrite).
    // injectRegister: null — registration is manual in src/main.tsx only.
    // devOptions disabled: no dev service worker; gates run on the
    // production preview build only.
    // KNOWN DEVIATION from Chair scenario S6 (flagged, not hidden): Workbox's
    // NavigationRoute + createHandlerBoundToURL serves the fallback for
    // every matching navigation while the worker controls the page — it is
    // NOT failure-gated, so an online navigation under SW control serves
    // the 404 shell (which boots the SPA and renders the correct lesson
    // from precached chunks) instead of the prerendered lesson HTML.
    // Prerendered HTML still serves first visits, crawlers, and any page
    // before the worker takes control. A failure-gated (network-first)
    // navigation handler needs injectManifest + a custom SW file, which is
    // a 4th file outside this task's cap — that is a Chair round-2 call,
    // not a silent workaround here.
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      manifest: false,
      devOptions: { enabled: false },
      workbox: {
        globPatterns: ['assets/**/*.{js,css}'],
        navigateFallback: '404.html',
        // 404.html cannot be glob-precached: prerender writes it AFTER the
        // vite build (npm run build runs vite, then prerender), and vite
        // empties dist first, so no 404.html exists when this plugin runs.
        // Pin it explicitly instead. Revision is a build timestamp so the
        // shell is refetched on every deploy — its content changes with
        // every bundle (hashed asset refs), and a null revision would let
        // a stale shell survive updates and point at purged old assets.
        additionalManifestEntries: [
          { url: '404.html', revision: String(Date.now()) },
        ],
        // Workbox's default per-file precache cap is 2 MiB, but the core
        // lib chunk is 6.04 MB and must be precached for the shell to boot
        // offline. Raise the per-file cap to 10 MiB; the TOTAL precache
        // budget (<=20 MB, FT-SW1) is unchanged and still enforced.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
    }),
  ],
})
