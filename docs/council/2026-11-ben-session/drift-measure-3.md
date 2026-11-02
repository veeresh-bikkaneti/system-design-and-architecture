# Ben drift measurement 3 (current origin/main 0f51b12, incl. #134 + #137)

Worktree (left in place): .claude/worktrees/m4   Raw outputs: .claude/worktrees/_scratch/out3/
Real embedder, `npm run eval:ben`, 199 cases (151 diagnosis + 48 holdout), 69 off-course. All 7 gate tests ran in every
run (7 passed, 0 skipped, VERIFIED from vitest output). Scratch-only edits in m4: hookTimeout 900s, DIAG dump in routing.eval.ts,
BATCH constant sed'd, router variants copied from out3/router.*.ts. Nothing committed.
Gates (evals/ben/routing.eval.ts GATES): accuracy>=0.85, maxDrift<=0.03, maxOffered<=0.10, maxRefusal<=0.08, lessonTop3>=0.90.
Drift limit 3.0% of 69 => 2 cases pass (2.9%), 3 fail (4.3%).

## Variants
- V0 main, BATCH=32.  V1 BATCH=1 alone.  V2 BATCH=1 + C2.  V3 BATCH=1 + C1' + C2 (reference).
- C2 port: THRESHOLDS.techMajority=0.5; `vote.intent==='tech' && vote.confidence > techMajority` before parametric_fallback.
- C1' port: self vote not confirmed by isAboutTutor -> redirect (or lesson if topScore>=override && conf<overrideVote), placed after
  the named-tag pins. NOTE: current main already dropped the bare self branch (comment in router.ts), so C1' now only changes
  the fall-through; its old rationale is largely gone.

| | overall | cases | holdout | drift all (n/69) | offered | refusal | top-1 | top-3 | gates |
|---|---|---|---|---|---|---|---|---|---|
| V0 | 87.9% | 88.1% | 87.5% | 1.4% (1) | 4.3% | 2.0% | 93.1% | 96.0% | 7/7 pass |
| V1 | 86.9% | 88.1% | 83.3% | 4.3% (3) | 4.3% | 2.0% | 93.1% | 97.0% | drift FAIL |
| V2 | 87.4% | 88.1% | 85.4% | 2.9% (2) | 4.3% | 2.0% | 93.1% | 97.0% | 7/7 pass |
| V3 | 87.4% | 87.4% | 87.5% | 1.4% (1) | 4.3% | 2.0% | 93.1% | 97.0% | 7/7 pass |

