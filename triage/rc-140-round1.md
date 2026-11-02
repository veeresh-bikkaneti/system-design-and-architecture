# Reality check PR #140 (fix/ben-setup-pin-order, head 6be2d4d)
Env: Windows 11 (10.0.26300), node v26.13.0, Git Bash. Worktree: C:\Users\veere\source\repos\system-design-course\system-design-and-architecture\.claude\worktrees\rc140 (left in place, clean).
Verdict: VERIFIED WITH CONCERNS

## Commands (cwd = rc140), all after `npm ci` (0 vulns)
- npx vitest run src/ai/local/semantic -> 1 file, 51/51 pass
- npm test -> 48 files, 517/517 pass
- npm run lint -> 0 errors (pre-existing warnings only)
- npm run content:check -> OK; content:validate -> 41 lessons OK
- VITE_BASE_PATH=/system-design-and-architecture/ npm run build -> OK, snapshot-budget OK. It rewrote public/llms.txt, public/sitemap.xml, worker/migrations/0006_qa_chunks.sql, worker/src/qa/curriculum.ts; reverted with git checkout --. Nothing committed.
- npm run eval:ben -> gate test 7/7; all 88.1%, holdout 87.5%, drift 1.4%, top-1 93.2%, top-3 96.1%. Matches expected. Miss list shows the same entries as the author's claim (not diffed against a main run: I did not run main; "zero flips" UNVERIFIED by me, numbers match). REPORT.md reverted.

## Step 3 red on old code
Swapped router.ts with origin/main's, ran semantic.test.ts: 4 failed | 47 passed. Failing: "help me setup the tutor", "how do I set up the tutor", "can you help me set up Ben", "help me set up local AI". Text: AssertionError: expected 'redirect' to be 'lesson'. Restored; status clean. Matches claim exactly.
Single commit (0904c8e fix + tests together) weakens the history-level failing-first proof; step 3 restores it. Minor.

## Step 4 diff review
Files: router.ts, semantic.test.ts, cases.json, EVIDENCE_LOG.md only. No threshold/gate/exemplar/BATCH change.
Pin object: pinTags() body is field-for-field the old block (action, lessons, pinned, reasons order). Offcourse call is pinTags(namedTagLessons(q)), the same input the old block used. Other pins keep order (non-offCourse path unchanged, router.ts:320-321). VERIFIED.
Setup pin sits after isOffCourseTopic hard block, isFollowUp/isAboutTutor and focus pin, so blocked topics and self still win.

Adversarial probe (namedTagLessons only; the pin is vote-independent). Under an off_topic vote OLD = redirect, NEW = pin when listed:
- pins: setup the tutor for my kid homework; help me set up the tutor in python; install ben; ben setup meme; tutor setup; how do I set up a tutor business; help me setup the tutor program for school; install ben franklin biography; set up a tutor for math lessons near me; setup local ai on my gpu; install webllm; hire a tutor, set up a schedule.
- no pin (still redirect): who is Tom Hanks; set up my netflix account; set up my smart tv.
Cause: router.ts:151-152 `setup && tutor` returns true BEFORE the ownBox guard (router.ts:160-163); the guard words (python, gpu, docker, laptop...) only apply to the "ai env" branch.

## Step 5 eval hygiene
Added cases (cases.json:145-146) tutor-setup-1/-2: id/schema match neighbours (id,q,intent,action,lessons); 0 hits in holdout.json. OK.
Swap: author replaced a missed blind phrasing ("how do I get Ben running on my device") with an easier one. It IS disclosed in EVIDENCE_LOG.md:324 as a separate gap, not widened. It is NOT in the PR body (body mentions neither it nor the swap) and not filed as a known-gap case/ticket. Under ADR 0001 a hidden miss is a hygiene problem; log disclosure partly mitigates. Also, log admits the new eval cases may not even have an off_topic vote at BATCH=32, so they pass on main too? (UNVERIFIED: I did not run them against main router.) Unit tests are the real proof.

## Step 6 trailers
All 3 commits carry Co-Authored-By: Claude Sonnet 5.5 + Claude-Session. PR footer has the robot line + session URL. OK.

## Findings
Important: router.ts:151-152 (reached via :303) the setup pin runs under off_topic/debate votes with no own-environment guard, so non-Ben phrasings that used to redirect correctly now pin tutor-loop: "how do I set up a tutor business", "set up a tutor for math lessons near me", "install ben franklin biography", "ben setup meme", "setup local ai on my gpu". The PR's own negative tests cover only the aiEnv branch. Pre-existing under other votes, but the PR widens it into the off_topic vote where redirect was right. Suggest a guard (ownBox / business / name words) on the setup&&tutor branch or tests documenting the accepted tradeoff.
Important: swapped-case miss not in PR body or tracked as a known gap (EVIDENCE_LOG.md:324 only).
Minor: red tests and fix share one commit (0904c8e); step 3 re-proves red.
Minor: EVIDENCE_LOG dated 2026-11-02 while today is 2026-11-01 (cosmetic).

## NOT run
e2e (Playwright), Linux/CI, real browser, BATCH=1 eval, eval on origin/main for flip diff, new eval cases against old router.
