#!/usr/bin/env node
/**
 * End-to-end verification of the neural narration player for one lesson.
 *
 * Proves, in a real Chromium:
 *  1. `public/audio/<slug>/narration.json` is served and valid.
 *  2. Every manifest word is wrapped in a `span.narr-word` in the article.
 *  3. Pressing play starts the neural audio and the read-along highlight
 *     advances with the audio clock.
 *  4. Seeking via the narration options slider moves the highlight to the
 *     manifest word at the seek position.
 *  5. When the neural assets are unavailable, the lesson falls back to the
 *     browser's speech synthesis (spy on speechSynthesis.speak) and shows
 *     the fallback player UI.
 *
 * Environment note: this sandbox's Chromium blocks direct navigation to
 * localhost (Local Network Access checks), so every request to the dev
 * server is proxied through Node fetch via request interception — the same
 * pattern as e2e/smoke.spec.ts. Range requests are forwarded so the
 * <audio> element can stream the opus file through the proxy.
 *
 * Usage: node scripts/tts/verify_player.mjs <lesson-slug> [accent]  (accent defaults to "us")
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const REPO = new URL('../..', import.meta.url).pathname;
const CHROME = '/opt/meta-chromium/chrome';
const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}`;
const SLUG = process.argv[2];
const ACCENT = process.argv[3] || 'us';
if (!SLUG) {
  console.error('usage: node scripts/tts/verify_player.mjs <lesson-slug> [accent]');
  process.exit(2);
}
if (ACCENT !== 'us' && ACCENT !== 'uk') {
  console.error(`accent must be 'us' or 'uk', got ${ACCENT}`);
  process.exit(2);
}
const LESSON_URL = `${BASE}/lesson/${SLUG}/`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function waitForVite(proc, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/audio/${SLUG}/${ACCENT}/narration.json`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    if (proc.exitCode !== null) throw new Error('vite dev server exited early');
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite dev server did not start');
}

/**
 * Proxy the local dev server through Node fetch (see module docstring).
 * When blockAudio is true, /audio/** requests get a 404, simulating a
 * lesson with no build-time narration so the browser-voice fallback runs.
 */
async function proxyLocalServer(page, { blockAudio = false } = {}) {
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== '127.0.0.1') {
      await route.continue();
      return;
    }
    if (blockAudio && url.pathname.startsWith('/audio/')) {
      await route.fulfill({ status: 404, body: 'not found (verify_player fallback simulation)' });
      return;
    }
    const upstream = await fetch(`${BASE}${url.pathname}${url.search}`, {
      method: req.method(),
      headers: {
        ...(req.headers().range ? { range: req.headers().range } : {}),
      },
      redirect: 'manual',
    });
    const headers = {};
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

async function newBrowser() {
  return chromium.launch({
    executablePath: CHROME,
    env: {
      ...process.env,
      http_proxy: '', https_proxy: '', HTTP_PROXY: '', HTTPS_PROXY: '',
      all_proxy: '', ALL_PROXY: '',
      no_proxy: '*', NO_PROXY: '*',
    },
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      // The sandbox's proxy env vars would otherwise route localhost
      // through the public egress proxy, tripping Chrome's Local Network
      // Access checks and blocking the dev server (see playwright.config.ts).
      '--no-proxy-server',
      '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults',
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
    ],
  });
}

/** Manifest word index active at media time t (mirrors findActiveWordIndex). */
function wordIndexAt(flat, t) {
  let idx = -1;
  for (let i = 0; i < flat.length; i++) {
    if (flat[i].start <= t) idx = i;
    else break;
  }
  return idx !== -1 && t < flat[idx].end ? idx : -1;
}

