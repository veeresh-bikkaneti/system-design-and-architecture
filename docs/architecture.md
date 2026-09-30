# Architecture

How this site works, for curious developers. The short version: it is a
static site on GitHub Pages. Everything expensive happens at build time;
the browser does the rest.

## 1. The static-hosting mental model

There is no server for the site itself. GitHub Pages serves plain files
— HTML, CSS, JS, images, audio. No database, no API, no server-side
rendering at request time for the course content. (The repo also contains
a Cloudflare Worker + D1 backend — `worker/` — for the course Q&A agent,
auth, and exams, but it is not deployed yet and the learning experience
doesn't depend on it.)

That constraint shapes every design decision:

- **Heavy work runs at build time, in CI.** Neural narration is
  generated ahead of time by maintainers and checked into the repo as
  static audio + manifest files (the CI build never runs TTS itself);
  page prerendering, OG share images, sitemap, RSS, and llms.txt are
  generated fresh during the build itself. Either way, what Pages serves
  is static files.
- **All interactivity runs in the visitor's browser.** React renders the
  UI, the `<audio>` element plays narration, Mermaid renders diagrams to
  SVG client-side. If it moves, highlights, or speaks, that happens on
  the learner's machine — the hosting bill stays zero.

If you're wondering "how does a static site do X?", the answer is always
one of: "it was precomputed at build time" or "your browser does it."

## 2. Build pipeline

`npm run build` runs three stages:

```
tsc -b && vite build && node scripts/seo/prerender.mjs
```

- **Vite** bundles the React 19 app. `vite.config.ts` sets
  `base: process.env.VITE_BASE_PATH ?? '/'`. The deploy workflow sets
  `VITE_BASE_PATH=/<repo-name>/` because GitHub Pages serves the site
  from a repository subpath, not the domain root. Building without it
  produces domain-root URLs that 404 on Pages — the throwaway e2e build
  skips it deliberately (it serves the build at a domain root locally,
  where the subpath doesn't exist); the real build never does.
- **Prerendering** (`scripts/seo/prerender.mjs`) renders the 39
  indexable routes to static `index.html` at build time — home, roadmap,
  badges, and the 36 lessons — each with its own title, description,
  canonical URL, OG/Twitter tags, and JSON-LD (schema.org structured data
  for search engines). This is what makes 36 lessons' worth of content
  visible to crawlers despite client-side routing.
- **SEO artifacts** (`scripts/seo/`): per-lesson OG share images
  (`generate-og-images.mjs`), `sitemap.xml` (`generate-sitemap.mjs`),
  RSS feed (`generate-feed.mjs`), and `llms.txt` with lesson summaries
  (`generate-llms-txt.mjs`) — all generated with the base path applied,
  all reading lesson metadata through shared helpers in `lesson-meta.mjs`
  (whose `siteConfig()` supplies the base path and site URL);
  `generate-manifest.mjs` uses those helpers to generate
  `src/lib/lesson-manifest.ts`.

CI (`.github/workflows/deploy.yml`) runs the checks gate (typecheck,
unit tests, lint, Cloudflare Worker gates, content index/eval gates);
then the production build and the e2e smoke suite in real Chromium run in
parallel; then it deploys to Pages.

## 3. Content system

Lessons are MDX files in `content/lessons/` — Markdown with embedded
React components (diagrams, quizzes, callouts).

- **Validation is a CI gate**, not a convention. `scripts/validate_lessons.py`
  checks frontmatter and quiz integrity (every question's `correctIndex`
  is within its options range, no empty question text); `scripts/check_mdx_h1.py`
  enforces heading structure. A lesson that fails validation doesn't ship.
- **Quizzes** are `<Quiz lessonSlug questions={...} />` components
  (`src/components/Quiz.tsx`). Results feed a client-side progress store
  (`src/store/progress.ts`, localStorage-backed) — there is no backend,
  so progress never leaves the browser.
- **Diagrams** are either Mermaid source blocks rendered to SVG
  client-side, or hand-built interactive React components
  (`src/components/diagrams/`).

## 4. Animations

All animation is CSS + React state — no animation libraries, no canvas
game loop.

- **The `translate` property, not `transform`.** Mermaid positions its
  SVG nodes with the `transform` *attribute*. Animating the CSS
  `transform` property would clobber those laid-out positions. The
  `translate` property composes *with* the attribute instead of replacing
  it, so nodes keep their positions while animating in
  (`src/components/diagrams/diagrams.css`, `mermaid-node-in` keyframes).
  If you animate SVG that something else positioned, reach for the
  individual transform properties (`translate`, `rotate`, `scale`) first.
- **Mermaid** diagrams render to SVG in the browser
  (`src/components/MermaidDiagram.tsx`); node entrances are staggered
  via `animation-delay` for a cascade effect.
- **StepThrough** (`src/components/diagrams/StepThrough.tsx`) is a
  stepper UI over diagrams: the learner advances steps and the
  corresponding diagram region highlights — state-driven, CSS-transitioned.
- Interactive diagrams (cache flows, load-balancer sims, hash-ring
  playgrounds) are React components with local state; motion is CSS
  transitions on state change.

## 5. Listen mode (neural narration)

Every lesson has a Listen button. Press it and the lesson is read aloud
while the exact word being spoken lights up — karaoke for system design.
(Deeper detail lives in `docs/listen-natural-tts.md`.)

### Voices are synthesized ahead of time

There is no TTS API call from the browser. `scripts/tts/synthesize.py`
runs **Kokoro-82M** (Apache-2.0, CPU-only) over the lesson's extracted
prose and emits, per lesson per accent:

```
public/audio/<slug>/<accent>/narration.opus    # the audio
public/audio/<slug>/<accent>/narration.json    # word-level timestamps
```

- **Accents:** `us` → Kokoro voice `af_heart` (language `a`),
  `uk` → `bf_emma` (language `b`). `--voice` selects the voice;
  `--only-missing` skips lessons that already have that accent.
- The manifest records its `accent` and `voice`; the player validates
  the manifest schema (including `accent`) before trusting it.
- Audio is Opus — small enough to ship the full corpus statically:
  36 lessons × 2 accents = 72 packages. (US packages are being generated
  first; until the UK run completes, UK probes fall back to Web Speech.)

### The player

`src/components/LessonNarrator.tsx` owns the player:

1. **Probe.** On load it fetches `audio/<slug>/<accent>/narration.json`.
   Manifest present and valid → neural player. Missing/invalid →
   Web Speech fallback.
2. **Karaoke.** The neural player (`<audio>` + `requestAnimationFrame`)
   drives highlighting off the **audio clock**: each frame binary-searches
   the manifest for the word at `audio.currentTime` and lights up its
   `<span class="narr-word">`. Words are wrapped in spans lazily on first
   play by `src/lib/narrate-dom.ts`, which aligns manifest blocks to DOM
   blocks by normalized text and rolls back to block-level highlighting
   rather than lighting up the wrong words.
3. **US/UK picker.** A segmented control switches accent, persisted in
   `localStorage`. Switching re-probes, remounts the player, and resets
   shared playback state — the new accent always starts clean.
4. **Floating pause/play button.** A fixed bottom-right button
   (`FloatingPlaybackButton.tsx`) stays reachable while scrolling. It
   shares state with the main player through a tiny framework-free store
   (`src/lib/playback-share.ts`): the active player publishes its status
   and registers its toggle, so both controls always agree — pause from
   either one, resume from either one. Rendered only when narration is
   available; stacked above the Q&A button so the two never overlap.
5. **Web Speech fallback** (`ListenButton.tsx`). When no neural package
   exists, the browser's own speech synthesis reads the lesson with
   sentence-level highlighting. It has its own device-voice preference
   (Auto/US/UK), and the floating button integrates with it exactly as
   with the neural player.

### Verification

`scripts/tts/verify_player.mjs <slug> [accent]` proves the player in
real Chromium: manifest validity, 100% word tagging, highlight advance
with the audio clock, seek accuracy, pause, floating-button agreement,
and the full fallback path. `scripts/tts/validate_manifest.py` checks
each package's opus file presence and the manifest schema (required
keys, matching `accent`, non-decreasing word timestamps).

## 6. Repo workflow

- **Feature branches.** All work happens on branches; `main` is never
  committed to directly.
- **PR flow.** Push the branch → open a pull request → merge with a
  **merge commit** (history stays readable) → delete the branch.
- **Main-branch ruleset.** The convention — enforced by branch
  protection on GitHub — is: no direct pushes to `main`; merges go
  through PRs with CI green (checks gate, build, e2e smoke). No merge, no
  deploy without explicit approval after the evidence has been reviewed.
- **Release branches** (e.g. `release/neural-voice-2026-09-30`) collect
  a release's work; worker branches (e.g. `swarm/tts-us-a`) hold
  machine-generated assets and merge back into the release branch.
