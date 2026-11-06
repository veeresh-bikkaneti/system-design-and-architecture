# CONSENSUS MANIFEST — Ben local-first setup-policy reconciliation

**Status: CHAIR-APPROVED for the scoped implementation (2026-11-05 03:53:05 -06:00), subject to the required report-first remote record and formal Advisor re-review.** Verified base: `origin/main` `a11c799`; PR #199 head `24fd0458`. This is routing/evaluation work for Ben’s existing browser-local inference only. No cloud AI agent, paid model API, cloud hosting, Oracle VM, provider migration, or merge is authorized.

This document supersedes the first local planning draft; this is the Chair-approved scoped proposal. The earlier local draft is not a separate repository artifact.

## Task and decision

Reconcile Ben's setup-routing behavior with the owner's no-answer default as an approved narrow policy amendment to D2 on PR #199. The owner-approved policy is:

- Clear Ben/tutor setup referent → `tutor-loop`.
- Clear indication of the learner's own AI/development environment → clarify; Ben cannot inspect or configure the learner's machine. Specific own-environment signals take precedence over generic “AI env” wording.
- Bare or ambiguous setup request → clarify.
- The reported screenshot wording, **“I want to setup my ai env can you help”**, → clarify.

This newer direction supersedes the earlier #134/#140 decision to pin ambiguous “set up my AI env” wording to `tutor-loop`. Preserve the distinction between an explicit tutor setup question and an independent AI-development environment. For a mixed request that names both the tutor and a distinct Python/venv/CUDA/API-key environment, this proposal conservatively clarifies. This tie-break remains **UNVERIFIED, low confidence** and must be covered adversarially by tests; it is not an owner-confirmed rule. A device mention alone (for example, “on my laptop”) does not by itself establish that the user means an independent development environment.

## Current evidence and constraints

- **Verified base:** fetched `origin/main` is `a11c799`; PR #199 is still at `24fd0458`, based directly on that main. The earlier implementation worktree is not the target; its prior test/eval/build results are historical, not acceptance evidence.
- **Verified current inference ladder:** `src/ai/local/inference.ts` tries the page-callable browser `LanguageModel` Prompt API, then WebLLM on WebGPU, with an existing no-WebGPU path. No cloud model provider or Oracle VM is needed or in scope.
- **Verified prior route policy:** merged #140 pins several “set up Ben / my AI env” phrases. The owner's later no-answer default changes the ambiguous own-environment cases; it does not repeal clear tutor-referent routing.
- **Verified case/test conflict:** `evals/ben/cases.json` already has `env-setup-report` for the exact screenshot phrase, labeled `lesson`/`tutor-loop`; `env-setup-2` and `env-setup-3` also label ambiguous AI-environment wording as lesson. `env-own-python`, `env-own-conda`, and `env-own-openai` currently permit or expect `parametric_fallback`. Existing semantic tests encode the old policy. These labels/tests must be corrected to reflect the owner's stated product decision, with the reason recorded. This is not a new case and must not be done to improve a score.
- **Verified no-hit turn gap:** current `turn.ts` returns redirect for `!lead` before its clarify branch. A no-hit setup clarification therefore needs an explicit turn-builder correction and a test. Blocked-topic redirects must remain redirects.
- **PR #199:** open draft `feat/ben-blind-holdout-2` at `24fd0458`, based on `a11c799`. Its exact-head advisory Ben eval and frontend-gates checks fail. The combined 304-case report states accuracy 79.9% against a gate of 85% and drift 5.8% against 3.0%; the current 103-case blind set is 66.0%. D2 remains a draft; these are not passing-baseline numbers.
- **PR #135:** open, non-draft chunker change at `9fdc8784`, based on older `f739912`; it reports a 2.0-point accuracy trade and drift 2.9% versus 1.4% on its stated base. No PR reviews were recorded in the live API check. Do not copy or duplicate its chunker/index edits. Current-base remeasurement and the trade-off decision remain separate.
- **PR #201:** open draft phase 1 for pinned vectors, head `096f02c8`; it contains a manifest and intentionally failing tests. No PR reviews were recorded in the live API check, and its frontend-gates check fails. It is not implementation authorization for this task.
- **Browser-AI research:** a Firefox/Edge capability note exists only in the stale local feature worktree; it is not in `main`. It distinguishes Firefox consumer-facing/on-device features from a page-callable model API and Edge's experimental Prompt API. Recheck official-source status before a separate documentation-only publication. No browser-AI engine change is proposed here.

