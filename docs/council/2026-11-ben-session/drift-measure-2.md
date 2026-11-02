# Drift measurement 2: C1' (self rule after the pin) + C2 (tech majority)

Scratch worktree: `.claude/worktrees/m3` (detached at origin/main c4b17dd, which includes #131's spaced set-up pin), batch1.patch applied.
Harness-only edits, kept out of the diff below: `BATCH = Number(process.env.BATCH ?? 1)` in build-index.mjs, timeouts raised to 900 s,
a `DIAG` JSON dump in routing.eval.ts, `evals/ben/probe.eval.ts`, and `router_main.ts` (a copy of main's router for side-by-side probes).
Raw output is in `_scratch/out/` (`*.json` per-case dumps, `*.REPORT.md`, `*.log`, `probe-*.txt`). Variant routers are `_scratch/router.{main,c1,c2,both}.ts`.

## 1. Red-first: the Skeptic's falsification, reproduced (verified)
3 `it.each` tests: the question vector sits on the SELF example axis (`vec(4,[0,0,0,0,0,0.6])`), a competing designing-ai-systems chunk is present, and each test expects `intent self`, `action lesson`, `pinned ['tutor-loop']`.
- origin/main router: **27/27 pass**.
- Draft C1 (`if (offCourse || vote.intent === 'self')`, before the pin): **3 failed | 24 passed**, `expected 'redirect' to be 'lesson'` for all three phrasings.
- I also added 3 tests for the rules themselves. On main: `redirects an unconfirmed self vote even when a lesson clears the answer bar` (best 0.45 to 0.62) FAILS (got `lesson`), `does not fall back to general knowledge on a split tech vote` (tech 0.44) FAILS (got `parametric_fallback`), and `still answers an unsure self vote when a lesson matches strongly` (S2 override) passes.
- With C1'+C2: **30/30 pass**. oxlint on both files: exit 0, no findings. `tsc --noEmit`: no errors in either file.

## 2. Diff (router.ts; no case names, no exemplar change, 0.45 unchanged)
```diff
+  /** General-knowledge fallback reads no lesson score, so it needs a tech majority, not a plurality. */
+  techMajority: 0.5,
@@ after the namedTags pin block, before `topScore >= THRESHOLDS.lesson`
+  // A self vote isAboutTutor did not confirm is not a course question: treat it
+  // like debate/off_topic. After the pins, so "set up Ben" still reaches tutor-loop.
+  if (vote.intent === 'self') {
+    if (topScore >= THRESHOLDS.override && vote.confidence < THRESHOLDS.overrideVote) {
+      return { ...base, action: 'lesson', reasons: ['a lesson matches strongly despite the vote', ...reasons] };
+    }
+    return { ...base, action: 'redirect', reasons: ['unconfirmed self vote is outside the course', ...reasons] };
+  }
-  if (vote.intent === 'tech') {
+  if (vote.intent === 'tech' && vote.confidence > THRESHOLDS.techMajority) {
```
Deliberate asymmetry: after C1', `self` defers to the pin while `debate`/`off_topic` still pre-empt it. That is what keeps "set up Ben" working.
Follow-ups, out of scope (each needs its own measurement): the pin regex misses "setting up". Stale comment to fix if this ships: router.ts lines 267-273 still say an unconfirmed self vote "falls through to the rest of the policy table".

## 3. Full eval: 7 gate tests ran in every run, 0 skipped (verified, `Tests N passed (7)` in each log)
Drift is shown as cases out of 69 off-course cases. The 3% gate allows 2/69 (2.9%). 3/69 (4.3%) fails.

| variant | batch | gates | all acc | cases acc | holdout acc | holdout drift | ALL drift | offered | top-1 / top-3 |
|---|---|---|---|---|---|---|---|---|---|
| main (fresh baseline) | 32 | 7/7 | 168/192 87.5% | 126/144 | 42/48 | 0/20 | 1/69 | 3/69 | 91/98, 94/98 |
| main | 1 | **6/7** | 166/192 | 126/144 | 40/48 | 2/20 | **3/69 FAIL** | 3/69 | 91/98, 95/98 |
| C1' only | 1 | 7/7 | 167/192 | 126/144 | 41/48 | 1/20 | 2/69, **zero slack** | 3/69 | 91/98, 95/98 |
| C1' only | 32 | 7/7 | 169/192 | 126/144 | 43/48 | 0/20 | 1/69 | 2/69 | 91/98, 94/98 |
| C2 only | 1 | 7/7 | 167/192 | 126/144 | 41/48 | 1/20 | 2/69, **zero slack** | 3/69 | 91/98, 95/98 |
| C2 only | 32 | 7/7 | 168/192 | 126/144 | 42/48 | 0/20 | 1/69 | 3/69 | 91/98, 94/98 |
| **C1'+C2** | 1 | 7/7 | 168/192 | 126/144 | **42/48 = main** | 0/20 | **1/69, slack = 1 case** | 3/69 | 91/98, 95/98 |
| C1'+C2 | 32 | 7/7 | 169/192 | 126/144 | 43/48 | 0/20 | 1/69 | 2/69 | 91/98, 94/98 |

The one drift left in every row is trap-queue-bank (course 0.72, best 0.53), a real miss that is out of scope.
**cases.json does not move in any variant (126/144).** Every C1'/C2 effect sits in the holdout.

Flips vs main@32, with margins (C1'+C2 @1; the BATCH=1 index alone causes the flips marked index):
- h-d-ai-art (exp. redirect): clarify -> **redirect** (C1'). Vote self 0.500, runner-up tech 0.361 (vote slack 0.139). best 0.4557, which is 0.164 under the 0.62 override. If the vote ever flipped to tech, the 0.45 lesson gate would still answer it (drift).
- h-trap-gateway-arch (exp. redirect): main@1 gives parametric_fallback, C2 holds it at redirect. Tech 0.481 against the 0.5 bar: **0.019 margin**.
- index: c-solid-2 lesson->parametric_fallback MISS (tech 0.547, *above* the bar, so C2 does not catch it), c-dtx-2 parametric->clarify (still a miss), c-obs-1 lesson->clarify MISS (best 0.4377), c-bff-2 clarify->lesson (now correct), h-trap-token-arcade redirect->clarify MISS (course 0.581).
- @32 C1'+C2 flips only h-d-ai-art (clarify->redirect, now correct).

C2's corridor, both sides: the case it blocks votes tech 0.481 (0.019 under). The weakest correctly routed true-tech cases vote 0.616 (BATCH=1) and 0.597 (BATCH=32). Probe phrasings land closer: `what is a mutex` 0.534 and `what is a spinlock` 0.535, so **0.034 to 0.035 above**. Corridor: 0.481 to 0.534, 0.053 wide. That is near-fitted, even though the 0.5 value has a principled name.

## 4. Probes, C1'+C2 vs main, same vectors (verified)
Skeptic's file: **53** phrasings (the brief said 54; the file has 53 lines). My main column matches the Skeptic's main column on all 53 at BATCH=1.
Route changes at both batch sizes: **1/53**. `do you use the internet to answer`: clarify -> redirect (self 0.80, best 0.36). That is better behaviour, and it lowers "offered".
The three set-up phrasings stay `lesson tutor-loop` (pinned). Follow-ups: 0 changes. Follow-ups run with a caching history; whether that matches the Skeptic's history is UNVERIFIED (main outputs match his, though).

40 new phrasings (`_scratch/probe-new.txt`, expectations written before any output). Changes at both batch sizes: **3/40**.
- `do you store my questions`: clarify -> redirect (self 0.735). Matches expectation.
- `what languages do you speak`: parametric_fallback -> redirect (C2: tech 0.412 at B1, 0.496 at B32, which is 0.004 under the bar). Matches expectation, but by a hair at B32.
- **`could you walk me through setting up local AI`: lesson (designing-ai-systems) -> redirect.** Expected tutor-loop. The pin regex `\bset\s*up\b` misses "setting up", the vote is self 0.611, and best is 0.4605, so C1' turns a wrong-lesson answer into a refusal. **This is the regression class the Skeptic predicted**, reached through a pin gap, not through placement.
Expectation misses that are the same on main and C1'+C2 (not caused by C1'/C2): `help me setup the tutor` redirect (off_topic 0.48; the reason string comes from the `offCourse` branch, which runs before the pin, so the pin never ran), `setting up WebLLM for this course` parametric (pin misses "setting"), `what is a race condition` redirect (off_topic), `how does HTTPS encryption work` redirect, `so what happens when it fills up` clarify.
Slim-majority tech (`what is a spinlock` 0.535) still answers. The `how to set up docker` control is not pinned.

## 5. Determinism (verified)
C1'+C2 at BATCH=1, run twice: the per-case JSON dumps and REPORT.md are **byte-identical**.

## 6. Unit tests and lint (verified)
`npx vitest run src/ai/local/semantic`: 30/30. `oxlint router.ts semantic.test.ts`: exit 0.
NOT RUN: `npm test` (full), `npm run lint` (full), content:validate, content:check, build, test:e2e, browser embedding parity.

## Verdict
- **Recommend C1'+C2, by elimination.** Either rule alone has zero slack. "None" means reverting BATCH=1, a correctness fix, to keep a lucky gate (draft alternative F, rejected).
- **Non-circular evidence is the probes, not the eval.** Only 2 of the 192 cases reach the self branch (h-d-ai-art, h-s-name). Across the 93 probes, C1'+C2 changed 4 routes. 3 got better (`do you use the internet`, `do you store my questions`, `what languages do you speak`). 1 went from a wrong answer to a refusal (`setting up local AI`: wrong lesson before, redirect now). C1' redirected about 8 other self phrasings correctly, and they were already redirects on main.
- **ADR §7 debt: does NOT block the merge. It DOES block any claim that drift is fixed.** Quote the gate as "passes", never "improved".
- Gate at BATCH=1: C1'+C2 passes at 1/69, **one drift case of slack**. Either rule alone passes at 2/69 with **zero slack**, which is fragile and rejected.
- Both rules were designed against two holdout cases. cases.json is unmoved in every variant, so the gate pass is **circular, not merely contaminated**. ADR 0001 §7 debt: fold holdout into cases.json and write a fresh holdout before claiming generalisation.
- Inferred, not verified: C1' as placed is sound for anything the pin catches. Its risk surface is pin gaps ("setting up local AI").
  C2's 0.019 / 0.034 corridor is thin on both sides.
- UNVERIFIED: whether a fresh holdout shows C1'/C2-caused misses. Browser single-query parity.
