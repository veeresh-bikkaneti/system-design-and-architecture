# DRAFT for T2 council (Chair: Liz, plus Skeptic C): Ben drift at BATCH=1

Status: draft for decision. Read-only work: nothing tracked was edited, committed or pushed. All evals ran in a
scratch worktree at 66a3ef0 with `BATCH` read from an env var, using `npx vitest run --config vitest.eval.config.ts`.
That worktree has been removed, and the main repo plus the batch-1 worktree are unchanged (checked with `git status`). Raw per-case dumps: `diag-b1.json` and `diag-b32.json` in this scratchpad.

## 1. Diagnosis (verified, one deterministic run per config)

The router's answer gate is `THRESHOLDS.lesson = 0.45` on the best section (`router.ts:296`). The `tech` branch
(`router.ts:299`) returns `parametric_fallback` with **no similarity floor**: a plurality vote alone is enough.

| case | batch | got | vote (share) | top lesson / chunk | best | margin to 0.45 | mechanism |
|---|---|---|---|---|---|---|---|
| h-d-ai-art (exp. redirect) | 32 | clarify | self 0.508 | designing-ai-systems / "RAG: give the chef a library card" | 0.4427 | -0.0073 | score gate (just below) |
| | 1 | **lesson (DRIFT)** | self 0.500 | same | 0.4557 | **+0.0057** | score gate (just above) |
| h-trap-gateway-arch (exp. redirect) | 32 | redirect | course 0.534 / tech 0.374 | api-gateways / "Summary" | 0.2785 | -0.17 | vote: course + low score, so redirect |
| | 1 | **parametric (DRIFT)** | tech 0.481 / course 0.423 | same | 0.2745 | -0.18 | vote: tech plurality, then no-floor tech branch |
| c-solid-2 (exp. lesson) | 32 | lesson | course 0.460 / tech 0.426 | solid-principles / "L - Liskov substitution" | 0.4543 | +0.0043 | score gate plus vote |
| | 1 | parametric | tech 0.547 | same | 0.4477 | -0.0023 | vote flip, score below gate |
| h-trap-token-arcade (exp. redirect) | 32 | redirect | off_topic 0.507 / course 0.493 | url-shortener / "The key-generation problem" | 0.3683 | -0.08 | off-topic vote won by 0.014 |
| | 1 | clarify | course 0.581 / off_topic 0.419 | same | 0.3532 | -0.10 | vote flip, then clarify band |
| c-bff-2 (exp. lesson) | 32 | clarify | course 0.625 | bff-backend-for-frontend / "Why this matters" | 0.4440 | -0.0060 | score gate |
| | 1 | lesson | course 0.720 | same | 0.4703 | +0.0203 | score gate |
| trap-queue-bank (contrast) | 32 / 1 | lesson / lesson | course 0.708 / 0.721 | message-queues / "Backpressure" | 0.5287 / 0.5297 | +0.08 | stable and genuinely wrong |

What the data shows, as opposed to assertion:
- **Two separate failure modes.** (a) *Score gate*: h-d-ai-art's vote is the same at both batch sizes. Only its
  score moved, by 0.013, and that crossed 0.45. c-bff-2 is the same mechanism in the other direction.
  (b) *Intent vote*: gateway-arch never comes near any score gate (about 0.275). It drifted because the
  course/tech vote flipped, and every one of its 7 neighbours sits below 0.30 (the nearest tech exemplar is 0.202),
  so the vote is noise. On main it was refused only because noise happened to favour `course`.
