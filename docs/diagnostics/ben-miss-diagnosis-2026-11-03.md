# Ben routing: why the 61 misses miss (2026-11-03)

Read-only diagnostic for PR #199 (council record: `docs/council/2026-11-03-ben-blind-holdout.md`). No router, exemplar, threshold or label was changed. Regenerate the raw numbers with `node scripts/ben/diagnose-misses.mjs` (needs the model from `npm run ben:index`).

Run: 201 diagnosis + 103 blind = 304 cases, 243 correct (79.9%), 61 misses. Index content `d7cf5587d308a692`.

Labels: **VERIFIED** = read off the script output; **INFERRED** = my reading of why, not proven by an experiment.

## Gates after dropping the 3 collisions

| Gate | Value | Limit | Status |
|---|---|---|---|
| Accuracy | 79.9% | >= 85% | FAIL |
| Drift | 5.8% (6 of 104 off-course) | <= 3.0% (3 cases) | FAIL |
| Offered (off-course got clarify) | 7.7% | <= 10% | pass |
| Course turned away | 3.8% | <= 8% | pass |
| Lesson top-3 | 96.8% | >= 90% | pass |

Two consecutive `eval:ben` runs produced an identical `REPORT.md`.

## How the router decides (router.ts, VERIFIED by reading)

1. Rules (blocked topic, about-Ben, follow-up) come first.
2. An `off_topic` or `debate` vote redirects unless `topScore >= 0.62` and vote share `< 0.6`.
3. Unique-tag pin, then `topScore >= 0.45` means lesson.
4. Else a `tech` plurality vote means parametric_fallback.
5. Else `topScore >= 0.33` means clarify, else redirect.
6. A `self` vote alone does nothing (deliberate drift fix, router.ts:333); only the regex `isAboutTutor` yields self.

Exemplar bank (VERIFIED): course 60, tech 34, debate 32, off_topic 54, self 18 = 198. All 34 tech exemplars are `What is X?` definitions (Jenkins, Python, Git, compiler...). None is "how do I", "explain" or "X vs Y". 21 of the 54 off_topic exemplars start "How do I".

## Misses by cause

| # | Group | n | Cases | Cause |
|---|---|---|---|---|
| G1 | General coding goes to redirect/clarify (tech never wins the vote) | 7 | n-t-055, 057, 060, 062, 063, 067, h-t-postman | Exemplar shape gap |
| G2 | Course vote wins, topScore 0.34-0.45, so clarify | 16 | c-part-2, c-cloud-2, c-rate-2, c-dtx-2, c-obs-1, c-acl-1, h-c-dip, h-c-kafka-batch, n-c-002, 006, 014, 017, 028, 029, 044, 048 | Clarify band wide; best section scores low for symptom phrasing |
| G3 | Course question overruled by an off-course vote | 4 | c-mpp-2, n-c-008, n-c-050, c-shard-1 | Override rule strict / exemplar echo |
| G4 | Course question, no close chunk, non-course vote | 2 | n-c-042, n-c-003 | Symptom phrasing shares no vocabulary with lessons |
| G5 | Course question, tech vote wins | 3 | c-solid-2, c-raft-2, n-c-018 | "What is X" shape pulls the tech exemplars |
| G6 | Lesson route, wrong lesson | 10 | c-repl-1, c-repl-2, c-dtx-1, c-ai-1, c-es-2, n-c-007, 009, 010, 012, 036 | Ranking, or label strictness |
| G7 | Off-course question gets clarify | 7 | trap-cache-feelings, h-trap-stream-river, h-trap-token-arcade, h-d-ai-art, n-d-079, n-o-084, n-o-086 | Lexical false friends |
| G8 | Off-course answered (5 drift) plus one tech mis-pin | 6 | trap-queue-bank, n-d-071, n-d-077, h-trap-gateway-arch, n-d-072; t-hashtable (tech, pinned to url-shortener) | Real course/tech overlap; some label doubt |
| G9 | Ben-directed question not routed to self | 6 | h-s-name, n-s-103, 104, 105, 106, 107 | No self-by-vote branch |

