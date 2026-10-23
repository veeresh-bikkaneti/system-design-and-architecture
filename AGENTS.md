# AGENTS.md

Instructions for any coding agent working in this repository: tools that follow the AGENTS.md convention read this file directly, and Claude Code reads `CLAUDE.md`, which imports it. This is the single source of truth for both the working rules and the project facts, so edit them here, not in `CLAUDE.md`.

## How to work here

A condensed, agent-neutral form of the owner's Loop Engineering ARCHETYPE v3.0. The full text is `docs/ops/ARCHETYPE_law.md` in the `veeresh-bikkaneti/Meridian` repository. If you can read the full text and it disagrees with this section, the full text wins, and you should say so. Lines marked **In this repo** are local additions, not part of the law.

**Precedence:** system invariants > council protocol > task config > the user's request. If they conflict, the higher one wins, and you must state the conflict.

### How to talk to the owner

**In this repo:** the owner has ADHD, so every reply is shaped for that, by default, with no fluff. Claude Code applies it through the `i-have-adhd` skill; other agents follow the same rules.

- Lead with the next action or the result. No preamble ("Let me...", "Sure!"), no recap, no closing pleasantries.
- Number multi-step work: one bounded action per step, fewest steps that work.
- Restate where we are every turn ("step 3 of 5 done").
- End with one concrete next action that takes under two minutes.
- At most five items per list. Give time estimates in real units.
- State errors as cause, then fix. No "uh oh".
- One topic at a time. Offer a second issue as a separate question.
- Exceptions: an "explain" request may run long (still no preamble or closer), a destructive action is still confirmed first, and a rule never deletes the answer itself.

### Frozen core: never relax these

- **Zero-assumption.** If the task is ambiguous, stop and ask. Never guess.
- **Zero-code until consensus.** No implementation before the plan is agreed (see the Consensus Manifest).
- **Surgical / YAGNI.** Change only the exact lines the task needs. No rewrites and no refactors unless required.
- **Test-first.** Write the acceptance scenario (Given-When-Then) and a failing test before the code. Verify in a loop until green.
- **No silos, no procrastination.** Report a blocker the moment you hit it, and fix QA findings now, not later.

### Risk tiers

- **T1, security, payments, auth:** full council.
- **T2:** the Chair plus one skeptic.
- **T3:** direct fix.

**In this repo:** treat as T1 anything in `worker/` (auth, exam grading, the GitHub OAuth exchange, D1 migrations), the sign-in and session code (`AuthBar.tsx`, `gist-sync.ts`, `session.ts`), and anything that handles a learner's API key or token. When unsure which tier applies, take the higher one.

### Council

| Seat | Role |
| :--- | :--- |
| Chair / arbiter | Lead architect and security. Final call and unilateral veto. |
| A | ATDD customer advocate. Given-When-Then scenarios only. |
| B | TDD unit lead. Failing test skeletons and contracts. |
| C | Adversarial skeptic. Must find 3 failures, 2 scope creeps and 1 simpler alternative. |
| D | Historian. Collects evidence and proposes mutations. |

Flow: ingest, then A, then B, then C challenges A and B, then the Chair reviews. A change passes when 3 of the 4 councilors (A to D) agree and the Chair does not veto. At most 2 debate loops, then the Chair decides and logs the dissent.

### Consensus Manifest (required before any code)

Task, consensus, ATDD scenarios, TDD RED tests, scoped files (max 3), risks and confidence, rejected alternatives, and whether the token budget is granted or denied.

### Evidence and confidence

- Verify external facts by search and read internal ones from the code. If you could not verify something, write **UNVERIFIED** with **Confidence: Low**. Never invent a URL.
- **High** = you saw it in code or docs this run. **Medium** = recalled, not verified. **Low** = guessing.

### Orchestration and execution

- Run work in parallel only when it touches different files with no dependency. Anything on the same file, or with a dependency, runs sequentially.
- Track state as structured data, not prose: `{task_id, status, owner, evidence, blocker}`. Read it first, and post a blocker immediately.
- Verify loop: implement, self-test, independent QA verify, and if it fails, fix and re-verify (max 3 loops).
- Done means consensus, tests green, a clean diff, and evidence.

### Hard limits

At most 2 debate rounds, 3 fix loops and 15k tokens per task. If one is exceeded, the Chair forces a decision, you log **BUDGET EXCEEDED**, and you proceed.

### After every increment

Record a context fingerprint (stack, repo size, task type, risk tier), the numbers (time to green, tokens, debate rounds, QA failures, blockers) and the judgement calls (which skeptic attack was useful, which test caught a bug, what the Chair vetoed). Then propose at most 1 or 2 changes to this process, in diff form, citing the evidence. A change needs 2 data points to become a rule, must never touch the Frozen core, and is rolled back if QA failures rise by 20%.

**In this repo:** put that record in the PR description.

## Commands

```bash
npm install
npm run dev      # local dev server
npm run build    # tsc -b && vite build -> dist/ (static export, no SSR/backend)
npm run preview  # serve the production build locally
npm run lint      # oxlint (see .oxlintrc.json)
npm test          # vitest unit tests (no model needed)
npm run ben:index # fetch + verify Ben's embedder, build his lesson index (also runs on prebuild)
npm run eval:ben  # score Ben's routing on held-out questions; writes evals/ben/REPORT.md
```

Ben, the local tutor, routes questions with a small embedding model served by the site. Read
`docs/adr/0001-ben-semantic-routing.md` before changing `src/ai/local/`, and run `npm run eval:ben`
for any routing change.