## Risk tier

**T2 — material product-intent and behavior change** across route precedence, user-visible clarification, test contracts, and evaluation labels. No T1 auth/session/token path is touched. The answer must not claim Ben can inspect the learner's machine or introduce any remote inference dependency.

## Scenarios and acceptance conditions for future implementation

1. Update the existing diagnosis rows `env-setup-report`, `env-setup-2`, and `env-setup-3` to expect `clarify`; update the existing clear own-environment cases to expect `clarify` rather than allowing `parametric_fallback`. Keep the Netflix/product-setup noun control on its existing general-tech route. Record that these label changes reflect the owner's policy decision, not a gate-clearing relabel. Do not add a duplicate screenshot case or put this case in the blind set.
2. After the hard blocked-topic filter, own-environment or bare-ambiguity clarification must take precedence over the generic AI-setup/tutor pin, named-tag setup pin, off-topic-vote shortcut, and strong-lesson override. A clear tutor-referent setup question still routes to `tutor-loop` only when it does not also contain a distinct own-environment signal. The exact screenshot phrase and representative own-environment phrases clarify even with a competing high-scoring lesson.
3. Mixed explicit-tutor plus distinct own-environment signals clarify under the conservative, UNVERIFIED tie-break. A laptop/device mention alone does not override a clear tutor referent.
4. Clarify remains a clarify turn with no retrieved lesson hits. It gives a source-free, truthful disambiguation asking whether the learner means their own AI environment or how Ben runs locally in the browser; it does not claim access to the learner's machine. The hard blocked-topic rule remains ahead of setup clarification.
5. Controls remain unchanged: named Postgres/Redis setup stays on the general-tech path; “set up an AI pipeline” remains lesson retrieval; unrelated blocked-topic requests still redirect.
6. Failing-first tests cover the exact phrase, existing paraphrases, clear own-environment signals, bare ambiguity, mixed signals, a noisy/off-topic vote, a competing lesson, and no-hit turn construction. Update contradictory existing tests and diagnosis labels. Preserve data hygiene and holdout separation.
7. Keep every D2 threshold unchanged. Before introducing a fresh blind set, the diagnosis/pooled evaluation must pass the existing gates, including the fixed `screenshot-catholic` control; two runs of this pooled-only evaluation must produce identical `REPORT.md`.
8. Amend `routing.eval.ts`/`data.test.ts` so fresh-set results are calculated and reported separately. For each CPU variant, the fresh set must pass accuracy >=85%, drift <=3.0%, offered <=10%, refusal <=8%, lessonTop3 >=90%, and beat the keyword baseline. Report per-set top-3 and baseline comparisons. The hard-coded `screenshot-catholic` assertion remains a fixed diagnosis/control case and is not a blind-set gate. No gate/threshold is relaxed; the evaluator explicitly separates which existing criteria apply to each set. The exposed 103-case blind result is not fresh validation.
9. Until pinned-vector work is accepted, evaluate both documented CPU variants (`f9feac54...` and `1837cd2f...`). The Linux/CI advisory result on the exact head is release evidence; local numbers are diagnostic only. Preserve the D2 requirement for no exemplar near-copies and the approved fresh-agent/attestation process.
10. Verify diagnosis/pooled report determinism before the fresh holdout is introduced. Then freeze the exact candidate and score one new holdout once per required CPU variant (one recorded result per variant). Re-running an identical frozen commit for CI/audit is not a new tuning loop; no code, label, threshold, or exemplar may change in response to either fresh-set result. A failing fresh set returns the task to the council and requires a newly approved holdout plan.
11. Run the repository-required checks for `src/ai/local/` changes: read ADR 0001 first; focused semantic/data tests; `npm test`; `npm run lint`; `npm run build` with the Pages base path; `npm run content:check`; `npm run content:validate`; and `npm run eval:ben`. Record exact outcomes, update ADR 0001 section 7, and append `EVIDENCE_LOG.md`. No merge is authorized by this task.