Total 7+16+4+2+3+10+7+6+6 = 61. The 6 drift cases are the 5 off-course in G8 plus n-s-107 (G9).

## Answers

### (a) Why do general-coding questions end as redirect? (numbers VERIFIED, cause INFERRED)

| id | question | winning vote | tech share | topScore | branch |
|---|---|---|---|---|---|
| n-t-055 | center a div | course 0.44 | 0.00 | 0.14 | no lesson close enough |
| n-t-057 | sql left vs inner join | course 0.66 | 0.00 | 0.25 | no lesson close enough |
| n-t-060 | undo git commit | off_topic 0.43 | 0.32 | 0.16 | off_topic outside the course |
| n-t-062 | chmod 755 | course 0.54 | 0.35 | 0.25 | no lesson close enough |
| n-t-063 | csv with pandas | off_topic 0.48 | 0.43 | 0.19 | off_topic outside the course |
| n-t-067 | docker volumes | course 0.73 | 0.27 | 0.43 | clarify |
| h-t-postman | what is postman | course 0.58 | 0.42 | 0.25 | no lesson close enough |

Tech is never the plurality. A tech vote goes to fallback (router.ts:352), so these are vote failures, not threshold failures. Nearest exemplars:

- 055: off_topic "How do I split a pizza evenly" 0.19, course "can u explain sharding simply" 0.19, off_topic "How do I grow tomatoes" 0.18. No tech exemplar in the top 7.
- 062: course "difference between authentication and authorization" 0.28; tech "What is functional programming?" 0.20.
- 060: tech "What is Git used for?" 0.41 is closest, but four off_topic "How do I..." neighbours (0.22-0.26) outweigh it.
- 063: tech "What is Python?" 0.29, then off_topic "How do I load the dishwasher" 0.20.

Cause (INFERRED): the tech bank is 34 definitions, so a coding question in "how do I" or "X vs Y" shape lands nearest the "How do I..." lifestyle exemplars or the course trade-off exemplars. All similarities are small (0.14-0.29), so shape beats topic.

### (b) Course questions in symptom phrasing -> clarify/redirect (VERIFIED)

G2 (16): course vote share at least 0.55 in all, at least 0.69 in 14. topScore 0.34-0.45: above the 0.33 clarify gate, below the 0.45 lesson gate. Examples: c-cloud-2 vote 1.00, top 0.43; c-obs-1 1.00, 0.44; c-rate-2 0.86, 0.40; h-c-dip 0.89, 0.41; n-c-044 0.85, 0.43; n-c-014 0.88, 0.34. In 14 of 16 the top-ranked lesson is the labelled one (REPORT.md); the exceptions are c-obs-1 (caching-strategies) and n-c-044 (load-balancers). So retrieval is mostly right; the best section just scores 0.34-0.44.

G4 (2): n-c-042 "posted a comment, refreshed, it vanished" has self vote 0.62 (nearest exemplar "Hi there" 0.30), top 0.23. n-c-003 "replace an old system gradually" has course vote 0.69 but top 0.33 (best chunk is stream-vs-batch; the strangler idea lives in the ACL lesson). INFERRED: symptom phrasing shares no vocabulary with the lesson prose.

### (c) Debate, self, off-topic misses

