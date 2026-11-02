# Reality Check round 3: PR #140 (head d375ebc)

VERDICT: VERIFIED WITH CONCERNS. Both round-2 Minors are fixed and verified. But the fix commit introduces a new false-positive class (a bare "Ben" after a setup verb now pins tutor-loop under an off_topic vote for non-tutor sentences). That is a defect in the PR's own scope, so per the repo constitution it is NOT mergeable as-is: either fix it or the owner explicitly accepts and discloses it. PR body is also stale. No Critical finding.

## Round-2 Minors

| Minor | Status | Evidence (verified) |
|---|---|---|
| 1. "setup the tutor for my kid homework" pinned under off_topic | FIXED | new router: redirect; 053e90e router: lesson:tutor-loop. Also fixed: "help me setup the tutor program for school", "setup the tutor for my son". |
| 2. "set up Ben please" regressed pin -> redirect | FIXED | new: lesson:tutor-loop; 053e90e: redirect. Same for "install Ben please". |

## Commands (worktree rc140b, detached at origin/fix/ben-setup-pin-order)
- Head d375ebc (git and `gh pr view` headRefOid d375ebc60b07...). `git diff 053e90e HEAD --stat`: EVIDENCE_LOG.md (+1), router.ts (+10/-7), semantic.test.ts (+10): exactly 3 files, 21+/7-. evals/ untouched (cases.json, holdout.json not in diff). `grep -c $'\x08' router.ts` = 0. PASS.
- Failing-first: router.ts swapped from 053e90e, `npx vitest run src/ai/local/semantic`: 4 failed / 58 passed (the 4 new tests: kid homework, program for school, "set up Ben please", "install Ben please"). Restored: 62/62. PASS, matches claim.
- `npm test`: 48 files, 528/528, exit 0. PASS. (First run showed 1 failed file: a stale untracked scratch probe of mine importing a deleted file; removed, rerun clean. Not a PR issue.)
- `npm run lint`: exit 0 (warnings only, pre-existing react rules in kofi components).
- `content:check` exit 0; `content:validate` OK, 41 lessons.
- `VITE_BASE_PATH=/system-design-and-architecture/ npm run build`: exit 0, snapshot-budget OK. Generated files reverted with `git checkout -- .`.
- `npm run eval:ben`: exit 0. all 88.1%, holdout 87.5%, drift 1.4%, top-1 93.2%, top-3 96.1%. Matches claim. REPORT.md reverted.
- CI on PR (gh): Analyze, Ben routing gate (advisory), CodeQL, GitGuardian all SUCCESS; mergeable MERGEABLE.

## Probes: route() with off_topic vote (vec(3), 8-dim test index), new d375ebc vs old 053e90e
(a) Must NOT pin
| Phrase | new | old |
|---|---|---|
| how do I set up a tutor business | redirect | redirect |
| set up a tutor for math lessons near me | redirect | redirect |
| install ben franklin biography | redirect | redirect |
| ben setup meme | redirect | redirect |
| setup local ai on my gpu | redirect | redirect |
| install ben franklin | redirect | redirect |
| set up a tutor for my kid | redirect | redirect |
| hire a tutor and set up a schedule | redirect | redirect |
| set up a tutor for my business | redirect | redirect |
| i need a tutor near me, set up an account | redirect | redirect |
| setup the tutor for my kid homework | redirect | PINNED |
| help me setup the tutor program for school | redirect | PINNED |
| setup the tutor for my son | redirect | PINNED |
| set up ben for my son's homework | redirect | redirect |
| **install ben 10 game** | **PINNED** | redirect |
| **set up ben and jerry's account** | **PINNED** | redirect |
| **install ben affleck fan page** | **PINNED** | redirect |
| **set up ben's birthday party** | **PINNED** | redirect |
| **install ben.exe on windows** | **PINNED** | redirect |

(b) Must pin
| Phrase | new | old |
|---|---|---|
| help me setup the tutor | pin | pin |
| how do I set up the tutor | pin | pin |
| can you help me set up Ben | pin | pin |
| help me set up local AI | pin | pin |
| set up my AI env | pin | pin |
| set up Ben please | pin | redirect (fixed) |
| install Ben please | pin | redirect (fixed) |
| install Ben | pin | pin |
| how do I set up the tutor loop | pin | pin |
| set up the tutor for my lessons | pin (acceptable: ambiguous, harmless, tutor-loop is the right lesson if they mean the lesson topic) | pin |

