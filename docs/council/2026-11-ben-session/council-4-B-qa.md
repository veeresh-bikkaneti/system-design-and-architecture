# Council 4, seat B (QA)

**Recommended option: D.** Measure BATCH=32 + C2 (not yet measured), keep C1' dropped, and do not ship V2 now. Vote for D: APPROVE WITH CONDITIONS. Vote against A (ship V2): REJECT. Vote against C (V3): REJECT.

## Verified numbers
- GATES on origin/main (`evals/ben/routing.eval.ts:43-49`): accuracy 0.85, maxDrift 0.03, maxOffered 0.10, maxRefusal 0.08, lessonTop3 0.90. VERIFIED.
- Drift denominator = expected redirect|self only (`routing.eval.ts:89`): 49 (cases) + 20 (holdout) = 69. VERIFIED. Drift numerator = answered (lesson or parametric_fallback) and not in okActions (`routing.eval.ts:72`).
- Drift limit 0.03 x 69 = 2.07, so 2 cases pass, 3 fail. 2/69 = 2.9% (0.1 pt slack). VERIFIED.
- Accuracy counts match the percentages (175/199 V0, 174/199 V2, 173/199 V1, 174/199 V3; cases 133/151 V0 and V2; holdout 42/48 V0, 41/48 V2). VERIFIED from out3/*.REPORT.md.
- Per-variant drift split (cases vs holdout) matches the per-case list. VERIFIED.
- The off-course and holdout expected-action counts above come from `git show origin/main:evals/ben/{cases,holdout}.json`.

## Error in drift-measure-3.md
- Line 39 lists c-obs-1 as a "newly WRONG" V1/V2 flip. It is not. V0 already has it wrong (`out3/v0.REPORT.md:37`: expected observability, got caching-strategies). The real V0 to V2 flips are: newly wrong c-solid-2 and h-trap-token-arcade; newly right c-bff-2. Net -1 (175 to 174). The count still holds; the narrative is wrong.
- Also: h-d-ai-art was already wrong on V0 (clarify, not redirect). The drift is new, the wrong action is not.

## What the drift gate protects
- It guards the claim that Ben does not answer personal or off-course questions with course material. A case counts as drift when it is answered as a lesson or as parametric fallback.
- At n=69 one case is 1.45 pts, so the gate is effectively "at most 2 of 69." A pass at exactly 2 is a pass under `<=`. Zero slack is acceptable as a gate only if the result is reproducible on the target platform.
- Tech-expected cases (expected parametric_fallback, 22 + 6) are outside the drift gate. C2 can therefore cost accuracy on them but cannot move drift. No such case flipped in V2 except env-own-conda, which is still scored correct.

## Test contracts missing for C2 (techMajority)
- No test on origin/main covers `vote.intent==='tech' && confidence > 0.5`. The router code is at `router.ts:321-322`. The existing fallback test (`semantic.test.ts:82`) passes, so its confidence is above 0.5 (inferred, not checked).
- Needed contract (failing first, then the fix): tech vote 0.49 with no lesson gives redirect; 0.50 gives redirect (strict >); 0.51 gives parametric_fallback.

## Regression tests (both fail today or are unmeasured)
- "help me setup the tutor" should give lesson tutor-loop. Expected at `probe-new.txt:25`. Why it fails: the offCourse branch returns redirect (`router.ts` ~285) before the named-tag pin (~303). `isTutorSetupQuestion` already matches "setup" plus "tutor" (`router.ts:148-152`). Test shape: route() with an off_topic vote at 0.48, no lesson above 0.45, question "help me setup the tutor" expects action lesson, lessons[0] tutor-loop, pinned tutor-loop. Expected to fail on main.
- Guard for that fix: "help me set up a tutor for my kid's math" (off-course) must still redirect. The fix could leak tutor-loop into off-topic questions that contain "tutor" and "setup." UNVERIFIED that this case exists in the cases.
- "who was Alan Turing": no expected action in probe-new (class new). C2 moves it from fallback to redirect (tech .485). The Chair must decide the expected action before measuring. Test shape: route() with tech vote 0.485 and no lesson expects the chosen action. Do not add it to the burned holdout.

## What must be re-run on Linux before any merge
1. `npm run eval:ben` on Linux, with the index rebuilt by `scripts/ben/build-index.mjs` (BATCH constant at line 20). Compare REPORT.md and the DIAG json with the Windows run. Note `public/ben/index.json` is gitignored and rebuilt locally. Cross-machine determinism is UNVERIFIED.
2. `npx vitest run src/ai/local/semantic` (42 tests on Windows, VERIFIED).
3. `npm test`, `npm run lint`, `npm run content:validate`, `npm run content:check`, `npm run build` with VITE_BASE_PATH=/system-design-and-architecture/.
4. The PR-triggered eval is described as advisory in the brief (#137). UNVERIFIED whether it blocks merges. If advisory, the gate is not enforced in CI, so the owner should not treat a local pass as protection.

## Conditions for D (testable)
1. Measure BATCH=32 + C2 with the same harness. Accept only if drift is at most 1/69 and holdout accuracy is at least 87.5%. Not measured today.
2. Add the C2 contracts above; each must fail first on main.
3. Add the tutor-setup failing test plus its off-course guard before any fix.
4. Chair fixes the Alan Turing expected action before any run.
5. Correct drift-measure-3.md lines 39-40 (c-obs-1, h-d-ai-art) before it is cited.
6. No tuning against the holdout (it is burned). Any BATCH=1 ship waits for a new holdout (#136 part 3).
7. Re-run the Linux list above; a drift difference between platforms blocks the merge.

## Unknown / UNVERIFIED
- BATCH=32 + C2 result: not measured in the brief.
- Linux behavior and cross-machine determinism: not run.
- Whether the PR eval blocks merges: not checked.
- The ADR section 7 holdout rules: only lines 140-147 and 181-189 were read.
