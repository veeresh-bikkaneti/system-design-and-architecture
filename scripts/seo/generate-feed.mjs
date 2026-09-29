/**
 * Generates `public/feed.xml` (copied to `dist/` by the Vite build) — an RSS
 * 2.0 feed of all lessons so readers can subscribe in any feed reader.
 *
 * One `<item>` per lesson: title, link, summary as description, tier as
 * category, and `<pubDate>` from real per-file git history (same approach as
 * `generate-sitemap.mjs` — reflects actual content freshness).
 * `<lastBuildDate>` is the generation time.
 *
 * The feed is advertised with
 * `<link rel="alternate" type="application/rss+xml">` in `index.html`.
 *
 * Runs automatically via `prebuild`, before `vite build` copies `public/`.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { repoRoot, loadLessonMetas, siteConfig } from './lesson-meta.mjs';

const { siteUrl } = siteConfig();

const CHANNEL_TITLE = 'System Design Mastery';
const CHANNEL_DESCRIPTION =
  'A free system design course — 36 lessons from beginner to master, with interactive quizzes and an AI tutor.';

function lastModFor(paths) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', ...paths], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/** RFC-822 date for RSS `<pubDate>` (git gives ISO-8601). */
function toRfc822(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const tierLabels = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

const metas = loadLessonMetas();

const items = metas
  .map((m) => {
    const link = `${siteUrl}lesson/${m.slug}/`;
    const pubDate = toRfc822(lastModFor([`content/lessons/${m.slug}.mdx`]));
    return (
      `    <item>\n` +
      `      <title>${esc(m.title)}</title>\n` +
      `      <link>${esc(link)}</link>\n` +
      `      <guid isPermaLink="true">${esc(link)}</guid>\n` +
      `      <description>${esc(m.summary)}</description>\n` +
      `      <category>${esc(tierLabels[m.tier])}</category>\n` +
      `      <pubDate>${pubDate}</pubDate>\n` +
      `    </item>`
    );
  })
  .join('\n');

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<rss version="2.0">\n` +
  `  <channel>\n` +
  `    <title>${esc(CHANNEL_TITLE)}</title>\n` +
  `    <link>${esc(siteUrl)}</link>\n` +
  `    <description>${esc(CHANNEL_DESCRIPTION)}</description>\n` +
  `    <language>en</language>\n` +
  `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n` +
  `${items}\n` +
  `  </channel>\n` +
  `</rss>\n`;

writeFileSync(join(repoRoot, 'public', 'feed.xml'), xml);
console.log(`feed.xml: ${metas.length} items`);
