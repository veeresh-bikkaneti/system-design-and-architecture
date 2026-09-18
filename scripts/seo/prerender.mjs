/**
 * Prerenders SEO-critical routes to static HTML after `vite build`.
 *
 * The problem: this is a client-rendered SPA, so the raw HTML GitHub Pages
 * serves is an empty `<div id="root">` — crawlers (and raw-HTML AI fetchers
 * like OAI-SearchBot / PerplexityBot / Claude-SearchBot) see zero lesson
 * content, and every lesson lived behind a `#` fragment (one indexable URL).
 *
 * What this does: for each of the 39 indexable routes it writes a real static
 * HTML file (`lesson/<slug>/index.html`, …) containing the full SEO `<head>`
 * (title, description, canonical, Open Graph, JSON-LD) and the route's text
 * content in raw HTML. GitHub Pages serves these with HTTP 200.
 *
 * On boot, the SPA's `createRoot` replaces `#root` with the interactive app —
 * the static HTML is the crawlable/no-JS snapshot, the client takes over for
 * humans. Also writes `dist/404.html` (the app shell) as a fallback so
 * client-side routes like `/badges/:id` still boot when visited directly.
 *
 * Runs automatically at the end of `npm run build`.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot, loadLessonMetas, siteConfig, lessonsDir } from './lesson-meta.mjs';
import { evaluate } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const { base, siteUrl } = siteConfig();
const distDir = join(repoRoot, 'dist');
const template = readFileSync(join(distDir, 'index.html'), 'utf8');

if (!/<script type="module"[^>]*src="[^"]*\/assets\//.test(template)) {
  throw new Error(
    'prerender: dist/index.html has no Vite entry script — run `vite build` first',
  );
}
const rootMountHtml = '<div id="root"></div>';

const metas = loadLessonMetas();

/* ------------------------------------------------------------------ */
/* small HTML helpers                                                  */
/* ------------------------------------------------------------------ */

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const SITE_NAME = 'System Design Mastery';
const SITE_DESCRIPTION =
  'Learn system design progressively, from beginner to master, with an AI tutor that draws you the diagrams.';

/** Mirror of src/components/headings.ts `slugifyHeading` — keep in sync. */
function slugifyHeading(text) {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return slug === '' ? 'section' : slug;
}

/** Plain-text extraction from jsx-runtime children (mirrors App.tsx). */
function textOf(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'object' && node.props) return textOf(node.props.children);
  return '';
}

/* ------------------------------------------------------------------ */
/* static MDX components — text content only, no interactivity          */
/* ------------------------------------------------------------------ */

// Interactive diagrams/sims render a labeled placeholder in the static
// snapshot; the client hydrates the real thing on boot.
const interactivePlaceholder = (name) => () =>
  jsx('div', {
    className: 'interactive-placeholder',
    children: jsx('p', { children: `Interactive diagram: ${name} (loads in the app)` }),
  });

const INTERACTIVE_COMPONENTS = [
  'PacketFlow',
  'HashRingPlayground',
  'NapkinMathPlayground',
  'ScrollyDiagram',
  'StepThrough',
  'VsToggle',
  'LoadBalancerSim',
  'SlidingWindowSim',
  'CacheFlow',
  'CdnFlow',
];

function isMermaidPre(props) {
  const child = props.children;
  const className =
    child && typeof child === 'object' ? child.props?.className ?? '' : '';
  return className.includes('language-mermaid');
}

