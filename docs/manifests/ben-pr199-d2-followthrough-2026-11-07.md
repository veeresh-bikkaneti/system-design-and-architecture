# T2 Follow-through Plan — PR #199: D2 data hygiene and fresh holdout

**Target:** [PR #199](https://github.com/veeresh-bikkaneti/system-design-and-architecture/pull/199), head `62a8fb0`, based on `origin/main` `a11c799` at review time.  
**Risk tier:** T2 — the exemplar bank influences user-facing semantic routing; the evaluation-set migration and fresh holdout affect release evidence.  
**Status:** **PROPOSED — NOT APPROVED FOR IMPLEMENTATION OR MERGE.** Skeptic C round 1 voted `APPROVE WITH CONDITIONS`. Conditions are incorporated below, but the reviewer has not confirmed this revision. Chair approval is pending. The formal Advisor (Opus) is unavailable through the configured session tools; per `AGENTS.md` §3, do not approve this plan or begin implementation without the Advisor’s recorded concurrence.

This is a continuation plan for PR #199, not a re-review of its already-approved setup-policy decision. It supplements the existing proposed D2 manifest and corrects its remaining data-set prerequisite. It preserves browser-local inference and the owner’s no-cloud, no-paid-API, no-Oracle-VM constraint.

## Verified checkpoint

- The PR report is `201 diagnosis + 0 fresh holdout`, with diagnosis accuracy `89.6%`, drift `2.9%`, offered `5.8%`, refusal `2.0%`, and lesson top-3 `97.0%`.
- `evals/ben/holdout.json` still contains 103 examined cases labeled “Blind holdout 2.” These cases are not fresh and are excluded from the current report. The planned D2-0 migration has not been completed.
- Three D2b data-hygiene contracts remain red: four near-copy collisions (`n-c-024`, `n-t-068`, `n-o-094`, `n-s-102`); How-do-I share `21/54 = 38.88%` versus a `35%` maximum; and one named pattern/principle course exemplar versus a minimum of four.
- The existing D2 manifest’s 41 draft exemplars are hypotheses, not approved content. The evaluator currently reports an empty *fresh* set; no fresh score exists.

## Objective and hard boundaries

Complete the diagnosis migration, resolve the existing data-hygiene failures without per-case hacks, freeze one candidate, and validate it on a genuinely independent holdout. Do not change router rules, routing thresholds, gate thresholds, current setup-policy labels, or unrelated code. D2-L label decisions must follow intent definitions, not the measured outcomes. Do not tune after any fresh-holdout score. No inference provider, cloud, paid API, or VM changes are in scope.

## Ordered stages and scoped files

Each stage is sequential. A later stage cannot start until the prior stage passes. The stage limits keep each implementation increment within three files.

### Stage 1 — D2-0: retire the examined holdout

**Files:** `evals/ben/cases.json`, `evals/ben/holdout.json`, `evals/ben/data.test.ts` (3).

Move the 103 examined `n-` cases from the stale “Blind holdout 2” file into diagnosis `cases.json`, preserving their IDs and current labels for this stage. Empty `holdout.json` until a new independent set is ready. Update the hygiene contracts to assert disjoint IDs, the expected 304-case diagnosis set, and that no examined “Blind holdout 2” records are treated as fresh. Preserve the existing Guide-ID validity check. The current evaluator already reports an empty fresh set; do not modify `routing.eval.ts` unless a failing test proves that it cannot represent this staged state. If so, stop and obtain a manifest amendment before editing it.

### Stage 2 — D2-L: independent label review before final diagnosis scoring

**File:** `evals/ben/cases.json` (1).

A fresh Skeptic reviewer, given the intent definitions and case text before any score/report, reviews the already-identified cases `n-d-072`, `n-d-077`, `n-s-107`, and the G6 group (`n-c-007/009/010/012/036`, `c-repl-1/2`, `c-dtx-1`, `c-ai-1`, `c-es-2`). Record each decision and definition-based reason. Change a label only when the definition requires it. If there is disagreement, or a proposed change is justified by passing a gate, stop and return to the Chair; do not score-tune labels.

### Stage 3 — D2b: minimum general exemplar-hygiene repair

**Files:** `evals/ben/exemplars.json`, `evals/ben/data.test.ts` (2).

Keep the existing hygiene thresholds unchanged. Reword or remove the four near-copy examples; reduce How-do-I share to `<=35%`; and provide at least four general course examples matching the pattern/principle contract. Draft from lesson concepts and the existing intent definitions, not scored question text, IDs, distinctive tokens, or case-specific wording. The current 41-example draft is not automatically approved: review every proposed entry against all 304 diagnosis questions and the written no-per-case-hack rule. Do not weaken tests to make the bank pass.

### Stage 4 — diagnosis-only candidate freeze

Before creating the new holdout, run the unit/data-hygiene tests and `npm run eval:ben` twice on each required index variant. Both runs for a given variant must produce byte-identical diagnosis-only reports. Both variants must meet the unchanged gates: accuracy `>=85%`, drift `<=3.0%`, offered `<=10%`, refusal `<=8%`, lesson top-3 `>=90%`. Record the full index/vector identifiers and run outputs for the laptop/slow-runner variant prefix `f9feac54…` and fast-runner variant prefix `1837cd2f…`; keep both required until PR #201’s pinned-vector artifact is accepted. If the candidate fails or the variants disagree on a gate, stop; do not author or score a fresh set against a moving candidate.

### Stage 5 — genuinely fresh holdout

**Files:** `evals/ben/holdout.json`, generated `evals/ben/REPORT.md`, `EVIDENCE_LOG.md` (3).

Only after the candidate is frozen, commission a new, independent author in a throwaway environment with only a copy of `content/lessons/`. The author receives no repository, PR thread, evals, `REPORT.md`, router, exemplars, labels, or scratch files. Record the exact lesson paths supplied and their hashes. Create about 100 natural questions with labels. Add the new set once; do not reuse or relabel the examined 103-case set. If the automated near-copy check finds an accidental collision, freeze and invalidate the set; do not edit or cherry-pick questions after seeing the conflict.

Score the fresh set exactly once per required index variant, on the same frozen candidate, with no tuning or repeat after any fresh result. Each variant must independently meet the unchanged gates above. A failed fresh gate, an index-variant disagreement, or any post-score candidate change returns to the Chair for a new T2 plan and a newly authored blind set; never change thresholds or tune against this set. The report and evidence log must distinguish diagnosis metrics from fresh metrics.

## Acceptance and stop conditions

1. D2-0 tests prove the 304 examined cases are diagnosis data, with zero stale/duplicate IDs and no pre-existing `n-` record presented as fresh.
2. D2-L decisions are independently documented before final metric review; no relabeling to pass.
3. All data-hygiene tests pass with their original thresholds; no exemplar matches or near-copies a scored question.
4. Diagnosis runs are repeatable and both CPU variants meet every unchanged gate before candidate freeze.
5. The new holdout is mechanically isolated, scored once per variant, and independently meets every unchanged gate. Any failed gate blocks release; it is not a request to tune the holdout.
6. Existing PR checks and all repository gates applicable to the final PR head are green. No merge is authorized by this plan.

## Files and budget

The implementation is staged as three files for D2-0, one file for D2-L, two files for D2b, and three files for fresh scoring/reporting. `REPORT.md` is generated evidence; `EVIDENCE_LOG.md` is mandatory append-only evidence. No `src/`, router, threshold, evaluator, chunker, or index change is included. If the current evaluator needs a change, stop and re-review the scope. **Maximum future implementation/review budget: 15,000 tokens total** (D2-0 2,000; D2-L 2,000; D2b 4,000; candidate verification and fresh holdout 7,000). This manifest does not authorize that budget to be spent.

## Skeptic C review — round 1 (verbatim)

VOTE: APPROVE WITH CONDITIONS

**Verified:** The checkout is PR #199 head `62a8fb0769f5247609d3ce373dbec7d0778b3cbc`, based on the stated current main `a11c799`; no files were changed. `evals/ben/REPORT.md` reports 201 diagnosis cases and 0 fresh holdout, with 89.6% diagnosis accuracy, 2.9% drift, and 97.0% lesson top-3. `evals/ben/data.test.ts` enforces the near-copy, How-do-I share, and named-pattern thresholds. The repository manifest identifies the four current exemplar collisions and the unresolved D2-L cases/group. The PR's earlier setup-policy work is out of this review's scope.

**Required conditions before implementation:**
1. **Resolve the old holdout dependency explicitly.** Current `holdout.json` still contains 103 cases labeled “Blind holdout 2”; `routing.eval.ts` deliberately excludes that set as non-fresh. The manifest says those examined `n-` cases move into `cases.json` before a replacement fresh set. The proposed plan both preserves `cases.json` and omits it from its five deliverables. Add this as a separately scoped/approved prerequisite (including any D2-L label-only edits), or otherwise state a consistent disposition. Do not silently drop the 103 cases or retain them as fresh evidence.
2. **Clarify one-shot scoring across variants.** Define final holdout scoring as exactly one immutable run per required CPU/index variant, with both results meeting the unchanged gates and no tuning between or after runs. Diagnosis-only repeatability checks must finish before the holdout is introduced/scored; do not repeat an eval that includes the fresh holdout.
3. **Make the five-file exception auditable.** Justify each of `exemplars.json`, `data.test.ts`, `holdout.json`, generated `REPORT.md`, and `EVIDENCE_LOG.md` as necessary, separately from the manifest and the `cases.json` prerequisite. Keep staged D2b/D2-L boundaries clear.
4. Enforce real author isolation: a fresh author with no inherited PR/thread context or repository access beyond a throwaway copy of `content/lessons/`; record the actual supplied paths. A prompt prohibition alone is insufficient.
5. No implementation or merge until the required Chair decision and formal Advisor concurrence are recorded; stop on label disagreement or a failed holdout rather than tuning to pass.

**Inferred:** With those amendments, the sequence preserves the stated unchanged thresholds, avoids eval-question-specific exemplars, and offers meaningful blind validation. **Unverified:** I did not run tests/evals or verify external PR metadata; this was a read-only repository review.

## Review status

Round count: 1 of 2. This revision incorporates the Skeptic’s five conditions; confirmation is still pending. Advisor reply: **not available / not consulted**. Chair decision: **pending**. The PR carrying this manifest must remain draft and plan-only. Do not edit PR #199’s implementation branch or merge it until the formal Advisor and Chair approvals are recorded.
