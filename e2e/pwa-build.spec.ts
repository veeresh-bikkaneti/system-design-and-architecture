import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Council 2026-11-02 (PR #109): assertions on the BUILT service worker and
 * on the registration source. Filesystem only, no browser; they read
 * dist/sw.js, so run `npm run build` first (CI does).
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const swPath = join(root, 'dist', 'sw.js');

function sw(): string {
  expect(existsSync(swPath), 'dist/sw.js must exist (build before running e2e)').toBe(true);
  return readFileSync(swPath, 'utf-8');
}

test.describe('built service worker (filesystem)', () => {
  test('BLD1 navigation fallback denylist keeps file-like paths away from the app shell', () => {
    const m = sw().match(/denylist:\[(\/.*?\/[a-z]*)\]/);
    expect(m, 'sw.js must carry a NavigationRoute denylist').not.toBeNull();
    const lit = m![1];
    const re = new RegExp(lit.slice(1, lit.lastIndexOf('/')), lit.slice(lit.lastIndexOf('/') + 1));
    for (const p of [
      '/sitemap.xml',
      '/feed.xml',
      '/llms.txt',
      '/robots.txt',
      '/audio/lesson-one.mp3',
      '/system-design-and-architecture/sitemap.xml',
      '/system-design-and-architecture/audio/us/x.mp3',
    ]) {
      expect(re.test(p), `${p} must be denied the app shell`).toBe(true);
    }
    for (const p of [
      '/',
      '/system-design-and-architecture/',
      '/oauth/callback',
      '/oauth/callback?code=ab.cd',
      '/system-design-and-architecture/oauth/callback?code=a1&state=x.y',
      '/lesson/caching-strategies',
      '/roadmap',
      '/privacy',
    ]) {
      expect(re.test(p), `${p} is an SPA route and must still get the shell`).toBe(false);
    }
  });

  test('BLD2 no clientsClaim, skipWaiting only behind the SKIP_WAITING message', () => {
    const s = sw();
    expect(s).not.toContain('clientsClaim');
    expect(s).not.toMatch(/clients\.claim/);
    const skips = s.match(/skipWaiting\(\)/g) ?? [];
    expect(skips).toHaveLength(1);
    expect(s).toMatch(/"SKIP_WAITING"===[a-z]\.data\.type&&self\.skipWaiting\(\)/);
  });

  test('BLD3 precache is assets js/css plus 404.html only, and has no runtime caching', () => {
    const s = sw();
    const urls = [...s.matchAll(/\{url:"([^"]+)"/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(50);
    for (const u of urls) {
      expect(u === '404.html' || /^assets\/[^"]+\.(js|css)$/.test(u), `unexpected precache url ${u}`).toBe(true);
    }
    expect(urls).toContain('404.html');
    expect(s).not.toContain('registerRoute(/');
    expect(s).not.toMatch(/CacheFirst|NetworkFirst|StaleWhileRevalidate/);
  });

  test('BLD4 registration keeps the default updateViaCache (never "all")', () => {
    const main = readFileSync(join(root, 'src', 'main.tsx'), 'utf-8');
    expect(main).toContain('navigator.serviceWorker');
    expect(main).not.toMatch(/updateViaCache/);
  });
});