function rewriteHref(href) {
  if (!href) return href;
  if (href.startsWith('#')) return href; // in-page anchor
  if (href.startsWith('/')) {
    // Internal route link (MDX sources use `/lesson/<slug>` form): prefix the
    // Pages base path so the static snapshot links resolve.
    const path = href.replace(/^\//, '');
    return `${base}${path}`.replace(/([^/])$/, '$1/');
  }
  return href;
}

const staticMdxComponents = {
  // Quiz: questions are public content; the answer key is NOT rendered —
  // marking correct answers in raw HTML would publish it to view-source.
  Quiz: ({ questions = [] }) =>
    jsx('section', {
      className: 'quiz-static',
      children: [
        jsx('h2', { id: 'quiz', children: 'Check your understanding' }, 'h'),
        jsx(
          'ol',
          {
            children: questions.map((q, i) =>
              jsx(
                'li',
                {
                  children: [
                    jsx('p', { children: jsx('strong', { children: q.question }) }, `q${i}`),
                    jsx(
                      'ul',
                      {
                        children: (q.options ?? []).map((opt, j) =>
                          jsx('li', { children: opt }, `o${j}`),
                        ),
                      },
                      `opts${i}`,
                    ),
                  ],
                },
                `q${i}`,
              ),
            ),
          },
          'qs',
        ),
      ],
    }),
  VideoCard: ({ videoId, title, source, description }) =>
    jsx('p', {
      className: 'video-static',
      children: [
        'Video: ',
        jsx('a', { href: `https://www.youtube.com/watch?v=${videoId}`, children: title }, 'a'),
        source ? ` — ${source}` : '',
        description ? jsx('br', {}, 'br') : null,
        description ?? '',
      ],
    }),
  MermaidDiagram: ({ code }) =>
    jsx('pre', {
      children: jsx('code', { className: 'language-mermaid', children: code }),
    }),
  pre: (props) =>
    isMermaidPre(props)
      ? jsx('pre', {
          children: jsx('code', {
            className: 'language-mermaid',
            children: textOf(props.children).trim(),
          }),
        })
      : jsx('pre', { ...props }),
  h2: (props) => {
    const title = textOf(props.children);
    return jsx('h2', { ...props, id: slugifyHeading(title) });
  },
  a: (props) => jsx('a', { ...props, href: rewriteHref(props.href) }),
  table: (props) =>
    jsx('div', { className: 'table-scroll', children: jsx('table', { ...props }) }),
  ...Object.fromEntries(
    INTERACTIVE_COMPONENTS.map((name) => [name, interactivePlaceholder(name)]),
  ),
};

const mdxCache = new Map();

/** Compile one lesson's MDX body to static HTML (no interactivity). */
async function renderLessonBody(slug) {
  if (mdxCache.has(slug)) return mdxCache.get(slug);
  const source = readFileSync(join(lessonsDir, `${slug}.mdx`), 'utf8');
  const { default: Content } = await evaluate(source, {
    jsx,
    jsxs,
    Fragment,
    remarkPlugins: [remarkGfm],
  });
  const html = renderToStaticMarkup(
    jsx(Content, { components: staticMdxComponents }),
  );
  mdxCache.set(slug, html);
  return html;
}

/* ------------------------------------------------------------------ */
/* <head> builders                                                     */
/* ------------------------------------------------------------------ */

function headTags({ title, description, canonical, jsonLd }) {
  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
  ];
  if (jsonLd) {
    // Escape `<` as \u003c: a literal `</script>` inside JSON (e.g. from a
    // lesson title) would otherwise terminate the script block and allow
    // HTML/script injection. \u003c is a valid JSON string escape that
    // JSON.parse decodes back to `<`, so structured-data consumers are
    // unaffected.
    const safeJson = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
    tags.push(`<script type="application/ld+json">${safeJson}</script>`);
  }
  return tags.join('\n    ');
}

function siteJsonLd() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${siteUrl}#website`,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      url: siteUrl,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${siteUrl}#organization`,
      name: SITE_NAME,
      url: siteUrl,
      sameAs: ['https://github.com/veeresh-bikkaneti/system-design-and-architecture'],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Course',
      '@id': `${siteUrl}#course`,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      url: siteUrl,
      provider: { '@id': `${siteUrl}#organization` },
      numberOfLessons: metas.length,
      isAccessibleForFree: true,
    },
  ];
}

function lessonJsonLd(meta, canonical) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'LearningResource',
      '@id': `${canonical}#learning-resource`,
      name: meta.title,
      description: meta.summary,
      url: canonical,
      isPartOf: { '@id': `${siteUrl}#course` },
      position: meta.order,
      timeRequired: `PT${meta.estimatedMinutes}M`,
      isAccessibleForFree: true,
      inLanguage: 'en',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
        {
          '@type': 'ListItem',
          position: 2,
          name: meta.title,
          item: canonical,
        },
      ],
    },
  ];
}

