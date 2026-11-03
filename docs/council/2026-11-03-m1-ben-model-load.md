# Council record: slice M1, Ben model load never blocks the chat (PR #195)

Tier T2 (QA R-02 Blocker, plus R-04 and R-27). Procedure: AGENTS.md section 3 (Chair + Skeptic, then the advisor). Panel: one seat (Skeptic, sonnet), as the T2 rule requires. Council lead: Sonnet 5.5. Decided by council and advisor under the owner's standing instruction of 2026-11-02 for the technical questions (including the question left for the Chair in the manifest).

## Round 1

### Seat C (Skeptic), report, verbatim

VOTE: SUPPORT WITH CHANGES. There are 2 blocking items, B1 and B2. I read the manifest, both new test files, origin/main inference.ts and QaChatPanel.tsx, and the #109 diff. node_modules is not installed in this clone, so I could not read the WebLLM source (UNVERIFIED).

BLOCKING

1. The 60 s bound is unevidenced and may be marginal on slow connections (item 1). Inferred, not verified: QA saw 3-6 %/min. WebLLM reports download progress per fetched shard, so on a slow link the gap between events could approach or exceed 60 s. I could not check how long the silent GPU shader-compile phase runs. The manifest's own wording, "whether downloadprogress fires during a stall", is likewise unchecked. Change the acceptance wording: A1 becomes a two-stage bound, with values marked as defaults pending live data. Before the first progress event: 120 s, which covers the WebGPU adapter request, the dynamic import and the config fetch. After any progress event: 60 s, re-armed on each event. Add a named phase: 'compiling' allowance only if the live run shows a silent compile phase. M1a must read the installed @mlc-ai/web-llm source for initProgressCallback cadence and shard size before the value is frozen. Test change: make the first-progress case a separate case from the stall-after-progress case. The existing "never settles" test uses 60 s, so it becomes 120 s. For the Prompt API, tryPromptApi (inference.ts:55-70) only publishes progress from downloadprogress. Since create() itself can sit with no event, the same bound must wrap it. availability() and create() also need coverage.

2. Cancel is not abort, and the manifest must say so (item 2). On origin/main, CreateMLCEngine is called with only initProgressCallback (inference.ts:101). I found no AbortSignal and no unload in the code that calls it. Whether the library supports abort is UNVERIFIED. The Prompt API create() does accept signal (inferred; M1a must verify). Pass it when available. Add an acceptance line: "Cancel and fail abandon the wait. The WebLLM download may continue in the background. A late settle is ignored, and if it resolves, the engine is discarded (call unload() if it exists)." Add a test that a late resolve after cancel does not flip the phase to ready and does not publish progress. The stall test (S8-style) covers this for failed only.

NON-BLOCKING

3. Decision on question 3: a cancelled load is restartable; a failed load stays sticky until reload. The reason is that failure means the network or GPU broke, and S8 exists to stop us hammering it. Cancel is the user's choice, so an explicit "Try again" respects it. Add retryModelLoad() that works only from cancelled. It resets enginePromise to null and bumps a generation counter. The abandoned create() is guarded by a generation check, not by the cache. S8 (inference.test.ts:126) pins only gate failures and rejection caching, so it stays green. Required tests: cancel, then retry, gives a second CreateMLCEngine call; the old call's late resolve is ignored; failed, then retry, stays a no-op; auto-restart from a question after cancel does not happen (already pinned). Cost: one more small export and one button (M1b), still under the 3-file cap.

4. Composer logic (item 4). In QaChatPanel.tsx, streaming must mean "a deterministic answer is being produced" only. answerByKeywords (line 458) and answerByMeaning (line 441) call await rewriteWithModel. Both must be detached: patch the lesson answer, run setStreaming(false) in finally, then fire the rewrite without awaiting it. Guard against a late rewrite overwriting a newer turn by checking assistantId is still the last message. semanticWithin(SEMANTIC_WAIT_MS) (line 288) is a 12 s hold with streaming true, which is bounded, so it is acceptable and not the R-02 bug. Say so in the manifest. Model-only questions via answerFromModelKnowledge (line 396) should not wait forever. When the phase is loading, failed or cancelled, skip the await and show the existing fall-through. That fall-through is the keyword answer if turn.inScope, else the deterministic NO_SOURCE line (lines 400-418), which are already gated honestly. The test for this exists (model-load.test.tsx model-only case). Add one assertion that the bubble is NO_SOURCE, not empty.

