# Consensus Manifest D2: Ben router generalization (PR #199, issues #180, #198)

Status: PROPOSED, phase 1 only (manifest + failing tests). No router, exemplar, threshold, label or case file is changed by this commit. Needs Skeptic (C) and advisor approval before any implementation. The Chair (Liz) approves merges.

Evidence labels: **VERIFIED** = measured by me in a scratch copy on 2026-11-03 or read in code; **INFERRED** = my reading; **UNVERIFIED** = not measured, low confidence.

```text
CONSENSUS MANIFEST
Task: Make Ben's semantic router meet the unchanged pooled gates (accuracy >= 85%, drift <= 3.0%, offered <= 10%,
      refusal <= 8%, lessonTop3 >= 90%) on the 304 pooled cases, then confirm on a FRESH blind set. No threshold changes.
Risk tier and rationale: T2. router.ts and exemplars.json are not T1 paths (AGENTS.md section 3); no auth, secrets or
      data loss. Behaviour change across a user-facing decision table, so Chair + Skeptic (C) review the manifest.
Scenarios / acceptance conditions: below.
Failing tests or test contracts: below (committed RED in this phase).
Scoped files: split into manifests of at most 3 files each (below).
Risks / unknowns: below.
Rejected alternatives and why: below.
Token budget: D2-0 3k, D2a 6k, D2b 8k, D2-L 3k, D2-G1 5k; each within the 15,000 cap.
Approvals / votes / dissent: PENDING (Skeptic C, advisor).
Chair decision: PENDING.
```

## Measured effect of each candidate (VERIFIED, 304 pooled cases, laptop CPU variant)

Method: scratch copy of `router.ts` plus an in-memory extension of the exemplar bank, run through the real embedder and the real `buildIndex()` (lesson index content `d7cf5587d308a692`, vector variant `f9feac54...`, the laptop one). The scratch files were deleted; nothing in the repo is changed. Baseline: 243/304 correct (79.9%), drift 6/104 (5.8%).

| Candidate | Correct | Accuracy | Drift | Fixed | Broken | Verdict |
|---|---|---|---|---|---|---|
| G2 clarify band: course vote >= 0.6 | 255 | 83.9 | 9 (8.7%) | 12 | 0 | rejected: 3 off-course traps leak (course share 0.61-0.66) |
| **G2: course vote >= 0.7** | 253 | 83.2 | 6 | **10** | **0** | proposed |
| G2: course vote >= 0.8 | 250 | 82.2 | 6 | 7 | 0 | fallback if 0.7 is judged too close to the 0.66 off-course ceiling |
| G2 plus a top-lesson margin condition (0.02 / 0.04 / 0.06) | 253 / 249 / 245 at vote 0.7 | | | 8 / 5 / 2 | 0 | rejected: margin does not discriminate (right-lesson margins 0.015-0.116, the two wrong-lesson cases 0.021 and 0.050) and it only removes fixes |
| **G9 self vote >= 0.8 (and topScore < 0.45)** | 245 | 80.6 | 6 | **2** (n-s-103, n-s-105) | 0 | proposed, with a second-person guard (below) |
| G9 self vote >= 0.75 | 244 | 80.3 | 6 | 2 | 1 (n-o-097, redirect to self) | rejected: 0.01 from a regression |
| G2 0.7 + G9 0.8 | 255 | 83.9 | 6 | 12 | 0 | proposed together |
| Vote noise floor (ignore neighbours below 0.20 / 0.25 / 0.30) | 245 / 244 / 240 | | 6 / 5 / 5 | 4 / 4 / 5 | 2 / 3 / 8 | rejected: breaks working tech and course cases; does not fix G7 |
| Exemplars A2+B+D+E+F alone (no G2/G9) | 247 | 81.3 | 3 | 6 | 2 | exemplars are worth little without G2/G9 |
| **G2 0.7 + G9 0.8 + exemplars A2+B+D+E+F** (no G1) | **258** | **84.9** | **3 (2.9%)** | 17 | 2 (c-url-1, n-t-058) | best candidate; 1 case short of 85% (needs 259) |
| same, plus tech "how do I" exemplars C (G1, conditional) | 260 | 85.5 | 3 (2.9%) | 18 | 1 (c-url-1) | clears accuracy; needs the owner's G1 answer |
| same with G2 at 0.8 | 256 | 84.2 | 3 | 15 | 2 | |

Reading the table:

