import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * T-PWA-5 (Chair PASS, veto n, round 1/2) — offline + SW-control specs.
 * PERMANENT committed deliverable (Chair exception to the temp-spec rule).
 * T-PWA-5 AMENDMENT, arm (c) (Chair final verdict, round 2/2 consumed,
 * veto n, ACCEPTED with conditions): fallback-only bootstrap for the
 * sandbox, implemented in requireSwControl below. If any amendment
 * condition fails in the re-run, the amendment FAILS and the round-1
 * skip outcome (CI-only) stands — no fourth arm, no improvisation.
 *
 * Scope notes (read before changing anything here):
 * - Root-preview specs prove ROOT-SCOPE worker behavior only. The worker's
 *   scope is BASE_URL (vite.config.ts, src/main.tsx), so Pages-subpath scope
 *   (scope = BASE_URL under /system-design-and-architecture/) is a
 *   deploy-matrix note, NOT a claim proven by these specs.
 * - BOOTSTRAP IS NEVER EVIDENCE OF SW BEHAVIOR. The proxy bootstrap
 *   exists only to get a first document loaded in this sandbox; no gate
 *   assertion reads anything from the bootstrapped page. Activation poll
 *   and controller check happen ONLY after direct navigations
 *   post-unrouteAll, and every measured navigation carries its own
 *   triple gate (controller + workerStart + body). The call to unrouteAll
 *   itself is never evidence; the per-navigation gates carry the proof.
 * - CI RUNS THE DIRECT PATH FIRST AND REMAINS THE DEPLOY GATE. The
 *   fallback runs only when the direct goto fails with the EXACT string
 *   ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS, and only for the first
 *   document load. A SANDBOX SKIP IS NEVER A PASS.
 * - Fallback-only ordering, exactly: direct goto FIRST; on the exact LNA
 *   string only, proxy-bootstrap the FIRST document load only (document +
 *   its subresources until load — without them the app never boots and
 *   registration never runs), then unrouteAll, then a load/network settle,
 *   then direct navigations. Post-bootstrap LNA gets a DISTINCT named
 *   skip (POST_BOOTSTRAP_LNA_REASON); any other post-bootstrap failure
 *   FAILS — never re-proxy, never skip.
 * - Triple gate on EVERY measured navigation: controller true +
 *   workerStart > 0 + shell-body 0 lesson-title hits. Controller proves
 *   control, NOT serving; the body gate is load-bearing, workerStart is
 *   corroborating only. OFF4 keeps img-hidden + workerStart (no
 *   lesson-title discriminator exists there; a lingering route would load
 *   art online and fail it — that is the gate). C's fake-pass is real
 *   and guarded: a lingering route + setOffline bypassed by Node-fetch
 *   fulfillment renders the lesson with controller true and zero SW
 *   serving — hence the body gate on every navigation.
 * - OFF5/OFF7 home-navigation discriminator, defined from the actual
 *   bodies this session (dist/404.html = 7673 bytes vs dist/index.html =
 *   18011 bytes): the shell carries 0 hits of "All lessons" and 0 hits
 *   of the lesson title; the prerendered home carries 1 hit of each.
 *   The home gate asserts 0 "All lessons" hits AND 0 lesson-title hits.
 * - Sandbox skip: this sandbox's Chromium blocks direct localhost
 *   navigation (net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS) even with
 *   the config's LocalNetworkAccessChecks disable flags, for 127.0.0.1 and
 *   localhost alike, and granting 'local-network-access' does not help.
 *   When the gate's direct goto hits that error, the test takes the
 *   fallback path (above), NOT a skip. Only a post-bootstrap LNA skips,
 *   with its distinct reason. A skip is never a pass.
 * - LNA-ESCAPE MECHANISM IS UNVERIFIED: why a direct navigation would
 *   succeed after a proxied bootstrap (same-origin local context vs
 *   SW-served navigation) is not proven; the re-run either measures the
 *   gates or skips distinctly, and the report must say which per test.
 * - 30s non-activation observation: SANDBOX-ENVIRONMENT NOTE ONLY.
 *   LNA blocking app subresources means the app never boots and
 *   registration never runs (main.tsx registers on window load);
 *   production is a public origin where LNA does not apply. The "30s"
 *   figure itself is developer-reported and approximate, UNVERIFIED
 *   (matches neither the ~46s offline activation poll nor the 45s
 *   update wait) — never cited as a measured value. No product action.
 * - NC2 is fetch-based (no browser, no worker): it proves the SERVER serves
 *   prerendered HTML, so it runs everywhere, including this sandbox.
 * - BH-E2E is FAILURE-SIMULATION, not offline proof (conditional, see its
 *   header): it stubs the model to failed and asserts the header line for
 *   that given failure. It runs in this sandbox via its OWN proxy helper
 *   because it asserts Ben header copy, not worker behavior. BH-E2E is
 *   UNCHANGED by the amendment (its helper is never reused for SW gates).
 * - Signed-in offline behavior is OUT (split to its own T1 follow-up).
 * - Per-test mode is logged as "[pwa-mode] <title> via direct|fallback"
 *   so the run report can state fallback vs skipped vs passed per test.
 */

