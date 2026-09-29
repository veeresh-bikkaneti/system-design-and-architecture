/**
 * Generates Open Graph share images (1200×630 PNG) for every indexable route:
 * one per lesson plus home, roadmap, and badges.
 *
 * Why build-time PNGs: social crawlers (X, LinkedIn, iMessage, Slack) fetch
 * `og:image` with plain image GETs — they don't run JS and several don't
 * accept SVG, so the images must exist as static PNGs in `public/og/`
 * (copied to `dist/og/` by Vite) before `prerender.mjs` references them.
 *
 * Rendering: satori (React → SVG, pure Node) + @resvg/resvg-js (SVG → PNG).
 * Both are $0 MIT/MPL-2.0 npm packages — no external service, no API key.
 * Typography uses the site's real brand fonts (Fraunces 600 + Inter 400/600,
 * latin subsets committed under `scripts/seo/assets/fonts/`) and the warm
 * paper / amber palette from `src/index.css`, so cards look like the site.
 *
 * Idempotent: skips any PNG newer than its inputs (this script, the fonts,
 * and the lesson's MDX). Fails loudly on render errors so CI never ships
 * pages pointing at missing images.
 *
 * Runs automatically via `prebuild`, after the lesson manifest exists.
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
import { createElement as h } from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { repoRoot, lessonsDir, loadLessonMetas } from './lesson-meta.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fontsDir = join(scriptDir, 'assets', 'fonts');
const outDir = join(repoRoot, 'public', 'og');

const W = 1200;
const H = 630;
const MAX_BYTES = 300 * 1024; // keep each card comfortably under ~300 KB

/* Palette mirrors src/index.css (warm paper + amber accent scale). */
const PAPER = '#f5f0e6';
const INK = '#1c1917'; // stone-900
const MUTED = '#57534e'; // stone-600
const FAINT = '#78716c'; // stone-500
const ACCENT700 = '#b45309';
const ACCENT800 = '#92400e';
const PILL_BG = '#fef3c7'; // amber-100
const WASH1 = 'rgba(253, 230, 138, 0.55)'; // amber-200
const WASH2 = 'rgba(252, 211, 77, 0.35)'; // amber-300

const toArrayBuffer = (buf) =>
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const fontFiles = {
  fraunces600: join(fontsDir, 'fraunces-v38-latin-600.ttf'),
  inter400: join(fontsDir, 'inter-v20-latin-regular.ttf'),
  inter600: join(fontsDir, 'inter-v20-latin-600.ttf'),
};
for (const [name, path] of Object.entries(fontFiles)) {
  if (!existsSync(path)) {
    throw new Error(
      `generate-og-images: missing font ${name} at ${path} — ` +
        'the committed latin-subset TTFs under scripts/seo/assets/fonts/ are required',
    );
  }
}

const fonts = [
  { name: 'Fraunces', data: toArrayBuffer(readFileSync(fontFiles.fraunces600)), weight: 600, style: 'normal' },
  { name: 'Inter', data: toArrayBuffer(readFileSync(fontFiles.inter400)), weight: 400, style: 'normal' },
  { name: 'Inter', data: toArrayBuffer(readFileSync(fontFiles.inter600)), weight: 600, style: 'normal' },
];

const tierLabels = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

// Satori quirk: with `letterSpacing`, plain spaces can collapse to zero width
// (observed: "SELF-PACEDCOURSE" on the home card). Non-breaking spaces are
// immune and render at the same advance width, so every tracked-out label
// goes through this helper. Single-line by design — no wrapping intended.
const tracked = (s) => s.toUpperCase().replace(/ /g, '\u00A0');

const pill = (label) =>
  h(
    'div',
    {
      style: {
        backgroundColor: PILL_BG,
        color: ACCENT800,
        fontSize: 24,
        fontWeight: 600,
        letterSpacing: 2,
        padding: '12px 24px',
        borderRadius: 999,
      },
    },
    tracked(label),
  );

const meta = (text) =>
  h('div', { style: { fontSize: 26, color: MUTED } }, text);

/**
 * One branded 1200×630 card: eyebrow, Fraunces title (auto-sized by length),
 * Inter subtitle, and a footer row with pill metadata + a "Free" marker.
 */
