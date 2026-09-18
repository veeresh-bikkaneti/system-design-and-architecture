/**
 * Shared build-time helpers for SEO scripts.
 *
 * Parses the `export const meta = {...}` block at the top of each
 * `content/lessons/*.mdx` file so Node scripts (manifest generator, sitemap,
 * prerenderer) share one source of lesson metadata without importing the
 * Vite-bundled modules.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const lessonsDir = join(repoRoot, 'content', 'lessons');

const REQUIRED_META_FIELDS = [
  'slug',
  'title',
  'tier',
  'order',
  'summary',
  'estimatedMinutes',
];

/** Extract and validate the `meta` object from one MDX source file. */
export function extractMeta(source, file) {
  const match = source.match(/export const meta = (\{[\s\S]*?\n\});/);
  if (!match) throw new Error(`${file}: no \`export const meta = {...}\` block found`);
  // The meta block is a static object literal authored in our own content
  // files (validated separately by `npm run content:validate`).
  const meta = new Function(`return (${match[1]});`)();
  for (const field of REQUIRED_META_FIELDS) {
    if (meta[field] === undefined || meta[field] === null || meta[field] === '') {
      throw new Error(`${file}: meta.${field} is missing`);
    }
  }
  if (!['beginner', 'intermediate', 'advanced'].includes(meta.tier)) {
    throw new Error(`${file}: meta.tier must be a valid tier`);
  }
  return meta;
}

/** All lesson metas, sorted by `order` (the syllabus sequence). */
export function loadLessonMetas() {
  const files = readdirSync(lessonsDir)
    .filter((f) => f.endsWith('.mdx'))
    .sort();
  const metas = files.map((f) =>
    extractMeta(readFileSync(join(lessonsDir, f), 'utf8'), f),
  );
  const slugs = new Set();
  for (const meta of metas) {
    if (slugs.has(meta.slug)) throw new Error(`duplicate lesson slug: ${meta.slug}`);
    slugs.add(meta.slug);
  }
  return metas.sort((a, b) => a.order - b.order);
}

/**
 * Site URL configuration. `VITE_BASE_PATH` mirrors vite.config.ts
 * (`base: process.env.VITE_BASE_PATH ?? '/'`).
 */
export function siteConfig() {
  const base = process.env.VITE_BASE_PATH ?? '/';
  const origin = 'https://veeresh-bikkaneti.github.io';
  const siteUrl = `${origin}${base}`;
  return { base, origin, siteUrl };
}
