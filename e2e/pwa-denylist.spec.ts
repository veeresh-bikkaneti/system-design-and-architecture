import { expect, test } from '@playwright/test';

/**
 * Council 2026-11-02 (PR #109), item 2: under service-worker control a
 * navigation to an existing static file must return the file, not the
 * app shell.
 */
test('DEN1 SW-controlled navigation to robots.txt returns the file, not the shell', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
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
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller !== null),
    'page must be SW-controlled before the check',
  ).toBe(true);

  const res = await page.goto('/robots.txt');
  expect(res?.status()).toBe(200);
  const body = await res!.text();
  expect(body).toContain('User-agent');
  expect(body).not.toContain('<html');
  expect(body).not.toContain('id="root"');

  // A fetch from a controlled page is not a navigation; it must also return the file.
  await page.goto('/');
  const txt = await page.evaluate(async () => (await fetch('/robots.txt')).text());
  expect(txt).toContain('User-agent');
});
