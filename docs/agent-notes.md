# Agent notes — annex to AGENTS.md

These sections were carried over verbatim from this repository's previous
AGENTS.md when the council-template AGENTS.md was adopted on 2026-10-26
(owner's decision: adopt + keep the extra sections as an annex). AGENTS.md
§11 points here for the operational detail that does not fit the template's
project-configuration section.

> **Carry-over flag (2026-10-26, not a silent edit):** the Architecture
> section's final part, describing a BYOK AI tutor (`src/ai/client.ts`,
> `src/store/aiSettings.ts`), is **stale**: `src/ai/` now contains only
> `local/` (the on-device Ben) and neither file exists on main. The text
> below is preserved verbatim as carried over; correcting that paragraph
> is a separate change.

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

## Owner question format (domain questions only)

Technical questions are settled by the council and the advisor and never sent to the owner (AGENTS.md section 2). When a domain question is unavoidable, send ONE batched message built like this, written in plain words (no em dashes, no mid-sentence colons, whole sentences, no jargon the owner has not used):

1. First line: the single next action the owner can take in under two minutes, with the answer options spelled out ("reply: 1 yes, 2 no, 3 name").
2. For each question, three short parts. What it is (how it works, in two sentences, the `/pstack:how` view). Why it exists and why it matters now (the `/pstack:why` view: the history or rule that created the question). Our recommendation with one reason, and what happens if there is no answer.
3. A line stating what the council and advisor already decided so the owner does not have to.
4. Numbered items, at most five per message, most important first. Never ask the same question twice; say if an earlier question is still open.
5. Technical detail stays in the linked record, not in the message.

## Handoff checkpoints (never leave work hanging on a limit)

Checkpoint = after each merge, council verdict, PR opened or closed, owner decision, background agent started or finished, and again before any limit or session end. No warning is guaranteed; the checkpoints are the guarantee. If the harness supplies a limit notice, or a PreCompact or SessionEnd hook is configured, treat it as a final checkpoint (UNVERIFIED that a limit notice is delivered in every case).

1. **Repo handoff (the only step that counts as a record).** Update `triage/NEXT-AGENT.md` and push it. Use ONE rolling handoff branch and ONE draft PR; every checkpoint is a push to it, never a new PR (each PR run costs about 5 minutes of CI across 3 jobs). A handoff PR gets no merge exemption; a handoff in an unmerged draft PR counts as saved. The session lead edits the file; sub-agents report to the lead and never edit it; on a rejected push, fetch and rebase, never force-push.
2. **Freshness test.** The first line holds the UTC time, the SHA of `origin/main`, and the open PR numbers (`gh pr list`). A reader compares `git rev-parse origin/main` with that SHA; a mismatch means the handoff is stale and the reader re-verifies before acting.
3. **What stays out of a pushed handoff** (the repository is public): local absolute paths, usernames, emails, tokens, session URLs, worktree paths, agent ids. Name branches and PR numbers instead. Agent ids and worktree names belong in the local copy only.
4. **Local conveniences (not records).** Update the agent's project memory; copy the handoff to `.ai-context/HANDOFF.md` (the session-end hook overwrites `SESSION_STATE.md` each session, so do not rely on that file); run `graphify update src` only if code changed since the last run (code-only, no LLM, derived output in `src/graphify-out/`, gitignored, never committed; the full semantic graph needs `/graphify` in an assistant session).
5. **Branches and agents.** `git rev-list --left-right --count origin/<b>...<b>` is `0 0` for every branch you made; each background agent has a one-line state (branch, PR, next action) in the handoff.
6. **Budget.** Checkpoint cost counts against the section 7 budget. If it would exceed it, write the minimum (state line, `origin/main` SHA, open PRs, next action) and report `BUDGET EXCEEDED` per section 9.
7. **On a limit warning:** finish 1 to 6, start no new agents, then stop.

## Session end (remote is the source of truth)

Before stopping, for every branch you created or pushed:

- `git status --porcelain --untracked-files=no` prints nothing.
- `git rev-list --left-right --count origin/<branch>...<branch>` prints `0` and `0` (or the branch had no upstream and you pushed it with `-u`).
- A rejected push is never forced. Fetch, rebase, re-verify, or stop and report.
- A held or parked branch is pushed too; its hold status is written in its PR or README.
- Not enforced by tooling yet: the "Protect main branch" ruleset has no required status checks, no required thread resolution, and an always-bypass admin role (checked 2026-11-02). Making these mechanical is the owner's decision (tracked in an issue).

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
