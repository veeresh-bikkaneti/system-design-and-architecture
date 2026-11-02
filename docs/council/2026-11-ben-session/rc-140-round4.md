# Reality Checker round 4: PR #140 head 3a6e265

Verdict: VERIFIED WITH CONCERNS. Both round-3 defects are fixed. No blocking finding. Mergeable on the Chair's acceptance of the disclosed trade-off, plus three non-blocking Minors (disclosure gaps, no code change required).

## Round-3 defects
| Defect | Status | Evidence |
|---|---|---|
| 1. bare `(set up|install) ben` pinned Ben-name look-alikes | FIXED | 5 round-3 look-alikes now redirect under off_topic vote(3) (probe + 5 tests, which fail on d375ebc) |
| 2. HUMAN_TUTOR over-blocked school/homework setups | FIXED | the 4 round-3 phrases now pin; tests fail on d375ebc |

## Step 1: scope
- HEAD 3a6e265 (verified). Diff vs d375ebc: EVIDENCE_LOG.md, router.ts, semantic.test.ts only. evals/ untouched. 0 bytes of 0x08 in router.ts.
- Test change: "help me setup the tutor program for school" was moved from the redirect list (it now pins, the disclosed trade-off).

## Step 2: failing-first (verified)
d375ebc router + 3a6e265 tests: 9 failed / 62 passed (71). Failing: install ben 10 game; set up ben and jerry's account; install ben affleck fan page; set up ben's birthday party; install ben.exe on windows; pins for: setup the tutor at school; set up the tutor for my school computer lab; set up the tutor for homework help; how do I install local AI at school. Restored: 71/71.

## Step 3: gates (verified, this run)
npm test 48 files / 537 passed; lint exit 0 (warnings only); content:check 0; content:validate 0; build (VITE_BASE_PATH set) exit 0, snapshot-budget OK, reverted; eval:ben exit 0: all 88.1, holdout 87.5, drift 1.4, top-1 93.2, top-3 96.1 (matches claim), reverted. gh checks: CodeQL, Analyze, Ben routing gate (advisory), GitGuardian all SUCCESS; MERGEABLE, state OPEN.

## Step 4: probes via route(), off_topic vote vec(3), 3a6e265 (old = d375ebc)
(a) Must NOT pin. Fixed (redirect now, old pinned): install ben 10; set up ben's account; install ben stiller movie; setup ben&jerrys; install ben-hur; install ben 10 now; set up ben & jerry's; install ben for free movie; install ben 10, please; install ben's app (curly apostrophe); install ben 10 for me; set up ben: the game; install ben (the movie); set up ben then; install ben the builder game; plus the 5 round-3 cases. Round-1/2 look-alikes all still redirect (tutor business, near me, ben franklin, ben setup meme, local ai on my gpu, kid, schedule, son, business, kid homework).
STILL PINS (false positives, Minor):
- install ben, the movie; install ben, the rat movie; set up ben, jerry and the party; set up ben, my uncle, a birthday card (comma+space is accepted as "punctuation").
- set up ben now playing on netflix ("now" polite word).
- set up ben. my friend ben; install ben. (arguably legit, also caught by trailing-ben rule).
Severity: Minor. Require a Ben-name collision with a comma or "now" right after the name, under an off_topic vote. Contrived. Non-blocking.
(b) MUST pin: all pass (pin tutor-loop): set up Ben for me; install Ben now; install Ben, please; set up Ben!; help me set up Ben again; can you install Ben?; set up Ben, thanks; install Ben pls; set up ben plz; install ben again; please set up Ben; set up Ben.; install Ben for me please; set up the tutor at work; set up the tutor for school; setup the tutor at school; ...school computer lab; ...homework help; install local AI at school; my school blocks webgpu, how do I set up the tutor; plus all round-1/2/3 legit phrases (help me setup the tutor, set up Ben please, install Ben, set up my AI env, etc.).
Legit phrases that REDIRECT under an off_topic vote (Ben + trailing words not on the allow-list):
- set up Ben at school; set up Ben for homework; install Ben for homework help; set up Ben on my school chromebook; set up the tutor on my school laptop (own-box); how do I get Ben running on my device (disclosed gap).
- Regressions vs d375ebc (old pinned, new redirects), NOT disclosed: set up Ben so I can study; install Ben at work; setup ben for my class; how do I set up Ben on my phone.
Severity: Minor. Inherent consequence of the chosen rule (bare Ben is ambiguous, so require a terminator). Only under an off_topic vote; how often a real-embedding vote does that for these phrasings is UNVERIFIED. Non-blocking.
Non-Ben phrase pinning: only "set up the tutor program for school" and "help me setup the tutor program for school" (disclosed trade-off) plus the comma/now cases above.

## Step 5: regression sweep (verified)
Method: all 201 phrases (153 cases.json + 48 holdout.json) x vote axes 0..5 = 1206 combos, route() with d375ebc router vs 3a6e265 router, compared action plus pinned lessons. Flips: 0.

## Step 6: disclosure
PR body discloses: known gaps (device-running phrase, Ben-before-verb), "set up Ben please" no longer a gap, "tutor program for school" trade-off flagged "needs Chair acceptance or a fix", not-mergeable-until-round-4. EVIDENCE_LOG round-3 entry discloses the same. Not disclosed: the comma/"now" false pins, and the new redirects listed above (Ben + trailing context).

## Findings
Blocking: none found. The one open decision is the Chair's acceptance of the "tutor program for school" trade-off (the PR body already asks for it). If the Chair does not accept it, it is blocking.
Minor (non-blocking):
1. Comma/"now" after Ben still pins Ben-name collisions (see above).
2. Legit "set up Ben at school / for homework / so I can study / at work / for my class / on my phone" redirect under an off_topic vote; four of these regressed vs d375ebc. Undisclosed.
3. Disclosure gap: add findings 1 and 2 to the known-gaps line in PR body and EVIDENCE_LOG.

## NOT RUN
e2e (Playwright), real browser, CI/Linux locally, real-embedding votes (all probes use synthetic vec(3)), BATCH=1 eval.

## State left
Worktree rc140b detached at 3a6e265, clean (git status empty); probe files removed from src/. Scratch left in .claude/worktrees/_scratch/: r4.new.ts, r4.d375.ts, r4-build.txt, r4-eval.txt, rc140-r4-probe-out.txt, this report.
