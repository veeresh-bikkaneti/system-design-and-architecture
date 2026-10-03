---
name: listen-mode-narration
description: Build or extend "Listen" (read-aloud) mode for a static, client-only content site - natural neural voices with US and UK accents generated at build time, word-by-word follow-along highlighting, and navigation that lets learners rewind, skip forward, start from any paragraph and resume where they left off - with a browser-voice fallback, and ship it without breaking production. Use when asked to add or improve text-to-speech, narration, read-along or audio playback for lessons/articles; when listeners can only play from the start ("no fast forward / skip / read from here"); when adding another accent or voice; when a Listen/narration change touches LessonNarrator, ListenButton, playback-share, listen-seek or scripts/tts; or when reusing this pipeline in another repo. Trigger proactively on "make it sound human", "highlight the word being read", "rewind", "continue where I left off".
---

# Listen mode: natural voices, follow-along, and seek on a static site

Extracted from building this course's Listen mode, then retrofitting seek after a user noticed it
could only play from the start. The repo is the source of truth (`docs/listen-natural-tts.md`,
`docs/architecture.md` section 5); this skill is the *order of work* and the traps that cost time.
Ground each step in the project you are actually in; file names below are this repo's and are
illustrations when you apply the skill elsewhere.

## The shape of the solution

Two tiers, both zero runtime cost, no backend:

1. **AI narration (primary).** At build time a neural TTS (Kokoro-82M, Apache-2.0, CPU) turns each
   lesson's prose into `narration.opus` plus `narration.json` (per-word timestamps), one pair per
   accent: `public/audio/<slug>/us/` (voice `af_heart`) and `.../uk/` (voice `bf_emma`). The browser
   plays it with a plain `<audio>` element and lights up the word at `audio.currentTime`.
2. **Browser voice (fallback).** Web Speech API reads the same blocks, highlighting the block and,
   where the browser reports boundaries, the sentence. It is also the path for any lesson or accent
   without generated audio, so Listen never breaks.

Seek, resume and progress are built on **one shared concept, the block index**, so both tiers behave
identically from the learner's side.

## Phase 1 - Decide the architecture before touching code

- Check whether narration already exists on the base branch (`scripts/tts`, `public/audio`,
  `LessonNarrator.tsx`). Extend it; do not build a second pipeline.
- Confirm the constraints: static hosting, no API keys for learners, no per-listen cost. If the user
  wants runtime cloud TTS, say what it breaks (keys, cost, privacy) and ask.
- Why build time: natural voice, $0 forever, word timestamps from the model's duration predictor, and
  the player stays a plain `<audio>` element.

## Phase 2 - Extract speakable blocks

`scripts/tts/extract_narration.py` turns each MDX lesson into ordered blocks of kind `title`,
`summary`, `prose`. Rules that matter:

- Skip code, diagrams, quizzes, JSX widgets, comments. Join wrapped list items into one block (it
  renders as one `<li>`). Expand symbols to spoken form (`~` to "about", `&` to "and"); the DOM side
  mirrors this with `speakablePunct` so spoken and written text still match.
- Store a content hash so stale audio can be detected after the lesson changes.

## Phase 3 - Synthesize per accent

```bash
python3 scripts/tts/synthesize.py --only-missing          # writes opus + manifest per lesson
python3 scripts/tts/synthesize.py --voice bf_emma --only-missing   # UK; --voice picks the accent dir
python3 scripts/tts/synthesize.py --slugs <slug> --limit-blocks 3  # smoke test
```

- `VOICES` in `synthesize.py` maps voice id to (misaki lang code, accent dir). Adding an accent is one
  entry there, one entry in `NARRATION_ACCENTS` in `src/lib/narration.ts`, then re-run.
- It logs failures per lesson without aborting and exits nonzero; re-run `--only-missing` to retry.
- Offline or behind a proxy: `HF_HUB_OFFLINE=1` resolves weights from `scripts/tts/.cache/hf/`.
  A 403 on the Hugging Face download means the sandbox blocks it - report it, do not work around it.
- Manifest contract (validated at runtime by `isValidManifest`): `slug`, `voice`, `accent`,
  `sampleRate`, `duration`, `audio` (a safe `*.opus` name), `contentHash`, and `blocks[]` with
  `words[] {text,start,end}`; starts non-decreasing, all within `duration`.

## Phase 4 - Validate, then publish the index

```bash
python3 scripts/tts/validate_manifest.py <slug> <accent>   # player contract, per accent
python3 scripts/tts/test_align.py
npm run narration:index                                    # regenerate the has-narration bitset
node scripts/tts/verify_player.mjs <slug> [accent]         # headless-Chromium end-to-end check
```

The bitset (`src/lib/narration-index.generated.ts`) is generated, never hand-edited, and a unit test
fails if it drifts from `public/audio`. It lets the page decide synchronously whether to probe, so
lessons without audio make no wasted 404s and the ~190 KB manifest is fetched only on first Listen
press (hover/focus prefetches).

## Phase 5 - Player, follow-along, accent picker

- `LessonNarrator.tsx` probes per accent: valid manifest means the neural player; missing or invalid
  means the Web Speech player (`ListenButton.tsx`). The US/UK picker persists in `localStorage`;
  switching accent re-probes, remounts and resets shared state so the new accent always starts clean.