## Scope and file-limit request

The behavioral increment is split sequentially, not in parallel:

- **D2-0 policy-label correction:** `evals/ben/cases.json` only. Correct existing diagnosis labels before the route change; preserve the untouched fresh blind set.
- **D2-0 split-eval/hygiene contract:** `evals/ben/routing.eval.ts` and `evals/ben/data.test.ts`; report diagnosis and holdout metrics separately, including per-set top-3 and baseline comparison, and keep the screenshot control in diagnosis only.
- **D2-0 fresh holdout artifact:** `evals/ben/holdout.json`, written after fixes by the approved fresh agent; no eval-bank or router access during authoring.
- **D2a route/answer/tests:** `src/ai/local/semantic/router.ts`, `src/ai/local/semantic/turn.ts`, `src/ai/local/semantic/semantic.test.ts` only.
- D2's already-planned broader generalization work stays in its own approved phases. No `exemplars.json`, threshold, index, chunker, workflow, or inference changes are part of this policy amendment.

**Three-file-cap exception requested and fully enumerated:** D2a remains limited to three behavioral files. D2-0 requires the four-file mechanical/data-gate split already proposed in #199 (`cases.json`, `holdout.json`, `routing.eval.ts`, `data.test.ts`); this amendment adds the per-set metric checks needed for the stated blind acceptance contract. The complete scoped change may therefore touch 11 tracked paths: those four D2-0 files; the three D2a files; generated `evals/ben/REPORT.md`; `docs/adr/0001-ben-semantic-routing.md`; this manifest; and `EVIDENCE_LOG.md`. The exception is limited to these separately responsible data, measurement, route, answer, test, generated-report, ADR, manifest, and evidence artifacts. Any additional path or broader change requires a new manifest and approval.

**Approved branch:** continue sequentially on `feat/ben-blind-holdout-2` at PR #199 head `24fd0458`, because the D2 manifest binds D2-0/D2a/D2b to one ordered branch and shared eval/index. Re-fetch/recheck before each push. The Chair has approved this scoped implementation, not a merge or promotion of the draft PR. If the branch/manifest changes or the sequence is no longer viable, stop and amend this manifest rather than silently creating a parallel competing PR.

## Sequence and non-goals

- D1 ordered D3 fresh holdout, then remeasure #135; D2 router work is built only if D3 or a content edit shows a gate failure. D3 has now run on #199 and failed, so the D2 trigger is met. Complete/approve the read-only miss diagnosis and the exact D2 manifest amendment before router edits. Remeasure #135 on the agreed current base as its separate follow-up; no #135 merge until its trade-off and current exact-head gates are resolved.
- Follow #199's sequential D2-0/D2a/D2b plan. Keep consumed diagnosis data separate from reserved scored data. After router/content changes and a frozen candidate, write a **new** blind set using a fresh agent in a throwaway directory containing only a copy of `content/lessons/`; record the directory-listing hash/attestation. Record one score per required CPU variant and do not tune after either score. The old 103-case blind set is not a tuning set.
- Keep #135 (sentence-boundary chunking/trade-off) and #201 (pinned vector artifact) as independent governed tracks; do not edit their files in this increment. Until #201 is accepted, honor D2's two-CPU-variant check.
- Do not add general “how do I code” exemplars (D2-G1); that item remains conditional on its separate owner product decision, which this approval does not answer.
- Current-main Prompt API/WebLLM inference remains browser-local. Publishing the Firefox/Edge note is a separate docs-only follow-up after source revalidation; it is not a prerequisite for this router change.
- No paid cloud inference, Oracle VM, model-provider migration, threshold change, blind-set fishing, or main merge.

## Risks and open items

