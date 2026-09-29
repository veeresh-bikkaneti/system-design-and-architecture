import { expect, test, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Course-wide diagram layout regression test.
 *
 * Guards against the 2026-09-29 diagram cropping incident: Mermaid v12
 * positions flowchart/state nodes via `transform="translate(x, y)"`
 * attributes, and the `.mermaid-diagram .node` entrance animation used to
 * animate the CSS `transform` property, which overrides those attributes for
 * the animation's whole fill window. Every flowchart/state node piled up at
 * the SVG origin as a clipped sliver in the container's top-left corner.
 * The fix uses the individual `translate` property, which composes with the
 * attribute instead of replacing it.
 *
 * This spec loads every lesson that contains a fenced mermaid block, waits
 * for every diagram to render, and fails if any rendered node/actor lies
 * outside its SVG viewport (with a small tolerance for label overflow).
 * The lesson list is derived from the MDX sources at test time, so new
 * lessons and new diagrams are covered automatically.
 *
 * Environment note: this sandbox's Chromium build blocks direct navigations
 * to localhost (Local Network Access checks), so like e2e/smoke.spec.ts this
 * spec proxies the test server through Node fetch via request interception.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = 'http://127.0.0.1:4173'; // matches playwright.config.ts webServer port
const SETTLE_MS = 2500; // entrance animation is 0.6s + cascade delays; wait it out
const TOLERANCE_PX = 4; // mermaid labels may overflow node boxes by a hair

/** Proxy the local test server through Node fetch (see note above). */
async function proxyLocalServer(page: Page): Promise<void> {
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== '127.0.0.1') {
      await route.continue();
      return;
    }
    const upstream = await fetch(`${TARGET}${url.pathname}${url.search}`, {
      method: req.method(),
      headers: req.headers() as HeadersInit,
      body: ['GET', 'HEAD'].includes(req.method())
        ? undefined
        : await req.postDataBuffer().catch(() => undefined),
      redirect: 'manual',
    });
    const headers: Record<string, string> = {};
    upstream.headers.forEach((v, k) => {
      headers[k] = v;
    });
    await route.fulfill({
      status: upstream.status,
      headers,
      body: Buffer.from(await upstream.arrayBuffer()),
    });
  });
}

interface LessonCase {
  slug: string;
  diagramCount: number;
}

function allLessonSlugs(): string[] {
  const dir = join(repoRoot, 'content', 'lessons');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => f.slice(0, -4));
}

function lessonsWithDiagrams(): LessonCase[] {
  const dir = join(repoRoot, 'content', 'lessons');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => {
      const src = readFileSync(join(dir, f), 'utf8');
      const diagramCount = (src.match(/^```mermaid$/gm) ?? []).length;
      return { slug: f.slice(0, -4), diagramCount };
    })
    .filter((l) => l.diagramCount > 0)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

interface Outlier {
  slug: string;
  diagram: number;
  kind: 'node' | 'actor';
  label: string;
  detail: string;
}

test('every mermaid node/actor renders inside its SVG viewport', async ({
  page,
}) => {
  test.setTimeout(600_000); // 36 heavy lesson pages in one sweep
  const lessons = lessonsWithDiagrams();
  expect(lessons.length).toBeGreaterThan(30); // sanity: the sweep must stay course-wide

  await proxyLocalServer(page);

  // Lessons unlock tier-by-tier as earlier tiers are completed (see
  // src/lib/progress-gate.ts); a locked lesson renders a gate instead of its
  // diagrams. Seed every lesson as complete so the sweep sees real content.
  // The store persists via zustand/middleware under this key/shape.
  await page.addInitScript((slugs: string[]) => {
    window.localStorage.setItem(
      'sdm-progress',
      JSON.stringify({
        state: {
          completedLessons: slugs,
          quizResults: {},
          seenBadges: [],
          celebratedBadges: [],
        },
        version: 0,
      }),
    );
  }, allLessonSlugs());

  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));

  const outliers: Outlier[] = [];
  let checkedDiagrams = 0;

  for (const { slug, diagramCount } of lessons) {
    await page.goto(`${TARGET}/lesson/${slug}`, { timeout: 60_000 });
    const diagrams = page.locator('.mermaid-diagram');
    await expect(diagrams).toHaveCount(diagramCount, { timeout: 45_000 });
    await page.waitForTimeout(SETTLE_MS); // let entrance animations finish

    const found: Outlier[] = await page.$$eval(
      '.mermaid-diagram',
      (els, tol) =>
        els.flatMap((el, diagram) => {
          const svg = el.querySelector('svg');
          if (!svg) return [];
          const vp = svg.getBoundingClientRect();
          const bad: {
            diagram: number;
            kind: 'node' | 'actor';
            label: string;
            detail: string;
          }[] = [];
          for (const kind of ['node', 'actor'] as const) {
            for (const n of svg.querySelectorAll(`.${kind}`)) {
              const r = (n as SVGGraphicsElement).getBoundingClientRect();
              if (r.width === 0 && r.height === 0) continue; // hidden/filtered
              const label = (n.textContent ?? '').trim().slice(0, 40);
              const outside =
                r.left < vp.left - tol ||
                r.top < vp.top - tol ||
                r.right > vp.right + tol ||
                r.bottom > vp.bottom + tol;
              if (outside) {
                bad.push({
                  diagram,
                  kind,
                  label,
                  detail:
                    `node rect (${r.left.toFixed(0)},${r.top.toFixed(0)},` +
                    `${r.width.toFixed(0)}x${r.height.toFixed(0)}) outside ` +
                    `viewport (${vp.left.toFixed(0)},${vp.top.toFixed(0)},` +
                    `${vp.width.toFixed(0)}x${vp.height.toFixed(0)})`,
                });
              }
            }
          }
          return bad;
        }),
      TOLERANCE_PX,
    );
    checkedDiagrams += diagramCount;
    for (const o of found) outliers.push({ slug, ...o });
  }

  expect(pageErrors, `JS errors on lesson pages: ${pageErrors.join(' | ')}`).toEqual([]);
  expect(
    outliers,
    outliers.length
      ? `nodes/actors outside their SVG viewport:\n` +
        outliers.map((o) => `  ${o.slug} diagram#${o.diagram} [${o.kind} "${o.label}"] ${o.detail}`).join('\n')
      : 'all nodes inside viewports',
  ).toEqual([]);
  expect(checkedDiagrams).toBeGreaterThan(70); // the full affected inventory
});