- **Follow-along:** each animation frame binary-searches the manifest for the word at
  `audio.currentTime` (`findActiveWordIndex`) and highlights its `<span class="narr-word">`. Word spans
  are added lazily on first play (`narrate-dom.ts`). Manifest blocks are aligned to DOM blocks by
  normalized text (`alignBlocks`); a block that cannot align, or whose words cannot be tagged,
  highlights as a whole block. Audio never depends on highlighting.
- Respect reduced motion (instant highlight, no smooth scroll) and keep a screen-reader live region
  for state changes. Nothing ever autoplays.
- `playback-share.ts` is a tiny framework-free store shared by the main player and the floating
  play/pause button, so both always agree. The active player publishes status, registers its toggle,
  and (see Phase 6) its seek handlers and progress.

## Phase 6 - Rewind, skip, "read from here", resume, progress

Brainstorm first (what are the jobs: resume, replay, skip, jump), then build the smallest slice that
covers them with one shared concept. What shipped:

- **Block index** = order of `extractLessonBlocks` (`src/lib/listen.ts`). Pure helpers (clamp, step,
  resume resolution, manifest-to-block map, arrow-key guard) live in `src/lib/listen-seek.ts` and are
  unit-tested. Paragraph-level on purpose: it behaves identically on both engines. Time-based +-15s
  fits recorded audio but not browser speech (no reliable duration), so it stays out of v1.
- **Previous/next paragraph:** buttons in the player and floating control, plus Left/Right keys while
  active. Ignore keys when focus is in an input/textarea/contenteditable or a modifier is held.
- **Read from here:** an explicit margin play marker per paragraph (hover/focus, tap on touch).
  Never bind playback to clicks on the text itself - that fights selection and links. On a paused
  player it also resumes; previous/next move the position but stay paused.
- **Resume:** last block per lesson in `src/store/listenPosition.ts` (`sdm-listen-position`,
  versioned, sanitized on load, clamped if content shrank, cleared at lesson end), offered as
  "Continue from where you left off".
- **Progress ring** around the floating button: audio time on the neural path, paragraphs on the
  browser path, quantized so a 60 fps clock does not re-render it. Percentage goes in the tooltip;
  keep the accessible name constant so progress is not announced repeatedly.
- **Highlight and scroll** the target block after every seek, including while paused.

### Traps found in the audit (check each before declaring seek done)

1. **Two block lists.** The manifest includes title and summary blocks; the browser voice never
   speaks them. Map manifest blocks onto the shared index through the inverse of `alignBlocks`;
   unaligned or zero-word blocks have no time, so fall back to the next aligned block.
2. **Neural has no sentence boundaries**, and speech chunks never start mid-block, so "from here" is
   the paragraph start. Say so in the docs rather than faking sentence precision.
3. **Dispose before cancel.** On Web Speech, call `run.dispose()` before `speechSynthesis.cancel()`,
   or the cancelled utterance's late `onerror` calls `stop()` mid-seek. Reconcile the paused flag when
   seeking while paused (`synth.resume()` then start a fresh utterance on resume).
4. **Lazy loads.** A read-from-here click before first play must trigger the manifest fetch and word
   tagging first (`startAtBlock` stores a pending start and probes with autoplay).
5. **Players remount.** They are keyed by slug and accent, so position cannot live in refs; use the
   persisted store.
6. **Paused highlight.** The animation loop only runs while playing, so a paused seek must sync the
   highlight explicitly.
7. **`indexRef` counts chunks, not blocks**, and `stop()` and end-of-lesson reset it; map block to
   first chunk (`firstChunkOfBlock`).

## Phase 7 - Verify honestly, ship safely

- Gates: `npx tsc -b`, `npm run lint` (no new warnings), `npx vitest run src`, `npx vite build`. The
  full `npm run build` also needs Ben's Hugging Face index; if the sandbox blocks that, say so, and
  confirm it on the deploy run instead. `vite build` rewrites `public/llms.txt` and
  `public/sitemap.xml` - revert them (`git checkout --`) before committing.
- Tests to keep: seek helpers, the position store (garbage in, safe out), share store (quantized
  progress, notify only on change), and component tests for seek-while-playing/paused/idle and the
  ring. Add `afterEach(cleanup)` to every RTL file.
- Be explicit about what is not verified: real audio, and `speechSynthesis.cancel()` then `speak()`
  latency, which varies by browser. Ask the user to try the controls on the live site.
- Flow: one PR per concern, draft first. PR checks here run only CodeQL and GitGuardian (the real
  gates run on push to `main`), so run the gates locally and read the Deploy workflow's jobs
  (gates, build, E2E, deploy) after merging. Do not pile merges on `main` while a deploy is running.
- Docs move with the code: `docs/listen-natural-tts.md`, `docs/architecture.md`, `CLAUDE.md`. If a
  change alters what leaves the device, update the README privacy statements in the same PR.
- Work in a worktree or subagent for long builds, but commit early and often: if the container
  restarts, committed work survives and in-flight work does not.

## Adapting to another project

1. Pick a block unit (paragraph/section) and give it a stable index shared by every engine.
2. Build the extractor and a manifest with per-word times and a content hash.
3. Generate audio per accent offline; validate; publish a generated "has audio" index.
4. Implement the neural player and the fallback behind one `PlaybackShare`-style store.
5. Add seek, resume, progress on the block index; run the trap list above.
6. Document limits (paragraph-level, browser latency) and list unverified items in the PR.