- The D2 branch currently fails multiple gates. The setup-policy correction is not presumed to solve general blind-set misses.
- The mixed-signal priority is an assumption. Existing tests currently pin tutor setup when a laptop is mentioned; this proposal distinguishes a plain device mention from explicit independent environment markers and requires Skeptic acceptance.
- #135 is based on an older base and reports a measurable trade-off; it is not current-main green.
- #201's pin design and review are still pending; until accepted, cross-CPU D2 results remain required.
- The Firefox/Edge note is dated 2026-11-01 and not in current main; revalidate sources before publication. No real Edge/Firefox run is evidenced. Current inference-ladder support is verified from code, not every browser/device.

## RED tests required before future source changes

Current-main tests encode the old pin for the screenshot phrase and paraphrases; diagnosis labels expect lesson or general-tech fallback for these cases; `turn.ts` redirects before clarification when no lesson hit exists; and the D2 evaluator does not yet isolate all acceptance metrics by set. New/updated tests must fail for those intended reasons before code changes. Controls must show explicit tutor wording still pins (unless a distinct independent-environment signal is also present), Postgres/Redis and AI-pipeline controls retain their route, blocked topics remain redirects, and the screenshot control is never treated as a blind-set case. All focused tests must pass before full gates run.

## Token budget

Maximum **15,000 tokens** for this planning/review task and the future bounded implementation unless the Chair records a different limit under repository governance. No budget exception is requested.

## Approvals and Chair decision


- Owner/Chair approved this exact manifest for scoped implementation at **2026-11-05 03:53:05 -06:00**; the owner then explicitly reconfirmed **no cloud AI agent or VM setup** at 03:53:51.
- Skeptic (C), rounds 1 and 2: **SUPPORT WITH CHANGES**; all requested acceptance/scope corrections are incorporated. Both reports are preserved below.
- Advisor: formal re-review after the report-first commit `f65be07` was published to PR #199: **APPROVE**, no material blockers. The review outcome must be recorded on the remote before source edits begin.
- Chair decision: **APPROVED for the named scoped implementation only**; no merge, threshold change, cloud inference, or VM setup is authorized.