let vite;
let ownVite = false;
try {
  // Reuse a server already on the port (e.g. started separately).
  // The manifest URL proves it is serving this repo's public/ dir.
  let up = false;
  try {
    up = (await fetch(`${BASE}/audio/${SLUG}/${ACCENT}/narration.json`)).ok;
  } catch { /* not up */ }
  if (!up) {
    vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
      cwd: REPO, stdio: 'ignore',
    });
    ownVite = true;
    await waitForVite(vite);
  }

  const manifest = await (await fetch(`${BASE}/audio/${SLUG}/${ACCENT}/narration.json`)).json();
  const flat = manifest.blocks.flatMap((b) => b.words);
  check('manifest served and valid', manifest.slug === SLUG && flat.length > 0, `${flat.length} words`);

  // ---- Neural path -------------------------------------------------------
  {
    const browser = await newBrowser();
    const page = await browser.newPage();
    // The player's accent comes from localStorage (defaults to "us"): seed
    // it so the page actually plays the accent under test. Without this the
    // UK runs silently tested US audio against UK manifest timings.
    await page.addInitScript((accent) => {
      window.localStorage.setItem('lesson-narration-accent', accent);
    }, ACCENT);
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().startsWith('Failed to load resource:')) {
        errors.push(`console: ${m.text()}`);
      }
    });
    await proxyLocalServer(page);
    await page.goto(LESSON_URL, { waitUntil: 'networkidle' });
    // The MDX body mounts asynchronously (Suspense + dynamic import);
    // tagging aligns against the rendered article, so wait for it.
    await page.waitForFunction(
      () => (document.querySelector('.lesson-prose')?.textContent ?? '').length > 1000,
      { timeout: 30_000 },
    );

    // Neural player mounted (its options button only exists in neural mode).
    await page.getByRole('button', { name: 'Narration options', exact: true })
      .waitFor({ timeout: 15_000 });
    check('neural player mounted', true);

    // Floating play button is visible while the neural player is mounted.
    // It shares its accessible name with the main player; .fixed isolates it
    // (the Q&A button is also fixed but named "Open course Q&A").
    await page.locator('button.fixed[aria-label="Listen to this lesson"]')
      .waitFor({ timeout: 15_000 });
    check('floating play button visible', true);

    // Play via the main player button (:not(.fixed) excludes the floating one).
    await page.locator('button[aria-label="Listen to this lesson"]:not(.fixed)').click();
    await page.getByText(/Playing AI narration/).waitFor({ timeout: 15_000 });
    check('neural audio playing', true);

    // Words are tagged lazily on first play.
    const tagged = await page.locator('span.narr-word').count();
    check(
      'all manifest words tagged',
      tagged === flat.length,
      `${tagged}/${flat.length} spans`,
    );

    // Highlight advances with the audio clock.
    const idx1 = await page.locator('span.narr-word-active').getAttribute('data-narr-idx');
    await page.waitForTimeout(4000);
    const idx2 = await page.locator('span.narr-word-active').getAttribute('data-narr-idx');
    check(
      'highlight advances with audio clock',
      idx1 !== null && idx2 !== null && Number(idx2) > Number(idx1),
      `word ${idx1} → ${idx2}`,
    );

    // Seek: jump to the middle of a known word; the highlight must land there.
    // (Mid-lesson for long lessons; the midpoint for short ones — a hardcoded
    // index would fail with a confusing timeout on lessons under 501 words.)
    // Rounded to the slider's 0.5s step: the range input snaps fractional
    // values, so the expected clock text must be computed from the snapped t.
    const probe = flat.length > 500 ? flat[500] : flat[Math.floor(flat.length / 2)];
    const t = Math.round(((probe.start + probe.end) / 2) * 2) / 2;
    const expected = wordIndexAt(flat, t);
    await page.getByRole('button', { name: 'Narration options', exact: true }).click();
    const slider = page.getByLabel('Seek narration');
    // Set via the native value setter so React's controlled input picks up
    // the change; then fire input for React's onChange.
    await slider.evaluate((el, v) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
        .set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, t);
    // The dialog shows "m:ss / m:ss" progress; the seek must move it near t.
    await page.waitForFunction(
      (exp) => {
        const dlg = document.querySelector('div[aria-label="Narration options"]');
        return dlg && dlg.textContent.includes(`${Math.floor(exp / 60)}:${String(Math.floor(exp % 60)).padStart(2, '0')}`);
      },
      t,
      { timeout: 10_000 },
    );
    check('seek moves playback position', true, `t=${t.toFixed(2)}s`);
    // Pause immediately: the audio keeps playing forward, so catching the
    // exact seek-target word (often <0.5s long) while playing is a race.
    // Pausing freezes the highlight; it must have landed within a few
    // words of the seek target — proving seek→highlight linkage.
    await page.getByRole('button', { name: 'Pause narration' }).click();
    await page.getByText(/Paused at/).waitFor({ timeout: 10_000 });
    check('pause works', true);
    const frozenIdx = await page.locator('span.narr-word-active').getAttribute('data-narr-idx');
    check(
      'seek highlights manifest word at seek time',
      frozenIdx !== null && Number(frozenIdx) >= expected - 1 && Number(frozenIdx) <= expected + 10,
      `t=${t.toFixed(2)}s → word ${frozenIdx} (expected ~${expected})`,
    );

    // Floating button shares the player's state and drives it: resume from
    // the main player's paused state through the floating control.
    // (The neural main button says "Resume narration" — only the floating
    // button says "Resume listening".)
    await page.locator('button.fixed[aria-label="Resume listening"]').click();
    await page.getByText(/Playing AI narration/).waitFor({ timeout: 15_000 });
    check('floating button resumes neural playback', true);
    check(
      'floating button agrees with player state',
      (await page.locator('button.fixed[aria-label="Pause listening"]').count()) === 1,
    );

    check('no page errors during neural playback', errors.length === 0, errors.join(' | ').slice(0, 200));
    await browser.close();
  }

  // ---- Fallback path (neural assets unavailable) --------------------------
  {
    const browser = await newBrowser();
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.__speakCalls = [];
      const synth = window.speechSynthesis;
      // No fake voice objects: assigning a plain object to
      // utterance.voice fails Chromium's WebIDL type check (a real
      // browser returns genuine SpeechSynthesisVoice platform objects,
      // so the app never hits this). With zero voices the app skips the
      // voice assignment and speaks with the default voice.
      synth.getVoices = () => [];
      synth.speak = (u) => {
        window.__speakCalls.push({ text: u.text.slice(0, 80), rate: u.rate });
        // Don't actually speak: just record the call and report started so
        // the app's state machine proceeds.
        setTimeout(() => u.onstart && u.onstart(new Event('start')), 0);
        return undefined;
      };
    });
    await proxyLocalServer(page, { blockAudio: true });
    await page.goto(LESSON_URL, { waitUntil: 'networkidle' });

    // Fallback player UI: no neural options button, no karaoke word spans.
    await page.locator('button[aria-label="Listen to this lesson"]:not(.fixed)').waitFor({ timeout: 15_000 });
    const neuralOptions = await page
      .getByRole('button', { name: 'Narration options', exact: true })
      .count();
    const karaokeSpans = await page.locator('span.narr-word').count();
    check('fallback renders (no neural UI)', neuralOptions === 0 && karaokeSpans === 0,
      `neuralOptions=${neuralOptions} narr-word spans=${karaokeSpans}`);

    await page.locator('button[aria-label="Listen to this lesson"]:not(.fixed)').click();
    // NOTE: this must match ListenButton's sr-only status text exactly.
    await page.getByText('Playing lesson audio.').waitFor({ timeout: 15_000 });
    const speakCalls = await page.evaluate(() => window.__speakCalls.length);
    const firstText = await page.evaluate(() => window.__speakCalls[0]?.text ?? '');
    check('browser voice fallback speaks', speakCalls > 0 && firstText.length > 0,
      `${speakCalls} speak() call(s), first: ${JSON.stringify(firstText)}`);

    // Fallback highlights the spoken block.
    const activeBlocks = await page.locator('.narr-block-active').count();
    check('fallback highlights spoken block', activeBlocks > 0, `${activeBlocks} active block(s)`);

    // Floating button reflects and drives the fallback player too.
    // (The fallback main button also says "Pause listening" — .fixed
    // isolates the floating one.)
    check(
      'floating button reflects fallback playing state',
      (await page.locator('button.fixed[aria-label="Pause listening"]').count()) === 1,
    );
    await page.locator('button.fixed[aria-label="Pause listening"]').click();
    // NOTE: this must match ListenButton's sr-only status text exactly.
    await page.getByText('Paused.', { exact: true }).waitFor({ timeout: 10_000 });
    check('floating button pauses fallback speech', true);

    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
} finally {
  if (ownVite) vite?.kill('SIGKILL');
}
