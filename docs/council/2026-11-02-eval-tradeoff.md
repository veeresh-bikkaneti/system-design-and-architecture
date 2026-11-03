# Council record: Ben eval trade-off for PR #177 and PR #135 (issue #180)

Decided by council and advisor under the owner's standing instruction of 2026-11-02 (technical questions go to the council and the advisor; the owner is asked only domain questions). Tier T2. Panel: one seat (Skeptic, sonnet) plus the advisor, as the T2 rule requires. Council lead: Sonnet 5.5. Owner Chair: the per-PR merge word and the formal Chair roles are unchanged.

## Question
Should the owner-parked Ben changes be merged: #177 (three lesson edits, semantic score 88.1 to 87.6) and #135 (sentence-boundary chunking, score 88.1 to 86.1, drift 2.9% against a 3% gate)? What comes first?

## Round 1

### Seat C (Skeptic), report, verbatim

VOTE: A now, then B, with #135 merged only after B and only if it passes the criteria below. In short: merge #177 now. Build a fixed index plus a new blind holdout next. Re-measure #135 on that base and merge it only if it passes.

Verified from the repo and GitHub:
- The eval thresholds are as described (routing.eval.ts GATES): accuracy 0.85, maxDrift 0.03, maxOffered 0.10, maxRefusal 0.08, lessonTop3 0.90.
- eval:ben is not a required check. The ruleset's required checks are only "PR Frontend gates" and "PR Worker gates". pr-ben-eval.yml is continue-on-error, advisory, and says so. The only blocking run is deploy.yml, after the merge to main. A flipped gate case therefore shows up as a red deploy, not a blocked PR.
- Per #180 and drift-measure-3, repeat runs on one machine are byte-identical. The noise is sensitivity to content edits, not run-to-run noise. Cross-machine and Linux behaviour of BATCH=1 is UNVERIFIED. The 1.0pt gap in QA R-28 is probably the same batch effect. That is INFERRED, not proven.
- Both PRs show green on every required check and on the advisory eval. #177 would pass the gates with slack. #135 passes the gates with 0.1pt of drift headroom.

What the earlier council said: the council-4 skeptic approved BATCH=1 plus C2 only with conditions. A unit test must show "help me set up the tutor" reaches the tutor-loop lesson even when the vote is off_topic. A unit test for techMajority must be added. maxDrift must not be changed. The consumed holdout must be recorded in ADR section 7, and a new blind holdout ticketed. "Who was Alan Turing" becomes redirect, accepted as a regression in the PR body. Its worry was that a zero-slack gate becomes a "flake generator". #180 shows the flake already exists on main (586 of 775 unchanged chunks get different vectors). New facts strengthen the case for BATCH=1 but do not remove those conditions.

Options:
- A: #177 only. Content fixes live. The -0.5pt is three threshold-edge flips, not a content defect. Gate-flap risk low: 87.6 against an 85 floor. Trivial, revertable.
- B first: delays the content fixes and the fragment fix. Removes the flapping. Largest cost: a router change plus about 100 new holdout cases.
- C: both now. Fixes fragments (189 of 779 sections today), but newly misses 7 cases and one off-course question gets a lesson. Gate-flap risk high: one more drift case is 4.3%, which fails the gate and turns the deploy red.
- D: rework #135 now. The tuning would run against a noisy, partly burned holdout; overfitting risk.

I judge fragment answers worse for students than a 0.5 to 2.0 point routing score. That is an inference. No user-impact data exists, and the eval scores routing, not answer text (QA R-28). The 2-point drop on #135 is still unreliable, because the index shifts by itself under BATCH=32.

Steps and acceptance criteria:
1. Merge #177. Criteria: required checks green, post-merge deploy eval:ben green. Record 87.6 as a batch artifact.
2. Build the fix, with TDD and a T2 manifest. Set BATCH=1. Add a test that the same chunk gives the same vector alone and in a batch, skipping when the model is absent. Add the council-4 conditions: tutor-setup routing before the offCourse redirect, techMajority tests, no maxDrift change. Fold the current holdout into cases.json. Add a new blind holdout of about 100 cases. Measure: two runs byte-identical; adding a chunk leaves other vectors bit-identical; all 7 gates run with none skipped; the Linux CI run matches the local one.
3. Re-run #135 on that base. Merge it if: fragments are 0; drift is at most 2.9% with one case of slack, or a case review is recorded; accuracy is 85% or higher; top-3 is 90% or higher; the off-course regression (h-d-ai-art) is explained by mechanism, not by editing eval cases.
4. Make eval:ben a required check only after about 10 clean runs. Use an always-reporting job, per the warning in pr-ben-eval.yml.

