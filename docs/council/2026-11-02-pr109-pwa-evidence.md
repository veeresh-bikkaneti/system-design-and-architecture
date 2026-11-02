# Evidence packet for the T1 council: PR #109 (PWA), head a5aaed0

Tier T1 (touches `src/components/AuthBar.tsx` and `src/lib/gist-sync.ts`). Prepared by the implementer agent, verified/inferred/UNVERIFIED labels as reported. Procedure: AGENTS.md section 3 (four seats, then the advisor).

## State
- Head a5aaed0 on `feat/pwa`; 7 of 7 PR checks pass (CodeQL, Analyze, Frontend gates, Worker gates, E2E smoke, Ben routing gate, GitGuardian).
- Local gates: `npm test` 708/708; lint exit 0; `tsc -b` clean; `content:check` OK; `content:validate` 41 lessons OK; build with `VITE_BASE_PATH=/system-design-and-architecture/` OK, 171 precache entries / 13,385 KiB, snapshot budget OK. Local e2e: 21 passed, 1 failed (Windows `spawn npx ENOENT` in UPD1a), 6 not run; CI e2e passes on the final head.
- Merge of `origin/main` into the branch (no force-push). Conflicts: EVIDENCE_LOG.md (both sides kept); package.json (main's `vitest ^5.0.5` plus only `vite-plugin-pwa 1.3.0`); package-lock.json (main's lock plus `npm install --package-lock-only`; name/version diff: 297 packages added, 0 changed, 0 removed); `src/components/qa/QaChatPanel.tsx` (main's file taken unchanged: the PR no longer touches it; main shows the failed model state via `modelStatus.detail` from `inference.ts:158`, "On-device model unavailable · answering from the lessons"; the PR's unit test and BH-E2E were updated to main's text; behaviour change: header failure wording changes from "Model failed · lesson answers work").
- A real e2e defect was found and fixed: the UPD1b spec's `startPreview` used `npx vite preview`, which leaves an orphan process holding port 4174 after SIGTERM, so the "new version" server never started and `update()` saw identical bytes; fixed to run node on vite's entry file directly; `pwa-update.spec.ts` passes 7/7 locally.
- Diff: 11,476 additions against main, of which 8,199 are the lockfile; about 3,277 real lines (35 deletions). Non-lockfile files over 300 lines: `e2e/pwa-offline.spec.ts` (558), `e2e/pwa-update.spec.ts` (405+), `UpdatePrompt.test.tsx` (389), `e2e/signed-in-offline-label.spec.ts` (337), `UpdatePrompt.tsx` (302).

## a) Two bases
- The service worker is registered at `${BASE_URL}sw.js` with scope `BASE_URL` (`src/main.tsx`). Manifest `start_url` and `scope` are `.`, no `id`. `index.html` links `/manifest.webmanifest`, which Vite rewrites per base. SW precache URLs are relative; the Workbox navigation fallback is `404.html`, which prerender writes for any base.
- Verified at the Pages base: the built `index.html` links `/system-design-and-architecture/manifest.webmanifest`. CI e2e runs at base `/`.
- The Cloudflare mirror builds with `VITE_BASE_PATH=/` (`deploy.yml:159`) and `wrangler.mirror.toml` has SPA `not_found_handling`. NOT built or run here: mirror SW behaviour is inferred.
- The PR itself says subpath behaviour is unproven and needs a check on the Pages deploy.
- Inferred: while the SW controls the origin root, navigating directly to `/sitemap.xml`, `/feed.xml` or `/llms.txt` returns the app shell instead of the file.

## b) Caching
- Precache is `assets/**/*.{js,css}` plus `404.html` only (`vite.config.ts`). No runtime caching in the built `sw.js` (verified).
- Nothing caches API or worker calls, the OAuth exchange, tokens, Hugging Face or WebLLM weights, audio, or `ort/` (ONNX runtime WASM, up to 26.9 MB).
- Largest precached file `lib-*.js` 6.04 MB, under Cloudflare's 25 MiB per-asset cap. Total precache 13.4 MiB against the PR's 20 MB gate.

## c) Update flow
- `skipWaiting` only on a `SKIP_WAITING` message from the user's Update click. No `clientsClaim`. `UpdatePrompt` is in-flow with an in-memory dismiss. Declining keeps the old version, which stays self-consistent because its assets are precached (verified in the spec).
- There is no kill-switch or self-unregister path. If an old SW boots a broken app, the prompt cannot render and the user is stuck until all tabs close. Not fixed in this PR.

## d) T1 behaviour changes (`AuthBar.tsx`, `gist-sync.ts`)
- `applySnapshot` no longer calls `markClean`; only a successful push does (`gist-sync.ts:130`).
- "Continue" navigates even if sync throws, and opens login only when the token was cleared.
- Sign-in and OAuth errors are staged: network copy versus "GitHub rejected that token". Post-exchange sync failures no longer show a sign-in error; a 401/403 opens login.
- The signed-in label shows "Synced" only when not dirty. `idle.ts` swallows background sync failures.
- Token storage unchanged (sessionStorage only; `session.ts` not touched). Tests added: `AuthBar.test.tsx`, `gist-sync.test.ts`.
- Pre-existing, not changed: `github()` on a 401/403 sets `accessToken` to null in the store but does not clear sessionStorage.

## e) CSP and f) SEO
- `index.html` gets only two `<link>` lines; the CSP is unchanged. `worker-src` and `manifest-src` fall back to `default-src 'self'`, so the SW and manifest are covered; `script-src` is not weakened.
- Prerender produced 46 routes; snapshot budget OK; no generated `public/` artifacts committed.

## NOT RUN
Lighthouse; Android/iOS install checks; a real two-deploy update; a Cloudflare mirror build or run.

## Questions the implementer raised
Is the missing kill-switch acceptable? Should the SW exclude `/sitemap.xml`, `/feed.xml` and `/llms.txt` from the navigation fallback?
