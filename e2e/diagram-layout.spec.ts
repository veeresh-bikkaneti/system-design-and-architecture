import { expect, test, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { revealLazyDiagrams } from './reveal-lazy-diagrams';

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
 * for every diagram to render, and asserts:
 *  - every node/actor rect lies inside its SVG viewport (with a small
 *    tolerance for label overflow);
 *  - nodes/actors are NOT piled at the origin (max pairwise center distance
 *    must exceed PILE_PX). NOTE: piled nodes still sit *inside* the viewport,
 *    so the viewport check alone cannot catch the original bug — the piling
 *    check is the true regression guard for 2202ae9;
 *  - every edge/label element (links, edge labels, sequence message lines,
 *    state transitions, loops, notes, clusters) lies inside the viewport;
 *  - every token-carrying edge keeps TOKEN_GLOW_PX clearance from the
 *    viewport edge, so the traveling `.flow-token` drop-shadow glow
 *    (diagrams.css) is never clipped by the SVG viewport;
 *  - the `.mermaid-diagram` scroll container never clips vertically
 *    (overflow-x-auto must not produce a vertical scrollbar);
 *  - every StepThrough diagram: walking all steps, each highlighted node's
 *    pulsing amber glow (drop-shadow up to 7px, diagrams.css) keeps
 *    HIGHLIGHT_GLOW_PX clearance inside its SVG viewBox.
 *
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
const PILE_PX = 40; // max pairwise node-center distance below this = piled at origin
const TOKEN_GLOW_PX = 12; // token r=4 + drop-shadow blur 5 + margin
const HIGHLIGHT_GLOW_PX = 12; // stepthrough drop-shadow blur 7 + margin

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
  kind: 'node' | 'actor' | 'piling' | 'edge' | 'token-glow' | 'container-clip' | 'stepthrough-glow';
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
  let checkedStepThroughs = 0;

  for (const { slug, diagramCount } of lessons) {
    await page.goto(`${TARGET}/lesson/${slug}`, { timeout: 60_000 });
    // Diagrams are viewport-gated (lazyMdx + IntersectionObserver, PR #44):
    // placeholders below the fold never load until scrolled near.
    await revealLazyDiagrams(page);
    const diagrams = page.locator('.mermaid-diagram');
    await expect(diagrams).toHaveCount(diagramCount, { timeout: 45_000 });
    await page.waitForTimeout(SETTLE_MS); // let entrance animations finish

    const found: Outlier[] = await page.$$eval(
      '.mermaid-diagram',
      (els, opts) =>
        els.flatMap((el, diagram) => {
          const { tol, pilePx, tokenGlowPx } = opts as {
            tol: number;
            pilePx: number;
            tokenGlowPx: number;
          };
          const svg = el.querySelector('svg');
          if (!svg) return [];
          const vp = svg.getBoundingClientRect();
          const bad: {
            diagram: number;
            kind: 'node' | 'actor' | 'piling' | 'edge' | 'token-glow' | 'container-clip';
            label: string;
            detail: string;
          }[] = [];
          const rectOf = (n: Element) => (n as SVGGraphicsElement).getBoundingClientRect();
          const inside = (r: DOMRect, margin: number) =>
            !(
              r.left < vp.left - margin ||
              r.top < vp.top - margin ||
              r.right > vp.right + margin ||
              r.bottom > vp.bottom + margin
            );

          // 1. node/actor viewport containment (original check).
          const centers: { x: number; y: number }[] = [];
          for (const kind of ['node', 'actor'] as const) {
            for (const n of svg.querySelectorAll(`.${kind}`)) {
              const r = rectOf(n);
              if (r.width === 0 && r.height === 0) continue; // hidden/filtered
              centers.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
              const label = (n.textContent ?? '').trim().slice(0, 40);
              if (!inside(r, tol)) {
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

          // 2. piling guard: the 2202ae9 bug piled every node at the SVG
          // origin — piled nodes are still *inside* the viewport, so check 1
          // cannot see it. Distinct laid-out nodes are never within pilePx
          // of each other.
          if (centers.length >= 2) {
            let maxDist = 0;
            for (let i = 0; i < centers.length; i += 1) {
              for (let j = i + 1; j < centers.length; j += 1) {
                const d = Math.hypot(centers[i].x - centers[j].x, centers[i].y - centers[j].y);
                if (d > maxDist) maxDist = d;
              }
            }
            if (maxDist < pilePx) {
              bad.push({
                diagram,
                kind: 'piling',
                label: `${centers.length} nodes`,
                detail: `max pairwise node-center distance ${maxDist.toFixed(1)}px < ${pilePx}px — nodes piled at origin (2202ae9 regression)`,
              });
            }
          }

          // 3. edge/label containment.
          const EDGE_SELECTORS =
            '.flowchart-link, .edgePath, .edgeLabel, .messageLine0, .messageLine1, .transition, .loopLine, .loopText, .note, .cluster';
          for (const n of svg.querySelectorAll(EDGE_SELECTORS)) {
            const r = rectOf(n);
            if (r.width === 0 && r.height === 0) continue;
            const label = (n.textContent ?? '').trim().slice(0, 40) || (n as SVGElement).className?.baseVal || '?';
            if (!inside(r, tol)) {
              bad.push({
                diagram,
                kind: 'edge',
                label,
                detail:
                  `edge/label rect (${r.left.toFixed(0)},${r.top.toFixed(0)},` +
                  `${r.width.toFixed(0)}x${r.height.toFixed(0)}) outside viewport`,
              });
            }
          }

          // 4. token-glow clearance: traveling .flow-token circles (r=4,
          // drop-shadow blur 5) ride these edges; if an edge passes within
          // tokenGlowPx of the viewport edge, the glow clips.
          const TOKEN_EDGE_SELECTORS =
            '.flowchart-link, .messageLine0, .messageLine1, .transition';
          for (const n of svg.querySelectorAll(TOKEN_EDGE_SELECTORS)) {
            const r = rectOf(n);
            if (r.width === 0 && r.height === 0) continue;
            if (!inside(r, tokenGlowPx)) {
              const clearance = Math.min(
                r.left - vp.left,
                r.top - vp.top,
                vp.right - r.right,
                vp.bottom - r.bottom,
              );
              bad.push({
                diagram,
                kind: 'token-glow',
                label: (n.textContent ?? '').trim().slice(0, 30) || 'edge',
                detail: `token edge within ${clearance.toFixed(1)}px of viewport edge (< ${tokenGlowPx}px glow margin) — traveling token glow clips`,
              });
            }
          }

          // 5. container vertical clipping: .mermaid-diagram is
          // overflow-x-auto (overflow-y computes to auto); a vertical
          // scrollbar here means the diagram is cropped for the reader.
          const htmlEl = el as HTMLElement;
          if (htmlEl.scrollHeight > htmlEl.clientHeight + tol) {
            bad.push({
              diagram,
              kind: 'container-clip',
              label: 'scroll container',
              detail: `vertical overflow: scrollHeight ${htmlEl.scrollHeight}px > clientHeight ${htmlEl.clientHeight}px`,
            });
          }

          return bad;
        }),
      { tol: TOLERANCE_PX, pilePx: PILE_PX, tokenGlowPx: TOKEN_GLOW_PX },
    );
    checkedDiagrams += diagramCount;
    for (const o of found) outliers.push({ slug, ...o });

    // 6. StepThrough glow sweep: walk every step of every StepThrough
    // diagram; highlighted nodes carry a pulsing drop-shadow (up to 7px
    // blur, diagrams.css). The svg must allow the glow to paint past its
    // viewBox (overflow: visible — see diagrams.css); if it clips, each
    // highlighted node needs HIGHLIGHT_GLOW_PX clearance inside the
    // viewport or the amber pulse is sliced.
    const stepThroughOutliers: Outlier[] = await page.evaluate(
      async (glowPx: number) => {
        const bad: { kind: 'stepthrough-glow'; label: string; detail: string }[] = [];
        const stepGroups = [...document.querySelectorAll('[role="group"][aria-label="Steps"]')];
        for (const [panelIdx, stepGroup] of stepGroups.entries()) {
          // Step dots are plain buttons (not tabs — see StepThrough.tsx).
          const tabs = [...stepGroup.querySelectorAll('button')] as HTMLElement[];
          // The step group div sits inside the StepThrough controls div, whose
          // parent is the panel root that also holds the diagram svg.
          const root = stepGroup.parentElement?.parentElement;
          const svg = root?.querySelector('svg') as SVGSVGElement | null;
          if (!svg || tabs.length === 0) continue;
          // Production invariant: the svg must not clip the highlight glow.
          // With overflow: visible the halo paints past the viewBox freely.
          // If the invariant is ever violated, walk every step and report
          // which highlighted nodes would have their glow sliced.
          if (getComputedStyle(svg).overflow === 'visible') continue;
          bad.push({
            kind: 'stepthrough-glow',
            label: `panel#${panelIdx}`,
            detail: `StepThrough svg clips at its viewBox (overflow: ${getComputedStyle(svg).overflow}) — highlight glow is sliced on edge nodes`,
          });
          for (const [stepIdx, tab] of tabs.entries()) {
            tab.click();
            await new Promise((r) => setTimeout(r, 150)); // let React re-render the highlight
            const vp = svg.getBoundingClientRect();
            for (const g of svg.querySelectorAll('.stepthrough-highlight')) {
              const r = (g as SVGGraphicsElement).getBoundingClientRect();
              if (r.width === 0 && r.height === 0) continue;
              const clearance = Math.min(
                r.left - vp.left,
                r.top - vp.top,
                vp.right - r.right,
                vp.bottom - r.bottom,
              );
              if (clearance < glowPx) {
                const label = (g.textContent ?? '').trim().slice(0, 40);
                bad.push({
                  kind: 'stepthrough-glow',
                  label: `panel#${panelIdx} step#${stepIdx} "${label}"`,
                  detail: `highlighted node within ${clearance.toFixed(1)}px of SVG viewport edge (< ${glowPx}px glow margin) — amber pulse clips`,
                });
              }
            }
          }
        }
        return bad;
      },
      HIGHLIGHT_GLOW_PX,
    );
    const stepGroupCount = await page.locator('[role="group"][aria-label="Steps"]').count();
    checkedStepThroughs += stepGroupCount;
    for (const [i, o] of stepThroughOutliers.entries())
      outliers.push({ slug, diagram: i, ...o });
  }

  expect(pageErrors, `JS errors on lesson pages: ${pageErrors.join(' | ')}`).toEqual([]);
  expect(
    outliers,
    outliers.length
      ? `diagram geometry outliers:\n` +
        outliers.map((o) => `  ${o.slug} diagram#${o.diagram} [${o.kind} "${o.label}"] ${o.detail}`).join('\n')
      : 'all diagram geometry checks passed',
  ).toEqual([]);
  expect(checkedDiagrams).toBeGreaterThan(70); // the full affected inventory
  expect(checkedStepThroughs).toBeGreaterThan(0); // the glow sweep must see StepThrough panels
});