const TARGET = 'http://127.0.0.1:4173';
const LESSON_SLUG = 'scaling-web-service';
const LESSON_TITLE_TEXT = 'From Zero to Millions';
const DEEP_SLUG = 'solid-principles';
const DEEP_TITLE_TEXT = 'Object-Oriented Design That Ages Well';
const BEN_QUESTION = 'How do you scale a web service from zero to millions?';
const LNA_REASON =
  'sandbox-only skip: Chromium blocks direct localhost navigation ' +
  '(ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS); SW-control specs are CI-only';
const POST_BOOTSTRAP_LNA_REASON =
  'sandbox-only skip: post-bootstrap direct navigation still LNA-blocked ' +
  '(ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS); the LNA-escape mechanism ' +
  'is UNVERIFIED; SW-control specs are CI-only';
/** Home-navigation shell discriminator (see header): shell 0, prerendered home >= 1. */
const HOME_SHELL_MARKER = 'All lessons';

function isLnaError(e: unknown): boolean {
  return String(e).includes('ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS');
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function correctAnswers(slug: string): number[] {
  const mdx = readFileSync(join(repoRoot, 'content', 'lessons', `${slug}.mdx`), 'utf-8');
  return [...mdx.matchAll(/correctIndex:\s*(\d+)/g)].map((m) => Number(m[1]));
}

/**
 * Control gate for every SW-dependent test. Amendment arm (c),
 * fallback-only ordering, exactly:
 * 1. Direct goto FIRST. On the EXACT LNA string only, take the fallback
 *    path; any other failure FAILS LOUDLY.
 * 2. Fallback: proxy-bootstrap the FIRST document load only (document +
 *    its subresources until load), then unrouteAll, then a load/network
 *    settle, then direct navigations. No gate assertion reads anything
 *    from the bootstrapped page: the activation poll and controller
 *    check below run ONLY after direct navigations post-unrouteAll.
 * 3. Post-bootstrap LNA on a direct navigation gets the DISTINCT named
 *    skip (POST_BOOTSTRAP_LNA_REASON); any other post-bootstrap failure
 *    (including a failed activation poll or controller check) FAILS —
 *    never re-proxy, never skip.
 * Returns 'direct' or 'fallback' for the per-test run report.
 */
async function requireSwControl(page: Page): Promise<'direct' | 'fallback'> {
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
    try {
      await page.goto(`${TARGET}/`, { timeout: 30000 });
    } catch (e2) {
      if (isLnaError(e2)) test.skip(true, POST_BOOTSTRAP_LNA_REASON);
      throw e2;
    }
  }
  console.log(`[pwa-mode] ${test.info().title} via ${mode}`);
  let activated = false;
  for (let i = 0; i < 23; i++) {
    const state = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
      return reg?.active?.state ?? 'none';
    });
    if (state === 'activated') {
      activated = true;
      break;
    }
    await page.waitForTimeout(2000);
  }
  expect(activated, 'worker must reach activated after online install').toBe(true);
  try {
    await page.reload();
  } catch (e) {
    if (mode === 'fallback' && isLnaError(e)) test.skip(true, POST_BOOTSTRAP_LNA_REASON);
    throw e;
  }
  const controller = await page.evaluate(() => navigator.serviceWorker.controller !== null);
  expect(controller, 'page must be SW-controlled after reload (no clients.claim in app)').toBe(true);
  return mode;
}

