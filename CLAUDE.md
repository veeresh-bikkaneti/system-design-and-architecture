# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev      # local dev server
npm run build    # tsc -b && vite build -> dist/ (static export, no SSR/backend)
npm run preview  # serve the production build locally
npm run lint      # oxlint (see .oxlintrc.json)
```

There is no test suite in this repo (no test runner in `package.json`, no `*.test.*`/`*.spec.*` files).

`package-lock.json` is intentionally gitignored, so `.github/workflows/deploy.yml` must not use
`actions/setup-node`'s `cache: npm` — it requires a committed lockfile and will fail the build step
otherwise.

## Architecture

This is a static, client-only Vite + React + TypeScript SPA — no backend. It ships to GitHub Pages
via `npm run build` producing `dist/`, deployed by `.github/workflows/deploy.yml` on push to `main`
(base path set via `VITE_BASE_PATH` for the repo-name subpath). The app uses `HashRouter`
(`src/App.tsx`) specifically so client-side routes work on GitHub Pages without server rewrites.

**Lessons are MDX files loaded at build time.** `src/lib/lessons.ts` uses
`import.meta.glob('/content/lessons/*.mdx', { eager: true })` to import every lesson module, then
sorts them by `meta.order`. Each `.mdx` file under `content/lessons/` must export a `meta` object
(`slug`, `title`, `tier`, `order`, `summary`, `estimatedMinutes`) followed by the lesson body in
Markdown/JSX. `vite.config.ts` wires `@mdx-js/rollup` (with `remark-gfm`) *before* the React plugin
so `.mdx` compiles into an importable component. Lessons end with a `## Sources & further reading`
section citing primary/canonical sources for the topic (see `README.md`'s Curriculum section for
the citation convention this course follows) — not attribution to any single secondary source.

**Tier-gated progression.** Lessons belong to a `tier` (`beginner` | `intermediate` | `advanced`,
ordered by `tierOrder` in `src/lib/lessons.ts`). `src/lib/progress-gate.ts` unlocks a tier only once
every lesson in the immediately preceding tier is completed; `LessonPage` redirects home if the
requested slug is locked or unknown. A lesson is marked complete either manually or by passing its
embedded `<Quiz>` (mapped as an MDX component in `App.tsx`'s `MDXProvider`) at or above
`QUIZ_PASS_THRESHOLD` (0.7). All progress lives in `src/store/progress.ts`, a Zustand store
persisted to `localStorage` under the key `sdm-progress`.

**BYOK AI tutor is a strictly additive, client-only feature.** The user supplies their own
Anthropic API key, stored in `localStorage` via the Zustand store `src/store/aiSettings.ts` (key
`sdm-ai-settings`) and used directly from the browser (`dangerouslyAllowBrowser: true` in
`src/ai/client.ts`) — the key is sent only to Anthropic's API, never to any other service. Every
lesson, quiz, and progress feature must keep working with zero API key configured.
`src/ai/systemPrompt.ts` builds a system prompt that includes the current lesson's title/summary
(derived from the route in `ChatWidget.tsx`) and a strict contract requiring architecture answers
to include a fenced ` ```mermaid ` diagram, rendered via `MermaidDiagram.tsx`/`ChatMarkdown.tsx`.
