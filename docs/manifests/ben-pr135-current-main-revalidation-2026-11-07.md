# T2 Plan — PR #135: current-main chunker revalidation

**Target:** [PR #135](https://github.com/veeresh-bikkaneti/system-design-and-architecture/pull/135), current head `9fdc878`, merge base `f739912`; `origin/main` was `a11c799` when reviewed.  
**Risk tier:** T2 — sentence-aware chunking and index text change what Ben retrieves and what gets embedded across the lesson corpus; this is a broad user-facing answer-quality and evaluation change.  
**Status:** **PROPOSED — REVALIDATION ONLY; NOT APPROVED FOR IMPLEMENTATION OR MERGE.** Skeptic C round 1 voted `APPROVE WITH CONDITIONS`. The plan incorporates those conditions, but the reviewer has not confirmed this revision. Chair approval is pending. The formal Advisor (Opus) is unavailable through the configured session tools; per `AGENTS.md` §3, do not approve this plan or begin implementation without the Advisor’s recorded concurrence.

This is a separate plan from PR #199 and PR #201. Do not copy their code, labels, exemplars, or holdout data into #135. Preserve browser-local inference and the owner’s no-cloud, no-paid-API, no-Oracle-VM constraint.

## Verified checkpoint

- PR #135 is open and non-draft. Its 7 checks are green on the existing head, but that head is based on older `f739912` and is not current-main acceptance evidence.
- PR #135’s index builder uses `BATCH=32`; current main `a11c799` pins `BATCH=1` for deterministic embeddings. The old PR report’s zero-fragment result and routing trade-off were measured on the old base and must not be reused as current results.
- Current main’s report covers 151 diagnosis plus 48 historical holdout cases. The 48-case set is not fresh independent evidence. Current main does not provide a fresh holdout for this chunker candidate.
- The prior council’s acceptance for remeasurement requires: zero fragments; accuracy `>=85%`; drift `<=2.9%` with one-case slack or a written case review; lesson top-3 `>=90%`; and a mechanism-based explanation of `h-d-ai-art`, not an evaluation-data edit.

## Objective and hard boundaries

Bring the existing #135 candidate onto the verified current base without rewriting remote history, preserve BATCH=1 and all newer deterministic-index behavior, then measure the candidate against the same current-base baseline. This plan ends with a **provisional revalidation result only**. It does not authorize a merge or a claim of fresh-set/release readiness. The historical 48-case holdout is comparative only.

### Stage 1 — integrate current main without rewriting history

**Files:** `scripts/ben/chunk-lessons.mjs`, `scripts/ben/build-index.mjs`, `evals/ben/data.test.ts` (3).

After formal approval, update the existing PR branch with a normal merge of the then-verified `origin/main`; do not rebase or force-push. Resolve conflicts only inside the named scope. Preserve the current-main `BATCH=1` constant and its deterministic-index behavior/tests, while retaining #135’s sentence-aware windowing, fragment predicate, stripped-block boundary behavior, sentence-boundary display trim, and build gate. If resolving conflicts requires scope expansion, changes the routing/data contracts, or cannot preserve `BATCH=1`, stop and ask the Chair for a revised plan; do not create a successor branch or rewrite history under this plan.

Keep `scripts/ben/chunk-lessons.d.mts` out of scope unless a type/build failure demonstrates it is necessary. If that occurs, stop and amend the manifest before editing it.

### Stage 2 — current-base comparative remeasurement

**Files:** generated `evals/ben/REPORT.md`, `EVIDENCE_LOG.md` (2).

On the exact merged candidate and exact same evaluation data, run a current-main baseline and candidate measurement for each required index variant. Use the project’s existing variant procedure; record the full variant/vector hashes and exact commands. The known prefixes are `f9feac54…` (laptop/slow-runner) and `1837cd2f…` (fast-runner). If the method to reproduce either variant is unavailable or ambiguous, stop and obtain a plan amendment rather than inventing an environment switch. Run `npm run eval:ben` twice per variant for repeatability of the comparative diagnosis report; reports for repeated runs of the same commit/variant must be byte-identical. Keep both variants required until PR #201’s pinned-vector artifact is accepted.

The measurement acceptance conditions are:

1. The shipped and pre-trim chunks both have zero fragments under the same `isFragment` predicate used by the unit test and build gate; no dangling stripped lead-in, mid-sentence section boundary, or mid-word display trim is introduced. A long sentence remains whole and is recorded if over the display limit.
2. The unchanged evaluator gates pass on each variant: accuracy `>=85%`, drift `<=2.9%` or a written independent case review under the prior council rule, offered `<=10%`, refusal `<=8%`, and lesson top-3 `>=90%`. Do not alter any threshold.
3. Explain the observed `h-d-ai-art` route change through the chunking/index mechanism and case evidence; do not edit or relabel the case to obtain a pass.
4. Run every applicable repository gate on the current PR head: `npm run content:validate`, `npm run content:check`, `npm test`, `npm run lint`, `VITE_BASE_PATH=/system-design-and-architecture/ npm run build`, `npm run test:e2e`, plus the PR’s Ben-evaluation check. Record any not-run gate explicitly; a stale green check is not a substitute.

The existing 48-case holdout may appear in the comparative report, but must be labeled **historical/non-fresh**. A result from it cannot be represented as independent validation or as satisfying a fresh-holdout gate.

### Stage 3 — separate fresh-set decision before any merge claim

No fresh set is approved or available for this exact #135 candidate. The fresh set proposed for PR #199 is candidate-specific and must not be reused for #135. Therefore this plan explicitly stops before merge readiness. A later T2 plan must decide and approve a #135-specific independent holdout protocol after the exact #135-on-current-base candidate is frozen. Minimum protocol: a fresh author isolated to a throwaway copy of `content/lessons/`, with no repository/PR context, evals, report, router, exemplars, or scratch files; recorded supplied paths; a separately frozen holdout; one score per required variant; no tuning or rescore after exposure. If no separate approved blind set is available, stop and obtain the Chair’s decision before any merge claim.

## Scope and budget

The integration stage is limited to the three existing source/test files above. The comparative evidence stage is limited to generated `REPORT.md` and the append-only `EVIDENCE_LOG.md`. The report is necessary to record the current-base result; the evidence entry is mandatory under the repository’s T2 process. The independent future holdout is explicitly out of scope and requires a separate plan. No router, cases, exemplars, thresholds, `chunk-lessons.d.mts`, or #199/#201 files are authorized. **Maximum future revalidation budget: 7,500 tokens.** This manifest does not authorize that budget to be spent.

## Skeptic C review — round 1 (verbatim)

VOTE: APPROVE WITH CONDITIONS

**Verified:** PR #135 is open/non-draft at `9fdc878`, based on `f739912`; current `origin/main` is `a11c799`. Its existing checks are green, but the recorded runs are from Nov. 2 and predate the current base. PR #135 uses `BATCH=32`; current main pins `BATCH=1`. Therefore the PR’s reported zero fragments, 2.0-point accuracy trade, and 2.9% drift do not establish results on the proposed merged head. The tradeoff record requires remeasurement after the batching fix and sets the stated fragment/accuracy/drift/top-3 criteria, including mechanism-based explanation of `h-d-ai-art` (docs/council/2026-11-02-eval-tradeoff.md:30–38). The existing PR diff is confined to chunking/index build, data tests, generated report, and evidence; it changes no router, cases, exemplars, or thresholds. AGENTS.md §4 caps scope at three files absent an approved exception; §11 lists repository quality gates. The current-main policy/evidence record identifies no fresh holdout yet and says both CPU variants still need approved fresh-set scores (EVIDENCE_LOG.md:606–607). The policy manifest keeps #135 separate from #199/#201.

**Assessment:** The proposed normal merge (not rebase/force-push), narrow conflict policy, BATCH=1/determinism preservation, explicit generated-file exception, and stop/escalation rule are sound. The “no merge/release readiness until fresh-holdout policy is satisfied” clause correctly prevents the historical 48-case holdout from being misrepresented as independent validation. No privacy or cloud-inference issue is apparent in this scope.

**Conditions before execution/approval:**
1. Make the fresh-holdout dependency operationally explicit: name the approved, independent holdout protocol applicable to #135; require its provenance/attestation, frozen exact candidate, both documented CPU variants, and no tuning after scoring. Do not import #199’s code or data into #135. If no approved independent set applies, stop and obtain a Chair decision before any merge claim.
2. State the exact variant identifiers and applicable commands/results in the plan: repeatable report generation, `npm run eval:ben`/all evaluator gates for each variant, plus applicable AGENTS.md §11 checks. Retain the one-case review option only as written case review, not threshold relaxation.
3. Resolve wording that says “rebase the plan/evaluation target” while forbidding git rebase: on main advancement, retarget and remeasure in a new review; do not rewrite branch history absent new authorization.

**Inferred:** These conditions address specification ambiguity, not evidence of an unsafe implementation. **Unverified:** No merged-current-main candidate or fresh holdout result exists yet; this review ran no builds, tests, or evals. Existing green checks are not current-base acceptance evidence.

## Review status

Round count: 1 of 2. This revision incorporates the Skeptic’s three conditions: the revalidation-only boundary, explicit holdout prerequisite/protocol, exact variants and gates, and no-history-rewrite retarget rule. Confirmation is still pending. Advisor reply: **not available / not consulted**. Chair decision: **pending**. The PR carrying this manifest must remain draft and plan-only. Do not update the #135 implementation branch or merge it until the formal Advisor and Chair approvals are recorded.


## Seat table and lead status

| Seat | Reviewer/model | Status |
|---|---|---|
| Chair | Liz, repository owner | Pending |
| Skeptic C | Independent internal Agent subtask; exact model identifier is not exposed, **UNVERIFIED** | Round 1: `APPROVE WITH CONDITIONS`; confirmation of this revision pending |
| Advisor | Required formal Advisor (Opus) | Not consulted; unavailable through the configured session tools |

**Council lead status:** Manus lead; exact model identifier is not exposed, **UNVERIFIED**. The lead has no vote or veto. Conditional planning support only; no consensus approval for implementation or merge. No dissent was reported by the single required T2 seat. The plan remains draft until the reviewer confirms its conditions, the formal Advisor concurs, and the Chair decides.
