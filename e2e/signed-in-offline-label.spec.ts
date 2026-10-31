import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Signed-in offline-label e2e (T1 follow-up, split from T-PWA-5).
 * Council PASS, veto n, round 1/2 (C FAIL dissent recorded, all 5 attacks
 * adopted as Manifest wording); human "go" received 2026-10-25.
 * PERMANENT committed deliverable.
 *
 * What this proves: the signed-in dirty label reads the login name, never
 * "Synced", while offline — via the stubbed-GitHub flow ONLY.
 *
 * Hard bans (violating any fails the task, never a silent workaround):
 * - NO src/ app code change, NO vite.config/precache change, NO new dep.
 * - NO real credentials, NO real GitHub calls: every api.github.com
 *   request is stubbed (fake token only), and a catch-all abort guards
 *   the tail so no unstubbed call can reach real GitHub.
 * - NO direct storage injection (Chair-banned): partialize persists
 *   dirty but NOT lastSyncedAt, so seeding state cannot prove the
 *   "Synced" checkpoint.
 * - NO reload and NO page.goto anywhere post-sign-in: a reload would
 *   lose lastSyncedAt via partialize and void the checkpoint. Link
 *   clicks only after sign-in.
 * - NO store setState via page.evaluate: UI-only actions only.
 * - NO proxy-fulfill and NO catch-all route stubbing: GitHub stubs
 *   cover api.github.com paths only.
 * - Assert on the header label span ONLY, never page-wide text. Poll
 *   with expect on the label, never an immediate textContent read.
 *
 * Harness (narrowed arm (c), explicit): this spec is SW-independent, so
 * it defines its OWN load helper — it never calls requireSwControl and
 * never asserts SW control. Ordering: direct goto FIRST; on the EXACT
 * LNA string only, proxy-bootstrap the first document only, then
 * unrouteAll, then register GitHub stubs, then direct navigations only
 * (link clicks; the app is already booted on the loaded document, so no
 * post-bootstrap goto is needed). Post-bootstrap LNA gets a DISTINCT
 * named skip; any other post-bootstrap failure FAILS. CI remains the
 * deploy gate for any skipped run. The LNA-escape mechanism is
 * UNVERIFIED, Confidence LOW.
 * - Baked client ID: if the app shows no PAT token input after clicking
 *   sign-in, the test FAILS LOUDLY, never silently skips.
 * - setOffline-vs-route interaction: neutralized by abort-before-offline
 *   + fulfilled-200 PATCH counting; residual interaction is UNVERIFIED,
 *   Confidence LOW, but it cannot re-clean because routes abort and the
 *   label is local state.
 * - Desktop viewport pinned: the label span is hidden below sm.
 * - Signed-in offline behavior is the ONLY thing proven here; SW control,
 *   offline precache, and installability belong to T-PWA-5, not this file.
 */

const TARGET = 'http://127.0.0.1:4173';
const LESSON_SLUG = 'scaling-web-service';
const STUB_LOGIN = 'stub-octocat';
const STUB_GIST_ID = 'stub-gist-1';
const FAKE_TOKEN = 'fake-token-for-tests-only';
const GIST_DESCRIPTION = 'system-design-mastery-progress';
const GIST_FILENAME = 'sdm-progress.json';
const PAT_NETWORK = 'Could not reach GitHub. Check your connection and try again.';
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test.use({ viewport: { width: 1280, height: 800 } });

function isLnaError(e: unknown): boolean {
  return String(e).includes('ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS');
}

function correctAnswers(slug: string): number[] {
  const mdx = readFileSync(join(repoRoot, 'content', 'lessons', `${slug}.mdx`), 'utf-8');
  return [...mdx.matchAll(/correctIndex:\s*(\d+)/g)].map((m) => Number(m[1]));
}

/** The header label span ONLY (AuthBar's signed-in span). Never page-wide text. */
function labelSpan(page: Page) {
  return page.locator('span.max-w-\\[10rem\\]');
}

/**
 * Bootstrap helper for the fallback path ONLY. Proxies TARGET requests via
 * Node fetch until the first document reaches load, so the app boots in
 * this sandbox. Anything outside the TARGET origin continues directly.
 * Never reused for SW gates (this spec asserts none).
 */
async function proxyBootstrapDocument(page: Page): Promise<void> {
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
  await page.goto(`${TARGET}/`, { timeout: 30000 });
}

