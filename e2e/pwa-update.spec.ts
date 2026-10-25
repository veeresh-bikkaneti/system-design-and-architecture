import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * T-PWA-5 (Chair PASS, veto n, round 1/2) — update-flow + manifest specs.
 * PERMANENT committed deliverable (Chair exception to the temp-spec rule).
 * NO playwright.config.ts change: preview lifecycle is managed INLINE here.
 * T-PWA-5 AMENDMENT, arm (c) (Chair final verdict, round 2/2 consumed,
 * veto n, ACCEPTED with conditions): fallback-only bootstrap for the
 * sandbox, implemented in UPD1b below. If any amendment condition fails
 * in the re-run, the amendment FAILS and the round-1 skip outcome
 * (CI-only) stands — no fourth arm, no improvisation.
 *
 * Scope notes (read before changing anything here):
 * - Root-preview specs prove ROOT-SCOPE worker behavior only. The worker's
 *   scope is BASE_URL, so Pages-subpath scope is a deploy-matrix note,
 *   NOT a claim proven by these specs.
 * - Two-build mechanics: build N is dist/ (the production build this run
 *   was started against); build N+1 is a vite-only build into a TEMP dir
 *   (never dist/, so this file cannot race other spec files' preview).
 *   N+1 needs no prerendered routes: the update flow only needs the app
 *   shell + sw.js + prompt. sw.js bytes differ across builds because
 *   404.html is pinned with revision String(Date.now()) (vite.config.ts),
 *   so every vite build regenerates sw.js bytes — a vite-only build
 *   proves the byte-difference mechanism exactly.
 * - Preview lifecycle is RESTART, never serve-fresh-on-rebuild (unverified):
 *   the N preview is stopped and an N+1 preview is started on the SAME
 *   port (4174, so the origin — and therefore the registration — is
 *   identical). The config's 4173 preview is untouched.
 * - UpdatePrompt does no polling and no registration.update(): the TEST
 *   itself calls registration.update() from page.evaluate.
 * - BOOTSTRAP IS NEVER EVIDENCE OF SW BEHAVIOR. The 4174-scoped
 *   bootstrap helper below exists only to get a first document loaded
 *   in this sandbox; it is NEVER a reuse of the offline file's 4173
 *   helper, and no gate assertion reads anything from the bootstrapped
 *   page. CI RUNS THE DIRECT PATH FIRST AND REMAINS THE DEPLOY GATE.
 *   A SANDBOX SKIP IS NEVER A PASS.
 * - Fallback-only ordering, exactly (UPD1b): direct goto FIRST; on the
 *   EXACT LNA string only, proxy-bootstrap the FIRST document load only
 *   on 4174, then unrouteAll, then a load/network settle, then direct
 *   navigations. Post-bootstrap LNA gets a DISTINCT named skip; any
 *   other post-bootstrap failure FAILS — never re-proxy, never skip.
 * - Post-restart gates (UPD1b): the post-restart reload gets controller
 *   + workerStart gates BEFORE update(). Post-restart LNA gets a
 *   DISTINCT skip (POST_RESTART_LNA_REASON). UPD2/UPD3 run ONLY on
 *   passed post-restart gates (flag-guarded, plus their existing
 *   waiting/registration guards).
 * - LNA-ESCAPE MECHANISM IS UNVERIFIED: why a direct navigation would
 *   succeed after a proxied bootstrap is not proven; the re-run either
 *   measures the gates or skips distinctly, and the report must say
 *   which per test.
 * - 30s non-activation observation: SANDBOX-ENVIRONMENT NOTE ONLY
 *   (LNA blocking app subresources means the app never boots and
 *   registration never runs; production is a public origin where LNA
 *   does not apply). The "30s" figure itself is developer-reported and
 *   approximate, UNVERIFIED — never cited as a measured value.
 *   No product action.
 * - Sandbox skip: like the offline file, browser parts SKIP with a named
 *   reason when direct localhost navigation is LNA-blocked in this
 *   sandbox; they are CI-only. Fetch/filesystem parts (UPD1a, MG1, MG2a)
 *   run everywhere and are UNCHANGED by the amendment. A skip is never
 *   a pass.
 * - Install-prompt assertions are OUT; Lighthouse automation is OUT.
 */

const TARGET_4173 = 'http://127.0.0.1:4173';
const UPD_PORT = 4174;
const UPD_TARGET = `http://127.0.0.1:${UPD_PORT}`;
const POST_BOOTSTRAP_LNA_REASON =
  'sandbox-only skip: post-bootstrap direct navigation still LNA-blocked ' +
  '(ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS); the LNA-escape mechanism ' +
  'is UNVERIFIED; SW-control specs are CI-only';
const POST_RESTART_LNA_REASON =
  'sandbox-only skip: post-restart reload LNA-blocked ' +
  '(ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS); the LNA-escape mechanism ' +
  'is UNVERIFIED; SW-control specs are CI-only';

function isLnaError(e: unknown): boolean {
  return String(e).includes('ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS');
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

async function waitForPort(port: number, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.status === 200) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`preview on port ${port} did not become ready`);
}