## Skeptic (C), round 1 report — verbatim
> ## Verdict: SUPPORT WITH CHANGES
>
> The owner’s policy is stated clearly, the draft correctly limits this to planning/review, and it keeps cloud inference/VM work out of scope. But the acceptance contract, current eval case, no-hit turn behavior, sequencing, and file-limit exception need reconciliation before approval or implementation.
>
> 1. **HIGH — The reported phrase is already in diagnosis data with the opposite expected action.** The draft says to add the exact phrase to `cases.json` (manifest v2:36), but current `evals/ben/cases.json:142` already contains `env-setup-report` with action `lesson` and lesson `tutor-loop`. The current semantic tests also expect the phrase to pin to tutor-loop (`src/ai/local/semantic/semantic.test.ts:216-243`). Since `routing.eval.ts:58-61` scores the case against its labeled action, routing it to `clarify` will remain an eval miss unless the diagnosis label is updated. **Correction:** say it is already present; change its expected action to `clarify` with a rationale that this is the owner’s policy correction, not label tuning to clear a gate. Keep it in diagnosis, not the fresh blind set. The separate seventh D2 gate for the Catholic-schools screenshot (`routing.eval.ts:195-196`; expected redirect) is a different question and can remain unchanged.
>
> 2. **HIGH — Current route precedence does not implement the stated clarification guarantees, and the no-hit turn case cannot currently work.** `router.ts:148-160, 183-195` pins some AI-environment wording to `tutor-loop`; `namedTagLessons()` can pin tutor setup before normal retrieval (`:344-358`), while own-environment inputs otherwise fall through to vote/retrieval outcomes rather than reliably clarifying. The draft requires clarification despite off-topic votes and strong competing lessons (v2:32), so define the policy decision’s precedence relative to those paths, while retaining the blocked-topic guard (`router.ts:303-305`) as the draft’s control requires. Separately, `turn.ts:95-116` redirects when `!lead` before it reaches its `clarify` handler; therefore a no-retrieved-lesson clarification cannot pass as written. **Correction:** specify tests proving the clarification decision wins over pins, off-topic votes, competing lessons, and absent hits (except blocked topics), and that `buildTurn` emits the requested source-free disambiguation when there is no lesson. Update existing own-environment tests that presently expect `parametric_fallback` or redirect (`semantic.test.ts:245-264, 326-332`).
>
> 3. **HIGH — D1/D2 sequencing and blind-set provenance are not fully aligned.** The approved D1 status says D3’s fresh holdout comes next, then #135 is remeasured, and D2 is built only if D3 or a content edit shows a gate failing (`docs/manifests/ben-index-determinism.md:89-92`). The new draft instead starts with #199 D2 review/sequencing (v2:57-58) without explicitly retaining that trigger/order. #199’s intentional phase-1 red tests and its reported 79.9%/5.8% numbers are not themselves proof of a current-main/D3 failure. **Correction:** state the D3 prerequisite/trigger and refer explicitly to #199’s blind-author restrictions and attestation process (`ben-router-generalization.md:52-56, 70-75`); identify the one fresh blind set to be scored on the exact candidate and prohibit tuning after it is scored. Do not treat the old 103-case blind score as fresh acceptance evidence.
>
> 4. **HIGH — The file-limit exception does not account for the planned diff.** The draft requests an exception for four implementation files (v2:42-51), but v2:40 also requires an ADR section 7 note and `EVIDENCE_LOG.md` entry; the eval writes a tracked `evals/ben/REPORT.md` (`routing.eval.ts:165-167`). AGENTS.md:80,88 caps scoped files at three and requires an approved exception for any excess; it has no stated exclusion for generated or required-record files. **Correction:** list every expected changed file, including records and generated report if they will differ, and justify/request the necessary exception (or narrow the actual diff under an authorized convention). Do not imply the present four-file request covers six or seven possible paths.
>
> 5. **MEDIUM — Branch target and #199 integration remain undecided.** The draft correctly forbids branch operations now and says not to alter #199 without implementation approval (v2:53), but the work is described as an amendment to #199 while leaving “amend #199 or fresh branch” for later. The proposed router/test/case paths overlap #199’s D2a/D2-L work (`ben-router-generalization.md:62-68`); they cannot be integrated as an isolated parallel edit without an explicit order and exact-head evaluation plan. **Correction:** before implementation, record the Chair-approved target and whether this is a sequential #199 increment or an independently reviewed branch from verified main, including how it will combine with D2a/D2-L. Keep #135’s chunker and #201’s vector-artifact work separate as the draft proposes; neither is in the proposed file list.
>
> **Route precedence and controls:** the draft’s blocked-topic, Postgres/Redis, AI-pipeline, and explicit-tutor controls are directionally appropriate. Mixed tutor-plus-own-environment clarification remains explicitly **UNVERIFIED, low confidence** (v2:14, 66); keep it an assumption, adversarially test it, and do not present it as an owner-confirmed rule. No cloud inference or Oracle VM is needed based on the inspected current-main local router/turn code.
>
> **Unverified:** I did not run tests/evals (review-only), independently query GitHub for #135/#199/#201 status, or verify a fresh blind-set artifact/attestation. The checkout is verified at `a11c799`; current-main code and tests substantiate the routing/turn findings above. PR metrics/status are taken from the supplied evidence and reviewed draft, not rerun.
>
> **Advisor review:** Not approval-ready as written. It is safe to send as a critique draft only if this Skeptic report accompanies it; revise the blocking inconsistencies before seeking Advisor concurrence or implementation approval.

## Delegated task record

```text
{task_id: ben-policy-skeptic-r1, status: completed, owner: Skeptic (C), evidence: SUPPORT WITH CHANGES; report preserved verbatim above; blocker: addressed in later draft}
{task_id: ben-policy-skeptic-r2, status: completed, owner: Skeptic (C), evidence: SUPPORT WITH CHANGES; blind-set/gate split and explicit clarification precedence updated; report preserved verbatim above; blocker: none for Advisor review}
{task_id: ben-policy-advisor, status: pending, owner: Advisor, evidence: formal review after the full Skeptic reports are pushed to the remote; blocker: report-first process}
```


## Skeptic (C), round 2 report — verbatim

