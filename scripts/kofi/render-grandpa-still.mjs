#!/usr/bin/env node
/**
 * Render the Ko-fi grandpa fallback still from the scene itself.
 *
 * The widget's fallback (WebGL unavailable, context lost, reduced
 * motion, scene still loading) must be the SAME character as the live
 * 3D scene — never a separately drawn figure. This script mounts
 * GrandpaScene on a throwaway page at 3x the widget's frame (690x480),
 * in reduced-motion mode (exactly one static seated frame), and
 * screenshots the canvas with its alpha channel into
 * src/components/kofi/grandpa-seated.png.
 *
 * Re-run after any change to GrandpaScene's model, palette, or camera:
 *   node scripts/kofi/render-grandpa-still.mjs
 *
 * Uses only what the repo already has: vite (dev server) and Playwright
 * with the sandbox Chromium fallback wired in playwright.config.ts.
 */
import { spawn } from 'node:child_process';
import { existsSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(REPO_ROOT, 'src/components/kofi/grandpa-seated.png');
const HARNESS = join(REPO_ROOT, 'kofi-still.tmp.html');
const PORT = 5199;
const MAX_BYTES = 150_000; // flat-shaded, few colours, mostly transparent
const SANDBOX_CHROMIUM = '/opt/meta-chromium/chrome';

const HARNESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  canvas { display: block; width: 690px; height: 480px; }
</style></head><body>
<canvas id="still"></canvas>
<script type="module">
  import { mountGrandpaScene } from '/src/components/kofi/GrandpaScene.ts';
  const canvas = document.getElementById('still');
  const handle = mountGrandpaScene(canvas, { reducedMotion: true });
  window.__stillMounted = !!handle;
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__stillReady = true; }));
</script></body></html>
`;

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`vite dev server did not come up at ${url}`);
}

let server;
try {
  writeFileSync(HARNESS, HARNESS_HTML);
  server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
  });
  const pageUrl = `http://127.0.0.1:${PORT}/kofi-still.tmp.html`;
  await waitForServer(pageUrl);

  const browser = await chromium.launch({
    ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--no-proxy-server',
      '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults',
    ],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 690, height: 480 }, deviceScaleFactor: 1 });
    // This sandbox's Chromium blocks direct navigations to localhost
    // (Local Network Access checks) — proxy the dev server through Node
    // fetch, the same workaround as e2e/smoke.spec.ts.
    const target = `http://127.0.0.1:${PORT}`;
    await page.route('**/*', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.hostname !== '127.0.0.1') {
        await route.continue();
        return;
      }
      const upstream = await fetch(`${target}${url.pathname}${url.search}`, {
        method: req.method(),
        headers: req.headers(),
        body: ['GET', 'HEAD'].includes(req.method()) ? undefined : await req.postDataBuffer().catch(() => undefined),
        redirect: 'manual',
      });
      const headers = {};
      upstream.headers.forEach((v, k) => { headers[k] = v; });
      await route.fulfill({ status: upstream.status, headers, body: Buffer.from(await upstream.arrayBuffer()) });
    });
    await page.goto(pageUrl);
    await page.waitForFunction(() => window.__stillReady === true, null, { timeout: 30_000 });
    const mounted = await page.evaluate(() => window.__stillMounted);
    if (!mounted) throw new Error('scene failed to mount in the harness (no WebGL?)');
    await page.waitForTimeout(300); // let the one static frame settle
    await page.locator('#still').screenshot({ path: OUT, omitBackground: true });
  } finally {
    await browser.close();
  }

  const { size } = statSync(OUT);
  console.log(`grandpa-seated.png: ${size} bytes`);
  if (size > MAX_BYTES) {
    throw new Error(`still is ${size} bytes, over the ${MAX_BYTES}-byte budget — check the render`);
  }
  console.log('OK — fallback still rendered from the live scene.');
} finally {
  if (server) server.kill('SIGTERM');
  if (existsSync(HARNESS)) unlinkSync(HARNESS);
}
