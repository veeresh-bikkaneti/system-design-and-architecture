# Evidence Log

Append-only record of completed work: what was attempted, what happened, and what blocked it. Newest entries at the bottom.

## 2026-10-23 — Seated Ko-fi ask (KofiBench)

- **Tier:** T2 (Manifest + council: Chair + C seat; 3 scoped files).
- **Task:** Add a seated Ko-fi ask to the course shell, tailored from the owner's spec for this site (not a port of any other site's flow): grandpa seated on a bench, tree to his left, mug in hand; a short refill animation plays once per page load; a speech cloud anchored to him shows the locked ask copy from first render; tapping the cloud or grandpa swaps the same cloud to a confirm (Continue / Cancel); Continue opens `VITE_KOFI_URL` via `window.open(url, "_blank", "noopener,noreferrer")`; Cancel and Escape return to the ask with focus restored. Renders nothing when `VITE_KOFI_URL` is unset/blank or the browser is offline. Never gates any lesson, badge, or Start learning. `prefers-reduced-motion`: no pour, cloud and confirm still work.
- **Files:** `src/components/kofi/KofiBench.tsx`, `src/components/kofi/KofiBench.test.tsx`, `src/App.tsx` (mount only).
- **Evidence:** failing test first, then 9/9 unit tests green; full suite 401/401; `tsc -b` clean; oxlint 0 errors; production build with the env var set embeds the URL, with it unset the bundle contains neither the URL nor the ask copy; Playwright (real Chromium) at 1280×800 and 390×740: cloud copy visible from first render, bounding-box non-intersection vs the Q&A button and Start learning asserted, no horizontal scroll at 390px, confirm flow + Ko-fi popup URL verified, a lesson still starts with the scene present, reduced-motion emulation shows the seated still scene with a working confirm.
- **Blocker:** none in the build. Go-live needs `VITE_KOFI_URL` set as a build variable on each deploy target (Workers Builds project env and the GitHub Actions secret for Pages); without it the scene silently renders nothing, by design.