function card({ eyebrow, title, subtitle, footerLeft, footerRight = 'Free' }) {
  const titleSize = title.length <= 40 ? 92 : title.length <= 70 ? 74 : 58;
  return h(
    'div',
    {
      style: {
        width: W,
        height: H,
        backgroundColor: PAPER,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 76px',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'Inter',
      },
    },
    // Decorative amber washes (painted first = behind the text).
    h('div', {
      style: {
        position: 'absolute', right: -170, top: -170, width: 540, height: 540,
        borderRadius: '50%', backgroundColor: WASH1,
      },
    }),
    h('div', {
      style: {
        position: 'absolute', right: 200, top: 280, width: 280, height: 280,
        borderRadius: '50%', backgroundColor: WASH2,
      },
    }),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 26 } },
      h(
        'div',
        { style: { fontSize: 27, fontWeight: 600, letterSpacing: 5, color: ACCENT700 } },
        tracked(eyebrow),
      ),
      h(
        'div',
        {
          style: {
            fontFamily: 'Fraunces', fontWeight: 600, fontSize: titleSize,
            lineHeight: 1.06, color: INK,
          },
        },
        title,
      ),
      subtitle
        ? h('div', { style: { fontSize: 30, lineHeight: 1.45, color: MUTED } }, subtitle)
        : null,
    ),
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 22 } }, ...footerLeft),
      h('div', { style: { fontSize: 25, fontWeight: 600, letterSpacing: 3, color: FAINT } }, footerRight.toUpperCase()),
    ),
  );
}

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

const metas = loadLessonMetas();

const pages = [
  {
    name: 'home',
    inputs: [],
    el: card({
      eyebrow: 'A free, self-paced course',
      title: 'System Design Mastery',
      subtitle:
        'Learn system design from zero to master — 36 lessons, diagrams that move, and an AI tutor that sketches with you.',
      footerLeft: [pill('36 lessons'), meta('Beginner to Advanced')],
    }),
  },
  {
    name: 'roadmap',
    inputs: [],
    el: card({
      eyebrow: 'System Design Mastery',
      title: 'Roadmap',
      subtitle: 'Your path from zero to master — every lesson in syllabus order, across three tiers.',
      footerLeft: [pill('Syllabus'), meta('36 lessons')],
    }),
  },
  {
    name: 'badges',
    inputs: [],
    el: card({
      eyebrow: 'System Design Mastery',
      title: 'Badges',
      subtitle: 'Earn badges as you learn — one per lesson, one per perfect quiz, one per tier.',
      footerLeft: [pill('Earn as you learn')],
    }),
  },
  ...metas.map((m) => ({
    name: `lesson-${m.slug}`,
    inputs: [join(lessonsDir, `${m.slug}.mdx`)],
    el: card({
      eyebrow: 'System Design Mastery',
      title: m.title,
      subtitle: truncate(m.summary, 150),
      footerLeft: [pill(tierLabels[m.tier]), meta(`${m.estimatedMinutes} min read`)],
    }),
  })),
];

/* Skip outputs newer than every input (script + fonts + lesson source). */
const scriptMtime = statSync(new URL(import.meta.url)).mtimeMs;
const fontMtimes = Object.values(fontFiles).map((p) => statSync(p).mtimeMs);
const staticInputs = [scriptMtime, ...fontMtimes];

mkdirSync(outDir, { recursive: true });

let generated = 0;
let skipped = 0;
for (const page of pages) {
  const outPath = join(outDir, `${page.name}.png`);
  const inputMtimes = [
    ...staticInputs,
    ...page.inputs.map((p) => statSync(p).mtimeMs),
  ];
  if (existsSync(outPath) && statSync(outPath).mtimeMs > Math.max(...inputMtimes)) {
    skipped += 1;
    continue;
  }
  const svg = await satori(page.el, { width: W, height: H, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
  if (png.length > MAX_BYTES) {
    console.warn(
      `generate-og-images: ${page.name}.png is ${Math.round(png.length / 1024)} KB ` +
        `(over the ~300 KB budget) — consider simplifying the card`,
    );
  }
  writeFileSync(outPath, png);
  generated += 1;
}

console.log(`og-images: ${generated} generated, ${skipped} up-to-date (${pages.length} total)`);