1. **G2 is real but small**: 10 of the 61 misses, no regression. Of the 27 cases that reach the clarify branch, only 2 are expected-clarify.
2. **Accuracy alone cannot pass without exemplars**: G2 + G9 reach 83.9. The gates need 259 correct (85%); the best candidate without G1 has 258.
3. **Drift is the binding gate and no router rule touches it.** The 6 drift cases are trap-queue-bank, n-d-071, n-d-077 (answered by the lesson gate at 0.47-0.53), h-trap-gateway-arch, n-d-072, n-s-107. Exemplars E/F/B fix the first three and the Gateway Arch case in the pooled run. The three that remain (n-d-072, n-d-077, n-s-107) are label doubts: exemplars.json says course "includes trade-off opinions about technology" (n-d-077 AWS vs Azure vs GCP), ADR 0001 sends a tech vote to parametric_fallback (n-d-072), and n-s-107 asks what Ben can do. Drift 3/104 = 2.88% passes by exactly one case: zero slack. **If those three labels are upheld the drift gate fails**; a label decision cannot be made to pass the gate, so it goes to the Skeptic with the definitions read before the numbers (D2-L).
4. **Exemplar sensitivity is high** (INFERRED from the runs): swapping one or two drafted exemplars moved the pooled result by 1 to 3 cases (84.9 to 86.5). Pooled numbers will not be trusted; the fresh blind set decides.
5. **Interaction risk**: adding symptom-phrased course exemplars raised the course vote of two off-course traps above 0.7, and the G2 rule then answered them (drift 6 to 9 in one run). Hence the G2 vote threshold must be decided together with the exemplar set, on the same run.

## Rule against per-case hacks

No eval question text, id, or distinctive token may appear in `router.ts` or `exemplars.json`. Exemplars are general paraphrases drafted from the lessons and the intent definitions in `exemplars.json` `about`. Verification by a reviewer:

- `evals/ben/data.test.ts` "never votes with a near-copy of a scored question" (committed in this phase): fails on an exemplar equal to, word-boundary-contained in (3+ tokens), or token-Jaccard >= 0.75 with any scored question. It already found **4 existing near-copies** in the current bank (n-c-024, n-t-068, n-o-094, n-s-102; VERIFIED), so those exemplars must be reworded in D2b, and their effect is UNVERIFIED.
- Every added exemplar is listed in the D2b diff; the reviewer reads the list against `cases.json`.
- Honest limit: the draft lists below were written after reading the diagnosis, so their categories (everyday uses of tech words, jobs and AI, trivia) were informed by the failures. Only the fresh blind set, written by an agent that has not seen the exemplars, can show they generalize.

## Split into manifests (max 3 files each)

