# Council 4, seat C (adversarial skeptic)

Evidence: drift-measure-3.md (cited as dm3:line), origin/main router.ts (fetched), ADR 0001 s7. Nothing re-run. All reruns UNVERIFIED by me.

## Q1 Overfitting under ADR 0001? Partly yes, but BATCH=1 itself is not the overfit
- ADR s7: holdout is "scored, never tuned against"; if it drives changes, fold it into cases.json and write a new one. C2 was designed after seeing h-trap-gateway-arch (holdout, dm3:26-27). That is exactly the ADR-forbidden loop. The holdout is burned (brief), so V2's 85.4% holdout is no longer an independent number.
- Mitigation: C2 is not a per-case patch; it is a one-line rule ("tech answer needs >0.5 of tech vote") with a plausible general rationale. But its only measured effect on the 199 cases is ONE case (h-trap-gateway-arch) plus env-own-conda (dm3:48), i.e. the evidence for C2 is n=1, and that n=1 is a holdout case. Structural justification is asserted, not demonstrated.
- BATCH=1 is justified independent of any case: it makes the index match what the browser computes (cos 0.992 vs in-batch, brief). That is a correctness fix; the metric damage is the honest measurement finally showing through.

## Q2 "Passes by letter at zero slack": protective or meaningless?
- 2/69 = 2.9% vs 3.0% (dm3:8). Gate granularity is 1.45 pts per case; the limit sits 0.1 pt above 2 cases. Effectively "max 2 drift cases". That is a real threshold, not meaningless, but V2 is exactly AT it, so the gate gives no early warning: next drift case = red CI on an unrelated lesson edit (h-d-ai-art best .456 vs .45, dm3:53-54, re-embeds neighbours).
- Gate changes meaning in practice: it stops being a regression detector and becomes a flake generator. V0 "passes" at 1/69 only because batch composition luck (dm3 key insight); so V0's green was never evidence of browser behaviour.

## Q3 Would shipping BATCH=1 train the team that the gate is flaky?
- Only if it flakes. V2 was byte-identical across 2 runs (dm3:31-32): deterministic on this machine; cross-machine UNVERIFIED. The flakiness is lesson-edit sensitivity, not run-to-run. Teams learn "red = change someone's content" - and then respond by loosening the limit. The real risk is a future person bumping maxDrift to 0.05 to unblock a PR. Condition below.

## Q4 Is B (hold, build bigger blind holdout first) a stall?
- It is a stall IF it has no date. Cost of waiting is real but bounded: the index/browser mismatch is q8 scale noise (cos 0.992), and on the metrics V0 vs V2 differ by -0.5 pt overall (175->174 correct, dm3:46). Real-user cost today is small and symmetric (some cases flip each way: V2 newly wrong c-solid-2, c-obs-1, token-arcade; newly right c-bff-2). So B leaves a live but low-magnitude mismatch.
- But B's logic is also the strongest FOR doing it: the 20 off-course holdout cases are too few to resolve a 1-case difference. Deciding A vs C vs D on 69 drift cases with 1 case = 1.45 pts is deciding on noise. A bigger blind set is the only thing that changes that.

## Q5 'help me setup the tutor' lesson -> redirect: real harm and why (checked origin/main router.ts)
- Order in route(): isOffCourseTopic -> (isAboutTutor || isFollowUp) -> focus -> `if (offCourse)` redirect (router.ts ~283-288) -> namedTagLessons pin (~299) -> lesson gate. isTutorSetupQuestion feeds namedLessons/pin only (~170), and isAboutTutor needs you/your/ben so "the tutor" misses it.
- So the #134 pin sits BEHIND the offCourse redirect. Under V0 the vote was self (.532), not offCourse, so pin fired -> tutor-loop. Under BATCH=1 vote became off_topic .480 -> offCourse branch fires first (topScore < override) -> redirect; pin never reached (dm3:61-62). The pin is only protective when the vote happens to be non-off-course; embedding noise decides whether #134 works. That is a latent bug in main, exposed not caused by BATCH=1.
- Harm: the single most likely first-use question ("help me set up the tutor") sends a user who needs the setup lesson to "outside the course". UNVERIFIED how common; no eval case covers it (dm3:80). Asymmetric: 'is it hard to install the tutor' improved, but that is luck in the other direction.

## Strongest argument AGAINST each option
- A (ship V2): ships a known user-facing regression (setup-tutor) and a zero-slack gate, justified by a rule tuned after reading holdout; the next lesson edit can turn CI red or tempts a threshold bump.
- B (hold): delays a correctness fix indefinitely; "bigger holdout" needs authoring effort and labels the team has not scheduled; meanwhile main's 1/69 is partly luck, so it keeps a green that is not browser-faithful.
- C (V3): reinstates C1' the Chair dropped, whose rationale is gone on current main (dm3:14-16), costs env-own-openai (dm3:44) and is a post-hoc fix for h-d-ai-art (holdout) - same overfitting charge as A, plus a reinstated rule.
- D (structural fix): any new rule written now is tuned on burned data; it must be justified by mechanism, not metrics.

## Recommendation: D = A with a structural precondition (APPROVE WITH CONDITIONS)
Ship BATCH=1 (+C2) only after moving tutor-setup protection ahead of the offCourse branch (rule layer, like isAboutTutor), because that is a mechanism fix independent of any score. Do not fix h-d-ai-art by tuning.
Conditions (testable):
1. Unit test: "help me setup the tutor", "how do I set up Ben", "install the tutor" route to lesson tutor-loop even when forced vote = off_topic .480 / debate. Fails on current main code first.
2. The move must not change any existing semantic unit test (42 pass, dm3:73) and `npm run eval:ben` must still be 7/7 gates; report drift count again.
3. Add a unit test for techMajority (none exists, dm3:74), incl. the 0.5 boundary and "what is a mutex" (.534).
4. Do NOT change maxDrift in this PR; record in ADR/REPORT that V2 sits at 2/69 and that a third drift case needs a case review, not a limit bump.
5. Record in ADR s7 that holdout was consumed (C2 and h-trap-gateway-arch), and open a dated ticket for the new blind holdout (#136 part 3) with owner; fresh holdout must be authored before any further router rule.
6. Write "who was Alan Turing" (fallback->redirect) as an accepted regression in the PR body, or the Chair rejects C2 on it. Note this is arguably the biggest C2 side effect and has no case.
If condition 1 cannot be met within the manifest (router.ts + test + eval = 3 files ok), fall back to B with a date. REJECT: V3, and A as-is (without condition 1).
UNVERIFIED: how frequent setup-tutor phrasing is; cross-machine determinism; whether moving the pin changes other cases (needs a rerun).