/**
 * Bootstrap helper for the fallback path ONLY (never reused for SW gates,
 * never reused by BH-E2E, which keeps its own helper). Proxies TARGET
 * requests via Node fetch until the first document reaches load, so the
 * app boots and registration runs in this sandbox. Anything outside the
 * TARGET origin continues directly.
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

async function swMetrics(page: Page): Promise<{ controller: boolean; workerStart: number }> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return {
      controller: navigator.serviceWorker.controller !== null,
      workerStart: nav ? nav.workerStart : -1,
    };
  });
}

/** Capture the navigation response body for one URL (proven readable for SW-served navigations). */
async function captureNavBody(page: Page, url: string): Promise<{ get: () => string }> {
  let body = 'NO_NAV_RESPONSE';
  page.on('response', (res) => {
    if (res.url() === url && res.request().isNavigationRequest()) {
      res
        .text()
        .then((t) => {
          body = t;
        })
        .catch(() => {
          body = 'UNREADABLE';
        });
    }
  });
  return { get: () => body };
}

async function waitForNavBody(
  page: Page,
  capture: { get: () => string },
): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const body = capture.get();
    if (body !== 'NO_NAV_RESPONSE') return body;
    await page.waitForTimeout(500);
  }
  return capture.get();
}

/**
 * Triple gate for a measured lesson navigation: the navigation response
 * body must be readable and carry 0 hits of the lesson title (the shell,
 * not prerendered HTML), the page must be SW-controlled, and workerStart
 * must be > 0. Controller proves control, NOT serving; the body gate is
 * load-bearing, workerStart corroborating only. Call with a capture
 * attached BEFORE the navigation; never call on a proxied navigation.
 */
async function assertSwServedLesson(
  page: Page,
  capture: { get: () => string },
  titleText: string,
  label: string,
): Promise<void> {
  const body = await waitForNavBody(page, capture);
  expect(body, `${label}: navigation response body must be readable`).not.toBe('UNREADABLE');
  expect(body, `${label}: navigation response body must be readable`).not.toBe('NO_NAV_RESPONSE');
  const hits = body.split(titleText).length - 1;
  expect(hits, `${label}: SW-controlled navigation must serve the shell (0 title hits), not prerendered HTML`).toBe(0);
  const metrics = await swMetrics(page);
  expect(metrics.controller, `${label}: controller must be present on the SW-controlled navigation`).toBe(true);
  expect(metrics.workerStart, `${label}: workerStart must be > 0 on a worker-handled navigation`).toBeGreaterThan(0);
}

/**
 * Triple gate for a measured HOME navigation: the navigation response
 * body must be the shell, distinguished from prerendered home by the
 * HOME_SHELL_MARKER (0 hits in the shell, >= 1 in prerendered home) AND
 * 0 lesson-title hits, plus controller true and workerStart > 0.
 */
