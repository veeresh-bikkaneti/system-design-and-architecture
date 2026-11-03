# PWA runbook: recovering from a broken service-worker deploy

Short version: there is no watchdog (the owner accepted that on PR #109). If a
deploy ships a bad app shell, the fix is to ship a `sw.js` that removes itself.

## How a bad deploy reaches users

- The worker precaches `assets/**/*.{js,css}` plus `404.html`, and answers every
  page navigation with that cached shell. A broken shell stays broken offline.
- `sw.js` is registered with the default `updateViaCache` (`'imports'`, checked by
  `e2e/pwa-build.spec.ts` BLD4), so the browser always revalidates `sw.js`
  itself and does not trust the HTTP cache for it. (Spec behaviour; UNVERIFIED
  end to end because `sw.js` is not live until this ships.)
- A new `sw.js` installs but WAITS. There is no `skipWaiting` on install and no
  `clientsClaim`. It takes over when every tab on the old version is closed, or
  when the user clicks Update in the banner.
- Residual risk: if the old shell is so broken the banner cannot render, the
  user stays on it until they close all tabs of the site.

## Header facts (curl -sI, 2026-11-02)

- GitHub Pages JS asset: `Cache-Control: max-age=600`, `ETag` present.
- Cloudflare mirror JS asset: `Cache-Control: public, max-age=0, must-revalidate`.
- No `_headers` file in the repo.

## Ship an unregistering sw.js

1. Branch from main. In `vite.config.ts` stop using VitePWA for this release, or
   replace its output: the file served at `<base>sw.js` must be exactly:

   ```js
   self.addEventListener('install', () => self.skipWaiting());
   self.addEventListener('activate', (event) => {
     event.waitUntil(
       (async () => {
         const keys = await caches.keys();
         await Promise.all(keys.map((k) => caches.delete(k)));
         await self.registration.unregister();
         const clients = await self.clients.matchAll({ type: 'window' });
         clients.forEach((c) => c.navigate(c.url));
       })(),
     );
   });
   ```

   `skipWaiting` here is deliberate: this release must replace the broken worker
   without waiting for tabs to close.
2. Keep `src/main.tsx` registering `<base>sw.js` so existing clients fetch it.
3. Deploy to both surfaces (Pages and the Cloudflare mirror).

## Verify users recover

- In a browser that has the broken version installed, open the site, wait for the
  update check (or DevTools, Application, Service Workers, Update), then confirm:
  `navigator.serviceWorker.getRegistrations()` resolves to `[]` and
  `caches.keys()` resolves to `[]` after the page reloads.
- Confirm the page then loads from the network (DevTools, Network, no
  "(ServiceWorker)" in the Size column).
- Once the bad release is fixed, ship a normal build; clients re-register on the
  next visit.
