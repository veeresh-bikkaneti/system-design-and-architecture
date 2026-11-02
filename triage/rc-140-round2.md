# Reality Check round 2: PR #140 (head 053e90e)

VERDICT: VERIFIED WITH CONCERNS (F1 mostly fixed, one look-alike still pins; F2 disclosed; one disclosure nuance)

| Finding | Status | Evidence (verified) |
|---|---|---|
| F1 look-alikes pinned under off_topic vote | FIXED for all 5 named + 8 of my 9 extras; 1 residual | All 5 named now redirect (probe, old router pinned all). Failing-first: old router -> 5 failed/53 passed; new -> 58/58. Residual: "setup the tutor for my kid homework" still pins tutor-loop (matches "the tutor"). |
| F2 blind phrasing undisclosed | FIXED (disclosure) | PR body "Known gap" line and EVIDENCE_LOG.md fix-round entry name "how do I get Ben running on my device"; cases.json/holdout.json untouched by 053e90e. |

## Commands (all in worktree rc140b)
- Head 053e90e confirmed (gh headRefOid and git). `git diff 6be2d4d HEAD --stat`: EVIDENCE_LOG.md, router.ts, semantic.test.ts only (3 files, +37/-6). PASS
- `grep -c $'\x08' router.ts` = 0. Regexes show real `\b`. PASS
- Failing-first: old router.ts swapped in -> 5 failed, 53 passed (the 5 look-alike tests); restored -> 58/58. PASS
- npm test: 48 files, 524/524, exit 0. PASS
- npm run lint: exit 0 (warnings only, pre-existing react rules in unrelated files).
- content:check OK; content:validate OK (41 lessons).
- `VITE_BASE_PATH=/system-design-and-architecture/ npm run build`: exit 0, snapshot-budget OK; dirtied public/llms.txt, public/sitemap.xml, worker/migrations/0006_qa_chunks.sql, worker/src/qa/curriculum.ts; reverted with `git checkout -- .` (clean after).
- npm run eval:ben: exit 0. all 88.1%, holdout 87.5%, drift 1.4%, top-1 93.2%, top-3 96.1%. Matches claim. REPORT.md reverted.

## Probes (route() with vec(3) = off_topic vote, 8-dim test index; old = router.ts from 6be2d4d)
(a) must NOT pin (new / old):
- how do I set up a tutor business: redirect / pinned
- set up a tutor for math lessons near me: redirect / pinned
- install ben franklin biography: redirect / pinned
- ben setup meme: redirect / pinned
- setup local ai on my gpu: redirect / pinned
- install ben franklin: redirect / pinned
- set up a tutor for my kid: redirect / pinned
- hire a tutor and set up a schedule: redirect / pinned
- help me set up the tutor in python: redirect / pinned
- **setup the tutor for my kid homework: STILL PINS tutor-loop** (old also pinned)
(b) must still pin: help me setup the tutor, how do I set up the tutor, can you help me set up Ben, help me set up local AI, set up my AI env: all pin tutor-loop. PASS. Also "install Ben", "can you help me install Ben" pin.
(c) Regression sweep: all 201 phrases in cases.json + holdout.json, each routed with old and new router at vote axes 0-5 (course, tech, debate, off_topic, self, CAP) = 1206 combos; compared action+pinned. Flips = 0. Caveat: synthetic vectors, not real embeddings; but the only changed branch is `if (offCourse)`, and axes 2/3 exercise it.
Probe file (throwaway): C:\Users\veere\source\repos\system-design-course\system-design-and-architecture\.claude\worktrees\_scratch\rc140b-probe.test.ts

## Findings
Important: none blocking.
Minor 1: "setup the tutor for my kid homework" (and likely any "the tutor" + setup verb, e.g. "set up the tutor for my class") still pins under off_topic. The "the tutor" signal is inherently ambiguous; same ceiling class as the documented one. Not disclosed in PR body. (verified for that phrase; others inferred)
Minor 2: "set up Ben please" was pinned at 6be2d4d under off_topic and now redirects. That is a behavior regression versus the previous PR head, though not versus main (UNVERIFIED against main). PR body words it as "still redirect", which reads as pre-existing; it is a trade-off made by this commit (documented in the ponytail comment in router.ts).
Minor 3: the `isTutorSetupQuestion` non-off-topic path is unchanged, so behavior outside the off_topic/debate branch is identical (verified by zero flips).
Scope: no threshold/gate/exemplar/BATCH change in 053e90e (diff is the three files above, verified). PR vs main touches cases.json (+2 cases, from earlier commits, not 053e90e).

## NOT RUN
e2e (Playwright), real browser, Linux/CI, BATCH=1 eval, real-embedding off_topic vote on look-alike phrases (probes use synthetic vec(3)).

## Cleanup
Worktree rc140b left in place with node_modules and untracked scratch (.claude/worktrees/_scratch/ inside it); tracked files clean (git status empty). Not removed, since it contains untracked scratch.
