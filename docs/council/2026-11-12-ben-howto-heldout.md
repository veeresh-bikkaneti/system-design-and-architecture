# Council record: Ben how-to held-out cases (Branch 2, F2 step 1)

Tier T2. Branch: `test/ben-howto-heldout`. Base: `origin/main` @ `a11c7997b63a31a96cdb4bb33a0d2de948647ab0`.
Procedure: AGENTS.md §3. Source manifest: PSTACK Arena Record + Consensus Manifest, 2026-11-12, Part II, Branch 2 (recorded in the commission workspace; this file summarises that branch's manifest entry and carries the advisor verdict for this branch verbatim, as AGENTS.md §3 step 7 requires).
Owners (manifest): Seat B (contracts) + Seat A (case expectations); Seat C owns false-steal disputes.
Round: **1 of 2**.
Model diversity: **no model diversity** — all council seats ran on one model family this session (manifest §II.1).
Implementing agent: **builder seat (model name withheld per commission instruction)**.

## Consensus Manifest summary (Branch 2)

```text
CONSENSUS MANIFEST
Task: F2 step 1, cases only — add the install/how-to held-out cases that make the
  measured boundary leak (Phase 1 interrogation §7) visible to the eval, before
  any routing fix exists. This branch is intentionally RED at HEAD: its failing
  run is its evidence. It is never merge-ready standalone; it stacks under
  branch 3 (fix/ben-howto-route).
Risk tier and rationale: T2 — eval-fixture change that defines the acceptance
  contract for a later routing change (branch 3); no production behaviour changes.
Scenarios / acceptance conditions:
  - Seed = Phase 1 §7 probe table's 7 rows, verbatim questions.
  - The 5 mis-grounded phrasings (install docker; how do I install docker;
    how to install docker on ubuntu; install kubernetes; set up kafka locally)
    expect the NEW how-to action, named `howto` (see PR body ruling line).
  - The 2 controls keep their HEAD-correct expectations and stay GREEN:
    the docker-definitional control → parametric_fallback (a variant,
    "what is a docker image" — "what is docker" itself is already scored as
    t-docker in cases.json and is not duplicated); the partition-key control
    → clarify (its HEAD-verified actual route, Phase 1 §7).
  - ≥4 additional bidirectional guards: imperative COURSE questions (design /
    pick / make / scale class) whose expectation is their HEAD-verified actual
    route, each verified by a HEAD probe run before finalising.
  - Every new tool-route fixture case carries a `source` URL or a confidence
    mark (citations gate applied to fixtures).
Failing tests or test contracts: `npm run eval:ben` at HEAD with the additions —
  the 5 how-to cases must FAIL, per-case got-vs-expected matching the §7 baseline
  (parametric_fallback / redirect / redirect / lesson / clarify); controls and
  guards must pass. evals/ben/data.test.ts extensions (anti-leak, slug hygiene,
  source/confidence presence) must pass under `npm test`.
Scoped files (maximum 3; justify any exception): evals/ben/holdout.json,
  evals/ben/data.test.ts — plus this record and the EVIDENCE_LOG.md entry the
  T2 record duty requires. NO routing, exemplar, or policy code (Seat C
  condition: the auditable sequence is the point).
Risks / unknowns: the partition-key question is already scored in cases.json as
  c-part-2 with a `lesson` expectation that HEAD does not meet (pre-existing
  miss, visible in the stale committed REPORT.md); the holdout control pins the
  HEAD-actual `clarify` route instead, per the task brief. Recorded as a finding
  for branch 3 / Seat C, not silently adjusted here.
Rejected alternatives and why: duplicating t-docker ("what is docker") into
  holdout — rejected, a scored case is not re-scored; a definitional variant is
  used instead. Naming the new action anything other than `howto` — rejected,
  no router/codebase convention (src/ai/local/semantic/router.ts:15,
  codec.ts intents) makes another name clearly native.
Token budget (maximum 15,000): per AGENTS.md §4 default for the task.
Approvals / votes / dissent: full council manifest passed ≥3 of 4 non-Chair
  seats (manifest §II.1); advisor verdict for this branch below — AGREE WITH
  NOTES, all notes NON-MATERIAL.
Chair decision (including any veto): proceed under the manifest; no veto recorded.
```

## Advisor verdict for this branch — VERBATIM

Source: advisor report, PSTACK CORRECT T2 branches, 2026-11-12, §2 (Branch 2 — `test/ben-howto-heldout` (F2 step 1, cases only) — T2). Reproduced exactly:

> **Verdict: AGREE WITH NOTES**
>
> **Faithfulness to evidence:** Verified. The boundary leak is measured, not inferred: Interrogation §7's coordinator probe shows `install kubernetes` → lesson (0.639, 0.559 un-boosted, still clearing the 0.45 bar), both docker-install phrasings → redirect (0.56 / 0.59), `set up kafka locally` → clarify, bare `install docker` → parametric_fallback (Interrogation §7 table — verified; recapitulated at Arena/Manifest §I.4 — verified). A cases-only branch seeded from exactly that probe table, with positive expectations naming the new how-to action, is the ADR-discipline sequence the manifest requires (Arena/Manifest §II.2 branch 2 — verified).
>
> **Tests / acceptance:** Verified sufficient — the branch's evidence is `npm run eval:ben` at HEAD with the new cases FAILING in a per-case got-vs-expected table matching the §7 baseline, plus `data.test.ts` extensions for anti-leak, slug hygiene, and a `source` URL or confidence mark on every new tool-route case (Arena/Manifest §II.2 branch 2 — verified). That last item is the citations gate applied to fixtures, as required (Arena/Manifest §II.1 global acceptance (3) — verified).
>
> **Notes (all NON-MATERIAL):**
> 1. [NON-MATERIAL] Merge sequencing: this branch is intentionally red at HEAD — that is its evidence. Under AGENTS.md §2, a change with a failing required gate does not merge (verified, AGENTS.md §2). The builder / coordinator must therefore hold this PR as an evidence branch and land it only stacked with, or immediately superseded by, branch 3 passing on top of it; it must never be presented to the owner as independently merge-ready. This restates existing manifest and §2 rules and changes no acceptance term.
> 2. [NON-MATERIAL] The ≥4 bidirectional guards must include the imperative course-question class by name ("how do I design a rate limiter" class) and must retain at least one already-passing control ("how do i pick a partition key", Interrogation §7 control row — verified), so a future guard regression is distinguishable from a seed error (Arena/Manifest §II.2 branch 2 — verified).
>
> **Conditions a builder must honour:** holdout.json additions ONLY — no routing, exemplar, or policy code in this branch (Seat C condition 1, branch 2 text — verified); failing table in the PR body; `EVIDENCE_LOG.md` entry; Seat C owns any false-steal dispute arising from the guard cases (branch 2 owner line — verified).

## Outcome

Round 1 of 2. Advisor: AGREE WITH NOTES (2 notes, all NON-MATERIAL). CORRECT may proceed on this branch (AGENTS.md §3 step 4). This PR is an evidence branch: intentionally RED at HEAD, never merge-ready standalone; it stacks under branch 3 (`fix/ben-howto-route`), whose PR will reference it.
