/**
 * Fail the build if any file in `dist/` is too big for the host it is about
 * to be deployed to.
 *
 * Context: this site has two deploy targets. GitHub Pages (the target of
 * record, `.github/workflows/deploy.yml`) allows files up to 100 MB. A
 * Cloudflare Worker serving `dist/` as static assets caps an individual
 * asset at 25 MiB, and a build that breaks that cap fails at the *deploy*
 * step — after a clean `npm run build` — with no error line naming the file.
 * That is a slow, silent failure mode, so this check names the file instead.
 *
 * The 25 MiB cap is the reason `copyRuntimeAssets()` leaves onnxruntime's
 * 25.6 MiB asyncify WASM out of a Workers Builds artifact; see
 * `scripts/ben/embedder.mjs` and docs/adr/0001-ben-semantic-routing.md.
 *
 * Enforced when the build is a Workers build (`WORKERS_CI=1`, injected by
 * Cloudflare Workers Builds) or when `--workers` is passed, so the Workers
 * cap can be checked locally:
 *
 *     WORKERS_CI=1 npm run build
 *     node scripts/check-asset-size.mjs --workers
 *
 * Elsewhere it only reports the largest files, since Pages has no such cap.
 *
 * Exits 0 on pass, 1 on any file over the cap.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { repoRoot } from './seo/lesson-meta.mjs';

/* Cloudflare Workers: 25 MiB per static asset, 20,000 files per version on
 * the free plan (100,000 on paid). See
 * https://developers.cloudflare.com/workers/platform/limits/#static-assets */
const WORKERS_MAX_ASSET_BYTES = 25 * 1024 * 1024;
const WORKERS_MAX_ASSET_FILES = 20_000;

const enforce = Boolean(process.env.WORKERS_CI) || process.argv.includes('--workers');
const dist = join(repoRoot, 'dist');
const fmt = (n) => `${(n / (1024 * 1024)).toFixed(2)} MiB`;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else if (entry.isFile()) out.push({ path: relative(dist, abs), bytes: statSync(abs).size });
  }
  return out;
}

let files;
try {
  files = walk(dist);
} catch (error) {
  console.error(`asset-size FAIL: cannot read dist/ — run \`vite build\` first (${error.message})`);
  process.exit(1);
}

const biggest = [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
console.log(
  `asset-size: ${files.length} files in dist/` +
    (enforce ? `, Workers caps: ${fmt(WORKERS_MAX_ASSET_BYTES)}/file, ${WORKERS_MAX_ASSET_FILES} files` : ' (Workers caps not enforced)'),
);
for (const f of biggest) console.log(`  max  ${f.path} ${fmt(f.bytes)}`);

if (!enforce) {
  console.log('asset-size: OK (reporting only — set WORKERS_CI=1 to enforce the Cloudflare Workers caps)');
  process.exit(0);
}

const over = files.filter((f) => f.bytes > WORKERS_MAX_ASSET_BYTES);
let failed = false;
for (const f of over) {
  console.error(
    `asset-size FAIL: ${f.path} is ${fmt(f.bytes)} — over the Cloudflare Workers ` +
      `per-asset cap of ${fmt(WORKERS_MAX_ASSET_BYTES)}. wrangler deploy would fail on this file.`,
  );
  failed = true;
}
if (files.length > WORKERS_MAX_ASSET_FILES) {
  console.error(
    `asset-size FAIL: ${files.length} files — over the Cloudflare Workers cap of ` +
      `${WORKERS_MAX_ASSET_FILES} assets per version.`,
  );
  failed = true;
}
if (failed) {
  console.error(
    'asset-size: serve the file from somewhere without the cap, or leave it out of ' +
      'the Workers artifact (see copyRuntimeAssets() in scripts/ben/embedder.mjs).',
  );
  process.exit(1);
}
console.log('asset-size: OK');