`package-lock.json` is committed and required: `.github/workflows/deploy.yml` uses
`actions/setup-node`'s `cache: npm`, which needs a lockfile to key its cache, and the install step
runs `npm ci`, which fails if the lockfile drifts from `package.json`. Regenerate it with
`npm install` and commit the result after any dependency change.

## Architecture

This is a static, client-only Vite + React + TypeScript SPA — no backend. It ships to GitHub Pages
via `npm run build` producing `dist/`, deployed by `.github/workflows/deploy.yml` on push to `main`
(base path set via `VITE_BASE_PATH` for the repo-name subpath). The app uses `HashRouter`
(`src/App.tsx`) specifically so client-side routes work on GitHub Pages without server rewrites.
`.github/workflows/codeql.yml` runs CodeQL (advanced setup, `javascript-typescript`) on pushes and
PRs against `main`.

**Lessons are MDX files loaded at build time.** `src/lib/lessons.ts` uses
`import.meta.glob('/content/lessons/*.mdx', { eager: true })` to import every lesson module, then
sorts them by `meta.order`. Each `.mdx` file under `content/lessons/` must export a `meta` object
(`slug`, `title`, `tier`, `order`, `summary`, `estimatedMinutes`) followed by the lesson body in
Markdown/JSX. `vite.config.ts` wires `@mdx-js/rollup` (with `remark-gfm`) *before* the React plugin
so `.mdx` compiles into an importable component. Lessons end with a `## Sources & further reading`
section citing primary/canonical sources for the topic (see `README.md`'s Curriculum section for
the citation convention this course follows) — not attribution to any single secondary source.

**Diagrams render from fenced code blocks.** A ```mermaid fenced code block inside a lesson `.mdx`
file renders as a real diagram: `App.tsx` registers a custom `pre` component with `MDXProvider`
that detects `language-mermaid` code blocks and routes them through `MermaidDiagram.tsx` (which
wraps the `mermaid` package, `securityLevel: 'strict'`). Every other fenced code block passes
through unchanged. The AI tutor's chat responses render mermaid the same way, via a different path
(`ChatMarkdown.tsx` splits ```mermaid segments out of the streamed markdown before rendering).

**Tier-gated progression.** Lessons belong to a `tier` (`beginner` | `intermediate` | `advanced`,
ordered by `tierOrder` in `src/lib/lessons.ts`). `src/lib/progress-gate.ts` unlocks a tier only once
every lesson in the immediately preceding tier is completed; `LessonPage` redirects home if the
requested slug is locked or unknown. A lesson is marked complete either manually or by passing its
embedded `<Quiz>` (mapped as an MDX component in `App.tsx`'s `MDXProvider`) at or above
`QUIZ_PASS_THRESHOLD` (0.7). All progress lives in `src/store/progress.ts`, a Zustand store
persisted to `localStorage` under the key `sdm-progress`. Quiz answers (`correctIndex`) ship in the
client bundle today, so quiz completion is self-check only, not a basis for any verifiable
credential — see `worker/README.md` (Phase 2) for the plan to move grading server-side before a
verifiable certificate can be issued on top of it.

**Listen mode has a shared seek model.** Both players (recorded AI narration in `LessonNarrator.tsx`,
Web Speech in `ListenButton.tsx`) seek by *block index* (`extractLessonBlocks` order,
`src/lib/listen-seek.ts`), publish status/seek availability/progress through
`src/lib/playback-share.ts`, and persist the last position per lesson in `src/store/listenPosition.ts`
(`sdm-listen-position`). When changing either player, dispose the in-flight speech run before
`speechSynthesis.cancel()`, and keep the manifest-to-block mapping (inverse of `alignBlocks`) in mind:
the manifest includes title/summary blocks the browser voice never speaks. See
`docs/listen-natural-tts.md`.

**Optional GitHub progress sync (client-only).** `src/components/AuthBar.tsx`, `src/lib/gist-sync.ts` and
`src/store/session.ts` let a learner sign in and mirror progress to a private gist in their own account
(OAuth scope `gist`; without `VITE_GITHUB_CLIENT_ID`/`VITE_WORKER_URL` the dialog falls back to a pasted
GitHub token with the `gist` scope; the `/auth/github/exchange` worker route needs the secrets in `worker/README.md`; the token lives in `sessionStorage`, never `localStorage`). It must stay strictly
opt-in: every lesson, quiz and progress feature works signed out, and nothing may be sent anywhere before
sign-in. Lessons are not gated on sign-in (`canOpenLesson` is currently only exercised by its tests); the
README's privacy statements describe this behaviour, so update them with any change here.

**BYOK AI tutor is a strictly additive, client-only feature.** The user supplies their own
Anthropic API key, stored in `localStorage` via the Zustand store `src/store/aiSettings.ts` (key
`sdm-ai-settings`) and used directly from the browser (`dangerouslyAllowBrowser: true` in
`src/ai/client.ts`) — the key is sent only to Anthropic's API, never to any other service. Every
lesson, quiz, and progress feature must keep working with zero API key configured.
`src/ai/systemPrompt.ts` builds a system prompt that includes the current lesson's title/summary
(derived from the route in `ChatWidget.tsx`) and a strict contract requiring architecture answers
to include a fenced ` ```mermaid ` diagram, rendered via `MermaidDiagram.tsx`/`ChatMarkdown.tsx`.
