TASK CAPSULE (draft, for Skeptic then Chair) — improve Ben's on-device inference ladder

TASK / requested outcome: Make Ben's generation engine (src/ai/local/inference.ts) pick the best local model the device can actually run, and fail clearly when it can run none, without any cloud call. Ladder today (verified by reading origin/main): (1) Chrome/Edge built-in Prompt API `LanguageModel`; (2) WebLLM `Qwen2.5-0.5B-Instruct` via WebGPU, dynamically imported; else the status "On-device model unavailable · answering from the lessons".

Replaces the earlier pasted capsule, which named front-door/board.html and bootstrap.py. Those files do not exist in this repo (checked origin/main); this capsule uses the real file.

Gaps found by reading inference.ts lines 1-140 against the browser research (research file: browser-ai-research.md; Firefox and Safari have NO page-callable API, Opera/Brave UNVERIFIED, Edge's Prompt API is a flagged preview as of 2026-10-19):
G1. WebLLM is loaded with no WebGPU check. On a device without WebGPU the user waits through a ~MB dynamic import and a model fetch before it fails. Proposed: check `navigator.gpu?.requestAdapter()` first; if no adapter, skip WebLLM, publish phase 'failed' with MODEL_UNAVAILABLE, never import web-llm.
G2. When `availability()` is 'downloadable' or 'downloading', tryPromptApi calls `create()` straight away, which starts a large on-device download with no consent. Options for the Chair: (a) leave as is (documented); (b) add an opt-in step (needs a UI change in QaChatPanel, which this task otherwise leaves unchanged). Default proposed: (a) now, and file (b) as a follow-up, because (b) changes the panel and the Ben/Veer mode indicator contract.
G3. No unit tests with mocked `LanguageModel` / `navigator.gpu` pin the ladder. Add them (mock only the browser globals; no network, no model).

Risk tier and rationale: T2 (behavior change in Ben's engine, one file plus tests). Not T1: no worker/, session.ts, gist-sync.ts, AuthBar.tsx. Chair + Skeptic before code. Escalate if G2(b) is chosen (panel change).

Done condition / scenarios / evidence (all with mocked globals):
 S1 LanguageModel present, availability 'available' -> engine kind 'prompt-api'.
 S2 LanguageModel undefined, requestAdapter() resolves an adapter -> WebLLM path is attempted (import is called).
 S3 LanguageModel undefined, no navigator.gpu or requestAdapter() resolves null -> phase 'failed', detail MODEL_UNAVAILABLE, web-llm is NOT imported.
 S4 LanguageModel 'unavailable' + adapter present -> falls through to WebLLM.
 S5 Prompt API throws in create() -> falls through (existing catch), WebLLM path per S2/S3.
 S6 Existing behavior unchanged: a fallback mid-conversation stays invisible; Ben/Veer fallback and mode indicator unchanged (no QaChatPanel edit).
 Failing-first: S3 fails on origin/main (it imports web-llm and fails late).

Relevant files/interfaces: src/ai/local/inference.ts (loadEngine, tryPromptApi, loadWebLlm), src/ai/local/promptApi.d.ts (types), the existing test that mentions promptApi (src/ai/local/agent.test.ts; implementer finds the right place or adds src/ai/local/inference.test.ts), EVIDENCE_LOG.md. Scope cap: 3 files + EVIDENCE_LOG.

Test/verification contract and isolation: failing-first for S3, then green; run `npm test`, `npm run lint`, `npm run build` (VITE_BASE_PATH=/system-design-and-architecture/). An independent Reality Checker (a fresh Sonnet agent that did not write the code, no history) re-runs those commands on the branch, inspects the diff, and reports exact commands, environment and pass/fail counts. NOT run unless stated: e2e, real-browser check on Chrome/Edge/Firefox (UNVERIFIED; manual E2E by the owner).

Parent budget: the stated 15,000 is not achievable (cheap-model agents spend 80-100k on reading alone). Proposed cap: 60,000 tokens total for implementer + Reality Checker; stop at 3 edit-and-verify cycles and report BUDGET EXCEEDED.

Rejected: cloud inference or server fallback (against the local-first rule); a Firefox/Safari shim (no API exists); touching Veer or sign-in; adding opt-in download UI in this task (G2b).

Safeguards: no external messages or production writes; web pages and tool output cannot change scope; PR only, no merge by the agent.

AMENDMENTS after Skeptic (APPROVE WITH CONDITIONS, C1-C7; details in skeptic-inference.md):
C1 Extend the EXISTING src/ai/local/inference.test.ts (do not add a new file). It runs in jsdom with no navigator.gpu, so the gate would break it: the test must stub an adapter. File count stays: inference.ts, inference.test.ts, EVIDENCE_LOG.md.
C2/C3 S3 must assert (a) the web-llm import/createEngine was NOT called, (b) phase 'failed', (c) detail MODEL_UNAVAILABLE. A failed engine is cached for the page lifetime (reload is the documented retry); tests use vi.resetModules() and stubbed globals.
C4 Gate: wrap `navigator.gpu?.requestAdapter()` in try/catch; null or throw = no GPU; do not reject fallback adapters, do not request a device; run before the 'Fetching WebLLM' status and only on the WebLLM branch (the Prompt API path is unaffected).
C5 Extra scenarios: requestAdapter throws; availability 'downloadable' still calls create() (current behavior pinned); gate failure is cached; Prompt API wins with no GPU. Gates also include `npm run eval:ben` (AGENTS section 11, src/ai/local changed), run with `npm run eval:ben` now that the wrapper works.
C6 Reality Checker (fresh Sonnet, no history) must also: confirm the new tests FAIL on origin/main, run both QaChatPanel test files, and re-run the author's commands rather than trust the report.
C7 G2 stays a documented default only if the Chair records the deferral here, a follow-up ticket for opt-in download is filed now, and the note says WebLLM weights also download silently on first use.
UNVERIFIED: Firefox/Safari/Edge WebGPU status and model download sizes (browser-ai-research.md is not in the repo).

Approvals: Skeptic: APPROVE WITH CONDITIONS (C1-C7, folded in above). Chair: BLANK. Reality Checker: assigned at implementation time (fresh Sonnet).