Drift (off-course answered as course), VERIFIED from DIAG json:
- V0: trap-queue-bank (lesson; vote course .708, best .529)
- V1: trap-queue-bank; h-d-ai-art (lesson; vote self .500, best .456 vs lesson gate .45); h-trap-gateway-arch (param_fallback; tech .481)
- V2: trap-queue-bank; h-d-ai-art. C2 removes h-trap-gateway-arch (tech .481 <= .5 -> redirect).
- V3: trap-queue-bank only (C1' redirects h-d-ai-art; self vote .500).
Holdout-only drift (10 off-course holdout cases): V0 0%, V1 10%, V2 5%, V3 0%.

## V2 repeatability
V2 run twice: REPORT.md byte-identical, DIAG json byte-identical (cmp). Embeddings at BATCH=1 are deterministic here.
(Third sample = the earlier run before the DIAG hook was in; same table numbers.) Cross-machine determinism UNVERIFIED.

## Case flips vs V0 (V1 and V2 unless noted; format v0 -> variant, (vote conf, best))
Newly WRONG:
- c-solid-2 (exp lesson): lesson (course .460, .454) -> parametric_fallback (tech .547, .448)   [V1, V2, V3]; best .448 just under the .45 gate
- c-dtx-2 (exp lesson): (was already wrong: pf tech .537/.400) -> clarify (course .583, .409); still wrong
- c-obs-1 (exp lesson): lesson (course 1.0, best .458) -> clarify (1.0, .438)   [best fell .020 across the .45 gate]
- h-d-ai-art (exp redirect): clarify (self .508, .443) -> lesson (self .500, .456)   DRIFT, best crossed .45 by +.006   [V1,V2; fixed in V3]
- h-trap-token-arcade (exp redirect): redirect (off_topic .507, .368) -> clarify (course .581, .353); wrong but not drift [V1,V2,V3]
- h-s-name (exp self): redirect (self .566) -> redirect (self .555), was already wrong; only the lesson shown changed
- h-trap-gateway-arch (V1 only): redirect (course .534) -> param_fallback (tech .481) DRIFT; C2 repairs it
- env-own-openai (V3 only): clarify (self .455) -> redirect (self .377); wrong because C1' redirects it
Newly RIGHT: c-bff-2 (clarify -> lesson, best .444 -> .470); env-own-conda unchanged-correct in V2.
Net accuracy: V0 -> V2 = 175 -> 174 (-0.5 pts overall).
Pure noise (correct before and after, slug/score moved only): d-guns, o-meaning, o-date, env-noun-netflix, s-hello, s-boss,
s-thanks, h-t-spring, h-t-copilot, h-trap-cap-graduation.
C2 itself changes only: h-trap-gateway-arch (V1 bad -> fixed) and env-own-conda (pf -> clarify at tech .433/.411, still scored correct).

## Margins (honest)
- V2 drift is 2/69 = 2.9% against a 3.0% limit. ZERO slack: one more drift case => 4.3% => red.
- h-d-ai-art sits at best .456 vs lesson gate .45 (+.006), and the index itself moved this by .013 between BATCH=32 and BATCH=1
  (.443 -> .456). So the second drift case is a coin-flip on embedding noise; a lesson edit that re-embeds neighbours could add or
  remove it. h-trap-gateway-arch only sits .019 under techMajority (.481 vs .5).
- V0's 1/69 has 1 case of slack; BATCH=1 spends it plus one more. C1' (V3) restores 1/69 but costs env-own-openai and
  its old rationale is partly obsolete on current main.

## Probe phrasings (48: 40 from probe-new.txt + 8 new written blind). Actions vs V0 (BATCH=32 main)
Harness: .claude/worktrees/m4/evals/ben/probe.eval.ts (+ vitest.probe.config.ts), output out3/p0.txt p1.txt p2.txt. V1 run to attribute.
Route-action changes V0 -> V2 (everything else identical in action AND lesson slug where action=lesson):
1. help me setup the tutor: lesson tutor-loop -> redirect (off_topic .480). REGRESSION vs expectation (should be tutor-loop). Cause BATCH=1
   (already redirect in V1; query vote moved self .532 -> off_topic .480). Not C2.
2. is it hard to install the tutor: redirect -> lesson tutor-loop (tech .439, pin). IMPROVEMENT, BATCH=1.
3. what languages do you speak: parametric_fallback (tech .496) -> redirect (tech .412). Within "self or redirect": IMPROVEMENT, C2 effect (V1 still fallback; tech .412 <= .5).
4. who was Alan Turing: parametric_fallback (tech .496) -> redirect (tech .485). C2 effect. Arguably a REGRESSION (a general-knowledge
   person question, which fallback was meant to answer; blind expectation was unset, class "new"). Judgement call, flag to Chair.
5. who is the CEO of Netflix: redirect -> (V1 parametric_fallback tech .336+) -> redirect (V2, tech .342). Net V0 -> V2 no change; BATCH=1 alone would have drifted it, C2 restores.
Unchanged, noteworthy: what is a mutex / semaphore / big O / who invented the web stay parametric_fallback (tech .534-.857);
who is Tom Hanks, capital of France stay redirect; race condition stays redirect (wrong vs expectation both sides).
Fallback margin for the new tech probes: mutex .534, spinlock .535, who invented the web .723 -- mutex/spinlock are only .03-.04 above .5.

## Unit tests (V2): `npx vitest run src/ai/local/semantic` -> 1 file, 42 passed, 0 failed (VERIFIED).
No test covers techMajority (not added; out of scope).

## Verdict (no tuning performed, no cases added)
V2 passes all 7 gates (VERIFIED, twice, identical). Drift margin: 0 cases / 0.1 pt. Passing but not robust.
Recommendation: V2 is shippable by the letter of the gates but has no slack; options for Chair: ship V2 with the fragility documented,
or V3 (restores 1/69 but costs env-own-openai and uses a rule the Chair dropped). Probe regression "help me setup the tutor" is a
BATCH=1 effect and is not covered by any case: UNVERIFIED whether it matters in practice.

## ERRATA (council 4, 2026-11-02)
- QA: c-obs-1 was already wrong at V0 baseline (expected observability, got caching-strategies); it is NOT a V2 flip. Real V0->V2 flips: c-solid-2 and h-trap-token-arcade newly wrong, c-bff-2 newly right. Net 175 -> 174 stands.
- Historian: counts in this report were wrong. holdout.json = 48 cases, 20 of them off-course; full set = 192 cases, 69 off-course (49 + 20). The drift denominator 69 is correct; "199 cases" and "10 holdout off-course" are not.
- Skeptic: the latent bug behind "help me setup the tutor": router.ts runs the offCourse redirect before #134's named-tag setup pin, and isAboutTutor misses "the tutor", so the pin only works when the embedding vote is not off_topic. BATCH=1 changed that vote (self 0.532 -> off_topic 0.480).
