# All Issues Identified — System Design Mastery, Round 2 (Consolidated)

One file, every finding from both round-2 reviews, for division among other agents.
Built 2026-11-02 from the two round-2 reports. No new findings were added here;
nothing in this file was re-verified beyond what the source reports state.

## Sources (read these for full evidence)

- QA round 2 (chatbot: white-box / black-box / visual / security):
  `~/workspace/sdm-ben-arena/qa-round2/REPORT.md` (219 lines) + seat notes
  (`whitebox/`, `blackbox/`, `visual/`, `security/`), failing-first tests
  (`new-tests.diff`, 11 tests), decision log (`.audit/decisions.tsv`).
- Coursework integrity round 2 (content / quizzes / links / code-content contract):
  `~/workspace/sdm-ben-arena/coursework-integrity/REPORT-round2.md` (217 lines)
  + reviewer notes (`round2-scope1..4-*.md`), decision log (`.audit-round2.tsv`).
- Both reviews ran at one SHA: main `915725c` (#139 merged). Deploy commit is
  UNVERIFIED from the UI (no build stamp). Live evidence is desktop-width,
  signed-out only, unless an item says otherwise.

## Counts

- QA: **28** (2 Blocker, 13 Major, 13 Minor). IDs `QA R-01`–`QA R-28`.
- Integrity: **66** (2 Blocker, 21 Major, 33 Minor, 10 Nit). IDs `INT R-01`–`INT R-52`
  (carried, minus struck R-45) + 15 `INT NEW*-*` issues.
- **Total: 94 unique findings.** (An earlier chat table double-listed INT R-13 in
  two tasks and miscounted Task 4 as 21; the division table in §D of this file
  is the corrected single-listing version: 2 + 13 + 8 + 22 + 49 = 94.)
- Not fixes, listed for completeness only: `INT NEW3-4` (informational),
  `INT NEW4-5` (no defect), `INT R-45` (STRUCK — round-1 reviewer error, do not cite).

## Rules for every agent working from this file (repo AGENTS.md, frozen core)

1. This file is an assignment list, NOT authorization to write code. No
   implementation code without an approved Consensus Manifest for that task.
   One manifest per fix task; max 3 scoped files (justify exceptions); failing
   tests first; gates `npm test` / `npm run lint` / `npm run build` /
   `npm run eval:ben` (after reading `docs/adr/0001-ben-semantic-routing.md`
   when `src/ai/local/` changes). Changes land by PR; merge only on the
   owner/Chair's explicit per-PR word. Never merge.
2. Label every claim verified / inferred / UNVERIFIED. A check not run is
   NOT RUN, never passing. Do not invent URLs, citations, or results.
3. T1 paths are read-only unless the task's manifest says otherwise with full
   council approval: `worker/`, `src/store/session.ts`, `src/lib/gist-sync.ts`,
   `src/components/AuthBar.tsx`.
4. Eval discipline: new failure cases go in `evals/ben/cases.json`, NEVER in
   `evals/ben/holdout.json`. Committed eval baseline at `915725c`: 88.1% /
   top-1 93.1%, 199 cases, index `1d9536e`. Fresh re-runs scored 86.9% — a
   1.0pt gap, cause unexplained; re-run twice before citing eval numbers.
   Eval scores routing + lesson only, never answer text.
5. The "ai env" reading (Ben's own setup vs the user's own AI dev environment)
   is UNVERIFIED / bypassed, never confirmed. No fix may depend on it.
6. F2 timing ("~18 min") is INCONCLUSIVE — one session observation, no error
   counts, zero fresh-profile load runs in round 2. Never cite it as measured.
   Add timing instrumentation before gating any load-time claim.

## Status key

- **CONFIRMED** (integrity): still present, fresh evidence at `915725c`.
- **CHANGED** (integrity): still present, materially different (difference noted).
- **PENDING-LIVE**: needs a live browser probe (see the 60-case black-box matrix
  in `qa-round2/blackbox/NOTES.md` §5; fresh profile mandatory for F2/F6 cases).
- **UNVERIFIED**: stated where the source report could not establish the fact.

---

## A. QA round 2 — chatbot (28)

Verdicts: white-box NEEDS WORK; black-box NEEDS WORK (60 cases: 50 PENDING-LIVE,
7 decided by round-2 live evidence, 3 partial); visual DOES NOT CONFORM (panel
scope, gate FAIL); security NOT SECURE-READY on the F1 vector only. Overall:
NOT usable end-to-end for a signed-out student. F3 (#134 pin) stands CORRECTED.

### QA R-01 — [Blocker] F1: Ben echoes the generation prompt / engine internals into the visible answer

- Evidence: question routes `parametric_fallback`
  (`src/ai/local/semantic/router.ts:321-322`, best lesson < 0.45 + `tech` vote)
  → `answerParametrically` (`src/ai/local/inference.ts:209-217`) sends
  `PARAMETRIC_SYSTEM_PROMPT` (`:198-201`) in the structured system channel,
  question + prior turns in the user string → small on-device model echoes it
  → `acceptDraft` (`src/ai/local/agent.ts:393-409`) has only 6 blocked
  substrings, none matching prompt phrases, role labels, or config-like lines
  → draft patched verbatim into the bubble
  (`src/components/qa/QaChatPanel.tsx:399`) with the "General knowledge" pill
  → persisted to `localStorage` (`sd.qa.history`) and re-fed via `priorTurns`.
- Observed (live, round 2, both sites): New topic → "how do I set up a Python
  virtual environment for AI work" echoes fragments ("CPU backend",
  "TopK: 64, Temp: 1", system-prompt sentences, ending "Model:"), pill
  "General knowledge overview — not in current lesson plan", no substantive
  answer. Q3/Q5 no longer leak — route-dependent. Two leaked fragments match
  the system prompt verbatim; "TopK/CPU backend" appear nowhere in code and
  match neither engine's config — INFERRED model confabulation, so a
  prompt-wording fix alone cannot close this. Which engine echoed is
  UNVERIFIED (needs the panel model-status subtitle at leak time).
- Fix: output-side leak detector on ALL model output before rendering /
  persistence (reject output sharing long n-grams with either system prompt,
  role-label lines, template markers; fall back to the deterministic
  `NO_SOURCE` line). Regression tests: the 3 failing-first F1 tests in
  `new-tests.diff` + a detector unit-test corpus.
- Architecture: prompt/rendering separation — a single `sanitizeModelOutput`
  gate shared by Ben + Veer; never render raw model output; keep the
  structured system-prompt channel; delimit and role-label-strip user-string
  prior turns. Do NOT "fix" by shortening the system prompt alone.
- Precondition: none adversarial — any ordinary general-tech question with no
  lesson ≥ 0.45 while the semantic layer loads.

### QA R-02 — [Blocker] F2: model download blocks the chat — no timeout, no cancel, sticky failure

- Evidence: `tryPromptApi()` → `loadWebLlm()` (`src/ai/local/inference.ts:55,
  97-110`); no timeout, no `AbortSignal`, no cancel export anywhere in
  `inference.ts` / `embedder.ts` / `runtime.ts`. `loadEngine` (`:143-162`)
  caches the rejected promise deliberately (pinned by `inference.test.ts`
  S8 — a fix must NOT be "retry on failure"). A hanging `create()` never
  settles (new test: `'hung'` after the 10s bound). Panel close/reopen cannot
  cancel: `QaWidget.tsx` keeps the panel mounted once opened, no cancel path.
  Composer disabling is `streaming`-gated only (no load-gate) — round-1 "input
  disabled" was the in-flight-answer state, not a loading state.
- Observed: live fresh-profile retest PENDING-LIVE (black-box BB-39–BB-43).
  Round-1 single-run observation: header percent ~3–6%/min. Expected per
  docs ("The chat never blocks on a model download", ADR 0001 §6): usable
  without a prolonged block, honest status, cancel/reset on close.
- Fix: bounded wait distinguishing "no progress" from "slow progress" (use
  existing `downloadprogress` events) + cancellation; keep sticky-failure
  caching. Add timing instrumentation (load start / first progress / ready
  timestamps + error counts) before any load-time claim is gated.
- Architecture: readiness state machine for model loading (loading / ready /
  failed / cancelled) with Cache Storage persistence; input never disabled
  for model loading alone; retrieval decoupled from generation.
- Timing verdict: INCONCLUSIVE (benchmark Q4/Q7 uncheckable — no
  instrumentation, zero model-load runs this round). Never cite "~18 min"
  as a measured figure.

### QA R-03 — [Major] F4: lesson fragments returned as confident answers

- Evidence (three compounding cuts): `windows()` splits at 150 words
  mid-sentence (`scripts/ben/chunk-lessons.mjs:80`, no sentence-boundary
  check) + list-marker stripping turns `5. Generate.` into a `Generate.` stub
  + dropped-diagram captions survive ("Watch a query fan out across the
  index:") → `TEXT_LIMIT = 700` slice (`scripts/ben/build-index.mjs:80`,
  after embedding — vector sees full text, reply sees cut text) →
  `sectionLead` keeps unterminated tails (`src/ai/local/semantic/turn.ts:39-48`,
  strips one trailing `…` only). Real chunk reproduced verbatim:
  `designing-ai-systems#6` = "narrow and careful at the bottom. Generate. …
  Watch a query fan out across the index:" (MDX lines 111–116).
- Census (measured at this SHA): 779 chunks; 46 start lowercase; 164 lack a
  terminal ending; **197 (25.3%) violate the frozen fragment predicate**; 98
  end with `:`. The predicate (fragment iff starts lowercase or lacks
  terminal punctuation `. ! ? …`) does NOT hold as a blanket gate — #135's
  fragment gate needs an evidenced-exceptions policy (colon-introduced
  lists/diagrams whose bodies chunking drops are the largest class) or a
  re-chunk of ~200 chunks first.
- Observed (live): "how do I set up my AI" → fragment answer, High,
  Designing AI Systems pill. Note: this phrasing (no "env") is outside #134's
  pin scope.
- Fix: sentence-boundary chunking + corpus guard + build gate failing before
  embedding + sentence-boundary `TEXT_LIMIT` handling. Regression tests: the
  4 failing-first F4 tests in `new-tests.diff` (one real chunk + two
  mechanisms — not a blanket zero-violation assertion).
- Architecture: chunking/index pipeline rebuild with a fragment predicate +
  exceptions ledger enforced at build time; `sectionLead` drops unterminated
  tails. (Chunk work is #135's lane; any chunk implementation needs a fresh
  manifest off current main.)

### QA R-04 — [Major] F6: ready-state-dependent answers — same question, different (sometimes wrong) answers, no provisional labelling

- Evidence: semantic path (12s `SEMANTIC_WAIT_MS`, `QaChatPanel.tsx:60`) vs
  keyword path diverge. Probe-verified: `prepareTurn('how do I set up my ai
  env')` (keyword) returns in-scope guardrails text from agentic-ai-patterns;
  `prepareTurn('how do I set up a Python virtual environment for AI work')`
  returns a sharding answer; `prepareTurn('how do I set up postgres')`
  returns OFF_COURSE — while the semantic path pins/routes the same three to
  tutor-loop/parametric/parametric respectively. Keyword answers carry
  High-confidence grounding labels via `grounding()` (`src/ai/local/web.ts`)
  and only a `· keyword match` suffix (`QaChatPanel.tsx:411,468`) — no
  "provisional / may change" meaning, no re-answer or staleness flag when
  loading finishes; the panel cannot distinguish "slow" from "failed"
  afterwards (`semanticWithin` race, `embedder.ts:77-86`).
- Observed: fresh-profile live retest PENDING-LIVE (BB-40/BB-41/BB-44).
  Expected: keyword-fallback answers visibly marked provisional, flagged /
  re-answered once the understanding layer is ready.
- Fix: disclose provisionality where the student can see it; flag/re-answer
  once ready; share one `applyDraft` path (keyword path currently lacks the
  semantic path's `draftFit` check — SEC-07, Low, folds here). Regression
  tests: the 2 failing-first F6 panel tests in `new-tests.diff`.
- Architecture: single turn pipeline with an explicit readiness dimension on
  every answer (ready / provisional / failed) and a staleness revisit for
  answers given while loading.

### QA R-05 — [Major] F5: wrong/incomplete lesson chunks — cache warming undefined, reranking unexplained

- Evidence: black-box BB-09 (decided-fail, round-2 live), BB-06
  (PENDING-LIVE); white-box code note (content gap, no code gate).
- Observed: "What is cache warming, and what are the different flavours of
  cache warming?" → Caching Strategies overview, no definition, Medium,
  flavours promised but not delivered. RAG/reranking: rerank named only in a
  final list, never explained (High). The caching lesson never defines
  "cache warming" as a term (nearest: probabilistic early expiration /
  pre-refresh, `caching-strategies.mdx:161`). F5b (Minor, folded here): guard
  pills irrelevant on Q3/Q5 (NoSQL/Sharding; Rate Limiting/Multi-Region).
- Fix: lesson-content completion (define warming; explain reranking as a
  pipeline step) + retrieval coverage for the exact questions. PENDING-LIVE
  re-probes: BB-06, BB-17, BB-20.

### QA R-06 — [Major] SEC-04: Veer has no output-side leak guard; an echo would stream verbatim and be persisted

- Evidence (static code only): `worker/src/qa/graph.ts:324-336` (final
  streaming call), `:344-352` (draft passed through, empty-only fallback);
  `worker/src/qa/routes.ts:231-272` (deltas enqueued verbatim; `finalAnswer`
  inserted into `qa_messages` + checkpointed). Defenses are input-side only
  (persona instruction + triage). Workers probes 10–12 never ran —
  PENDING-LIVE; this is "no guard if it does", NOT "Veer leaks".
- Fix: server-side output filter on the assembled `finalAnswer` before
  streaming completes (buffer-then-release for first tokens) and always
  before the `qa_messages` insert + checkpoint write. Regression test:
  mock-model streams the system prompt verbatim → `finalAnswer` replaced by
  fallback, nothing persisted.
- Architecture: shared output-gate with QA R-01 (one sanitize function,
  Ben + Veer). Worker paths are T1 — full council manifest required.

### QA R-07 — [Major] SEC-05: Veer rolling-summary channel elevates user text into the system prompt

- Evidence (heuristic/medium): `worker/src/qa/graph.ts:218-228` (summary
  appended inside `SystemMessage`), `:374-408` (`fallbackSummary` embeds
  dropped turns verbatim, ≤2000 chars, used when the model summary call fails
  or no model is present), `:475-478` (fires past 20 turns). Per-user only —
  no cross-user path exists (memory keyed `qa:user:<github_id>`). Impact: the
  model's "memory" presented with system-channel authority can steer its own
  later compliance.
- Fix: never place raw user-authored text in the system message — demote the
  summary to a `HumanMessage` or wrap in `wrapCourseData` delimiters;
  truncate-and-label in `fallbackSummary`. Regression test over
  `buildSystemPrompt` + `fallbackSummary` with instruction-like dropped
  turns. Worker paths are T1.

### QA R-08 — [Major] SEC-06: legacy GitHub token in JS-reachable `sessionStorage`; OAuth flow returns the token to the browser (owner decision)

- Evidence (read-only static): `src/store/session.ts:4-17` (`sdm-gh-token`
  in `sessionStorage`; zustand persist correctly excludes it, `:86-93`);
  `src/components/AuthBar.tsx:42-56` (pasted PAT, login-only check — granted
  scopes never verified, guidance says gist-only);
  `worker/src/index.ts:549-581` (exchange returns `{accessToken}` JSON).
  Precondition: script execution on the origin while the tab is open.
  Mitigations verified: tab-scoped storage, never in a URL, gist payload has
  no secrets + `payloadHasSecrets` guard. Contrast (cleared): Veer uses
  HttpOnly cookie + hash-only storage — the good pattern.
- Fix (owner decision): verify granted scopes at sign-in, reject
  non-`gist`-only tokens; long-term migrate progress sync to the
  HttpOnly-cookie pattern. No rotation owed (no token value in the repo).
  Session/AuthBar paths are T1 critical paths.

### QA R-09 — [Major] V-01: focus escapes the open dialog into the page behind it (WCAG 2.4.3, A)

- Evidence (keyboard Tab walks, both widths): dialog root
  `src/components/qa/QaChatPanel.tsx:497-498` (`role="dialog"`, no
  `aria-modal`, no trap, no `inert` background — re-verified by grep: no
  `aria-modal`/`aria-labelledby` present). Tab past the composer reaches
  obscured page links; focus order inside the dialog is logical.
  Screenshots: `qa-round2/visual/390-initial.png`, `1280-initial.png`.
- Fix: modal treatment — `aria-modal="true"`, Tab/Shift+Tab trap, background
  `inert` while open, reusing the nav-drawer pattern
  (`src/components/Layout.tsx:180-186`, verified present). If non-modal is
  intentional, document it and still manage focus (QA R-11 applies).

### QA R-10 — [Major] V-02: focus does not return to the FAB trigger on close (WCAG 2.4.3, A)

- Evidence: `probe5-focus-return.json`: `focusAfterClose=BODY`, both widths.
  Close button `QaChatPanel.tsx:536-537` only calls `onClose`;
  `QaWidget.tsx:55` (`onClose={() => setOpen(false)}`, no focus restore —
  verified).
- Fix: FAB ref + focus on close, for both Close-button and FAB-toggle paths.

### QA R-11 — [Major] V-03: focus does not move into the dialog on open; opening is not announced (WCAG 2.4.3, A; 4.1.3 partial)

- Evidence: `probe3-normal.json` / `probe3-reduced.json`: focus stays on FAB,
  `insideDialog=false`, both widths/modes; no `aria-modal`/`aria-labelledby`.
  Screen-reader announcement NOT TESTED — structural gap only.
- Fix: on open, move focus to the dialog/heading (`tabIndex={-1}` + focus) +
  `aria-labelledby` to the heading. Part of the same focus-management change
  as QA R-09/R-10 (+ Escape, QA R-16).

### QA R-12 — [Major] V-04: header icon-only buttons contrast 2.54:1 (WCAG 1.4.11, AA; needs 3:1)

- Evidence (probe-3 canvas-resolved measurement, both widths; stone-400
  icons on amber-50/60 header, `QaChatPanel.tsx:524-543`). Screenshot:
  `qa-round2/visual/390-initial-panel.png`.
- Fix: resting icon color `text-stone-600`; re-measure ≥ 3:1.

### QA R-13 — [Major] V-05: confidence label contrast 4.39:1 < 4.5:1 (WCAG 1.4.3, AA), 11px

- Evidence (probe-3 measurement, both widths; `QaChatPanel.tsx:688-694`,
  `text-stone-500` on stone-100). The general-knowledge pill variant
  (`:684-688`) was not observed — UNVERIFIED, re-check separately.
- Fix: `text-stone-600` (and/or 12px); re-measure ≥ 4.5:1.

### QA R-14 — [Major] V-06: answer completion never announced; status changes have no live region (WCAG 4.1.3, AA)

- Evidence (markup observation only — screen reader NOT TESTED). Sole answer
  live region unmounts when streaming ends (`QaChatPanel.tsx:711`); header
  status is a plain `<p>` (`:509`); `role="status"` exists only for transient
  notices (`:626`).
- Fix: persistent visually-hidden `aria-live="polite"` region announcing
  answer arrival + status transitions that change what the user can do;
  verify with a real screen reader before closing.

### QA R-15 — [Major] V-07: source-link pills 22.5px tall < 24px (WCAG 2.5.8, AA)

- Evidence (bounding-box measurement, both widths; `QaChatPanel.tsx:695-705`,
  `py-0.5` + 11px text). Screenshot: `qa-round2/visual/390-overflow-panel.png`.
- Fix: `py-1` + `min-h-6` (24px); verify wrapping with multiple sources.

### QA R-16 — [Minor] V-08: Escape does not close the dialog (APG pattern; no standalone A/AA failure claimed)

- Evidence: `QaChatPanel.tsx:493-500`, no key handler;
  `escapeClosesDialog=false` in every run. From the composer the Close button
  is a full page-wrap away while focus escapes (QA R-09), compounding cost.
- Fix: Escape handler → `onClose()` + focus return (with QA R-10).

### QA R-17 — [Minor] V-09: Veer toggle gives no advance sign-in cue (WCAG 1.3.1, A)

- Evidence: `QaChatPanel.tsx:569-586` (no cue/`aria-describedby` when signed
  out); hint block `:600-617` renders only after activation and is
  well-worded (preserve it). Evidence is LOCAL ONLY, from the labelled
  dummy-backend variant build (faithful build renders no Veer row without
  `VITE_QA_API_BASE`); production Veer is PENDING-LIVE.
- Fix: visible lock/"sign-in required" cue + `aria-describedby` when signed out.

### QA R-18 — [Minor] V-10: header status truncation hides full text, no recovery (visual-only; no A/AA criterion claimed)

- Evidence: `QaChatPanel.tsx:509` (`truncate`, no `title`). At 390px: "Runs
  in your browser · no API …"; at 320px: "Getting ready · re…". The loading
  % and model-unavailable explanation are cut off.
- Fix: `title={statusText}` and/or wrap to two lines at narrow widths.

### QA R-19 — [Minor] V-11: "Thinking" dots pulse under reduced motion (WCAG 2.3.3, AAA only)

- Evidence: dots `animate-pulse` at `QaChatPanel.tsx:667-675` (verified by
  grep); reduced-motion blocks in `src/index.css:250-260,320-328` cover other
  animations, not `animate-pulse` (verified). Probe-3 reduced-motion runs:
  dots `{animationName: 'pulse', duration: '2s', playState: 'running'}`.
- Fix: extend the reduced-motion block / `motion-safe:` scoping; dots static,
  "Thinking" text kept.

### QA R-20 — [Minor] V-12: disabled composer during streaming has no associated explanation (WCAG 1.3.1, A)

- Evidence: textarea `QaChatPanel.tsx:724-730` (`disabled={streaming}`, no
  `aria-describedby`; native `disabled` correctly exposed — not a 4.1.2
  failure).
- Fix: `aria-describedby` to the streaming status text + visible cue near the
  composer.

### QA R-21 — [Minor] V-13: Ben/Veer toggles exactly 24.0px tall (WCAG 2.5.8 PASS at the minimum, zero margin; hardening)

- Evidence: `QaChatPanel.tsx:551-586`.
- Fix: `py-1.5`/`min-h-7` (28px) for margin; re-measure.

### QA R-22 — [Minor] SEC-08: CSP / response-header gaps (CWE-693/1021, each needs its stated precondition)

- Evidence: meta CSP in `index.html:27-30` is sound (`script-src 'self'` +
  `wasm-unsafe-eval`, `frame-src` youtube-nocookie only). Gaps: no
  `frame-ancestors` (meta CSP cannot set it; Pages sets no headers; mirror
  sets none — clickjacking precondition); `connect-src 'self' https:` broad
  but unreachable without script execution; no HSTS/nosniff/referrer
  response headers on the app shell.
- Fix (owner decision): response headers on the mirror Worker; record Pages
  residual as accepted. Regression test: build-artifact test asserting the
  CSP meta tag in `dist/index.html` with no `unsafe-inline`/`unsafe-eval` in
  `script-src`.

### QA R-23 — [Minor] SEC-09: quota check-then-insert race; per-IP throttle skipped without `CF-Connecting-IP` (CWE-367/770)

- Evidence: `worker/src/qa/routes.ts:208-213` (count then insert, no
  transaction; overshoot by a few possible under concurrency); `:56-64`
  (throttle returns true when the header is absent). UNVERIFIED whether the
  deployed Worker is reachable without the edge header.
- Fix: atomic increment / unique per-day counter row; log (never silently
  open) the no-header throttle skip. Worker paths are T1.

### QA R-24 — [Minor] SEC-10: retention disclosure overpromises — "deleted after 30 days" vs code (session expiry + 30-day grace ≈ 60 days)

- Evidence: disclosure `QaChatPanel.tsx:41-42`; code: session TTL 30 days
  (`worker/src/qa/oauth.ts:35`, verified) + purge only when the most recent
  session expired > 30 days ago (`worker/src/qa/retention.ts:20,29,36`,
  verified). Re-login restarts the clock. The deletion mechanism itself is
  sound (hard `DELETE`s, idempotent — verified). New Topic deletes messages +
  checkpoint immediately but leaves `qa_users`/`qa_sessions` rows until the
  sweep.
- Fix (owner wording): "deleted within 30 days after your sign-in expires" —
  cheaper than changing the mechanism.

### QA R-25 — [Minor] SEC-11: Ben history persists indefinitely in `localStorage`; shared-device read precondition (CWE-200/922)

- Evidence: key `sd.qa.history` (`src/components/qa/useQaHistory.ts:9,19-31`),
  no TTL/size cap; contents are `QaMessage` fields only (no tokens /
  credentials — verified). Precondition: a second person on the same browser
  profile.
- Fix (owner decision): TTL/size cap or "forget on close" option; document
  shared-device behavior. Do not encrypt client-side (no key-management
  story).

### QA R-26 — [Minor/UNVERIFIED] SEC-12: markdown link protocols (`javascript:`/`data:`) from model output not established (CWE-79/116)

- Evidence: `src/components/ChatMarkdown.tsx:36-44` (ReactMarkdown v10.1.0 +
  remark-gfm, no `rehype-raw` — raw HTML verified not rendered — and no
  `rehype-sanitize`/URL transform). Whether react-markdown passes
  `javascript:` hrefs through was NOT established (no render probe run).
  Related verified-safe: mermaid fences double-guarded (`securityLevel:
  'strict'` + DOMPurify SVG profile).
- Fix: jsdom render test feeding `[click](javascript:alert(1))` and
  `[x](data:text/html,…)`; assert no such anchor renders. Do not treat as
  confirmed XSS.

### QA R-27 — [Minor] F7: no build/version/model status

- Evidence: verified in code (no build stamp, commit, index version, or
  routing label in the panel — white-box grep; visual confirms header cycles
  Getting ready → Loading % → Built-in browser AI with no explicit
  Ready/unavailable). Round-2 live: still no build stamp (BB-57). Whether a
  stamp is required is UNDECIDED (coordinator decision); the probe records
  presence/absence only. Deploy commit remains UNVERIFIED.

### QA R-28 — [Minor] Evidence/process: committed eval report is superseded-unexplained; e2e has a hard sleep

- (a) Fresh `eval:ben` runs (2×, identical index hash) score 86.9% all /
  92.1% top-1 vs committed REPORT.md 87.9% / 93.1% — a 1.0pt gap (2 cases
  flipped), cause inferred (different build state or run-to-run embedding
  nondeterminism), not proven; only 2 runs, no 5-run characterisation. Cite
  fresh runs; re-run twice before citing eval numbers (white-box rule R5).
  Gates still pass (accuracy 0.85, maxDrift 0.03, maxOffered 0.1, maxRefusal
  0.08, lessonTop3 0.9) — but the eval scores routing + lesson only, never
  answer text: it passes while F1/F4/F5 are live.
- (b) `e2e/diagram-layout.spec.ts:158` uses `page.waitForTimeout(2500)` —
  the only hard sleep in `src/`/`e2e/`/`scripts/ben/`; replace with a
  condition-based wait (flagged, not changed; outside Ben scope).

### QA probe backlog (not issues — work still owed)

- 60 black-box cases in `qa-round2/blackbox/NOTES.md` §5: 50 PENDING-LIVE, 7
  decided by round-2 live evidence, 3 partial (Pages pass, Workers legs
  outstanding). Includes fresh-profile F2/F6 cases, Veer signed-out cases,
  security probes 7–12, mobile 375px, and security probes P0–P9 (engine
  identification, evasion variants, two-identity Veer isolation P9 on
  Workers). Verbatim Q5/Q10/Q11 inputs and the verbatim Workers URL were
  never supplied to the black-box seat — no regression claim until supplied.
- Still unverified: mobile 375px; reduced-motion/dark-mode production; Veer
  production + signed-in flows; #139/#140 live effects; #135 trade-off;
  echoing engine identity; SEC-12; full-history secret scan (shallow
  1-commit clone); screen reader/voice/forced-colors; error states.

---

## B. Coursework integrity round 2 — content, quizzes, links, contract (66)

Verdicts: content/structure — sound corpus, stale copies (now including
video); quizzes/badges — not assessment-grade, worse (quiz-ace earnable by
transcription); links/citations — internal graph good, tutor layer and docs
weak; code↔content contract — guards one-directional, narration loss wider
than round 1. Reconciliation of 52 round-1 issues: 48 CONFIRMED, 0 FIXED,
3 CHANGED (R-21, R-39, R-52), 1 STRUCK (R-45), 0 UNVERIFIED. 15 new issues.
0 URLs live-checked; no test/build/eval ran in any review clone (validators /
generators ran only in disposable `/tmp` copies).

### INT R-01 — [Blocker] [CONFIRMED] Veer's committed corpus is a stale 39-lesson snapshot: two lessons invisible, 28 orders wrong; video list stale too

- Evidence: `worker/src/qa/curriculum.ts:15` ("All 39 lessons");
  `idempotency` order 12 vs MDX 14; `worker/migrations/0006_qa_chunks.sql`
  378 seed rows, 0 for either autocomplete lesson;
  `deploy-worker.yml:60-63` no `qa:index` step. Census corrected: 378 seed
  INSERTs (not 382 — 4 FTS trigger lines); regenerated 404 (+26). 408 retired
  as a counting artifact — never cite it.
- Fix (with INT R-03 + INT NEW1-1, same regeneration): `npm run qa:index`,
  NEW D1 migration (never edit `0006` in place), `agent.test.ts` to 41, tool
  description derived from `CURRICULUM.length`, `qa:index`/freshness step in
  `deploy-worker.yml`, plus the `LESSON_VIDEOS` parity assertion. Verify with
  the regenerated diff (expect 378 → 404 seed rows, +26) and the worker
  suite. Add the INT NEW4-3 PR freshness gate in the same pass. Worker paths
  are T1 — full council manifest required.

### INT R-02 — [Blocker] [CONFIRMED] README and `docs/ai-tutor.md` claim there is no server, while Veer is wired into the shipped widget

- Evidence: `README.md:13,21,23`; `docs/ai-tutor.md:3,87` vs
  `QaChatPanel.tsx:40-49,145-153` and ADR 0003.
- Fix (with INT R-16 + INT NEW3-1, one docs pass): qualify README +
  `ai-tutor.md` + `architecture.md`, mirroring the widget disclosure and
  ADR 0003, including the #139 no-WebGPU qualifier. No code change.

### INT R-03 — [Major] [CONFIRMED] Stale-count test/descriptions lock 39 in

- Evidence: test asserting 39 (`agent.test.ts:425,430`), "36 lessons" tool
  text (`tools.ts:112`), generator headers, JSON-LD 36 (`index.html:105`).
- Fix: with INT R-01 (same regeneration + locking-test pass).

### INT R-04 — [Major] [CONFIRMED] Server exam leaks perfect answers, reuses practice items, covers 3/41 lessons; nothing issued, no exam UI

- Evidence: exam leaks answers (`worker/README.md:151-156`), reuses practice
  items, 3/41 lessons.
- Fix (with the assessment-semantics decision, INT R-05/R-06/R-07/NEW2-1):
  new disjoint exam bank + README answer-map removal. Do not issue any
  credential before this is fixed. Worker paths are T1.

### INT R-05 — [Major] [CONFIRMED] Badges for clicking "Mark as complete" + LinkedIn Certification framing

- Evidence: `LessonPage.tsx:79`, `progress.ts:36-41`,
  `badges.ts:40-49,131-150`. All 86 badges reachable.
- Fix: one written assessment-semantics decision first (what completion,
  badges, and the future credential require), then code + badge-page copy to
  match, with INT NEW2-4 regression tests in the same changes.

### INT R-06 — [Major] [CONFIRMED] Failing retake never revokes completion

- Evidence: `progress.ts:48-56`, `Quiz.tsx:39-42,49-56`. No
  pass→failing-retake test.
- Fix: with the assessment-semantics decision + INT NEW2-4 tests.

### INT R-07 — [Major] [CONFIRMED] Gist merge resurrects un-complete / undoes downgrades; behaviour pinned by tests

- Evidence: `progress-merge.ts:52,17-25`, `gist-sync.ts:97-104,130-148`.
- Fix: with the assessment-semantics decision + INT NEW2-4 tests.
  Gist-sync is a T1 critical path.

### INT R-08 — [Major] [CONFIRMED] Correct answer longest in 152/190 questions (80.0%, re-measured)

- Evidence: 152/190 = 80.0% (149 sole-longest), re-measured fresh.
  Per-lesson distribution corrected: 20×4 / 16×5 / 5×6 (not 19/17/5, which
  sums to 191).
- Fix: rebalance option lengths in the question bank; add a longest-share
  check (see also INT NEW2-5 for the exam bank).

### INT R-09 — [Major] [CONFIRMED] TTS extractor drops ACL prose + truncates apostrophe title; shipped manifests affected (widened by INT NEW4-1)

- Evidence: TTS extractor drops prose + truncates title; shipped manifests
  affected. Widened by NEW4-1 (22 blocks, separate finding).
- Fix: with INT NEW4-1/NEW4-2 (extractor fix + re-extract, same pass).

### INT R-10 — [Major] [CONFIRMED] Diagram captions discarded by both chunkers

- Evidence: `chunk-lessons.mjs:33-60`, `build-index.mjs:104-116`;
  StepThrough 19 / VsToggle 13 / PacketFlow 12.
- Fix: stop chunkers discarding diagram prose; with the card-corpus parity
  test (INT R-28) and eval coverage (INT R-11) in the same pass. Judge #135
  against the code as it stands at `915725c`. (Chunk work is #135's lane.)

### INT R-11 — [Major] [CONFIRMED] Eval coverage 36/41; 5 lessons never referenced by any Ben eval case

- Evidence: recomputed fresh (151 + 48 cases); same 5 lessons never
  referenced. `data.test.ts:55-61` one-directional.
- Fix: add eval coverage for the five ungated lessons, with INT R-10/R-28.

### INT R-12 — [Major] [CONFIRMED] Guide answers lose their source pill

- Evidence: `turn.ts:133,154,158,162` vs `QaChatPanel.tsx:51,405,428,452`.
- Fix: change either `turn.ts` (stop emitting Guide sources) or
  `QaChatPanel.tsx` (render Guide pills without href). Verify with the pinned
  tutor-setup question in the browser task.

### INT R-13 — [Major] [CONFIRMED] Agentic trio contradiction

- Evidence: `designing-ai-systems.mdx:199-208` vs
  `agentic-ai-patterns.mdx:88-90`.
- Fix: reconcile the two passages (content edit; decide the correct
  statement, then edit the other passage to match).

### INT R-14 — [Major] [CONFIRMED] Sources 180/181 unlinked

- Evidence: census re-run fresh (181 entries, 1 link).
- Fix: add stable links to Sources entries starting with papers/RFCs (with
  INT NEW3-3 header-rationale correction).

### INT R-15 — [Major] [CONFIRMED] ADR 0001 presents removed Wikipedia lookup as current

- Evidence: 0 `wikipedia`/`searchWeb` hits in code.
- Fix: correct ADR 0001 to the as-built routing (docs-only change).

### INT R-16 — [Major] [CONFIRMED] `architecture.md` "not deployed yet" / "never leaves the browser" vs gist sync + Veer; deployment status UNVERIFIED

- Evidence: `architecture.md:11-14,78-79`.
- Fix: with INT R-02 (one docs pass).

### INT R-17 — [Major] [CONFIRMED] Committed sitemap/llms.txt stale (36 lessons, no base path, same 5 missing); generators correct

- Evidence: committed sitemap/llms.txt stale (36 lessons, wrong base path).
- Fix: delete `sitemap.xml`/`llms.txt` from git + `.gitignore`, or regenerate
  with the production base path (AGENTS.md §11 forbids committing these
  artifacts — the deploy workflow regenerates them). With INT R-18/R-39.

### INT R-18 — [Major] [CONFIRMED] "Thirty-six lessons" hero + prerender snapshot vs 41 counted elsewhere

- Evidence: "Thirty-six lessons" hero (`RoadmapPage.tsx:187`) + prerender
  home (`prerender.mjs:344`) vs 41 counted elsewhere.
- Fix: render hero counts from the live lesson list; with INT R-17/R-39.

### INT R-19 — [Major] [CONFIRMED] 4 "(unverified…)" VideoCard attributions shipped, rendered verbatim; destinations not live-checked

- Evidence: 4 "(unverified…)" VideoCard attributions shipped. Destinations
  not live-checked (0 URLs live-checked in this review).
- Fix: verify the four VideoCard channels and clear the editorial notes.

### INT R-20 — [Minor] [CONFIRMED] Ben pills show shortened card titles, 22/41 differ; Veer shows full titles

- Evidence: Ben pills show shortened titles (22/41 differ).
- Fix: align pill titles to one rule (Ben full titles or a stated shortening
  rule applied consistently).

### INT R-21 — [Minor] [CHANGED — precision] Same video, different source labels

- Change: `XP98YCr-iXQ` is a VideoCard in **2** lessons, not 3 — the 3rd
  occurrence (`data-partitioning.mdx:224`) is a Go-deeper link. Reuse /
  label-variant pattern unchanged.
- Fix: one label per video wherever it appears.

### INT R-22 — [Minor] [CONFIRMED] Style guide contradicts corpus, omits Go-deeper (new evidence merged)

- Evidence: style guide contradicts corpus (6-key schema vs 8 keys, "only
  `<Quiz>`" vs 13 component types, Go-deeper omitted). New evidence merged
  from NEW1-3 (same document).
- Fix: correct the style guide to the corpus as built (or vice versa, with a
  recorded decision).

### INT R-23 — [Minor] [CONFIRMED] Chunker files text under next section's heading

- Evidence: `chunk-lessons.mjs:149-155`.
- Fix: file trailing text under its own section heading (chunker pass, #135
  lane).

### INT R-24 — [Minor] [CONFIRMED] Chunker exceeds 150-word cap after folding + fragment tails

- Evidence: 779 chunks, 10 at 154–171 words, 4 fragment tails.
- Fix: enforce the cap post-folding; with the fragment-predicate work
  (QA R-03 / #135 lane).

### INT R-25 — [Minor] [CONFIRMED] Tables flattened to run-on prose, split mid-row

- Evidence: tables flattened, split mid-row.
- Fix: preserve table structure in chunks (or a stated flattening rule that
  never splits mid-row).

### INT R-26 — [Minor] [CONFIRMED] `###` handling inconsistent across chunkers/TOC; 5 headings, 3 files

- Evidence: 5 headings, 3 files.
- Fix: one `###` rule shared by both chunkers and the TOC.

### INT R-27 — [Minor] [CONFIRMED] Validator checks only `correctIndex` range; loader weaker than validator

- Evidence: validator checks less than loaders assume.
- Fix: align validator/loader checks (one contract, tested both sides).

### INT R-28 — [Minor] [CONFIRMED] No card↔corpus parity guard; sets equal today (44 cards ≡ 41 MDX + 3 Guide)

- Evidence: no parity guard; sets equal today.
- Fix: add the card-corpus parity test (with INT R-10/R-11 pass).