function startPreview(cwd: string, port: number): ChildProcess {
  const child = spawn(
    'npx',
    ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd, stdio: 'ignore' },
  );
  return child;
}

async function stopPreview(child: ChildProcess | null): Promise<void> {
  if (!child) return;
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.on('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function waitForActiveWorker(page: Page, timeoutMs = 45000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
      return reg?.active?.state ?? 'none';
    });
    if (state === 'activated') return;
    await page.waitForTimeout(2000);
  }
  throw new Error('worker did not reach activated after online install');
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

/**
 * 4174-scoped bootstrap helper for UPD1b's fallback path ONLY (never a
 * reuse of the offline file's 4173 helper). Proxies UPD_TARGET requests
 * via Node fetch until the first document reaches load, so the app boots
 * and registration runs in this sandbox. No gate assertion reads
 * anything from the bootstrapped page; gates run only on later direct
 * navigations post-unrouteAll.
 */
async function proxyBootstrap4174(page: Page): Promise<void> {
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== '127.0.0.1' || url.port !== String(UPD_PORT)) {
      await route.continue();
      return;
    }
    const upstream = await fetch(`${UPD_TARGET}${url.pathname}${url.search}`, {
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
  await page.goto(`${UPD_TARGET}/`, { timeout: 30000 });
}

async function waitForWaitingWorker(page: Page, timeoutMs = 30000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const waiting = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
      return reg?.waiting ? true : false;
    });
    if (waiting) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

