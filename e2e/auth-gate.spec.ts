import { expect, test } from '@playwright/test';

const TARGET = 'http://127.0.0.1:4173';

test('header offers GitHub sign-in when logged out', async ({ page }) => {
  await page.goto(`${TARGET}/`);
  await expect(page.getByRole('button', { name: /sign in with github/i })).toBeVisible();
});
