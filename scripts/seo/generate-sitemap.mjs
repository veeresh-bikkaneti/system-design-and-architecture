/**
 * Generates `public/sitemap.xml` (copied to `dist/` by the Vite build).
 *
 * 39 URLs: `/`, `/roadmap`, `/badges`, and one `/lesson/<slug>/` per lesson.
 * `/badges/:id` detail pages are intentionally excluded — 76 thin,
 * non-keyword-targeted pages; `/badges` is the indexable entry point.
 *
 * `<lastmod>` comes from real per-file git history so it reflects actual
 * content freshness (never a uniform build date). Google ignores `<priority>`
 * and `<changefreq>`, so they are omitted.
 *
 * Runs automatically via `prebuild`, before `vite build` copies `public/`.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { repoRoot, loadLessonMetas, siteConfig } from './lesson-meta.mjs';

const { siteUrl } = siteConfig();

function lastModFor(paths) {
  try {
    const out = execFileSync(
      'git',
      ['log', '-1', '--format=%cI', '--', ...paths],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    // Caveat: a bulk reformat commit touching every lesson would poison these
    // dates. Prefer targeted content commits; the date is informational only.
    return out || new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const metas = loadLessonMetas();

const urls = [
  { loc: siteUrl, lastmod: lastModFor(['index.html', 'src/pages/HomePage.tsx']) },
  { loc: `${siteUrl}roadmap/`, lastmod: lastModFor(['src/pages/RoadmapPage.tsx']) },
  { loc: `${siteUrl}badges/`, lastmod: lastModFor(['src/pages/BadgesPage.tsx']) },
  ...metas.map((m) => ({
    loc: `${siteUrl}lesson/${m.slug}/`,
    lastmod: lastModFor([`content/lessons/${m.slug}.mdx`]),
  })),
];

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls
    .map(
      (u) =>
        `  <url>\n    <loc>${esc(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`,
    )
    .join('\n') +
  `\n</urlset>\n`;

writeFileSync(join(repoRoot, 'public', 'sitemap.xml'), xml);
console.log(`sitemap.xml: ${urls.length} URLs`);
if (urls.length !== 39) {
  console.warn(
    `warning: expected 39 URLs, got ${urls.length} — update this check if the route set intentionally changed`,
  );
}