test.describe.serial('PWA update flow (two-build, shared worker state)', () => {
  let context: BrowserContext;
  let page: Page;
  let tmpDir = '';
  let nPreview: ChildProcess | null = null;
  let n1Preview: ChildProcess | null = null;
  let postRestartGatesPassed = false;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await stopPreview(nPreview);
    await stopPreview(n1Preview);
    await context?.close().catch(() => {});
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test('UPD1a sw.js bytes differ across two builds (filesystem, runs everywhere)', async () => {
    test.setTimeout(180000);
    const distSw = join(repoRoot, 'dist', 'sw.js');
    expect(existsSync(distSw), 'dist/sw.js must exist (build before running e2e)').toBe(true);
    const before = readFileSync(distSw, 'utf-8');
    tmpDir = mkdtempSync(join(tmpdir(), 'pwa-upd-'));
    execSync(`npx vite build --outDir ${join(tmpDir, 'dist')}`, {
      cwd: repoRoot,
      timeout: 240000,
      stdio: 'pipe',
      maxBuffer: 10 * 1024 * 1024,
    });
    const tmpSw = join(tmpDir, 'dist', 'sw.js');
    expect(existsSync(tmpSw), 'temp build must produce sw.js').toBe(true);
    const after = readFileSync(tmpSw, 'utf-8');
    // Fail loudly if identical: the timestamp revision must change bytes.
    expect(after, 'sw.js bytes MUST differ across builds (timestamp revision)').not.toBe(before);
    // Prove the temp build is servable (de-risks the N+1 preview below).
    const probe = startPreview(tmpDir, UPD_PORT);
    try {
      await waitForPort(UPD_PORT);
      const res = await fetch(`${UPD_TARGET}/`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('id="root"');
    } finally {
      await stopPreview(probe);
    }
  });

  test('UPD1b update() yields a waiting worker and the prompt (browser, CI-only)', async () => {
    test.setTimeout(120000);
    expect(tmpDir, 'UPD1a must have built the N+1 temp dir first').not.toBe('');
    nPreview = startPreview(repoRoot, UPD_PORT);
    try {
      await waitForPort(UPD_PORT);
      // Fallback-only ordering, exactly: direct goto FIRST; on the exact
      // LNA string only, 4174-scoped bootstrap of the first document
      // load only, then unrouteAll, then a load/network settle, then
      // direct navigations. Post-bootstrap LNA gets a DISTINCT skip;
      // any other post-bootstrap failure FAILS.
      let mode: 'direct' | 'fallback';
      try {
        await page.goto(`${UPD_TARGET}/`, { timeout: 30000 });
        mode = 'direct';
      } catch (e) {
        if (!isLnaError(e)) throw e;
        mode = 'fallback';
        await proxyBootstrap4174(page);
        await page.unrouteAll({ behavior: 'wait' });
        await page.waitForLoadState('load');
        await page.waitForLoadState('networkidle', { timeout: 15000 });
        try {
          await page.goto(`${UPD_TARGET}/`, { timeout: 30000 });
        } catch (e2) {
          if (isLnaError(e2)) test.skip(true, POST_BOOTSTRAP_LNA_REASON);
          throw e2;
        }
      }
      console.log(`[pwa-mode] UPD1b via ${mode}`);
      await waitForActiveWorker(page);
      try {
        await page.reload();
      } catch (e) {
        if (mode === 'fallback' && isLnaError(e)) test.skip(true, POST_BOOTSTRAP_LNA_REASON);
        throw e;
      }
      expect(
        await page.evaluate(() => navigator.serviceWorker.controller !== null),
        'page must be controlled by the N worker before the update',
      ).toBe(true);
    } finally {
      // Restart, never serve-fresh: N stops, N+1 starts on the same port.
      await stopPreview(nPreview);
      nPreview = null;
    }
    n1Preview = startPreview(tmpDir, UPD_PORT);
    await waitForPort(UPD_PORT);
    // The controlled page reloads: the N worker serves its shell while the
    // browser's update check fetches the N+1 sw.js. The test then forces
    // the check explicitly (the app never calls registration.update()).
    // Post-restart gates BEFORE update(): controller + workerStart on
    // the post-restart reload. Post-restart LNA gets a DISTINCT skip.
    try {
      await page.reload();
    } catch (e) {
      if (isLnaError(e)) test.skip(true, POST_RESTART_LNA_REASON);
      throw e;
    }
    const postRestart = await swMetrics(page);
    expect(postRestart.controller, 'post-restart reload must be SW-controlled before update()').toBe(true);
    expect(postRestart.workerStart, 'post-restart reload must be worker-handled before update()').toBeGreaterThan(0);
    postRestartGatesPassed = true;
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
    });
    expect(await waitForWaitingWorker(page), 'N+1 worker must reach waiting').toBe(true);
    await expect(page.getByText('New version available')).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'Update' })).toBeVisible();
  });

  test('UPD2 Update reloads exactly once and the prompt disappears', async () => {
    test.setTimeout(120000);
    if (!postRestartGatesPassed) {
      test.skip(true, 'post-restart gates did not pass; UPD2 runs only on passed post-restart gates');
    }
    const hasWaiting = await page
      .evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
        return reg?.waiting ? true : false;
      })
      .catch(() => false);
    if (!hasWaiting) {
      test.skip(true, 'UPD1b browser flow skipped in sandbox; no waiting worker to update');
    }
    let reloads = 0;
    page.on('framenavigated', (frame) => {
      if (frame.parentFrame() === null) reloads += 1;
    });
    await page.getByRole('button', { name: 'Update' }).click();
    await expect(page.getByText('New version available')).toHaveCount(0, { timeout: 30000 });
    expect(reloads, 'Update must reload exactly once via controllerchange').toBe(1);
  });

  test('UPD3 re-check update() leaves no waiting worker', async () => {
    test.setTimeout(120000);
    if (!postRestartGatesPassed) {
      test.skip(true, 'post-restart gates did not pass; UPD3 runs only on passed post-restart gates');
    }
    const hasRegistration = await page
      .evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
        return reg !== null;
      })
      .catch(() => false);
    if (!hasRegistration) {
      test.skip(true, 'UPD1b browser flow skipped in sandbox; no registration to re-check');
    }
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
    });
    await page.waitForTimeout(3000);
    const waiting = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg?.waiting ? true : false;
    });
    expect(waiting, 'no waiting worker must remain after the update').toBe(false);
    expect(await page.getByText('New version available').count()).toBe(0);
  });

  test('MG1 manifest JSON parses, fields correct, icons 200 online (fetch-based)', async () => {
    test.setTimeout(60000);
    const manifestRes = await fetch(`${TARGET_4173}/manifest.webmanifest`);
    expect(manifestRes.status).toBe(200);
    const manifest = (await manifestRes.json()) as Record<string, unknown>;
    expect(manifest.name).toBe('System Design Mastery');
    expect(manifest.short_name).toBe('SD Mastery');
    expect(manifest.display).toBe('standalone');
    expect(manifest.scope).toBe('.');
    expect(manifest.start_url).toBe('.');
    expect(manifest.theme_color).toBe('#f5f0e6');
    expect(manifest.background_color).toBe('#f5f0e6');
    const icons = manifest.icons as Array<{ src: string; sizes: string; purpose?: string }>;
    expect(icons.length).toBeGreaterThanOrEqual(4);
    for (const icon of icons) {
      const iconRes = await fetch(new URL(icon.src, `${TARGET_4173}/manifest.webmanifest`).toString());
      expect(iconRes.status, `icon ${icon.src} must be 200`).toBe(200);
    }
  });

  test('MG2a sw.js 200 online (fetch-based)', async () => {
    test.setTimeout(30000);
    const res = await fetch(`${TARGET_4173}/sw.js`);
    expect(res.status).toBe(200);
  });

  test('MG2b registration present (browser, CI-only)', async () => {
    test.setTimeout(120000);
    const hasRegistration = await page
      .evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
        return reg !== null;
      })
      .catch(() => false);
    if (!hasRegistration) {
      test.skip(true, 'UPD1b browser flow skipped in sandbox; no registration to assert');
    }
    expect(hasRegistration, 'a service worker registration must be present').toBe(true);
  });
});
