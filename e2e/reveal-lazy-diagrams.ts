import type { Page } from '@playwright/test';

/**
 * Diagrams are viewport-gated (see `lazyMdx` in src/components): each one is
 * just a "Loading …" placeholder until it scrolls within
 * DIAGRAM_PRELOAD_MARGIN of the viewport, so diagram elements below the fold
 * don't exist on a fresh page load. Specs that count or measure diagrams
 * must first bring every placeholder into view so each gets to load.
 *
 * A placeholder that has loaded is swapped for the real component (and a
 * loading one for its Suspense fallback), so each round snapshots what is
 * still pending and a few rounds pick up anything that mounted late.
 */
export async function revealLazyDiagrams(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Breadcrumb' }).waitFor();
  // The lesson body mounts after the page chrome, so wait for the first
  // placeholder (or an already-rendered diagram) before sweeping. A lesson
  // with no diagrams just falls through after the timeout.
  await page
    .waitForFunction(
      () =>
        document.querySelector('.mermaid-diagram') !== null ||
        [...document.querySelectorAll('div[aria-hidden="true"]')].some((el) =>
          /^Loading .+…$/.test(el.textContent ?? ''),
        ),
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => {});
  await page.evaluate(async () => {
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const pending = () =>
      [...document.querySelectorAll<HTMLElement>('div[aria-hidden="true"]')].filter(
        (el) => el.children.length === 0 && /^Loading .+…$/.test(el.textContent ?? ''),
      );
    for (let round = 0; round < 3; round += 1) {
      const placeholders = pending();
      if (placeholders.length === 0) break;
      for (const el of placeholders) {
        // The site sets scroll-behavior: smooth; an animated jump would be
        // cancelled by the next one before the observer ever fires.
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        // Give IntersectionObserver a frame or two to fire before moving on.
        await pause(120);
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
}
