# CONSENSUS MANIFEST: M1 Ben model load never blocks the chat (issue #153)

Status: DRAFT, awaiting Skeptic + advisor approval. Phase 1 only (reproduction, manifest, failing tests). No implementation code. This is a program: three manifests (M1a, M1b, M1c) below, each approved separately.

**Task:** QA R-02 (Blocker): the on-device model load has no timeout, no cancel and no readiness state, and a hung load disables the composer. Also QA R-04 (keyword answers not labelled provisional) and QA R-27 (no build/version/model status). Evidence: `git show origin/main:triage/ISSUES-CONSOLIDATED.md`, sections QA R-02, R-04, R-27.

**Risk tier and rationale:** T2 (behaviour change across the engine and the panel, new exported API). No T1 path touched: `worker/`, `src/store/session.ts`, `src/lib/gist-sync.ts`, `src/components/AuthBar.tsx` are untouched and stay out of scope. Eval thresholds and `evals/` are not edited. `src/ai/local/` changes, so `npm run eval:ben` runs after reading `docs/adr/0001-ben-semantic-routing.md` (read; section 6 promises "The chat never blocks on a model download").

## What the student sees today (VERIFIED by test traces)

Setup: model status `loading`, `rewriteWithModel`/`answerParametrically` never settle (what a hung `create()` does).
1. Lesson (keyword) answers DO appear: the card answer is patched before the model is awaited (`QaChatPanel.tsx` `answerByKeywords`, `patchMessage` then `await rewriteWithModel`). Test traced: the CAP answer renders.
2. But `handleSend` holds `streaming=true` until that await settles (`try { ... await answerWithBen } finally { setStreaming(false) }`, ~line 270-278). So the textarea, Send and "New topic" stay `disabled` (`disabled={streaming}`, ~lines 528, 727, 735) and "The assistant is writing…" shows forever. Traced red: `expected true to be false` on `composer.disabled`.
3. A question only the model can answer (`answerFromModelKnowledge` awaits `answerParametrically`) leaves an empty assistant bubble plus the same dead composer.
4. Close/reopen does not help: `QaWidget.tsx` keeps the panel mounted, so the stuck state survives (traced red).
5. Header shows `Loading On-device AI · N%` with no Stop control, no stall detection; `loadEngine` never settles (`inference.ts` ~143-162).
6. Keyword answers carry only `· keyword match` (`QaChatPanel.tsx` ~411, ~468), no "provisional" wording.
Real-browser rate (3-6 %/min), WebGPU and Prompt API behaviour: UNVERIFIED in CI (low confidence, reported by QA only).

## Acceptance conditions
A1. No-progress bound: a load with no `downloadprogress`/`initProgressCallback` event for **60 s** (proposal; UNVERIFIED value) ends `failed`; waiting callers resolve `null`.
A2. Slow progress is not failure: every progress event re-arms the bound; no total-time cap.
A3. `cancelModelLoad()` export: phase `cancelled`, waiting callers resolve `null`, later questions do not restart the load.
A4. Sticky failure kept (S8): no second `CreateMLCEngine` after `failed`; a late-settling abandoned `create()` cannot flip the phase back to `ready`. **"Retry on failure" is rejected.**
A5. Readiness state machine (below), exposed through the existing `getModelStatus`/`subscribeModel`.
A6. The composer, Send and New topic are never disabled by model loading alone; only an in-flight answer disables them, and an answer never awaits the model past the lesson answer.
A7. Lesson/keyword answers are available while loading and labelled provisional (R-04).
A8. Timing instrumentation: `getLoadTiming()` returns `{ startedAt, firstProgressAt, readyAt, errorCount }` (ms epoch). No load-time claim is made in docs or UI until data exists.
A9. Output gate (R-01) unchanged: `sanitize.test.ts` and the gate tests in `inference.test.ts` stay green.

## State machine (proposal)
```
idle      --first need / panel open--------> loading
loading   --engine ready------------------> ready        (terminal for the page)
loading   --no progress for 60 s / throw--> failed       (sticky; reload is the retry)
loading   --cancelModelLoad()-------------> cancelled    (sticky until explicit user restart: OPEN QUESTION)
loading   --progress event----------------> loading      (re-arm bound, store progress)
failed | cancelled | ready: no automatic transition; late settles of an abandoned create() are ignored.
```

## Failing tests (VERIFIED red at this commit; 13 fail, 1 guard passes)
- `src/ai/local/inference.readiness.test.ts` (8 tests, 7 red): hang never fails (`expected 'pending' to be 'settled'`); stall-after-progress; sticky stall-failure; `cancelModelLoad`/`getLoadTiming` `is not a function` (5 tests). Guard that passes today and must stay green: slow-but-steady progress (6 min at 20 s gaps) is not failed. Uses `@ts-expect-error` on the not-yet-existing exports; M1a deletes those comments.
- `src/components/qa/QaChatPanel.model-load.test.tsx` (6 tests, all red): composer stays disabled after a lesson answer, after a model-only question, and after close/reopen (`expected true to be false`); no `provisional` text; no "Stop loading" button; no cancelled copy.
- Untouched and must stay green: `inference.test.ts` S1-S9, `sanitize.test.ts`, `QaChatPanel.ben-fallback.test.tsx`, `QaChatPanel.veer.test.tsx`.