const tierLabels = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

function lessonLinkList(lessons, headingLevel = 2) {
  const tiers = ['beginner', 'intermediate', 'advanced'];
  return tiers
    .map((tier) => {
      const items = lessons
        .filter((m) => m.tier === tier)
        .map(
          (m) =>
            `<li><a href="${base}lesson/${m.slug}/">${esc(m.title)}</a><p>${esc(m.summary)}</p></li>`,
        )
        .join('\n');
      if (!items) return '';
      const H = `h${headingLevel}`;
      return `<${H}>${tierLabels[tier]}</${H}>\n<ul>\n${items}\n</ul>`;
    })
    .join('\n');
}

/* ------------------------------------------------------------------ */
/* route builders                                                      */
/* ------------------------------------------------------------------ */

async function buildHome() {
  const canonical = siteUrl;
  const body = `<h1>${esc(SITE_NAME)}</h1>
<p>${esc(SITE_DESCRIPTION)} Thirty-six lessons across three tiers — beginner, intermediate, advanced — each with an interactive quiz and an AI tutor that sketches the architecture with you.</p>
<nav aria-label="All lessons">
${lessonLinkList(metas)}
</nav>`;
  return {
    out: 'index.html',
    head: headTags({
      title: `${SITE_NAME} — Learn System Design from Zero to Master`,
      description: SITE_DESCRIPTION,
      canonical,
      jsonLd: siteJsonLd(),
    }),
    body,
  };
}

async function buildRoadmap() {
  const canonical = `${siteUrl}roadmap/`;
  const body = `<h1>Roadmap</h1>
<p>The full learning path: every lesson in syllabus order, grouped by tier. Complete each tier to unlock the next.</p>
${lessonLinkList(metas)}`;
  return {
    out: 'roadmap/index.html',
    head: headTags({
      title: `Roadmap | ${SITE_NAME}`,
      description:
        'The complete system design learning path: 36 lessons from beginner to advanced, in syllabus order.',
      canonical,
    }),
    body,
  };
}

async function buildLesson(meta) {
  const canonical = `${siteUrl}lesson/${meta.slug}/`;
  const staticBody = await renderLessonBody(meta.slug);
  const index = metas.findIndex((m) => m.slug === meta.slug);
  const prev = index > 0 ? metas[index - 1] : null;
  const next = index < metas.length - 1 ? metas[index + 1] : null;
  const nav = `<nav aria-label="Lesson navigation"><ul>` +
    (prev ? `<li>Previous: <a href="${base}lesson/${prev.slug}/">${esc(prev.title)}</a></li>` : '') +
    (next ? `<li>Next: <a href="${base}lesson/${next.slug}/">${esc(next.title)}</a></li>` : '') +
    `</ul></nav>`;
  const body = `<nav aria-label="Breadcrumb"><ol><li><a href="${base}">Home</a></li><li>${esc(tierLabels[meta.tier])}</li><li aria-current="page">${esc(meta.title)}</li></ol></nav>
<h1>${esc(meta.title)}</h1>
<p>${esc(meta.summary)}</p>
<p>${esc(tierLabels[meta.tier])} · ${meta.estimatedMinutes} min read</p>
<article>
${staticBody}
</article>
${nav}`;
  return {
    out: `lesson/${meta.slug}/index.html`,
    head: headTags({
      title: `${meta.title} | ${SITE_NAME}`,
      description: meta.summary,
      canonical,
      jsonLd: lessonJsonLd(meta, canonical),
    }),
    body,
  };
}

async function buildBadges() {
  const canonical = `${siteUrl}badges/`;
  const tierBadges = ['beginner', 'intermediate', 'advanced']
    .map((t) => `<li>${tierLabels[t]} Tier Complete — finish every ${tierLabels[t]} lesson.</li>`)
    .join('\n');
  const body = `<h1>Your badges</h1>
<p>Earn badges as you learn: one per lesson, one per perfect quiz, one per tier, and the System Design Master badge for completing all ${metas.length} lessons.</p>
<ul>
<li><strong>System Design Master</strong> — complete every lesson in the course.</li>
${tierBadges}
</ul>
<p>Unlock badges by learning in the app — <a href="${base}">start with lesson one</a>.</p>`;
  return {
    out: 'badges/index.html',
    head: headTags({
      title: `Badges | ${SITE_NAME}`,
      description:
        'Earn badges as you learn system design: per-lesson, per-quiz, per-tier, and the System Design Master badge.',
      canonical,
    }),
    body,
  };
}