> ## Verdict: SUPPORT WITH CHANGES
>
> The revised draft resolves the round-one high findings in substance, but its new acceptance wording contains a material blind-set contradiction that should be corrected before the manifest is treated as approval-ready.
>
> ### Round-one findings verified
>
> - **Case labels:** Fixed. The draft identifies `env-setup-report`, `env-setup-2`, and `env-setup-3` as existing diagnosis cases to relabel to `clarify`, and calls for the clear own-environment cases to expect `clarify` rather than permitting `parametric_fallback` (manifest lines 23, 36). Current `cases.json` confirms the exact screenshot wording is already `lesson`/`tutor-loop` (line 142); own-env IDs are lines 147–149. It explicitly distinguishes policy correction from score-driven relabeling and keeps the case out of the blind set.
> - **Precedence and no-hit turn:** Substantially fixed. Acceptance conditions require clarification despite off-topic votes or competing strong lessons, retain explicit Ben/tutor routing, and specify a source-free disambiguation when no lesson is retrieved while leaving blocked-topic redirects ahead (lines 37–41). This directly addresses the current setup pin behavior in `router.ts` and the `!lead`-before-clarify branch in `turn.ts`. Tests/update of old contracts are also required (lines 41, 77). For precision, say explicitly that own-environment/ambiguous clarification overrides setup/named-tag pins; the exact screenshot case implies that, but the precedence rule should not be left implicit.
> - **D1/D3/#135/D2 and blind provenance:** Fixed in substance (lines 60–63). The draft retains D3-before-#135 remeasurement and makes D2 conditional on a gate failure; it states the D3 failure triggers the D2 planning step. It also distinguishes the already-exposed 103-case blind result from fresh acceptance, and adopts #199’s fresh-agent, throwaway directory containing only `content/lessons/`, attestation/hash, one-time score, and no tuning after score.
> - **File-limit exception:** Fixed for this policy increment. It explicitly caps behavioral implementation at three files and enumerates eight tracked paths including cases, generated `REPORT.md`, ADR, manifest, and `EVIDENCE_LOG.md`, with a bounded rationale (lines 50–55). This covers the previously omitted records/report.
> - **#199 target:** Fixed. The proposal specifies sequential continuation on `feat/ben-blind-holdout-2` at D2 head `24fd0458`, requires re-fetch/recheck and Chair approval before edits, and says to stop and amend if the branch/manifest changes (line 56). This matches the current #199 D2 manifest’s single ordered D2-0/D2a/D2b branch plan.
>
> ### Material correction required
>
> **Blind-set gate contract is contradictory/overbroad.** Line 42 says all seven D2 gates must pass on both pooled data and a new blind set. In #199’s `routing.eval.ts`, seven tests include the five metric thresholds, a comparison against the keyword baseline, and a hard-coded assertion for the specific `screenshot-catholic` case (lines 171–197). The new manifest explicitly says not to put that screenshot case in the blind set (line 36), so the seventh test cannot apply to that set as written. Also, the blind is to be scored once (line 61), while the requirement for two identical `REPORT.md` runs is coupled to the same pooled-plus-blind wording; `routing.eval.ts` scores `cases.json` and `holdout.json` together and writes both to the report (lines 55–56, 143–167), so repeating that evaluation scores the blind twice.
>
> **Correction:** Specify exactly which gates apply to which dataset. Keep the screenshot assertion as a fixed diagnosis/control case, not a blind-set gate; list the numerical gates and any applicable baseline-comparison gate separately for the blind. Restrict repeatability runs to the pooled/diagnosis evaluation before the fresh blind is introduced, then freeze the exact candidate and score the fresh blind once with no post-score rerun or tuning (or define an alternative report-determinism check that does not rescore the blind).
>
> ### Advisor review
>
> **Yes—Advisor review may proceed now as review-only**, with this full Skeptic report included. It should not be treated as concurrence or implementation approval; resolve the blind-set gate/scoring contradiction and make pin precedence explicit before calling the manifest approval-ready. No tests or evaluations were run, consistent with the review-only constraint.


## Advisor re-review report — 2026-11-05 — verbatim