What could go wrong: BATCH=1 plus C2 sits at the drift limit again (2 of 69 off-course cases against a 3% limit); mitigation is step 3's slack criterion. #177 and step 2 both touch REPORT.md, so expect a rebase. Without a date, B turns into a stall.

Owner versus technical: all of this is technical. The holdout author must attest that they read no eval output, REPORT.md, router code or scratch files. An agent can do that. The only owner actions are the merge approvals the ruleset requires.

### Verdict (council lead, Sonnet 5.5), round 1

Adopt the Skeptic's path: (1) merge #177 now; (2) build the batching fix next as its own T2 task (BATCH=1 or fixed deterministic batching, with the determinism test, the council-4 conditions, the holdout folded into cases.json, and a new blind holdout of about 100 cases written by an author who attests they read no eval output; set a date: this task is the next Ben item after #109); (3) re-measure #135 on that base and merge it only on the stated criteria; (4) make eval:ben a required check only after about 10 clean runs. Recorded: the 87.6 on #177 is a batching artifact (issue #180). Nothing here needs the owner except the per-PR merge approvals the ruleset requires.

Round count: 1 of 2. Sent to the advisor next; the reply is recorded in the following commit.

### Advisor (Opus), reply, round 1, verbatim

AGREE: merge #177, and the sequencing is right. The Skeptic verified the things that matter: the gate thresholds from routing.eval.ts, that eval:ben is advisory and not a required check, and that repeat runs on one machine are byte-identical so the movement is content-edit sensitivity rather than run noise. #177 lands at 87.6 against an 85 floor: slack, not a cliff. #135 at 2.9% drift against a 3% limit has no slack, and that is exactly the shape the earlier council rejected for BATCH=1. Merging #177 now and re-measuring #135 after the batching fix is the correct order. No material notes.

Two things to carry into step 2, neither blocking:
- "Set a date" has no date. The verdict says the batching fix is "the next Ben item after #109," which is a sequence, not a deadline. The Skeptic flagged that without one, option B stalls, and this repo has an existing stall of exactly this kind in the held BATCH=1 branch. Put a concrete trigger in the record: the batching task opens as a draft PR within one working session of #109 merging, or it goes to the owner as a scheduling question.
- The holdout attestation needs to be checkable. "The author attests they read no eval output, REPORT.md, router code or scratch files" is the right requirement, but an agent attesting about its own context is unverifiable after the fact. Make it mechanical: the holdout author is a fresh agent whose brief names only the lesson corpus and forbids reading evals/, and the attestation records which paths it was given. A reviewer can then check the brief, not the claim.

Before you merge #177: its head is 0b9f0f9 with all checks green. The eval figures in the council record (88.1 vs 87.6) came from agent runs; the post-merge deploy.yml run is an acceptance criterion, so watch that deploy to completion. 0b9f0f9 predates the #186 merge: confirm whether #177 is behind main and whether GitHub will merge it cleanly, since the ruleset has strict_required_status_checks_policy: true.

### Outcome

Round count: 1 of 2. Advisor: AGREE, no material notes. Decided by council and advisor under the owner's standing instruction of 2026-11-02. Additions adopted: (1) trigger: the batching task (BATCH=1 or deterministic batching, determinism test, council-4 conditions, holdout folded into cases.json, new blind holdout of about 100 cases) opens as a draft PR within one working session of #109 merging; if that does not happen it goes to the owner as a scheduling question; (2) the holdout author is a fresh agent whose brief names only the lesson corpus under content/lessons/ and forbids reading evals/, REPORT.md, router code and scratch files, and the attestation lists the paths it was given; (3) #177 is merged now, with the post-merge deploy run as the acceptance check. Implementer of the merge: Sonnet 5.5 (council lead).
