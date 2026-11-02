SEAT A (ARCHITECT), council 3. Q1-Q3 (Q4-Q6 brief notes only). Read-only; nothing but this file written.

VERDICT: APPROVE WITH CONDITIONS

Q1 Keaton bug and C1'
- Real on origin/main (c4b17dd) BY CONSTRUCTION, verified in code: router.ts on main has no self guard between the pins and `if (topScore >= THRESHOLDS.lesson)` (line 296); the only self action is behind isAboutTutor (line 247, comment 267-273 says "falls through"). m3 test semantic.test.ts:222-228 (vec axis-4 + 1.0, best in [0.45,0.62)) is red on main per drift-measure-2 sec.1. Existing test at :103-112 asserts only `not 'self'`, so it hides the bug (lesson passes it).
- UNVERIFIED (low confidence): that real MiniLM vectors for "Who is Michael Keaton" vote self AND land best 0.45-0.62. Tests use synthetic vectors; no eval case contains it. Cheap check: one probe line in a scratch worktree, not a gate.
- Same code? YES. The Keaton fix IS C1' (the `if (vote.intent === 'self')` block after the pins, c1p-c2.diff lines 18-25). Not a second change. C2 (`techMajority`, diff line 33) is a different rule (tech plurality -> majority); it is not needed for Keaton, only for gate slack at BATCH=1 (either rule alone = 2/69, zero slack). So: C1' ships once, with C2 and BATCH=1, as ONE PR. Do not split C1' out ahead: alone it has zero slack at BATCH=1 and BATCH=1 alone fails the gate, so a split ships a red deploy gate.

Q2 Pin tests
- Put the 3 self-vote pin tests (m3 semantic.test.ts:211-220) in the DRIFT PR, not #134. Reason: they are red only against C1' code that does not exist until the drift PR; in #134 they pass trivially and prove nothing (the synthetic vectors vote 'course' on main per brief). They guard the drift PR's own hazard. #134 stays untouched = zero churn for an in-review PR. No tiny PR first (no code to be red against).
- One cheap exception worth a note: after #134 widens the pin, re-run the 3 tests on the rebased head; if #134's regex changes any phrasing the tests use, fix in the drift PR, never back-edit #134.

Q3 Order, files, re-measure
1. #134 (Liz click). Merge as is. Files: router.ts, semantic.test.ts, cases.json. cases.json grows, so denominators move (69 off-course changes) and every 1/69, 42/48 number is stale after merge.
2. DRIFT PR (C1'+C2 + 66a3ef0 BATCH=1), branch rebased on main after #134. Files: router.ts, semantic.test.ts, scripts/ben/build-index.mjs (+ its test, already in 66a3ef0), generated REPORT.md, EVIDENCE_LOG.md, one sentence in docs/ben-history.md section 7. That exceeds the 3-file cap (AGENTS.md section 4): Chair records a written exception. Ship m3 harness leftovers out (DIAG, router_main.ts, probe.eval.ts, BATCH env default, 900 s timeouts): drift-review-c2 R8.
   Re-measure here: `npm run ben:index && npm run eval:ben` on the REBASED head, 7/7, 0 skipped, drift <=3% of the NEW denominator. Who: the drift-PR author, pasted into the PR; Liz or a Linux run confirms (Windows-only so far, parity UNVERIFIED). Also unit tests, lint, content:*, build, record NOT RUN items.
3. #135 (chunker windows). Rebase on the merged drift PR, rebuild index at BATCH=1, rerun eval:ben, compare to the EVIDENCE_LOG baseline (1/69 trap-queue-bank, C2 margins 0.019/0.034/0.004@B32). Who: #135 author. Its -2.1 pts was BATCH=32 and is not valid for BATCH=1 (UNVERIFIED survives gate). Hold if drift slack hits 0 or any margin <0.
- Defer #135? YES, safely w.r.t. the drift fix: the Keaton/C1' fix and BATCH=1 touch router/index-build, not the chunker; #135 only fixes the fragments (30 broken chunks served on main). Cost of deferring is that bad chunks keep being served, which is a quality issue, not a gate or correctness break. Do NOT merge #135 before the drift PR: it perturbs the index that C1'/C2 margins were tuned on.
- Order of the drift PR vs #135 is decided by gate evidence, but default is drift first because it is smaller and already measured.

Brief notes Q4-Q6
- Q4 ticket: add `npm run eval:ben` to a PR-triggered workflow (path-filtered to src/ai/local/**, evals/ben/**, scripts/ben/**), same as deploy.yml step. Ticket, not scope.
- Q6 Chair-only: (a) 4th/5th file exception; (b) accept Windows-only evidence vs demand Linux; (c) ship "passes the gate" with contaminated holdout (ADR sec.7 triggered); (d) approve refusals for slim-majority tech (C2) as a UX tradeoff; (e) holdout author (Liz vs fresh agent).

CONDITIONS (testable)
1. Drift PR base = main containing #134; `git merge-base --is-ancestor <#134 sha> HEAD` true; the 3 pin tests exist only in the drift PR diff, `git diff origin/main -- src/ai/local/semantic/semantic.test.ts` shows them and #134's diff does not.
2. The Keaton test (semantic.test.ts:222-228) is red on origin/main and green on the head; verified by running it on both.
3. `grep "const BATCH = 1;" scripts/ben/build-index.mjs` matches; no DIAG/router_main/probe.eval/vitest.eval.config in diff.
4. eval:ben pasted on the rebased head, 7/7, 0 skipped, drift within gate; PR text says "passes the gate", never "fixed drift".
5. #135 merges only after a BATCH=1 eval vs the EVIDENCE_LOG baseline is pasted in its PR.
6. Chair writes the file-cap exception into the manifest before the drift PR is opened.
7. The tickets exist before merge: fold holdout into cases.json + fresh holdout; setting-up pin gap (R4); PR-triggered eval.
