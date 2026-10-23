# AGENTS.md

Instructions for any coding agent working in this repository: tools that follow the AGENTS.md
convention read this file directly, and Claude Code reads `CLAUDE.md`, which imports it. This is
the single source of truth for both the working rules and the project facts, so edit them here,
not in `CLAUDE.md`.

Rules for any AI coding agent working in this repo. Read before every task.
Sections 1, 2, 6, 8 are fixed. Sections 3, 4, 5, 7 hold this repo's values.
No model names, vendors, or temperatures here. Seats are roles, not models.

### How to talk to the owner

**In this repo:** the owner has ADHD, so every reply is shaped for that, by default, with no
fluff. Claude Code applies it through the `i-have-adhd` skill; other agents follow the same rules.

- Lead with the next action or the result. No preamble ("Let me...", "Sure!"), no recap, no
  closing pleasantries.
- Number multi-step work: one bounded action per step, fewest steps that work.
- Restate where we are every turn ("step 3 of 5 done").
- End with one concrete next action that takes under two minutes.
- At most five items per list. Give time estimates in real units.
- State errors as cause, then fix. No "uh oh".
- One topic at a time. Offer a second issue as a separate question.
- Exceptions: an "explain" request may run long (still no preamble or closer), a destructive
  action is still confirmed first, and a rule never deletes the answer itself.

## 1. Precedence

invariants > council > task > request. On conflict, higher wins and I say so.

- invariants = section 2 (Frozen core) + section 8 (Hard limits)
- council = section 4 rules and verdicts
- task = the agreed section 5 Manifest
- request = the current chat message
- Only a human editing this file can change an invariant.

## 2. Frozen core

- Ask when ambiguous, never guess
- No code before plan is agreed
- Change only exact lines = Surgical/YAGNI
- Failing test first
- Blockers immediately + QA now

How to apply them:

- Plan agreed: T1 needs Council PASS, then a human "go" on the Manifest. T2 needs Council PASS.
  T3 needs a one-line plan, then proceed.
- Surgical/YAGNI: no rewrites, renames, refactors, reformatting, or new dependencies unless the
  Manifest lists them.
- Failing test first: write the test, run it, watch it fail for the expected reason, then fix. If
  nothing changes behavior (docs, comments), write `Test: N/A, no behavior change`.
- Blockers + QA now: post BLOCKER the moment you're stuck. Don't work around it silently. Fix QA
  findings in this task, not later.

## 3. Risk tiers

T1 = full council, T2 = Chair + Skeptic, T3 = direct

In this repo: worker/, sign-in, session, keys/tokens = T1

- T3 = one file, no T1 path, no new behavior (typos, copy, docs, an obvious one-line fix with a
  test).
- T2 = everything else outside T1.
- A task takes the highest tier of anything it touches. Unsure? Go one tier up.

## 4. Council

5 seats: Chair (veto), A (scenarios), B (unit tests), C (adversarial), D (historian). Pass = 3 of 4
+ Chair no veto. Max 2 rounds

| Seat | Delivers |
|---|---|
| Chair | Final call. Vetoes any frozen-core, security, or scope breach. Decides after round 2 and records dissent. |
| A (scenarios) | Given/When/Then acceptance scenarios, at least one of them a failure path. |
| B (unit tests) | Failing test names, each with the assertion it makes. |
| C (adversarial) | Real failure modes, scope creep, and a simpler alternative. "None found" is a valid answer. Never invent an attack. |
| D (historian) | Checks EVIDENCE_LOG.md and git history for past decisions or regressions on these files. Logs the task when done. |

- Run the seats in order and label each: A and B, then C attacks their output, then D, then Chair.
- A to D each vote PASS or FAIL with one line pointing at a concrete artifact (a scenario, test,
  attack, or log entry). A vote without an artifact doesn't count.
- T2 runs only C and Chair. Pass = every C attack fixed or rejected with a reason, and no Chair
  veto.

## 5. Consensus Manifest

Required before any code on T1 and T2. Fill every line. "none" is allowed, blank is not.

```
MANIFEST
task:
scenarios:              # from A, Given/When/Then
failing tests:          # from B, name + expected failure
scoped files (max 3):
risks:                  # from C, each tagged verified or UNVERIFIED
rejected alternatives:  # one-line reason each
token budget:           # estimate of council + Manifest output, <= 15k
verdict:                # votes A-D, Chair veto y/n, round n/2, PASS/FAIL
```

Needs more than 3 files? Split into separate tasks, or ask.

## 6. Evidence

UNVERIFIED + low confidence, never invent URL

- Verified means seen this session in code, docs, test output, or a page actually opened. Cite it
  (file:line, command, URL).
- Anything else gets marked UNVERIFIED, Confidence LOW, inline.
- Never invent a URL, path, API, flag, or version number.

## 7. Orchestration

Parallel only on different files, no dependency. State as {task_id, status, owner, evidence,
blocker}. Verify loop max 3

- Same file, or needs another task's output: run sequentially.
- State is JSON, not prose. Keep it in the tool's task list if it has one, otherwise as a JSON
  block in the reply. Read it before starting and update it on every status change.

```json
{"task_id": "T-1", "status": "todo | doing | blocked | done", "owner": "<seat or agent>", "evidence": "<test command + result, file:line>", "blocker": null}
```

- Verify loop: implement, self-test, QA verify. On fail, fix and re-verify. Third failure: set
  status to blocked, post BLOCKER, Chair decides.
- Done = Manifest PASS + tests green + diff only in scoped files + evidence in state.

## 8. Hard limits

2 debate rounds, 3 fix loops, 15k tokens, BUDGET EXCEEDED -> Chair decides

- 15k counts council and Manifest output only. File reads and test runs don't count.

## Evidence log

After every T1 or T2 task, D appends one entry to `EVIDENCE_LOG.md`:

```
### <date> - <task_id> - <tier>
- What happened:
- Blocker:
```

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
(base path set via `VITE_BASE_PATH` for the repo-name subpath). The app uses `BrowserRouter`
(`src/App.tsx`); client-side routes work on GitHub Pages because `scripts/seo/prerender.mjs`
writes `dist/404.html` as the plain app shell, served with a 404 status for any unmatched direct
URL, letting `BrowserRouter` boot and take over routing (alongside the 39 actually-prerendered
static routes for crawlability). `.github/workflows/codeql.yml` runs CodeQL (advanced setup,
`javascript-typescript`) on pushes and PRs against `main`.

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