5. Output gate and persistence (item 5). Detached rewrites still go through the gate in rewriteWithModel/answerParametrically (S-tests, sanitize.test.ts), so the gate is unaffected. priorTurns(history) is captured at send time. A detached rewrite should patch only its own assistantId. Verify that persistence stores the final patched content, not a transient state.

6. Conflicts and merge order (item 6). #109 touches QaChatPanel.test.tsx only, not QaChatPanel.tsx, so there is no source conflict. It adds no e2e spec that pins header copy. QaChatPanel.test.tsx pins these strings: "Loading On-device AI · 42%", "Getting ready · reading the lessons", "Built-in browser AI", and the failed line "On-device model unavailable · answering from the lessons". The vi.mock factory in that file exports no cancelModelLoad. Inferred, UNVERIFIED: vitest throws on access to a missing mock export. A Stop button rendered during loading (BF3/BF4) and a click handler reading the import could trip it. Even if handler-only access is safe, the risk is real. Required: M1b keeps those four strings byte-identical, renders the Stop button as a sibling element, and uses getByText-safe markup. Merge order: land M1a first (no panel file). Land M1b second, and rebase it on #109 if #109 has merged. If #109 lands first, add cancelModelLoad: vi.fn() and retryModelLoad: vi.fn() to its mock. Keep the new cancelled header text out of the strings #109 pins. The ModelPhase type widening is the only shared surface. P1 a11y slices #155-#158 rebase onto M1b.

7. Tests (item 7). Fake timers are used throughout, so there is no real 60 s wait. The guard test (18 events at 20 s) would not catch an off-by-one bound. Add a boundary test: an event at 59 s re-arms, and silence at exactly 60 s fails. Mutation check: "never settle fails" would also pass for a total-cap implementation, but the slow-progress guard kills that mutant. Mutation check: add a test that a late resolve after cancel never reaches ready. Remove all @ts-expect-error comments in M1a. Also fix the timing test labels ("M1c" in the test describe text, "M1a" for getLoadTiming in the manifest).

8. Instrumentation privacy (item 8). getLoadTiming returns four numbers plus a count. No PII, no network. Keep it local-only, do not log to analytics, and record errorCount without storing the error message.

9. Tier (item 9). T2 is correct. worker/, session.ts, gist-sync.ts and AuthBar.tsx are untouched. The loaded model is not a secret, and the output gate is unchanged.

10. Live check (item 10). CI cannot prove real WebGPU, Prompt API, shader-compile silence or progress cadence. "Fixed" must not be claimed until a fresh-profile run on a slow throttled network records getLoadTiming(). The coordinator or Liz must run it, since an agent cannot drive real WebGPU in this harness. Never cite "~18 min". F2 timing is INCONCLUSIVE (triage/ISSUES-CONSOLIDATED.md:52, :128).

Merge order: M1a, then M1b, then M1c. Whether M1c happens at all is the owner's call, because R-27 is undecided.

### Verdict (council lead, Sonnet 5.5), round 1

