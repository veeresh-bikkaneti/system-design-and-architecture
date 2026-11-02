import { expect, test, type Page } from '@playwright/test';

/**
 * Council 2026-11-02 (PR #109), item 4: the service worker at the Pages
 * subpath. Runs only under playwright.subpath.config.ts against a build
 * made with VITE_BASE_PATH=/system-design-and-architecture/.
 */
const BASE = '/system-design-and-architecture/';
const LESSON_SLUG = 'scaling-web-service';

async function controlled(page: Page): Promise<void> {
  await page.goto(BASE);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
          return reg?.active?.state ?? 'none';
        }),
      { timeout: 45000, intervals: [1000] },
    )
    .toBe('activated');
  await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

test('SUB1 SCOPE GUARD: the worker registers with scope == the base path', async ({ page }) => {
  await page.goto(BASE);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
          return reg ? reg.scope : 'none';
        }),
      { timeout: 45000, intervals: [1000] },
    )
    .toBe(`${new URL(page.url()).origin}${BASE}`);
  // Poll until some worker exposes its script URL (the registration can exist
  // for a moment before installing/waiting/active is populated).
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          return reg?.active?.scriptURL ?? reg?.installing?.scriptURL ?? reg?.waiting?.scriptURL ?? '';
        }),
      { timeout: 45000, intervals: [500] },
    )
    .toMatch(new RegExp(`${BASE}sw\.js$`));
});

test('SUB2 the manifest link resolves under the base and scopes to it', async ({ page, request }) => {
  await page.goto(BASE);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe(`${BASE}manifest.webmanifest`);
  const url = new URL(href!, page.url()).toString();
  const res = await request.get(url);
  expect(res.status()).toBe(200);
  const m = (await res.json()) as { start_url: string; scope: string; icons: Array<{ src: string }> };
  const origin = new URL(page.url()).origin;
  expect(new URL(m.start_url, url).toString()).toBe(`${origin}${BASE}`);
  expect(new URL(m.scope, url).toString()).toBe(`${origin}${BASE}`);
  for (const icon of m.icons) {
    expect((await request.get(new URL(icon.src, url).toString())).status(), icon.src).toBe(200);
  }
});

test('SUB3 a reload while offline still serves the app, including a lesson deep link', async ({ page }) => {
  test.setTimeout(120000);
  await controlled(page);
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 20000 });
  await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 20000 });
  await page.goto(`${BASE}lesson/${LESSON_SLUG}`);
  await expect(page.getByRole('heading', { name: /From Zero to Millions/ }).first()).toBeVisible({
    timeout: 20000,
  });
});

test('SUB4 file-like paths under the base return the file under SW control', async ({ page }) => {
  test.setTimeout(120000);
  await controlled(page);
  const res = await page.goto(`${BASE}robots.txt`);
  expect(res?.status()).toBe(200);
  const body = await res!.text();
  expect(body).toContain('User-agent');
  expect(body).not.toContain('<html');
});