## The split (max 3 source files per manifest)
| Manifest | Scope | Source files | Tests |
|---|---|---|---|
| **M1a** engine/readiness | A1-A5, A8 core (bound, cancel, `cancelled` phase, sticky, timing). | `src/ai/local/inference.ts` (1) | `inference.readiness.test.ts` |
| **M1b** panel | A6, A7: stop awaiting the model in the turn (patch the lesson answer, run wording detached, clear `streaming` first), header copy per phase, Stop button, provisional label. | `src/components/qa/QaChatPanel.tsx` (1) | `QaChatPanel.model-load.test.tsx` |
| **M1c** status/version stamp (R-27) | Build/commit stamp and timing surfaced in the panel footer. Only if the coordinator decides a stamp is required (the triage says UNDECIDED). | `vite.config.ts` (define), `src/vite-env.d.ts`, `QaChatPanel.tsx` (3) | one render test |

**Order:** M1a, then M1b, then M1c. M1a touches no panel file, so it can run in parallel with anything. `QaChatPanel.tsx` is also edited by the P1 accessibility slices: propose M1b goes before them (Blocker severity; M1b's edits are small and local: the `disabled` props, the header ternary, one label), and the a11y slices rebase onto it. M1c goes last, after both. The orchestrator owns the final call; no two of these may be open against `QaChatPanel.tsx` at once.

## Risks / unknowns
- UNVERIFIED (low confidence): the 60 s bound; real `initProgressCallback` cadence; whether the Prompt API `downloadprogress` fires during a stall; real WebGPU behaviour. Not testable in CI. Needs a live fresh-profile run (BB-39 to BB-43) before any "fixed" claim; M1a's instrumentation is how that data is gathered.
- Aborting WebLLM mid-download: `CreateMLCEngine` has no abort API in the version used (UNVERIFIED, check in M1a). The bound may only abandon the promise, not stop the fetch; the late-settle guard (A4) covers correctness, bandwidth waste remains.
- R-04 re-answer/staleness once the model becomes ready is NOT in scope (label only); decision needed.
- `cancelled`: sticky vs restartable by an explicit "Try again" button is an open question for the Chair; tests pin only "no automatic restart".

## Rejected alternatives
- Retry on failure / auto-restart: rejected (S8, re-downloads Hub weights, hammers a failing network).
- A single total-time cap: rejected, it would kill a legitimate slow download (3-6 %/min).
- Block the chat until ready: that is today's bug.
- Raising the semantic wait (`SEMANTIC_WAIT_MS`) or changing evals/thresholds: out of scope.

**Token budget:** 15,000 per sub-manifest; phase 1 used roughly 25k of reading/tracing in total (estimate unreliable); the program as a whole needs the Chair's cap decision.

**Approvals / votes / dissent:** pending (Skeptic C + advisor; Chair Liz decides). T2 needs Chair + Skeptic.

**Chair decision:** pending.

## Library facts (verified from installed source)

Read at M1a GATE 1 from `node_modules/@mlc-ai/web-llm` 0.2.85 (`package.json`), file `lib/index.js` unless noted. Line numbers are of that installed file.

- `CreateMLCEngine` is just `new MLCEngine(config)` then `await engine.reload(modelId)` and returns the engine only after the load finishes (12922-12927). It takes no abort option.
- The library does have an abort path, but only through the engine instance: `reload()` creates an `AbortController` (13001) and passes its signal to the config, wasm and weight fetches (13041, 13065, 13115); `engine.unload()` aborts it (13160-13161). `reload()` swallows the `AbortError` and returns normally (13008-13012). Because `CreateMLCEngine` hides the instance until the load ends, M1a cannot call `unload()` mid-load. M1a abandons the wait (the download may continue in the background) and calls `unload()` on a late-arriving engine. Using `new MLCEngine(...)` + `reload()` directly would give a true abort, but would change what `inference.test.ts` mocks; deferred as a follow-up, not done.
- Progress cadence: one event "Start to fetch params" (8005-8010 region), then one event per finished weight shard during download (`reportCallback` after each shard, 7572-7574; 4 parallel download loops, 7576-7583), then one per shard while loading to the GPU (loading phase), then "Loading GPU shader modules" events throttled to at most one per second (8012-8025), then a final `progress: 1` "Finish loading" (13131-13137). So events are per shard, not per byte: a slow link waits one whole shard between events.
- Shard size: NOT in the installed package. It comes from the remote `ndarray-cache.json` (`nbytes` per record, 7518-7520). UNVERIFIED, so the 120 s / 60 s numbers stay UNVERIFIED defaults.
- Whether the silent phases (adapter request, dynamic import, config fetch, wasm fetch) are long: UNVERIFIED; that is what the 120 s first-event window is for.
- Prompt API: the only types available are the repo's own ambient `src/ai/local/promptApi.d.ts`, which has `monitor` (`downloadprogress`) and no `signal`. M1a passes `signal` anyway (the Chrome docs list it for `create()`; UNVERIFIED here, no Chrome source available) and the browser ignores it if unsupported. Whether `downloadprogress` fires during a stall: UNVERIFIED.

## M1a implemented (what changed)

`src/ai/local/inference.ts` only, plus `inference.readiness.test.ts`. Two-stage bound: 120 s before the first progress event, 60 s after, re-armed on each event, no total cap (numbers unchanged, GATE 1 gave no evidence to change them). The same bound covers the Prompt API `create()` and passes it an `AbortSignal`. Phases `idle/loading/ready/failed/cancelled`; `cancelModelLoad()`; `retryModelLoad()` works only from `cancelled`; failed is sticky. A per-load generation check ignores late progress and late settles; a late engine is discarded and `unload()` is called if it exists. `getLoadTiming()` returns `{ startedAt, firstProgressAt, readyAt, progressEvents, errorCount }`, numbers only, local, no message text (this is M1a, not M1c; the M1c labels in the phase-1 text above are stale). All `@ts-expect-error` comments removed. Cancel and fail abandon the wait; the WebLLM download may continue in the background.