/* ------------------------------------------------------------------ */
/* assemble                                                            */
/* ------------------------------------------------------------------ */

/* Every SEO tag the prerenderer manages. Stripped before injection so
 * re-runs (and the template's own homepage defaults) never duplicate. */
const SEO_TAG_RES = [
  /<title>[\s\S]*?<\/title>/,
  /<meta\s+name="description"[^>]*>\s*/g,
  /<link\s+rel="canonical"[^>]*>\s*/g,
  /<meta\s+property="og:[^"]*"[^>]*>\s*/g,
  /<meta\s+name="twitter:[^"]*"[^>]*>\s*/g,
  /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>\s*/g,
];

function applyRoute(tpl, { head, body }) {
  let html = tpl;
  // On a re-run the template carries the previous run's head block — swap
  // the whole sentinel block for the injection placeholder.
  html = html.replace(
    /<!--prerender-head-->[\s\S]*?<!--\/prerender-head-->\s*/,
    '__SEO_HEAD__',
  );
  // 1. Swap <title> for a placeholder marking the injection point.
  // (If a previous run left the template title-less, fall back to the top
  // of <head> so the script self-heals instead of silently emitting no tags.)
  if (html.includes('__SEO_HEAD__') === false) {
    if (/<title>[\s\S]*?<\/title>/.test(html)) {
      html = html.replace(/<title>[\s\S]*?<\/title>/, '__SEO_HEAD__');
    } else {
      html = html.replace(/<head[^>]*>/, (m) => `${m}__SEO_HEAD__`);
    }
  }
  // 2. Strip every other managed SEO tag (template defaults on a fresh
  //    build, or the previous run's tags on a re-run) so nothing duplicates.
  for (const re of SEO_TAG_RES.slice(1)) html = html.replace(re, '');
  // 3. Inject the route's head block.
  const wrappedHead = `<!--prerender-head-->\n    ${head}\n    <!--/prerender-head-->`;
  html = html.replace('__SEO_HEAD__', wrappedHead);
  // 4. Inject the static body, wrapped in sentinels so re-runs replace it
  //    instead of nesting or failing. A root div with content but no
  //    sentinel means an unknown template state — fail loudly rather than
  //    ship a page with another route's body.
  const sentinel = /<!--prerender-body-->[\s\S]*?<!--\/prerender-body-->/;
  const wrappedBody = `<!--prerender-body-->${body}<!--/prerender-body-->`;
  if (sentinel.test(html)) {
    html = html.replace(sentinel, wrappedBody);
  } else if (html.includes(rootMountHtml)) {
    html = html.replace(rootMountHtml, `<div id="root">${wrappedBody}</div>`);
  } else {
    throw new Error(
      'prerender: <div id="root"> has content but no prerender sentinel — ' +
        'run `vite build` for a fresh template before prerendering',
    );
  }
  return html;
}

const routes = [await buildHome(), await buildRoadmap(), await buildBadges()];
for (const meta of metas) routes.push(await buildLesson(meta));

for (const route of routes) {
  const outPath = join(distDir, route.out);
  mkdirSync(join(outPath, '..'), { recursive: true });
  writeFileSync(outPath, applyRoute(template, route));
  // Fail loudly if a route somehow rendered empty — an empty prerender is
  // worse than no prerender because it looks intentional.
  const written = readFileSync(outPath, 'utf8');
  if (!written.includes('<h1>')) {
    throw new Error(`prerender: ${route.out} has no <h1> — aborting`);
  }
}

// 404.html: the plain app shell (no static content) so client-side routes
// like /badges/:id still boot when visited directly. Served with a 404
// status by Pages — crawlers won't index it, which is the intent.
writeFileSync(join(distDir, '404.html'), template);

console.log(`prerender: ${routes.length} routes + 404.html`);