> **Verdict: APPROVE**
>
> No material blockers or corrections. The current manifest resolves both round-two Skeptic findings: it explicitly puts own-environment/bare-ambiguity clarification ahead of setup and named-tag pins, off-topic shortcuts, and strong lesson matches while retaining blocked-topic precedence (manifest lines 37–41); and it separates pooled-only determinism runs from the fresh-set gates and one-time frozen-holdout scoring (lines 42–45). The source confirms these are necessary, feasible changes: the blocked-topic check currently precedes setup routing (`src/ai/local/semantic/router.ts:303–305`), while a no-hit clarify currently redirects before reaching its clarify handler (`src/ai/local/semantic/turn.ts:95–116`).
>
> The approved sequence and boundaries are coherent: correct existing diagnosis labels as an owner-policy decision, preserve the fresh holdout during diagnosis, separate per-set metrics, then author and score a new holdout only after fixes and candidate freeze (manifest lines 36, 43–45, 52–56, 64–66). It keeps thresholds, exemplars, index, chunker, #135, and #201 unchanged; retains both CPU variants until the pinned-vector track is accepted; preserves the named acceptance checks and hard holdout freeze (lines 42–46, 56, 65–69). The explicit mixed-signal tie-break remains labeled UNVERIFIED/low confidence (lines 25 and 38), appropriately, and is slated for adversarial coverage.
>
> The report-first record is complete enough for this re-review: the current HEAD is `f65be0765b43edce484cd7ba26ad6957049ac3d6`, the checkout is clean, and that commit contains only the manifest and `EVIDENCE_LOG.md`. Both full Skeptic reports and the Chair’s scoped approval are present. It is not yet a closed formal approval record because the Advisor verdict is still marked pending in the record (manifest lines 89–92; `AGENTS.md`/council procedure, `docs/council/2026-11-02-council-procedure.md:60–68`).
>
> **Implementation may begin under the existing Chair approval once this Advisor verdict is recorded on the remote.** Until it is recorded, keep the existing source-edit pause. When recording, note the current branch head `f65be07`—the report-first-only advancement from the manifest’s earlier `24fd0458` reference—and re-fetch/recheck before implementation or any push. No new Chair approval is needed if work stays within this approved scope and sequence.
>
> The scope remains browser-local Prompt API, then WebLLM; the current inference source describes that client-side ladder (`src/ai/local/inference.ts:5–18, 108–18x`), with no cloud model or VM. Stronger reasoning, tool/function calling, and web scraping are not included or implied; any of those broader aspirations requires separate future authorization. Review only: no files, tests, or Git state were changed.


## Implementation checkpoint — 2026-11-06

- The scoped policy-label, router, turn-builder, semantic-test, split-evaluator, report, ADR, and evidence changes are prepared locally on `feat/ben-blind-holdout-2`, based on `origin/main` `a11c799` and PR #199 `0e852eb`. No inference-provider, cloud, VM, threshold, exemplar-bank, index, or chunker changes were made.
- Diagnosis-only evaluation passed for 201 cases: 89.6% semantic accuracy, 2.9% drift, 5.8% offered, 2.0% refusal, and 97.0% top-3; keyword baseline accuracy was 70.1%. Two consecutive runs produced byte-identical `evals/ben/REPORT.md`. Fresh holdout count is 0; the exposed `n-` blind set is excluded by design.
- Verification: semantic tests passed 79/79; `npm run lint` had 0 errors (12 warnings); root and Pages-base production builds passed; snapshot budget passed; `npm run content:check` and `npm run content:validate` passed; standard Playwright E2E passed 34/34 after rebuilding at the root path.
- Full serial unit suite remains blocked: 750/753 tests passed, with only the three D2b RED hygiene tests listed in `ben-router-generalization.md` failing in `evals/ben/data.test.ts`. These are outside this amendment's approved source/data scope and remain unfixed; no merge is authorized while this applicable gate is red.
- The fresh-agent artifact, one-time scoring on both CPU variants, and any claimed 83.3% fresh-holdout result remain **NOT DONE / NOT VERIFIED**. The candidate must not be represented as having passed fresh-set validation.
