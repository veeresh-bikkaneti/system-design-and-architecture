# Council 4, seat D (Historian)

Read-only. Refs: origin/main (= 0f51b12 lineage), branch fix/ben-index-batch-1, HEAD feat/contact-feedback.

## Findings (VERIFIED unless marked)
1. Gates were chosen once and never changed. All gates (accuracy .85, maxDrift .03, maxOffered .10, maxRefusal .08, lessonTop3 .90) introduced in ebd7f6d (2026-09-24, veeresh bikkaneti); `git log -G` on evals/ben/routing.eval.ts finds no later edit (routing.eval.ts:44-48, origin/main:45 maxDrift .03). No rationale recorded for 3% beyond ADR table (docs/adr/0001...md:155). Gate line set is ADR-documented, not derived.
2. Lesson gate 0.45 (THRESHOLDS.lesson) introduced in ebd7f6d at router.ts:41; `-G "^\s*lesson: "` finds no later change; now router.ts:42 on origin/main (line shift only). Never re-baselined.
3. Re-baseline that did happen: f5161ca (2026-10-27) regenerated REPORT.md for the 41-lesson corpus. Gates untouched, but "semantic router, all" moved 87.5% -> 86.5%, offered 2.9% -> 4.3%, holdout offered 5.0% -> 10.0%. Commit message silent on this.
4. Ship-with-zero-slack precedent: none found in router history. Closest is 0f51b12 (#137, advisory PR eval): pr-ben-eval.yml:3-4 "ADVISORY FIRST (continue-on-error)... BATCH=32 noise (ticket #136 part 2)", continue-on-error at :40. The blocking deploy gate remains deploy.yml:38 (`npm run eval:ben`). Advisory-izing is a precedent for softening a gate's effect, not for loosening thresholds.
5. ADR section 7 (docs/adr/0001-ben-semantic-routing.md:145-147): holdout "written after the router was tuned and before it was ever scored. Scored, never tuned against. When it starts driving changes, fold it into cases.json and write a new holdout." Holdout is already burned by the ADR's own text: :181 squared-weight fix "confirmed against the never-tuned-against holdout"; :184-188 a second attempt was tuned against holdout (89.6% -> 85.4%) and reverted. No new holdout exists: holdout.json and cases.json were last changed in ebd7f6d only (git log). §7 requires folding and a new holdout before a router change is judged, which has not happened.
6. Counts: cases.json 144 diagnosis, holdout.json 48. Off-course (redirect|self): diagnosis 49, holdout 20 (18 redirect + 2 self; by intent debate 6, off_topic 12, self 2). Total off-course 69, matches drift-measure. drift-measure-3.md:2 "151 diagnosis, 199 cases" is WRONG (192); drift-measure-3.md:29 "10 off-course holdout cases" is WRONG (20; its own percentages 10%/5% only work with 20).
7. BATCH=32 introduced in ebd7f6d (scripts/ben/build-index.mjs:20). Batch mismatch was never discussed in docs, ADR, EVIDENCE_LOG, or commit messages before 66a3ef0 (2026-11-01, Veer, branch fix/ben-index-batch-1 only, NOT on origin/main). Its own message: "NOT READY: eval drift gate fails at BATCH=1 (4.3% > 3.0%)". ADR acceptance numbers (ADR:164-167) were produced at BATCH=32.
8. Commit ebd7f6d says "drift 26.1% -> 2.9%"; REPORT at that commit shows overall drift 1.4% and offered 2.9%. The message mislabels the offered rate as drift.
9. REPORT.md on main is stale: commits touching src/ai/local since f5161ca (#127, #128, #129, #130, #131) never regenerated it. ADR:150 promises REPORT is committed so routing changes show their metric change in the diff.

## Vote (seat D): B, APPROVE WITH CONDITIONS
Conditions (testable):
1. Fold holdout.json into cases.json and write a new holdout per ADR:145-147 before any router change is judged on holdout. (Current holdout off-course = 20; minimum size is UNVERIFIED, my suggestion is at least 20 new off-course cases.)
2. Regenerate evals/ben/REPORT.md on the candidate branch; the diff must show BATCH=1 metric change.
3. Do not change maxDrift (.03) or lesson (.45) to pass; any zero-slack ship (V2 2/69) needs Chair's explicit written acceptance, since no zero-slack precedent exists.
4. Correct drift-measure-3.md counts (192 cases, 20 holdout off-course) before it is cited in the decision.
5. Keep BATCH=1 on fix/ben-index-batch-1 unmerged until (1)-(2) pass.
6. Recorded as UNVERIFIED: cross-machine determinism of BATCH=1 embeddings (drift-measure-3.md:33).

## Summary (6 lines)
1. Gates (3%, 0.45, others) were set in ebd7f6d and never edited or re-baselined; only the REPORT was regenerated (f5161ca), numbers moved, gates did not.
2. No precedent for zero-slack shipping found; closest is the advisory PR eval (0f51b12, pr-ben-eval.yml:40).
3. ADR section 7: holdout already burned (ADR:181, :184-188); a new holdout must be written before a router change is judged.
4. Holdout = 48 cases, 20 off-course (not 10 as drift-measure says); total 192 cases, 69 off-course (drift-measure's 199/151 is wrong).
5. BATCH=32 since ebd7f6d (build-index.mjs:20); mismatch first discussed in 66a3ef0 (unmerged, "NOT READY").
6. Vote: B, APPROVE WITH CONDITIONS (new holdout first, regenerate REPORT, no gate change, Chair sign-off for any zero-slack ship).
