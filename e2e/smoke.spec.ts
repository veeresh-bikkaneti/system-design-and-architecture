import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Smoke test against the production build (`npm run build` then this spec).
 * It proves the branch didn't break the app's core loop: boot without
 * errors, open a lesson, pass its quiz, and persist progress across reload.
 *
 * The answer key is read from the lesson MDX at test time so the spec stays
 * correct as content changes.
 *
 * Environment note: this sandbox's Chromium build blocks direct navigations
 * to localhost (Local Network Access checks) and the proxy blocks
 * downloading Playwright's own browser, so the config points Playwright at
 * the environment's Chromium and this spec proxies the test server through
 * Node fetch via request interception.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const LESSON_SLUG = 'scaling-web-service'; // order: 1, has a 4-question quiz
const TARGET = 'http://127.0.0.1:4173';

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

/** Read the answer key straight from the lesson source, in question order. */
function correctAnswers(slug: string): number[] {
  const mdx = readFileSync(join(repoRoot, 'content', 'lessons', `${slug}.mdx`), 'utf-8');
  return [...mdx.matchAll(/correctIndex:\s*(\d+)/g)].map((m) => Number(m[1]));
}

/** Fail the test if the page throws or logs JS console errors. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    // "Failed to load resource" is Chrome's network-level report (e.g. the
    // sandbox proxy breaking TLS to Google Fonts) — environmental, not an
    // app bug. Real JS errors still fail the test.
    if (msg.text().startsWith('Failed to load resource:')) return;
    errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

test.describe('production build smoke test', () => {
  test.beforeEach(async ({ page }) => {
    await proxyLocalServer(page);
  });

  test('homepage boots cleanly and lists lessons', async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto(`${TARGET}/`);
    await expect(page.locator('section[aria-label="All lessons"]')).toBeVisible();
    await expect(
      page.locator(`section[aria-label="All lessons"] a[href="/lesson/${LESSON_SLUG}"]`),
    ).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('lesson quiz can be passed and progress persists across reload', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const answers = correctAnswers(LESSON_SLUG);
    expect(answers.length).toBeGreaterThan(0);

    await page.goto(`${TARGET}/lesson/${LESSON_SLUG}`);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();

    for (const [qIndex, correct] of answers.entries()) {
      await page
        .getByRole('radiogroup', { name: `Question ${qIndex + 1}` })
        .getByRole('radio')
        .nth(correct)
        .check();
    }
    await page.getByRole('button', { name: 'Check answers' }).click();
    await expect(page.getByText(/You passed/)).toBeVisible();

    // Progress is persisted to localStorage: a reload keeps the lesson page
    // working, and the homepage shows the lesson as completed.
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();

    await page.goto(`${TARGET}/`);
    const lessonCard = page.locator(
      `section[aria-label="All lessons"] a[href="/lesson/${LESSON_SLUG}"]`,
    );
    await expect(lessonCard.getByRole('img', { name: 'Completed' })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('badges page renders', async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto(`${TARGET}/badges`);
    await expect(page.getByRole('heading', { name: 'Your badges' })).toBeVisible();

    expect(errors).toEqual([]);
  });
});