(c) Legit Ben setup that now redirects because of HUMAN_TUTOR (new regression vs 053e90e, all under off_topic/debate vote only)
- setup the tutor at school: redirect (old pin)
- set up the tutor for my school computer lab: redirect (old pin)
- my school blocks webgpu, how do I set up the tutor: redirect (old pin)
- set up the tutor for homework help: redirect (old pin)
- how do I install local AI at school: redirect (old pin)
Already redirecting at 053e90e and still: set up Ben for my son, set up the tutor on my school laptop, set up Ben at school, set up Ben so I can schedule lessons, set up the tutor on my kid's laptop (ben-before-guard cases were never pinned under off_topic).
Under a course vote (axis 0) every phrase above pins tutor-loop, so the exposure is only when the vote is off_topic/debate. Under real embeddings, whether these phrasings actually get an off_topic vote is UNVERIFIED.

## Regression sweep
Method: every question in evals/ben/cases.json + holdout.json (201 phrases) routed through 053e90e's router and d375ebc's router at vote axes 0..5 (course, tech, debate, off_topic, self, CAP), 8-dim synthetic index; compared action + pinned lessons. 1206 combos. Flips = 0. Caveat: synthetic vectors, not real embeddings; eval:ben (real embeddings, which exercises the real corpus) is also unchanged.

## PR body / EVIDENCE_LOG disclosure
- EVIDENCE_LOG.md: round-2 entry present; names the "how do I get Ben running on my device" gap and the Ben-before-verb gap. It does NOT disclose (1) the new Ben-collision pins (ben 10, ben and jerry's) or (2) that HUMAN_TUTOR now redirects legit school/homework/business Ben setups under an off_topic vote. Line 326 (round-1 entry) still says "set up Ben please" still redirects; that is historical and superseded by the round-2 entry (acceptable for append-only).
- PR body (gh): contains the round-1 section with the known gap "how do I get Ben running on my device" and "set up Ben please". No round-2 section was added, so the body is stale: it still lists "set up Ben please" as a known gap although it now pins, and does not mention HUMAN_TUTOR or the new regex. Minor, but the PR body should be updated.

## Findings
Important: none in the sense of safety/security. See "Mergeability".

Minor 1 (defect introduced by d375ebc, same class as the PR's own fix): `\b(set\s*up|setup|install)\s+ben\b(?!\s+franklin)` is a definite signal with only a franklin exclusion. "install ben 10 game", "set up ben and jerry's account", "install ben affleck fan page", "set up ben's birthday party", "install ben.exe on windows" now pin tutor-loop under an off_topic vote where 053e90e redirected. Verified with route() probes. Impact: an off-topic question shows the tutor-loop lesson instead of a polite redirect; no data/security impact. Likely rare. A fix would be to require Ben to end the clause or be followed by please/for me/on/and similar, or drop the alternative and rely on `please` handling.
Minor 2 (trade-off, undisclosed): HUMAN_TUTOR words are checked before any definite signal and include "school", "business", "schedule", "hire". Legit "set up the tutor at school / school computer lab / install local AI at school / homework help" redirect under an off_topic vote. Not disclosed in PR body or EVIDENCE_LOG.
Minor 3: PR body not updated for round 2 (stale known-gap list).
Minor 4 (inferred, not run): "ben setup meme" and Ben-before-verb phrasings and "get Ben running" remain the documented ceiling.

Mergeability: Per AGENTS.md (defect in the PR's own scope = not mergeable), Minor 1 is a regression the fix commit introduced, so I state plainly: NOT mergeable until Minor 1 is fixed (preferred, one-regex change plus 2 tests: ben 10 / ben and jerry's) or the owner explicitly accepts it and it is disclosed in the PR body and EVIDENCE_LOG. Everything else is mergeable-quality. Minors 2 and 3 should be disclosed/updated regardless. Scope check: no threshold/gate/exemplar/BATCH change; 3 files.

## NOT RUN
e2e (Playwright), real browser, Linux/CI-side re-run of my own (only gh-reported check status), BATCH=1 eval, real-embedding off_topic votes on the probed phrases (all probes use synthetic vec(3)).

## Cleanup
Worktree .claude/worktrees/rc140b left in place at detached d375ebc; tracked files clean (git status empty); node_modules present. Temporary router.old.ts and probe removed from it. Scratch files kept outside tracked tree: .claude/worktrees/_scratch/rc140b-probe3.test.ts (needs router.old.ts = `git show 053e90e:src/ai/local/semantic/router.ts` placed beside router.ts to rerun), rc140-r3-probe-out.txt (empty, ignore), rc140b-old-probe.txt (retired round-2 probe).