| Manifest | Files | Content | Order |
|---|---|---|---|
| **D2-0** data move | `evals/ben/cases.json`, `evals/ben/holdout.json`, `evals/ben/routing.eval.ts`, `evals/ben/data.test.ts` (4: justified exception, mechanical, no logic) | Move the 103 examined `n-` cases into cases.json; holdout.json holds only the fresh blind set once written; eval handles an empty set. Gates unchanged. | first, behaviour-neutral |
| **D2a** router | `src/ai/local/semantic/router.ts`, `src/ai/local/semantic/semantic.test.ts` | G2 rule: in the clarify branch, if intent is course and vote share >= 0.7 (decide 0.7 vs 0.8 in D2b's run), answer `lesson` from the top lesson. G9 rule: after the tag pin and before the lesson gate, a self vote >= 0.8 with topScore < lesson AND a second-person word (you, your, yours, yourself) in the question yields `self`. The guard keeps the "who is <actor>" drift fix (router.ts:333). The existing test "offers the closest lessons instead of guessing on a weak match" uses a unanimous course vote in the band and must be amended to the split-vote vector (see tests). | second |
| **D2b** exemplars | `evals/ben/exemplars.json`, `evals/ben/data.test.ts` | Add the five draft classes below (41 exemplars), reword the 4 near-copies. Re-run the eval; choose the G2 threshold on that run. | third (needs D2a) |
| **D2-L** label review | `evals/ben/cases.json` | Skeptic reads the intent definitions and decides, per case and in writing, n-d-072, n-d-077, n-s-107 and the G6 group (n-c-007/009/010/012/036, c-repl-1/2, c-dtx-1, c-ai-1, c-es-2). Relabel only when the definition says so; never to pass a gate. | before D2b's final run, independent of code |
| **D2-G1** (CONDITIONAL) | `evals/ben/exemplars.json`, `evals/ben/data.test.ts` | Tech "how do I / X vs Y / explain" exemplars (set C, 20). Do not start until the owner answers whether the tutor should answer general software questions. | after the owner answers |

D2a and D2b both feed one run, so they are separate commits on one branch, never parallel (shared eval, shared index).

## Scenarios and acceptance conditions

1. Pooled 304 (or the post-D2-0 set): accuracy >= 85%, drift <= 3.0%, offered <= 10%, refusal <= 8%, lessonTop3 >= 90%, original thresholds, GATES untouched. `npm run eval:ben` twice gives an identical REPORT.md.
2. **Fresh blind set**: written by a fresh agent in a throwaway directory holding only a copy of `content/lessons/` (no `evals/`, no `exemplars.json`, no docs), after D2a/D2b are merged to the branch. Scored once, nothing tuned afterwards. It must itself meet the same gates; one failed pass means back to the council, not to threshold edits.
3. No exemplar equals, contains or near-copies any scored question (the committed hygiene test), including the fresh set.
4. **Both CPU variants** of the index, `f9feac54...` (laptop, slow runners) and `1837cd2f...` (fast runners), pass the gates. UNVERIFIED so far: all numbers here are the laptop variant. The pinned-vector artifact is a SEPARATE manifest (`docs/manifests/ben-index-determinism.md`); until it lands, D2 acceptance must be shown on both variants (CI matrix or two recorded runs).
5. `npm test`, `npm run lint`, `npm run build`, `npm run content:check`, `npm run eval:ben` pass; `eval:ben` run because `src/ai/local/` changes, after re-reading ADR 0001. ADR 0001 section 7 gets a note describing the rule change.
6. A `src/ai/local/` change plus an EVIDENCE_LOG.md entry (T2).

## Failing tests committed in this phase (RED for the intended reason)

Run: `npx vitest run src/ai/local/semantic/semantic.test.ts evals/ben/data.test.ts` gives 5 failed, 81 passed. Full `npm test`: 5 failed, 746 passed.

| Test | File | State | Failure text |
|---|---|---|---|
| answers from the closest lesson when the course vote is decisive inside the clarify band | semantic.test.ts | RED | `expected 'clarify' to be 'lesson'` |
| routes a decisive self vote to Ben when the question addresses him and no lesson is close | semantic.test.ts | RED | `expected 'redirect' to be 'self'` |
| never votes with a near-copy of a scored question | data.test.ts | RED | `expected [ ...(4) ] to deeply equal []` (n-c-024, n-t-068, n-o-094, n-s-102) |
| does not let "How do I..." dominate the off_topic exemplars | data.test.ts | RED | `expected 0.3888 to be less than or equal to 0.35` (21 of 54) |
| teaches the router that "what is the X pattern/principle" is a course question | data.test.ts | RED | `expected 1 to be greater than or equal to 4` |
| precondition: weak vector is in the band with a unanimous course vote | semantic.test.ts | green guard | |
| still clarifies inside the band when the course vote is only a plurality (0.6) | semantic.test.ts | green guard | stops G2 from answering lexical false friends |
| still redirects below the clarify gate with a unanimous course vote | semantic.test.ts | green guard | |
| does not route a self vote below 0.8 to Ben | semantic.test.ts | green guard | |
| never routes a decisive self vote to Ben when the question does not address him | semantic.test.ts | green guard | the "who is <actor>" bug |
| a named-tag pin and a blocked topic outrank both new rules | semantic.test.ts | green guard | |

Known conflict to resolve in D2a: the existing test "offers the closest lessons instead of guessing on a weak match" (semantic.test.ts) uses the same unanimous-course vector as the new RED test, so the two cannot both pass. D2a amends the old test to use the split-vote vector (it then still asserts `clarify`). This amendment is part of the D2a diff, flagged for the Skeptic.

The eval itself (`npm run eval:ben`: accuracy 79.9 vs 85, drift 5.8 vs 3.0) is the other RED acceptance test and already fails on this branch.

## Draft exemplar classes for D2b (NOT applied; measured as the "A2+B+D+E+F" row)

- **A2 course, "what is the X pattern/principle" (G5, 9):** What is the circuit breaker pattern? | What is the sidecar pattern? | What does the bulkhead pattern protect against? | What is the open closed principle? | What is leader election? | What is eventual consistency? | What does CQRS mean? | What is a write-ahead log? | What is a bloom filter?
- **B off_topic, general knowledge and daily life, not "How do I" (G3/G8, 13):** Who painted the ceiling of the Sistine Chapel? | When was the Eiffel Tower built? | Which river is the longest in Africa? | Who wrote Pride and Prejudice? | What year did the Berlin Wall fall? | Who invented the telephone? | What is the tallest mountain in the world? | Tell me a fun fact about octopuses | What is a good name for my new puppy? | Recommend a movie for a rainy Sunday | What should I cook for dinner tonight? | Translate thank you very much into Spanish | Is it going to rain in London this weekend?
- **D self, about Ben's abilities and data (G9, 8):** What kinds of things can I ask you here? | Do you keep a record of our past conversations? | Does what I type leave my browser? | How should I talk to you to get the best answers? | Which topics are you able to teach? | What are you not able to help with? | Do you learn from what I tell you? | Do you have a nickname?
- **E off_topic, everyday uses of words that are also system terms (G7, 8):** Why is the line at the post office so long on Fridays? | What should I pack for a camping trip by a lake? | How do I tie a strong knot on a boat rope? | Why does my plumber say the pipes need replacing? | Where can I find a good laundromat nearby? | Which bank branch near me is open on Saturdays? | What is the best way to carry a heavy backpack on a long hike? | How do I mend a hole in my favorite sweater? (highest overfit risk; Skeptic to rule)
- **F debate, technology and society (G8, 3):** Will robots take over most jobs in the future? | Is technology making people lonelier? | Should children be allowed on social media before sixteen?
- **Symptom-phrased course exemplars (set A, 20)** were measured and **rejected**: they pushed two off-course traps over the G2 vote threshold (drift 6 to 9).
- **C tech "how do I" (G1, 20)** is held for D2-G1.

These add 41 exemplars (A2 9 + B 13 + D 8 + E 8 + F 3). Counts after the change: off_topic 54 to 75 (How do I share 23/75 = 31%, under the 35% test), course 60 to 69, self 18 to 26, debate 32 to 35.

## Risks and unknowns

- **Pooled-set overfit.** The 304 cases are the diagnosis data; every candidate above was chosen by looking at them. The prior blind result (67% on a fresh set) is the evidence that this risk is real. Mitigation: the fresh blind set and the near-copy test. Even then, expect the fresh score to be lower than the pooled one.
- **Drift gate has zero slack** on the pooled set and depends on three label decisions (D2-L). A fresh set with about 100 off-course cases allows 3 drift cases at 3.0%.
- **G2 threshold 0.7 sits 0.04 above the highest off-course course-vote (0.66) in the clarify band.** Tuned on the same cases (VERIFIED), so it may not hold on new questions (INFERRED).
- **G2 can answer from a wrong lesson**: 2 of the 10 clarify-band course cases at 0.7+ (c-obs-1, n-c-044) have the wrong top lesson; they go from clarify (already counted wrong) to a wrong answer. Metric-neutral, but a worse product outcome than offering lessons (INFERRED). A lessonTop3 gate remains (96.8%).
- **Index variance**: numbers are for the `f9feac54...` variant only. UNVERIFIED on `1837cd2f...`.
- **The 4 near-copy exemplars** (to be reworded) inflate current scores for those 4 cases by an unmeasured amount.
- Not measured: G3 residuals (n-c-050, c-shard-1), G4 (n-c-042, n-c-003), G6, the effect of rewording the 4 near-copies, a second run on the fast-runner variant, G1 exemplars on their own (only in combination).
- Owner question pending: should the tutor answer general software questions. D2-G1 waits for it. Without G1 the best measured accuracy is 84.9, one case below the gate.

## Rejected alternatives

- Lowering `lesson` (0.45) or `clarify` (0.33), or raising `override`: forbidden (gates and thresholds never change) and it would worsen drift.
- A margin condition on the top lesson (does not discriminate; table above).
- A vote noise floor (net small gain, up to 8 breaks, G7 unfixed).
- Symptom-phrased course exemplars (drift rises).
- Per-case rules, regexes or exemplars shaped like specific eval questions (the hygiene test and the rule above forbid it).
- Relabelling cases to pass gates (D2-L decides on definitions only, in writing, before the final run).
- Treating the pooled result as the proof: only the fresh blind set counts.

## Process improvements proposed (max 2)

1. Make `eval:ben` print the per-case branch (`reasons[0]`) so the miss list explains itself without the scratch diagnostic.
2. Run the eval on both index variants in CI so acceptance condition 4 is checked by the pipeline rather than by hand.
