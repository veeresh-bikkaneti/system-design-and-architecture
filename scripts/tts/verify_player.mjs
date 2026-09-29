#!/usr/bin/env node
/**
 * End-to-end verification for neural lesson narration (Track A).
 *
 * Serves the app with vite, drives it with system Chromium via
 * playwright-core, and proves:
 *  1. narration.json + narration.opus are served for the lesson
 *  2. clicking Listen tags every manifest word as span.narr-word
 *  3. seeking through the public UI moves the karaoke highlight to the
 *     word the manifest says is spoken at that media time (sync proof)
 *  4. the highlight advances on its own with the audio clock
 *  5. with /audio/* blocked, the Web Speech fallback renders (no neural UI)
 *
 * Usage: node scripts/tts/verify_player.mjs [slug]
 * Requires: npm install already run; public/audio/<slug>/ generated.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const REPO = new URL('../..', import.meta.url).pathname;
const CHROME = '/opt/meta-chromium/chrome';
const PORT = 5199;
const SLUG = process.argv[2] ?? 'scaling-web-service';
const BASE = `http://127.0.0.1:${PORT}`;

const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

async function waitForVite(proc) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await sleep(1000);
  }
  throw new Error('vite dev server did not start');
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

let vite;
try {
  vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: REPO, stdio: 'ignore',
  });
  await waitForVite(vite);

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });

  // ---- neural path ----
  const page = await browser.newPage();
  const jsonRes = await page.request.get(`${BASE}/audio/${SLUG}/narration.json`);
  check('manifest served (200)', jsonRes.ok());
  const opusRes = await page.request.get(`${BASE}/audio/${SLUG}/narration.opus`);
  check('opus audio served (200)', opusRes.ok());
  const manifest = await jsonRes.json();
  const flat = manifest.blocks.flatMap((b) => b.words);

  await page.goto(`${BASE}/lesson/${SLUG}/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Listen to this lesson' }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('span.narr-word').length > 0,
    null, { timeout: 20000 },
  );
  const tagged = await page.locator('span.narr-word').count();
  check('all manifest words tagged in DOM', tagged === flat.length, `${tagged}/${flat.length}`);

  // Seek to the middle of the lesson through the public UI, then confirm
  // the highlighted word matches the manifest at that media time.
  const target = Math.floor(flat.length / 2);
  const t = flat[target].start + 0.05;
  await page.evaluate((time) => {
    const slider = document.querySelector('input[aria-label="Seek narration"]');
    slider.value = String(time);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  }, t);
  await sleep(1200);
  const active = await page.evaluate(() => {
    const el = document.querySelector('span.narr-word-active');
    return el ? { text: el.textContent, idx: Number(el.dataset.narrIdx) } : null;
  });
  const idxOk = active && Math.abs(active.idx - target) <= 3;
  const textOk = active && norm(active.text) === norm(flat[active.idx]?.text ?? '');
  check('karaoke highlight matches manifest at seek time', !!(idxOk && textOk),
    active ? `idx=${active.idx} (target ${target}) text="${active.text}"` : 'no active word');

  // Highlight must advance on its own, driven by the audio clock.
  const idx1 = active?.idx ?? -1;
  await sleep(3000);
  const idx2 = await page.evaluate(() => {
    const el = document.querySelector('span.narr-word-active');
    return el ? Number(el.dataset.narrIdx) : -1;
  });
  check('highlight advances with audio clock', idx2 > idx1, `${idx1} -> ${idx2}`);

  const blockActive = await page.locator('.narr-block-active').count();
  check('spoken block highlighted', blockActive > 0);
  await page.close();

  // ---- fallback path: /audio/* blocked ----
  const ctx2 = await browser.newContext();
  await ctx2.route('**/audio/**', (route) => route.abort());
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE}/lesson/${SLUG}/`, { waitUntil: 'networkidle' });
  await page2.getByRole('button', { name: 'Listen to this lesson' }).click();
  await sleep(3000);
  const taggedFallback = await page2.locator('span.narr-word').count();
  const aiNote = await page2.getByText('Narrated by an AI voice').count();
  check('fallback renders without neural tagging', taggedFallback === 0 && aiNote === 0,
    `tagged=${taggedFallback} aiNote=${aiNote}`);
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exitCode = failed.length ? 1 : 0;
} finally {
  vite?.kill();
}
