# Council record: Branch 1 — Ben embedder guards (F1, issue #153 surviving surface)

Tier T2 (AGENTS.md §3). Branch `fix/ben-embedder-guards`, base `origin/main` @ `a11c7997b63a31a96cdb4bb33a0d2de948647ab0` (verified: Phase 1 record, `pstack-interrogation-2026-11-12.md` header; Arena/Manifest header agrees).
Owning seat: B (timing contract) — source: Consensus Manifest, Part II, Branch 1 (verified, `pstack-arena-council-2026-11-12.md` §II.2 Branch 1).
Round count: 1 of 2 (AGENTS.md §3 step 7).
Model diversity: all seats ran on one model family this session — recorded as "no model diversity" per AGENTS.md §3 step 1 (source: Consensus Manifest §II.1, verified).
Implementing agent: builder seat (model name withheld per commission instruction).

## Consensus Manifest summary (Branch 1)

Source for every line below: Consensus Manifest §II.2 Branch 1 (verified) and Phase 1 evidence §1 F1 / §4 (verified).

- Scope in: `src/ai/local/runtime.ts`, `src/ai/local/semantic/embedder.ts`, `src/components/qa/QaChatPanel.tsx` (consume timeout/reset state only — no new UI states, no panel refactor), `src/ai/local/inference.ts` (generate() guards only).
- Defect (verified, Phase 1 §1 F1): the generator *load* was already fixed by R-02 (PR #195, commit `6822094`; 120 s first-progress + 60 s stall timeouts in `src/ai/local/inference.ts`). The surviving surface is: embedder load has no timeout/abort (`src/ai/local/runtime.ts`, `src/ai/local/semantic/embedder.ts` at HEAD); a never-resolving load wedges `semanticPromise` forever; post-ready `semantic.embed()` (`QaChatPanel.tsx`) and both `generate()` calls (`src/ai/local/inference.ts`) are unguarded.
- Required shape: timeout/abort on `loadSemantic()`/`loadPipeline()` copying the R-02 *pattern* — not its constants (120 s/60 s were tuned for a ~750 MB remote download; the embedder is ~23 MB same-origin, Phase 1 §4, verified) — with values chosen and justified in the PR (Seat C condition). Reset the wedged `semanticPromise` on timeout. Guard post-ready `semantic.embed()` and both `generate()` calls with a generation epoch/token so a timed-out generation cannot write to the UI when it later resolves. WebLLM generation cannot be aborted (`src/ai/local/inference.ts`, load comment at HEAD) — UI copy must never promise a cancel that does not exist for that leg; cancelling the *turn* is the deliverable (Seat A).
- Scope out: router behaviour, thresholds, wording tier; `worker/` is a hard fence (AGENTS.md §11 T1 paths).
- Targeted tests (failing-first): NEW `src/ai/local/semantic/embedder.readiness.test.ts` modelled block-for-block on `src/ai/local/inference.readiness.test.ts`; extensions to `semantic.test.ts`/panel turn tests, `inference.readiness.test.ts`, and `QaChatPanel.model-load.test.tsx` as named in the manifest.
- Gates: `npm run eval:ben` REQUIRED (AGENTS.md §11 — `src/ai/local/` changes) with holdout-only reported separately vs HEAD baseline (accuracy 83.3% / drift 5.0% / offered 15.0%; combined 87.1% / top-3 97.1% — Phase 1 §7, verified); targeted `npm test`; `npm run lint`; `npm run build` with `VITE_BASE_PATH=/system-design-and-architecture/`. Browser WebGPU/Prompt-API behaviour stays labelled UNVERIFIED in CI.

## >3-file justification (recorded before code — advisor note 1)

AGENTS.md §4 caps scoped files at 3 absent a recorded justification (verified, AGENTS.md §4). This branch names four code files. Justification: the manifest's Branch 1 scope names all four files; the guards on the two `generate()` calls (`src/ai/local/inference.ts` at HEAD, the Prompt API `session.prompt()` leg and the WebLLM `chat.completions.create()` leg) are part of the same F1 surface (Phase 1 §1 F1, verified) — a timed-out generation writing to the UI late is the same hang class as the wedged embedder load, and fixing one without the other leaves the F1 surface open. Test files, this record, the PR body and the `EVIDENCE_LOG.md` entry are record/test artifacts under the manifest's global acceptance criteria (Consensus Manifest §II.1), not additional code scope.

## Advisor verdict for this branch — VERBATIM

Source: advisor report `advisor-agree-2026-11-12.md` §1 (Branch 1), pasted verbatim below, including its heading verdict line and all notes with their MATERIAL / NON-MATERIAL labels unchanged.

> **Verdict: AGREE WITH NOTES**

**Verdict: AGREE WITH NOTES**

**Faithfulness to evidence:** Verified. Phase 1 F1 is PARTIALLY SURVIVES: the generator load was already fixed by R-02, and the surviving surface is exactly the embedder load with no timeout/abort, the wedged `semanticPromise`, the unguarded post-ready `semantic.embed()` and both `generate()` calls (Interrogation §1 F1; §3 Act-on F1 — verified). The branch scope matches that surface item-for-item and scopes out router behaviour, thresholds, and the wording tier (Arena/Manifest §II.2 branch 1 — verified).

**Tests / acceptance:** Verified sufficient and measurable — failing-first tests modelled block-for-block on `inference.readiness.test.ts`, the retry-unwedged assertion (second `loadSemantic()` re-invokes the load), the 12 s race keyword-fallback extension, and `npm run eval:ben` as a REQUIRED gate with holdout reported separately against HEAD 83.3% / 5.0% / 15.0% (Arena/Manifest §II.2 branch 1 — verified; HEAD holdout figures corroborated at Interrogation §7 — verified).

**Notes (all NON-MATERIAL):**
1. [NON-MATERIAL] File-count record: the branch's scope-in prose covers four code surfaces — `runtime.ts`, `embedder.ts`, `QaChatPanel.tsx`, and the `generate()` guards in `inference.ts:143,195` (Interrogation §1 F1 — verified) — while AGENTS.md §4 caps scoped files at 3 absent a justified exception (verified, AGENTS.md §4). The builder must record the >3-file justification in the branch manifest before code, in the same manner branch 3 and branch 16 already record theirs (Arena/Manifest §II.2 branches 3, 16 — verified). This changes no scope, test, or acceptance term; it completes a record the constitution already requires.
2. [NON-MATERIAL] Timeout values must be chosen and justified in the PR, not copied from R-02's 120 s / 60 s — this is already a Seat C condition in the branch text (Arena/Manifest §II.2 branch 1 — verified); the builder must show the justification, not merely assert it.
3. [NON-MATERIAL] UI copy must never promise a cancel that does not exist for the WebLLM leg, because WebLLM generation cannot be aborted (`inference.ts:174-177`) (Arena/Manifest §II.2 branch 1, Seat A condition — verified). Cancelling the *turn* via the generation epoch/token is the deliverable.

**Conditions a builder must honour:** no `worker/` touch; no new UI states or panel refactor (anything more splits out — Seat C, branch 1 text); red runs captured pre-fix failing for the intended reason; browser WebGPU / Prompt-API behaviour labelled UNVERIFIED in CI per the R-02 test-header precedent; `EVIDENCE_LOG.md` entry (all branch 1 items verified, Arena/Manifest §II.2 branch 1 and §II.1 global acceptance).

---

## Disposition

The advisor verdict is `AGREE WITH NOTES` with every note labelled NON-MATERIAL (verified, advisor §1 above), so implementation proceeds under AGENTS.md §3 step 4 once this record is pushed to the remote (AGENTS.md §3 step 7: a record that exists only on one machine does not count).