Adopt all ten.
- B1: two-stage bound, values are DEFAULTS pending live data (120 s before the first progress event, 60 s after any event, re-armed on each event, no total cap); M1a reads the installed @mlc-ai/web-llm source for initProgressCallback cadence before freezing the numbers; the Prompt API create() is wrapped by the same bound; boundary tests (event at 59 s re-arms, silence at 60 s fails).
- B2: acceptance wording "cancel and fail abandon the wait; the download may continue in the background; a late settle is ignored and the engine discarded (unload() if it exists)"; a late-resolve-after-cancel test; pass the AbortSignal to the Prompt API create() where supported.
- Decision on the restart question: a CANCELLED load is restartable by an explicit retryModelLoad() (generation counter, S8 stays green); a FAILED load stays sticky until reload.
- Composer: streaming means only "a deterministic answer is being produced"; rewrites are detached and patch only their own assistantId; model-only questions skip the model await when the phase is loading, failed or cancelled and show the keyword answer or the deterministic NO_SOURCE line (assert it is not empty).
- M1b keeps the four strings pinned by #109's QaChatPanel.test.tsx byte-identical, adds the Stop button as a sibling element; merge order M1a, M1b, M1c; if #109 lands first its vi.mock gains cancelModelLoad and retryModelLoad stubs.
- Remove all @ts-expect-error comments in M1a; fix the test and manifest labels; getLoadTiming is local-only, no message text.
- M1c (R-27 version stamp) is decided by the council as OPTIONAL and DEFERRED until after the live check: a build stamp is cheap but adds a file and an undecided product choice; revisit with data.
- LIVE CHECK: an agent cannot claim the fix from CI alone. A fresh-profile run on a throttled network must record getLoadTiming(); whoever can drive a real browser with WebGPU runs it (the available /browse skill, or the owner on the live site) and attaches the numbers to the PR before the issue is closed.

Round count: 1 of 2. Sent to the advisor next; the reply is recorded in the following commit.

### Advisor (Opus), first reply, verbatim summary of what it asked for

The advisor's first reply gave no verdict on M1. It asked for three things before the M1 consult, and said the batching-fix trigger and the #109 smoke check are due:
1. The merge-order branch resolved. #109 merged (b88c2e5) before M1b, so the live branch is "add cancelModelLoad: vi.fn() and retryModelLoad: vi.fn() to the vi.mock factory in QaChatPanel.test.tsx"; M1b's implementer must do that and keep the four pinned strings byte-identical.
2. Confirm the four suites failing with `Failed to resolve import "../lib/lesson-manifest"` are a missing build step, not a break.
3. The batching-fix trigger (docs/council/2026-11-02-eval-tradeoff.md) started when #109 merged.

### Amendments adopted (council lead, Sonnet 5.5)

- Merge order is now settled: #109 is on main (b88c2e5). M1b rebases on main and adds the two mock stubs. P1 accessibility slices rebase onto M1b.
- Verified: src/lib/lesson-manifest.ts is gitignored and generated by `scripts/seo/generate-manifest.mjs`, which `npm test` runs through `pretest`. The four failures appeared because the phase-1 agent ran vitest directly. They are NOT a pre-existing break. Implementers must run `npm test`, or generate the manifest first, and must not treat those four failures as pre-existing.
- Batching-fix trigger: armed at the #109 merge. It opens as a draft PR within one working session, queued after the M1a/M1b implementation, or goes to the owner as a scheduling question.
- Live check for M1 and the post-merge smoke check for #109 are separate; the #109 result is posted on PR #109.

### Advisor (Opus), second reply, verbatim summary

Verdict: the Skeptic's ten points stand, implement them. Nothing is outstanding on the design; launch M1a. Do not loop back for another design pass. One addition: M1a's brief must carry an explicit gate that the implementer runs `npm ci` in its worktree and reads the installed @mlc-ai/web-llm progress-emission path (initProgressCallback cadence, shard size), or reports that it could not and leaves the 120 s / 60 s numbers labeled UNVERIFIED defaults. The pending-mock-export question is settled by adding the two stubs in M1b (required, not defensive). Order: #109 live smoke check (posted on PR #109), then M1a, then the docs PRs. The batching trigger is armed; queueing it after M1a/M1b is a reading of "within one working session", not a given, and if M1 runs long the honest move is the scheduling question to the owner.

### Outcome

Round count: 2 of 2 used for the record (round 1 Skeptic + verdict, advisor reply 1 asked for amendments, advisor reply 2 AGREE). Advisor: AGREE with one added gate (adopted into the M1a brief). Decided by council and advisor under the owner's standing instruction of 2026-11-02. Record of the batching trigger: queued after M1a and M1b as a reading of "within one working session"; if M1 is not merged by the end of the next working session, the batching task goes to the owner as a scheduling question.