/**
 * Load the app, own helper (never requireSwControl, never SW control).
 * Direct goto first; on the EXACT LNA string only, bootstrap the first
 * document, unrouteAll, settle — the app is already booted, so no
 * post-bootstrap goto is issued (link clicks only from here on).
 * Returns 'direct' or 'fallback' for the per-test run report.
 */
async function loadApp(page: Page): Promise<'direct' | 'fallback'> {
  let mode: 'direct' | 'fallback';
  try {
    await page.goto(`${TARGET}/`, { timeout: 30000 });
    mode = 'direct';
  } catch (e) {
    if (!isLnaError(e)) throw e;
    mode = 'fallback';
    await proxyBootstrapDocument(page);
    await page.unrouteAll({ behavior: 'wait' });
    await page.waitForLoadState('load');
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  }
  console.log(`[signed-in-mode] ${test.info().title} via ${mode}`);
  return mode;
}

interface StubCounters {
  patchFulfilled200: number;
}

/**
 * Stub every api.github.com call the sign-in + sync flow can make.
 * Returns live counters (PATCH fulfilled-200 count is the T3/T4 guard).
 * Unknown api.github.com paths ABORT: no unstubbed call may reach real
 * GitHub, and an unknown call fails loudly via the app error path.
 */
async function installGithubStubs(
  page: Page,
  opts: { patchStatus: number },
): Promise<StubCounters> {
  const counters: StubCounters = { patchFulfilled200: 0 };
  await page.route('**/api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const json = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (method === 'GET' && path === '/user') {
      await json(200, { login: STUB_LOGIN });
      return;
    }
    if (method === 'GET' && path === '/gists') {
      await json(200, [
        {
          id: STUB_GIST_ID,
          description: GIST_DESCRIPTION,
          files: { [GIST_FILENAME]: { filename: GIST_FILENAME } },
        },
      ]);
      return;
    }
    if (method === 'GET' && path.startsWith('/gists/')) {
      // Empty progress: pullAndMerge early-returns, never overwrites local state.
      await json(200, { id: STUB_GIST_ID, files: {} });
      return;
    }
    if (method === 'POST' && path === '/gists') {
      // Defensive only: the list stub above already matches, so sign-in
      // should never create. Present so a list miss still cannot escape.
      await json(200, { id: STUB_GIST_ID });
      return;
    }
    if (method === 'PATCH' && path.startsWith('/gists/')) {
      if (opts.patchStatus === 200) counters.patchFulfilled200 += 1;
      // github() calls res.json() before markClean, so PATCH must return JSON.
      await json(opts.patchStatus, {});
      return;
    }
    await route.abort('failed');
  });
  return counters;
}

/** Swap the GitHub stubs to aborts: the idle tick can then never re-clean. */
async function swapGithubToAborts(page: Page): Promise<void> {
  await page.unroute('**/api.github.com/**');
  await page.route('**/api.github.com/**', (route) => route.abort('failed'));
}

/**
 * Sign in via the PAT dialog (fake token only). FAILS LOUDLY if no token
 * input appears (baked-client-ID case) — never a silent skip.
 */
async function signInWithPat(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign in with GitHub' }).click();
  const tokenInput = page.getByLabel(/GitHub token/i);
  await expect(tokenInput).toBeVisible({ timeout: 15000 });
  await tokenInput.fill(FAKE_TOKEN);
  await page.getByRole('button', { name: 'Save and sync' }).click();
  await expect(page.getByRole('button', { name: 'Save and sync' })).toHaveCount(0, {
    timeout: 30000,
  });
}

/** Pass the lesson quiz via UI clicks only (no store writes from the test). */
async function passQuiz(page: Page): Promise<void> {
  const answers = correctAnswers(LESSON_SLUG);
  expect(answers.length).toBeGreaterThan(0);
  for (const [qIndex, correct] of answers.entries()) {
    await page
      .getByRole('radiogroup', { name: `Question ${qIndex + 1}` })
      .getByRole('radio')
      .nth(correct)
      .check();
  }
  await page.getByRole('button', { name: 'Check answers' }).click();
  await expect(page.getByText(/You passed/)).toBeVisible({ timeout: 30000 });
}