- **Off-topic guard is absent for these, not merely weak.** h-d-ai-art gives debate and off_topic 0.000 vote share.
  Its nearest exemplar is self "Are you an AI?" (0.533). Since the bare-vote self branch was removed
  (ben-history #7), an unconfirmed self vote falls through to the 0.45 course gate, not the 0.62 override.
  So the only thing refusing it on main was 0.0073 of score. None of the rule layer, refusal list,
  name/tag pins, or off-topic exemplars was involved in any of the four flips (`reason` field per case).
- trap-queue-bank is identical at both batch sizes, which shows the "marginal" label separates real cases from noise.
  It is a real miss, out of scope here.
- Vote shifts between batch sizes reach about ±0.1 of share, and best-section shifts reach 0.026.

## 2. Candidates

**A. Raise the answer floor (`THRESHOLDS.lesson`). REJECT.** File: router.ts, 1 line. In cases.json, true-course best
scores have p10 = 0.435, and 13 course cases sit in 0.43–0.48. Holdout course p10 = 0.457. Redirect cases reach
0.530 (trap-queue-bank). The two distributions overlap, and h-d-ai-art (0.4557) sits inside the true-positive band.
A floor that drops it has to sit in the 0.0017 gap below c-ddd-2 (0.4574). That is eval-tuning by definition. It also
cannot touch gateway-arch, because the tech branch reads no score.

**B. Lexical overlap guard (query content words must hit the chunk text or the lesson title/tags). REJECT.** File:
router.ts, about 15 lines, reusing `tokenize`. At BATCH=1 the `lesson` answers with zero text overlap are the four
follow-ups (f-example, f-simpler, f-analogy, f-explain-this), which would need an exemption, plus h-d-ai-art. At
BATCH=32 it also blocks the true course case c-agent-1, so it is batch-fragile too. A *title* guard misses the
target, because h-d-ai-art matches "ai". trap-queue-bank matches "queue" and gateway-arch matches "gateway". The guard
fires on the wrong cases, and it brings back the lexical deciding that ADR 0001 Context #1 names as the root cause.

**C. RECOMMENDED: "an unconfirmed or indecisive vote cannot authorize an answer".** File: `src/ai/local/semantic/router.ts`,
about 4 lines plus a THRESHOLDS entry with a comment. Two halves, each general, and neither names a case:
- **C1 self guard.** `if (offCourse || vote.intent === 'self')` in the off-course branch (`router.ts:261`). A self vote
  that `isAboutTutor` did not confirm is a non-course question, so it gets the same treatment as debate/off_topic
  (redirect unless the lesson is at or above 0.62 and the vote is below 0.6). This closes the sibling of the bug in
  ben-history #7: that fix stopped an unconfirmed self vote reaching `self`, and C1 stops it reaching `lesson`.
- **C2 tech majority.** `if (vote.intent === 'tech' && vote.confidence > THRESHOLDS.techMajority)` with `techMajority: 0.5`.
  Justification is the structural hole first: `parametric_fallback` is the only answering action with no evidence
  requirement. 0.5 means "majority, not plurality", and it is not fitted to any case. On the measured distribution,
  every correctly routed true-tech case votes at least 0.616 at BATCH=1 (0.597 at BATCH=32; min across cases and
  holdout), so the bar sits about 0.1 below the nearest true positive. h-t-postman, a miss on main, votes course (0.575),
  so C2 does not touch it. Thin side: gateway-arch is 0.481, only 0.019 under the bar.
- Failure modes: C1 will redirect a real course question whose nearest neighbours are self exemplars (none in
  cases.json: all 8 vote=self cases are expected `self` and rule-caught). C2 sends a split-vote tech question to the
  clarify/redirect path instead of a general-knowledge answer, which costs helpfulness but causes no drift.
  C2's 0.019 margin on gateway-arch could disappear on a future index.
- ADR fit: no exemplar is added, the threshold lives in THRESHOLDS, the router stays pure, and the policy-table
  semantics ("anything else, low → redirect") are unchanged.

**Measured effect (scratch, real embedder; no exemplar or case data changed):**

| variant | batch | drift all | holdout acc | all acc | offered | gates |
|---|---|---|---|---|---|---|
| main (no fix) | 32 | 1.4% | 87.5% | 87.5% | n/a | 7/7 |
| batch-1, no fix | 1 | 4.3% | 83.3% | 86.5% | 4.3% | 6/7 |
| C1 only | 1 | 2.9% (2/69) | 85.4% | 87.0% | 4.3% | 7/7, zero margin |
| C2 only | 1 | 2.9% (2/69) | 85.4% | 87.0% | 4.3% | 7/7, zero margin |
| **C1 + C2** | 1 | **1.4% (1/69)** | **87.5% = main** | 87.5% | 4.3% | **7/7** |
| C1 + C2 | 32 | 1.4% | 89.6% | 88.0% | 2.9% | 7/7 |

cases.json accuracy is 87.5% in every row: **the diagnosis set does not exercise either rule.** Both halves were
motivated only by holdout cases. That fact drives the holdout contract below.

**Holdout contract (do not soften):** this session dumped per-case scores, neighbours and overlap for all 48 holdout
cases, and designed C from h-d-ai-art and h-trap-gateway-arch. Under ADR 0001 §7 the holdout **has now driven a
change**. It must be folded into cases.json, and a **new holdout must be written** by someone who has not seen router
outputs, before it is scored. The holdout numbers above are contaminated and are weak evidence. The predicted effect
that can be checked without exemplars is: drift 1/69 at BATCH=1 on today's sets, cases.json unchanged at 87.5%, and
on a fresh holdout no C1/C2-caused misses among true course/tech questions.

## 3. CONSENSUS MANIFEST (recommended candidate)

```text
CONSENSUS MANIFEST
Task: Close two answer paths that a non-decisive intent vote can open (unconfirmed self vote reaching `lesson`;
  plurality-only tech vote reaching `parametric_fallback`), so the batch-exact (BATCH=1) index passes the ADR 0001
  drift gate without exemplar tuning. Lands on top of fix/ben-index-batch-1 (66a3ef0).
Risk tier and rationale: T2. Behavior change to Ben's routing policy (src/ai/local/semantic/router.ts). No T1 path
  touched (worker/, session.ts, gist-sync.ts, AuthBar.tsx untouched). Chair + Skeptic.
Scenarios / acceptance conditions:
  S1 A question whose vote is `self` but that isAboutTutor rejects, with a lesson section between 0.45 and 0.62,
     is redirected (today: answered from the lesson).
  S2 Same, with a lesson at or above 0.62 and vote below 0.6: still answered (override unchanged).
  S3 A tech-argmax vote with share at or below 0.5 and no lesson at or above 0.45 does not return parametric_fallback.
  S4 A tech vote with share above 0.5 and no lesson still returns parametric_fallback (existing test stays green).
  S5 Eval at BATCH=1: 7/7 gates, no skipped tests; drift at or below 3.0%; holdout accuracy at or above main minus 1 case
     (main 42/48); no holdout question appears in exemplars.json (data.test.ts).
Failing tests or test contracts (red first, synthetic vectors in semantic.test.ts style):
  T1 'redirects an unconfirmed self vote even when a lesson clears the answer bar' (fails on HEAD: action 'lesson').
  T2 'does not fall back to general knowledge on a split tech vote' (fails on HEAD: 'parametric_fallback').
  T3 existing 'falls back to the model's own knowledge...' and 'does not answer as Ben just because...' stay green.
Scoped files (maximum 3; justify any exception):
  1 src/ai/local/semantic/router.ts (about 4 lines + THRESHOLDS.techMajority with distribution comment)
  2 src/ai/local/semantic/semantic.test.ts (T1, T2; about 30 lines)
  3 evals/ben/REPORT.md (regenerated by the eval; committed by convention)
  Exception: EVIDENCE_LOG.md entry (mandated by AGENTS.md section 11 after every T2; append-only, no code).
  Out of scope, separate task: fold holdout.json into cases.json and write a new holdout (ADR section 7).
Risks / unknowns: C2 margin on gateway-arch is 0.019; C1/C2 are each zero-margin alone (2/69); cases.json does not
  exercise either rule, so the evidence is holdout-derived (contaminated); c-solid-2 and h-trap-token-arcade stay
  wrong; browser vs Node embedding parity of the query path is UNVERIFIED.
Rejected alternatives and why: (A) raising THRESHOLDS.lesson: course and off-course score distributions overlap
  (course p10 0.435), and any floor below h-d-ai-art fits a 0.0017 gap. (B) lexical overlap guard: misses h-d-ai-art
  on titles, blocks c-agent-1 at BATCH=32, needs a follow-up exemption, and is the lexical deciding ADR 0001 retired.
  (D) exemplars for the drifting cases: banned by ADR 0001 (holdout-driven exemplars dropped holdout 89.6 to 85.4).
  (E) re-baseline the 3% gate: GATES says "never lower them to pass". (F) keep BATCH=32: keeps the luck.
Token budget (maximum 15,000): about 9,000 (tests 2k, code 1k, eval runs and report 3k, evidence log 1k, review 2k).
Approvals / votes / dissent: [blank: Chair Liz] [blank: Skeptic C]
Chair decision (including any veto): [blank]
```

## 4. UNVERIFIED, and the acceptance protocol

UNVERIFIED (low confidence):
- Whether the browser's single-query embedding (WASM, possibly WebGPU) matches Node's BATCH=1 vectors exactly.
  Only Node was measured.
- Run-to-run determinism of the *patched* router (one run per variant; determinism was shown earlier only for the
  unpatched branch).
- Whether C generalises: the diagnosis set does not exercise it. Only a fresh holdout can show that.
- `npm test` full, lint, `content:validate`, `content:check`, `npm run build`, `test:e2e`: NOT RUN for C (only
  `vitest run src/ai/local/semantic` ran, 24/24 green, with C applied).

Acceptance protocol (implementer):
1. Add T1, T2, see them fail on 66a3ef0 for the stated reason, then apply C and see them pass.
2. `npx vitest run --config vitest.eval.config.ts` at BATCH=1 (branch default): 7/7, zero skipped. Drift at or below
   3.0%. Holdout accuracy at or above 41/48 (main 42/48 minus 1). Paste the REPORT.md table.
3. Confirm `git diff evals/ben/exemplars.json` is empty, so no per-case exemplar was added for any holdout case.
4. Full gates: `npm test`, `npm run lint`, `npm run content:validate`, `npm run content:check`, and
   `VITE_BASE_PATH=/system-design-and-architecture/ npm run build`. Report every gate that was not run as not run.
5. Chair decision recorded: open the new-holdout task, and decide whether merge waits for the fresh holdout's first score.