- **G7, off-course to clarify (7), VERIFIED:** course vote 0.51-0.66 (h-d-ai-art is self 0.50), topScore 0.34-0.43. n-o-084 "sturdy raft for a river camping trip": nearest exemplar is course "How does Raft elect a new leader" at 0.45. n-o-086 "tokens at the arcade": course "OAuth tokens" 0.21. Single words (raft, tokens, stream, cache) win. INFERRED: the small embedder leans on word overlap.
- **G8 drift (5), VERIFIED numbers:** n-d-071 "is AI going to take our jobs": self vote 0.42 (nearest "Are you an AI?" 0.57), top 0.49 on designing-ai-systems, so the 0.45 gate answers it. n-d-077 "AWS vs Azure vs GCP": course 0.86, top 0.47. trap-queue-bank: course 0.72, top 0.53. n-d-072 "python vs javascript": tech 0.91 (label says debate; arguably a tech question, label doubt, INFERRED). h-trap-gateway-arch: tech 0.48, top 0.27.
- **G9, self (6), VERIFIED:** n-s-103 "how do i use you" has self vote 1.00 and n-s-105 has 0.81, yet both redirect (top 0.29 and 0.32, no self branch). h-s-name has self 0.56. n-s-106 loses to off_topic 0.40 vs self 0.34; n-s-107 is tech 0.61 (and counts as drift); n-s-104 is course 0.56. Three of six have a self plurality that the router ignores by design.
- **G3, overruled (4), VERIFIED:** c-mpp-2 "what is the strangler fig pattern": off_topic vote 0.63 with top 0.58. n-c-008 (offensive search suggestions): debate 0.54 with top 0.57. Override needs top >= 0.62 and vote < 0.6, so both redirect. n-c-050: off_topic 0.50 (nearest "How do I split a pizza" 0.37), top 0.38. c-shard-1 "resharding painful": off_topic 0.46 ("painful memory"), top 0.26.

### (d) Single change class per group, no threshold lowered (all effects INFERRED)

| Group | Change class | Expected effect | Drift risk |
|---|---|---|---|
| G1 (7) | Exemplar additions: "how do I", "X vs Y", "explain" coding questions as `tech`. Wait for the owner's scope answer (council outcome item 4). | Up to +7 correct (2.3 points) | Low on off-course; may push more course questions to fallback (G5) |
| G2 (16) | Clarify-band policy: answer from the top lesson when the course vote is >= about 0.8 and topScore is in the band. On this data 8 of 16 pass, but 2 of them (c-obs-1, n-c-044) have the wrong top lesson, so +6 correct (c-cloud-2, c-rate-2, c-acl-1, h-c-dip, h-c-kafka-batch, n-c-006). No off-course miss reaches 0.8 (max 0.66). | About +6 (81.9% accuracy). Tuned on the same cases, so it needs a fresh blind set | None seen, unproven |
| G3, G4 (6) | Chunk coverage (symptom-phrased sections in ACL and replication lessons) plus an override tweak for strong chunks (top >= 0.55 vs a weak off-course vote) | +2 to +4 | Moderate: n-d-071 and n-d-077 sit at 0.47-0.49 |
| G5 (3) | Exemplar additions: course "what is X pattern" questions (strangler fig, RAG, Raft, Liskov) | +3 | Low, but conflicts with the G1 additions |
| G6 (10) | Label review first (Skeptic judged about 5 plausible alternatives). Not a router change. Never relabel to make cases pass. | Up to +5, by honest relabel only | None |
| G7, G8 (13) | Vote weighting that discounts neighbours under about 0.25 (noise), or near-miss off-topic exemplars (risk of tuning to the test) | Moving G7 to redirect: offered 7.7% to about 1%, +7 correct | Drift: G8 needs a vote or chunk fix; unclear |
| G9 (6) | Vote weighting: a self vote >= 0.8 with topScore < 0.45 yields self, guarded against the "who is X" actor bug (router.ts:333) | +2 (n-s-103, n-s-105) | Low if guarded |

Best case G1 + G2 + G5 + G9 is about +18 of 304, 85.9%: at the 85% gate, assuming no regressions (ADR 0001 section 7 records an earlier exemplar round that regressed the holdout, so this is optimistic). Drift only moves with G3, G4, G7, G8 and G9 fixes; the 3.0% gate allows 3 of 104 off-course cases, and there are 6 now.

## Caveats

- The script uses the same embedder and one-question-at-a-time embedding as the eval; index bytes vary by runner class (council record). This run used the laptop build, hash `f9feac54...`.
- G6 and several G8 items involve labels written by grep only; inspect before acting.
- Effects are counts on the same 304 cases the diagnosis read, not predictions for unseen questions.