test.describe('Signed-in offline label (stubbed-GitHub flow)', () => {
  test('T1 signed-in-offline-label-dirty-reads-login-not-synced', async ({
    page,
    context,
  }: {
    page: Page;
    context: BrowserContext;
  }) => {
    test.setTimeout(120000);
    await loadApp(page);
    const counters = await installGithubStubs(page, { patchStatus: 200 });
    await signInWithPat(page);
    // Online "Synced" checkpoint (polling expect, never an instant read).
    await expect(labelSpan(page)).toHaveCount(1);
    await expect(labelSpan(page)).toHaveText('Synced', { timeout: 30000 });
    expect(counters.patchFulfilled200).toBeGreaterThanOrEqual(1);
    // Abort-swap BEFORE the quiz pass: the idle tick can never re-clean.
    await swapGithubToAborts(page);
    // Link click only (never goto/reload post-sign-in) to the lesson.
    await page
      .locator(`section[aria-label="All lessons"] a[href="/lesson/${LESSON_SLUG}"]`)
      .click();
    await passQuiz(page);
    // Quiz pass marks dirty via the real AuthBar subscription.
    await context.setOffline(true);
    // Link click only, back home (home JS already loaded, renders offline).
    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Home' })
      .click();
    await expect(labelSpan(page)).toHaveText(STUB_LOGIN, { timeout: 30000 });
  });

  test('T2 signed-in-sync-failure-patch-500-label-stays-login', async ({
    page,
  }: {
    page: Page;
  }) => {
    test.setTimeout(90000);
    await loadApp(page);
    const counters = await installGithubStubs(page, { patchStatus: 500 });
    await page.getByRole('button', { name: 'Sign in with GitHub' }).click();
    const tokenInput = page.getByLabel(/GitHub token/i);
    await expect(tokenInput).toBeVisible({ timeout: 15000 });
    await tokenInput.fill(FAKE_TOKEN);
    await page.getByRole('button', { name: 'Save and sync' }).click();
    // PATCH 500: no markClean runs, dialog stays with the network copy.
    await expect(page.getByText(PAT_NETWORK)).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Save and sync' })).toHaveCount(1);
    expect(counters.patchFulfilled200).toBe(0);
    // Signed in (session set before the PATCH), label reads login, never Synced.
    await expect(labelSpan(page)).toHaveCount(1);
    await expect(labelSpan(page)).toHaveText(STUB_LOGIN, { timeout: 15000 });
  });

  test('T3 anti-vacuity-online-synced-and-patch-observed-or-fail', async ({
    page,
  }: {
    page: Page;
  }) => {
    test.setTimeout(90000);
    await loadApp(page);
    const counters = await installGithubStubs(page, { patchStatus: 200 });
    await signInWithPat(page);
    // Hard-FAIL unless BOTH the online "Synced" checkpoint and at least
    // one fulfilled-200 PATCH are observed: without them the T1 proof
    // would be vacuous (label reads login even with no sync at all).
    await expect(labelSpan(page)).toHaveCount(1);
    await expect(labelSpan(page)).toHaveText('Synced', { timeout: 30000 });
    expect(counters.patchFulfilled200).toBeGreaterThanOrEqual(1);
  });

  test('T4 idle-tick-guard-no-second-patch-recleans-dirty-label', async ({
    page,
    context,
  }: {
    page: Page;
    context: BrowserContext;
  }) => {
    test.setTimeout(120000);
    await loadApp(page);
    const counters = await installGithubStubs(page, { patchStatus: 200 });
    await signInWithPat(page);
    await expect(labelSpan(page)).toHaveCount(1);
    await expect(labelSpan(page)).toHaveText('Synced', { timeout: 30000 });
    await swapGithubToAborts(page);
    await page
      .locator(`section[aria-label="All lessons"] a[href="/lesson/${LESSON_SLUG}"]`)
      .click();
    await passQuiz(page);
    await context.setOffline(true);
    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Home' })
      .click();
    await expect(labelSpan(page)).toHaveText(STUB_LOGIN, { timeout: 30000 });
    // GUARD, not tick proof: exactly one fulfilled-200 PATCH (the sign-in
    // push) proves no second push re-cleaned the dirty label. No 60-120s
    // tick-boundary wait: slow, flaky, still phase-unknown.
    expect(counters.patchFulfilled200).toBe(1);
  });
});
