# Council 3, seat C (Skeptic): Q1, Q3, Q6

Verdict: APPROVE WITH CONDITIONS (4 numbered, testable). Not a Chair vote.

## Q1 Keaton bug
- VERIFIED (code path): origin/main router.ts:261-266 and 267-273. A `self` vote not confirmed by isAboutTutor skips the `offCourse` branch (:245 only covers debate/off_topic), the comment at :267-273 says it "falls through", and :296 returns action 'lesson' for any topScore >= 0.45. I replayed the m3 red test with `keaton-main.mts`: origin/main-equivalent router (`router_main.ts`) gives intent self 1.0, best 0.606, action **lesson**; the m3 router gives **redirect**. So the bug is real as logic.
- UNVERIFIED (low confidence): that real MiniLM vectors for "Who is Michael Keaton" vote self AND score a lesson 0.45-0.62. The test uses a hand-built vector (semantic.test.ts:222-228). No eval case contains it. "Reportedly" in the brief is the only evidence. Do not describe it as a production incident in the PR body.
- Same code as C1'? YES. The Keaton fix is the `if (vote.intent === 'self')` block (c1p-c2.diff). It ships once, with BATCH=1 and C2. I agree with seat A that splitting is a red deploy gate.
- Hidden cost of the fix, not stated anywhere: it redirects EVERY self-voted question that isAboutTutor misses and that scores < 0.62, including real course questions that merely sit near "who are you" examples (e.g. "what is a lesson in this course"). The 1/69 drift and 42/48 holdout are the only evidence this is rare, and the holdout is burned (ADR s7), so 42/48 is a ceiling, not an estimate.

## Q3 Scope creep / stacking
- Four stacked changes are mostly justified, but the drift PR is already three behaviors in one diff: Keaton redirect (C1'), tech majority (C2), BATCH=1. The Keaton redirect is a NEW user-facing behavior, not a drift repair. It is being smuggled through a "gate fix" PR. Call it a behavior change in the title and manifest (T2: public routing behavior).
- C2 is gate slack only (seat A: either rule alone = 2/69, zero slack). Zero slack at a limit of 2/69 means one more flaky case flips the deploy red. That is the real fragility, not the fix.
- Defer #135: agree. It changes the index the margins were tuned on. But the 30 broken chunks keep being served; it is a quality debt, not a free wait. Cap it with a date.
- Order: #134 first (already reviewed, touches router.ts pin region; drift PR rebases onto it, so conflicts are in router.ts only). Then drift PR. #135 last, re-measured at BATCH=1.

## Q6 What goes wrong after merge
1. eval:ben runs only on push to main (deploy.yml). A red gate then blocks the deploy AFTER merge, with Liz's click already spent. Windows-only measurements; Linux CI runner onnx numerics may differ. The 0-slack margin makes this likely, not hypothetical.
2. BATCH=1 changes the committed index artifact, so rollback is revert plus rebuild, not a one-line revert. Say so.
3. Pin tests use synthetic vectors that vote `course`; the new self-vote pin tests use axis 4 by hand. Neither proves real-embedding behavior.
4. Chair-only decisions: accept 0-slack margin or demand more; whether the Keaton redirect is acceptable product behavior; whether to run a Linux eval before merge; #135 deadline.

## Conditions
1. Run `npm run eval:ben` once on the PR head on a Linux runner (CI job or WSL) before merge; record drift count in the PR. Pass: drift <= 2/69.
2. PR title/manifest names the Keaton redirect as a behavior change, and rewrites router.ts:267-273 comment plus ben-history s7 closing sentence (per drift-review-c2.md).
3. One real-embedding probe of "Who is Michael Keaton" on main, result in the PR, so the bug claim leaves UNVERIFIED.
4. Add a course-question-near-self regression case (any real lesson question that votes self) to cases.json so the over-redirect risk has at least one tripwire.