async function assertSwServedHome(
  page: Page,
  capture: { get: () => string },
  label: string,
): Promise<void> {
  const body = await waitForNavBody(page, capture);
  expect(body, `${label}: navigation response body must be readable`).not.toBe('UNREADABLE');
  expect(body, `${label}: navigation response body must be readable`).not.toBe('NO_NAV_RESPONSE');
  const markerHits = body.split(HOME_SHELL_MARKER).length - 1;
  expect(markerHits, `${label}: SW-controlled home navigation must serve the shell (0 "${HOME_SHELL_MARKER}" hits), not prerendered home`).toBe(0);
  const titleHits = body.split(LESSON_TITLE_TEXT).length - 1;
  expect(titleHits, `${label}: SW-controlled home navigation must serve the shell (0 lesson-title hits), not prerendered home`).toBe(0);
  const metrics = await swMetrics(page);
  expect(metrics.controller, `${label}: controller must be present on the SW-controlled navigation`).toBe(true);
  expect(metrics.workerStart, `${label}: workerStart must be > 0 on a worker-handled navigation`).toBeGreaterThan(0);
}

test.describe('PWA offline (SW-controlled)', () => {
  test('OFF1 SW-controlled online navigation serves the shell and renders the lesson', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await requireSwControl(page);
    const lessonUrl = `${TARGET}/lesson/${LESSON_SLUG}`;
    const capture = await captureNavBody(page, lessonUrl);
    await page.goto(lessonUrl);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole('heading', { name: new RegExp(LESSON_TITLE_TEXT) }).first(),
    ).toBeVisible({ timeout: 20000 });
    const body = await waitForNavBody(page, capture);
    expect(body, 'navigation response body must be readable').not.toBe('UNREADABLE');
    expect(body, 'navigation response body must be readable').not.toBe('NO_NAV_RESPONSE');
    const hits = body.split(LESSON_TITLE_TEXT).length - 1;
    // Triangulation: the precached 404 shell carries 0 hits of the lesson
    // title text; the prerendered lesson page carries 8. Shell + correct
    // lesson render = amended S6 (T-PWA-2 Chair round 2).
    expect(hits, 'SW-controlled navigation must serve the shell (0 title hits), not prerendered HTML').toBe(0);
    const metrics = await swMetrics(page);
    expect(metrics.controller, 'controller must be present on the SW-controlled navigation').toBe(true);
    expect(metrics.workerStart, 'workerStart must be > 0 on a worker-handled navigation').toBeGreaterThan(0);
  });

  test('OFF2 offline lesson renders from precache', async ({ page }) => {
    test.setTimeout(120000);
    await requireSwControl(page);
    await page.context().setOffline(true);
    const lessonUrl = `${TARGET}/lesson/${LESSON_SLUG}`;
    const capture = await captureNavBody(page, lessonUrl);
    await page.goto(lessonUrl);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole('heading', { name: new RegExp(LESSON_TITLE_TEXT) }).first(),
    ).toBeVisible({ timeout: 20000 });
    await assertSwServedLesson(page, capture, LESSON_TITLE_TEXT, 'OFF2 lesson navigation');
  });

  test('OFF3 offline deep link renders its lesson, not home', async ({ page }) => {
    test.setTimeout(120000);
    await requireSwControl(page);
    await page.context().setOffline(true);
    const deepUrl = `${TARGET}/lesson/${DEEP_SLUG}`;
    const capture = await captureNavBody(page, deepUrl);
    await page.goto(deepUrl);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole('heading', { name: new RegExp(DEEP_TITLE_TEXT) }).first(),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Locked lesson')).toHaveCount(0);
    await expect(page.locator('section[aria-label="All lessons"]')).toHaveCount(0);
    await assertSwServedLesson(page, capture, DEEP_TITLE_TEXT, 'OFF3 deep-link navigation');
  });

  test('OFF4 offline badge gallery renders, art hidden on error', async ({ page }) => {
    test.setTimeout(120000);
    await requireSwControl(page);
    await page.context().setOffline(true);
    await page.goto(`${TARGET}/badges`);
    await expect(page.getByRole('heading', { name: 'Your badges' })).toBeVisible({ timeout: 20000 });
    // Badge art is unprecached (assets JS/CSS glob only), so every card img
    // errors offline and the T-PWA-4 tile fix hides it. Art must NOT be
    // asserted visible — that would fail offline by design.
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.badge-card').length > 0 &&
        document.querySelectorAll('.badge-card__img').length === 0,
      { timeout: 20000 },
    );
    // OFF4 gate (amendment): img-hidden + workerStart (+ controller, which
    // workerStart implies). No lesson-title body gate exists here.
    const metrics = await swMetrics(page);
    expect(metrics.controller, 'OFF4: controller must be present on the SW-controlled navigation').toBe(true);
    expect(metrics.workerStart, 'OFF4: workerStart must be > 0 on a worker-handled navigation').toBeGreaterThan(0);
  });

  test('OFF5 offline Ben keyword answer with lesson source link', async ({ page }) => {
    test.setTimeout(120000);
    await requireSwControl(page);
    await page.context().setOffline(true);
    const homeUrl = `${TARGET}/`;
    const homeCapture = await captureNavBody(page, homeUrl);
    await page.goto(homeUrl);
    await assertSwServedHome(page, homeCapture, 'OFF5 home navigation');
    await page.getByRole('button', { name: 'Open course Q&A' }).click();
    const panel = page.locator('[aria-label="Course Q&A"]');
    await expect(panel).toBeVisible({ timeout: 20000 });
    // Offline, loadSemantic fails (ben/index.json + models/ are outside the
    // assets JS/CSS precache glob), so handleSend falls to keywords after
    // the 12s semantic wait — never semantic routing.
    await panel.getByLabel('Ask about the course').fill(BEN_QUESTION);
    await panel.getByRole('button', { name: 'Send message' }).click();
    await expect(panel.getByText(/keyword match/)).toBeVisible({ timeout: 90000 });
    expect(await panel.locator('a[href^="/lesson/"]').count()).toBeGreaterThan(0);
  });

  test('OFF6 offline narration fallback pill renders, no playback asserted', async ({ page }) => {
    test.setTimeout(120000);
    await requireSwControl(page);
    await page.context().setOffline(true);
    const lessonUrl = `${TARGET}/lesson/${LESSON_SLUG}`;
    const capture = await captureNavBody(page, lessonUrl);
    await page.goto(lessonUrl);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible({ timeout: 20000 });
    // Headless voices are UNVERIFIED — the pill's presence is the claim,
    // never playback.
    await expect(page.getByRole('button', { name: 'Listen to this lesson' }).first()).toBeVisible({
      timeout: 20000,
    });
    await assertSwServedLesson(page, capture, LESSON_TITLE_TEXT, 'OFF6 lesson navigation');
  });

  test('OFF7 offline quiz pass persists across reload, local progress only', async ({ page }) => {
    test.setTimeout(120000);
    await requireSwControl(page);
    await page.context().setOffline(true);
    const lessonUrl = `${TARGET}/lesson/${LESSON_SLUG}`;
    const lessonCapture = await captureNavBody(page, lessonUrl);
    await page.goto(lessonUrl);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible({ timeout: 20000 });
    await assertSwServedLesson(page, lessonCapture, LESSON_TITLE_TEXT, 'OFF7 lesson navigation');
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
    await expect(page.getByText(/You passed/)).toBeVisible({ timeout: 20000 });
    const reloadCapture = await captureNavBody(page, lessonUrl);
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible({ timeout: 20000 });
    await assertSwServedLesson(page, reloadCapture, LESSON_TITLE_TEXT, 'OFF7 reload navigation');
    const homeUrl = `${TARGET}/`;
    const homeCapture = await captureNavBody(page, homeUrl);
    await page.goto(homeUrl);
    await assertSwServedHome(page, homeCapture, 'OFF7 home navigation');
    const lessonCard = page.locator(
      `section[aria-label="All lessons"] a[href="/lesson/${LESSON_SLUG}"]`,
    );
    await expect(lessonCard.getByRole('img', { name: 'Completed' })).toBeVisible({ timeout: 20000 });
  });

  test('NC1 guard: worker unregistered + caches cleared, offline navigation fails', async ({
    page,
  }) => {
    test.setTimeout(90000);
    // Sandbox pre-check: if even the online direct goto is LNA-blocked,
    // this guard cannot distinguish offline failure from the sandbox block.
    try {
      await page.goto(`${TARGET}/`, { timeout: 30000 });
    } catch (e) {
      if (String(e).includes('ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS')) {
        test.skip(true, LNA_REASON);
      }
      throw e;
    }
    await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    });
    await page.context().setOffline(true);
    let threw = false;
    try {
      await page.goto(`${TARGET}/lesson/${LESSON_SLUG}`, { timeout: 15000 });
    } catch {
      threw = true;
    }
    expect(threw, 'offline navigation with no worker and no cache must fail').toBe(true);
  });

  test('NC2 guard: pre-control body is prerendered HTML, title present (fetch-based)', async () => {
    test.setTimeout(30000);
    // No browser, no worker: this proves what the SERVER serves, so it
    // runs everywhere including the sandbox. The prerendered file lives
    // at the directory URL (trailing slash): the preview server answers
    // the clean URL with the SPA fallback (home shell, 1 title hit), while
    // Pages redirects clean -> directory URLs in production.
    const lessonRes = await fetch(`${TARGET}/lesson/${LESSON_SLUG}/`);
    expect(lessonRes.status).toBe(200);
    const lessonBody = await lessonRes.text();
    const hits = lessonBody.split(LESSON_TITLE_TEXT).length - 1;
    expect(hits, 'prerendered lesson page must carry the lesson title text').toBe(8);
    const shellRes = await fetch(`${TARGET}/404.html`);
    expect(shellRes.status).toBe(200);
    const shellBody = await shellRes.text();
    expect(shellBody.split(LESSON_TITLE_TEXT).length - 1, 'shell must carry 0 lesson title hits').toBe(0);
  });

  test('NC3 guard: single build, no waiting worker, no prompt', async ({ page }) => {
    test.setTimeout(120000);
    await requireSwControl(page);
    const waiting = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg?.waiting ? true : false;
    });
    expect(waiting, 'a single build must leave no waiting worker').toBe(false);
    expect(await page.getByText('New version available').count()).toBe(0);
  });

  test('BH-E2E conditional: stubbed-failure header shows the failed line', async ({ page }) => {
    test.setTimeout(120000);
    // CONDITIONAL: failure-simulation, NOT offline proof. The header is
    // asserted GIVEN a stubbed model failure; a natural model failure is
    // never claimed. Page-scoped global stubbing is test setup, not app
    // behavior. Mechanism: (a) LanguageModel stubbed to undefined before
    // app code runs (inference.ts checks at call time); (b) huggingface.co
    // aborted so loadWebLlm throws and loadEngine publishes failed;
    // (c) an in-scope question asked first — the model loads lazily via
    // rewriteWithModel on ask, never on panel open (panel open only calls
    // loadSemantic, which is also forced to fail here so the keyword path
    // runs and a model call is guaranteed for an in-scope question).
    await page.addInitScript(() => {
      try {
        Object.defineProperty(window, 'LanguageModel', { value: undefined, configurable: true });
      } catch {
        /* stub best-effort; the huggingface abort below still forces failure */
      }
    });
    await proxyLocalServer(page);
    await page.route('**/ben/index.json', (route) => route.abort('failed'));
    await page.route('**/huggingface.co/**', (route) => route.abort('failed'));
    await page.goto(`${TARGET}/`);
    await page.getByRole('button', { name: 'Open course Q&A' }).click();
    const panel = page.locator('[aria-label="Course Q&A"]');
    await expect(panel).toBeVisible({ timeout: 20000 });
    await panel.getByLabel('Ask about the course').fill(BEN_QUESTION);
    await panel.getByRole('button', { name: 'Send message' }).click();
    await expect(panel.getByText('Model failed · lesson answers work')).toBeVisible({ timeout: 90000 });
  });
});

/** Proxy bootstrap for BH-E2E only (header copy, not worker behavior). */
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
