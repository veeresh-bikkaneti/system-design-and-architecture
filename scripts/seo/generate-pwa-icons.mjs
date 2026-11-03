/**
 * Generates PWA PNG icons from public/favicon.svg into public/icons/.
 *
 * Why build-time PNGs: browsers and install prompts do not accept SVG for
 * manifest icons or apple-touch-icon, so the icon set must exist as static
 * PNGs in `public/icons/` (copied to `dist/icons/` by Vite).
 *
 * Rendering: @resvg/resvg-js (SVG -> PNG), already a devDependency — the
 * same renderer scripts/seo/generate-og-images.mjs uses. No new dependency.
 *
 * Sizing rules (Chair ruling, T-PWA-1):
 * - Source favicon is non-square (48x46 viewBox, parsed — never assumed),
 *   so artwork is never stretched and never cropped: it is fitted inside
 *   the canvas preserving aspect.
 * - "any" icons: artwork fitted to the full square canvas on transparency.
 * - "maskable" icons + apple-touch-icon: artwork fitted inside the central
 *   80% safe zone on an opaque paper (#f5f0e6) background, so OS masking
 *   and iOS rounded corners cannot clip it. Maskable icons must be
 *   full-bleed opaque by spec; apple-touch-icon gets the same treatment
 *   because iOS renders transparency as black.
 *
 * Outputs are committed (generated, not counted toward the 3-file cap).
 * Re-run manually after editing public/favicon.svg; this script is NOT
 * wired into prebuild (T-PWA-1 scope). Idempotent: skips any PNG newer
 * than this script and the favicon. Fails loudly on render errors.
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { repoRoot } from './lesson-meta.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(scriptDir, 'generate-pwa-icons.mjs');
const faviconPath = join(repoRoot, 'public', 'favicon.svg');
const outDir = join(repoRoot, 'public', 'icons');
const PAPER = '#f5f0e6';

// Resvg cannot parse `fill:color(display-p3 ...)` declarations, and falls
// back to black for every filled shape that carries one (verified: direct
// Resvg render of the raw favicon is an all-black silhouette). The same
// style attributes already carry the intended sRGB hex fill, so strip only
// the display-p3 declarations and keep the hex fills. Known limitation:
// Resvg also drops the favicon's blurred highlight ellipses (mask + filter
// groups), so the PNGs are the solid brand-purple silhouette, not the full
// browser rendering — the shape and colour are correct, the highlights are
// not. That is a renderer limitation, not a generator bug: a direct Resvg
// render of the raw favicon shows the identical silhouette.
const source = readFileSync(faviconPath, 'utf8').replace(
  /fill:color\(display-p3[^)]+\)\s*;?/g,
  '',
);
const viewBoxMatch = source.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
if (!viewBoxMatch) {
  throw new Error('generate-pwa-icons: public/favicon.svg has no "0 0 W H" viewBox');
}
const srcW = Number(viewBoxMatch[1]);
const srcH = Number(viewBoxMatch[2]);
const innerMatch = source.match(/^<svg[^>]*>([\s\S]*)<\/svg>\s*$/);
if (!innerMatch) {
  throw new Error('generate-pwa-icons: could not extract inner content of public/favicon.svg');
}
const inner = innerMatch[1];

// Fit the source aspect inside a box of maxW x maxH, centred on the canvas.
function fittedBox(canvas, maxW, maxH) {
  const scale = Math.min(maxW / srcW, maxH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (canvas - w) / 2, y: (canvas - h) / 2, w, h };
}

const outputs = [
  { file: 'icon-192.png', size: 192, kind: 'any' },
  { file: 'icon-512.png', size: 512, kind: 'any' },
  { file: 'icon-192-maskable.png', size: 192, kind: 'maskable' },
  { file: 'icon-512-maskable.png', size: 512, kind: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, kind: 'maskable' },
];

mkdirSync(outDir, { recursive: true });
const inputMtime = Math.max(statSync(scriptPath).mtimeMs, statSync(faviconPath).mtimeMs);
let generated = 0;
let skipped = 0;
for (const { file, size, kind } of outputs) {
  const outPath = join(outDir, file);
  if (existsSync(outPath) && statSync(outPath).mtimeMs > inputMtime) {
    skipped += 1;
    continue;
  }
  const box =
    kind === 'any'
      ? fittedBox(size, size, size)
      : fittedBox(size, size * 0.8, size * 0.8);
  const background =
    kind === 'any' ? '' : `<rect width="${size}" height="${size}" fill="${PAPER}"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${size} ${size}">${background}` +
    `<svg x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" ` +
    `viewBox="0 0 ${srcW} ${srcH}">${inner}</svg></svg>`;
  let png;
  try {
    png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  } catch (e) {
    throw new Error(`generate-pwa-icons: failed to render ${file}: ${e.message}`);
  }
  writeFileSync(outPath, png);
  generated += 1;
}
console.log(`generate-pwa-icons: ${generated} generated, ${skipped} skipped -> public/icons/`);
