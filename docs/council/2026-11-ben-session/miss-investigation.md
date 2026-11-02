# PR #135 (fix/ben-chunk-fragments): why 7 eval cases flipped

Read-only investigation, 2026-11-01. Scratch worktrees of origin/main (f2dcd70 base) and origin/fix/ben-chunk-fragments (c7c31c7).
Eval run with `npx vitest run --config vitest.eval.config.ts` plus a scratch diagnostic that dumps top lessons and chunk scores per case.

## Verdict first

- **Mostly (i), with one small real regression, so (iii) leaning (i).** 5 of the 7 misses come from batch-padding noise in the index build. They aren't caused by chunk content.
- **Only one real accuracy loss: c-solid-1.** c-ai-2 still passes once batch noise is removed, but its definition chunk lost retrieval quality.
- **The real regression is one mechanism.** Dropping a trailing `:` lead-in sentence frees up words, so prose on both sides of a stripped code fence or diagram packs into one window. The merged chunk is diluted. Confirmed for `solid-principles` (open/closed) and `designing-ai-systems` (vector DBs). It also deletes one sentence that carried real content: "The entire field is one triangle — **recall vs. latency vs. cost** — and every index is a point on it:" (designing-ai-systems.mdx:293). The next paragraph still says "the point on the triangle".
- **Recommendation: ship with one narrow fix.** Make a stripped block (code fence, diagram, JSX component) a hard window boundary. That's structural, not tuned. Guard-only isn't possible: the guard fails on main's 189 fragments, so it can't land without the chunker change.

## Key evidence: the eval moves on chunks whose text didn't change

`build-index.mjs` embeds chunks in batches of 32 (`BATCH = 32`, `embedAll`). With 779 → 763 chunks, every chunk after the first change lands in a different batch, so its padding changes and so does its vector. The eval file says it outright: "batching pads and shifts scores". Same text, same question, different score:

| chunk (identical text on both branches) | main | branch | delta |
|---|---|---|---|
| domain-driven-design#18 (Takeaways, 139w) | 0.4623 | 0.4368 | -0.0255 |
| zero-trust-security#9 (mTLS, 134w) | 0.4527 | 0.4473 | -0.0054 |
| data-partitioning#9 (Takeaways, 113w) | 0.3890 | 0.3667 | -0.0223 |
| solid-principles liskov "kitchen version" (46w) | 0.4543 | 0.4412 | -0.0131 |

These swings are as big as or bigger than the main-side margins over the 0.45 `lesson` gate.

**Control run: I embedded each chunk alone (`BATCH = 1`), which is how the browser embeds the query.** Scratch edit only.

| run | all | cases | holdout | top-1 |
|---|---|---|---|---|
| main, batch 32 (as shipped) | 87.5 | 87.5 | 87.5 | 92.9 |
| branch, batch 32 | 85.4 | 84.0 | 89.6 | 91.8 |
| main, batch 1 | 86.5 | 87.5 | 83.3 | 92.9 |
| branch, batch 1 | **87.0** | 87.5 | 85.4 | 91.8 |
| branch + stripped-boundary fix, batch 32 | 89.1 | 89.6 | 87.5 | n/c |
| branch + stripped-boundary fix, batch 1 | 87.5 | 88.9 | 83.3 | n/c |

With the noise removed, main → branch flips are: **lost c-solid-1**, gained c-raft-2 and h-trap-stream-river. The branch comes out net +0.5pt. Just changing the batch mode on main flips 4 cases by itself (c-solid-2, c-bff-2, h-trap-gateway-arch, h-trap-token-arcade).

## Per case (scores are cosine; "best" includes the 0.08 name boost where it applies; gate lesson = 0.45)

| case | question | expected | main: action, top lesson best / top-3 chunks | branch: action, top lesson best / top-3 chunks | class |
|---|---|---|---|---|---|
| c-solid-1 | What does the open closed principle mean in practice? | solid-principles | lesson 0.5185; solid#5 .5185, solid#14 .3529, cap#0 .3460 | clarify 0.404; solid#5 .4040, solid#13 .3570, cap#0 .3384 | **(a)+(b) real**: lead-in "The usual violation is the switch statement…:" dropped. Section drops 153w → 139w, which fits one window, so post-fence payment prose merges into #5. Still lost at batch 1 (0.5007 → 0.3831). |
| c-solid-2 | explain liskov substitution with an example | solid-principles | lesson 0.4543; solid#8 .4543, solid#7 .4518, solid#13 .3216 | clarify 0.4422; solid#6 .4422, solid#7 .4412, solid#12 .3191 | **(d)/(e)**: winning chunk text identical, ids renumbered. Margin 0.004. Fails on main too at batch 1. |
| c-part-1 | What is a hot partition and why is it bad? | data-partitioning, sharding-strategies | lesson 0.469; dp#9 .3890, dp#6 .3836, cap#6 .3801 | parametric 0.4467; cap#6 .3793, dp#9 .3667, dp#8 .3362 | **(e) batch noise**: dp#9 identical text. Passes on both branches at batch 1. Side note: main's #2 chunk dp#6 was the fragment "moving hot data aside. A scatter-gather query…:" |
| c-bff-1 | Why would web and mobile clients need different backends? | bff-backend-for-frontend | lesson bff 0.5569 score vs api-gw 0.5470; api-gw#4 .6206, bff#0 .5754, bff#4 .5049 | lesson **api-gateways** (0.5604 vs bff 0.5601); api-gw#4 .6388, bff#0 .5746, bff#summary .5244 | **(d)+(e)**: lesson-score margin 0.0099 on main. Passes on both at batch 1. Users barely notice: turn.ts cites lead+second within 0.03, so both lessons show, and api-gateways#4 really does answer it. |
| c-ddd-2 | what is event storming | domain-driven-design | lesson 0.4623; ddd#18 .4623, esc#18 .4215, ddd#19 .4086 | clarify 0.4368; ddd#18 .4368, esc#17 .4315, ddd#10 .4076 | **(e) batch noise**: ddd#18 identical text, -0.0255. Passes on both at batch 1. |
| c-ai-2 | what is a vector database used for in RAG | designing-ai-systems | lesson 0.479; dai#17 .4790, dai#19 .3988, dai#30 .3807 | parametric 0.4311; dai#15 .4311, dai#7 .3673, dai#6 .3616 | **(a)+(b) real, partly hidden**: triangle lead-in dropped. HNSW/IVF paragraph plus "Three practical notes…: Metadata filtering comes first." merge into the definition chunk (#14, 153w). Batch 1: case passes, but the definition chunk collapses 0.5039 → 0.3600. It's carried by #15 (metadata filtering). |
| c-zt-1 | How do services prove who they are to each other? | zero-trust-security, authn-authz | lesson 0.4527; zt#9 .4527, zt#7 .4337, authn#16 .4314 | clarify 0.4473; zt#9 .4473, authn#15 .4359, zt#7 .4310 | **(d)+(e)**: zt#9 identical text, margin 0.0027. Passes on both at batch 1. |

Newly fixed:

| case | question | main → branch | class |
|---|---|---|---|
| c-bff-2 | backend for frontend pattern | clarify 0.444 → lesson 0.4578 (bff#0 .364 → .378) | (e) batch noise. Passes on both at batch 1. |
| c-raft-2 | what is a quorum | parametric 0.4263 → lesson 0.4563; raft#6 .4074 → .4551 | (b) real gain: boundary change in consensus-raft. Holds at batch 1 (0.4314 → 0.4540). |
| h-trap-stream-river | Why do streams flow into rivers? (expect redirect) | clarify 0.357 → redirect 0.3106 (below clarify 0.33) | (c) benign: stream-vs-batch#17 is shorter and cleaner. Holds at batch 1. |

## Does the 189 → 0 fragment fix help users? Yes, clearly

The router passes the top lesson's top-2 chunks to `turn.ts`. `sectionLead(section.text)` uses chunk[0]'s opening sentences as the plain answer, and all chunks go to Qwen as context. On main, **30 distinct fragment chunks were served across eval cases, many at rank 0.** Five samples, shown as Ben shipped them:

1. `idempotency#16`, rank 0 for c-idem-2 and h-c-idem-key: "**designed.** Treating the key as authentication…". The answer would open with an orphan word.
2. `cloud-native-architecture#15`, rank 0 for c-cloud-1: "**request, then die) keeps customers from noticing.** The through-line…". Starts mid-parenthesis.
3. `designing-chat-at-scale#31`, rank 0 for c-chat-2: "**your trade-off: heartbeats are a three-way tug…**". Starts mid-sentence.
4. `data-partitioning#6`, rank 1 for c-part-1: "moving hot data aside. A scatter-gather query … in the application:". Broken at both ends, and it points at a diagram that isn't there.
5. `authn-authz#18`, rank 1 for c-auth-1: "when roles stop being expressive enough. … These talks and tutorials go further than we did here:". Broken start, dangling end.

All five would hurt. A spoken or displayed answer that opens with "designed." or "request, then die)" reads as broken. Rank-1 fragments also feed Qwen half-sentences.

## Recommendation

**Ship with one narrow fix: make a stripped block a hard window boundary in `windows()`.** In `chunkLesson`, on `STRIPPED`, push a sentinel paragraph after `dropDanglingLeadIn()`. `windows()` flushes `current` when it reads the sentinel. That's about 3 lines in scripts/ben/chunk-lessons.mjs.
- **Why it's principled, not tuned:** a code fence or diagram is a topic seam in the lesson. The lead-in rule already treats it as one, and it shouldn't silently stop being a seam just because a sentence was dropped. Main kept these splits by accident (the extra words pushed past 150).
- **Measured once, not iterated:** 804 chunks, 0 fragments, max 171w. It fixes both chunk-merge defects: c-solid-1 is back (0.5229) and the vector-DB definition chunk is top again (0.5032). With noise removed (batch 1) it ties main at 87.5% and doesn't beat it; holdout is 83.3% vs 85.4% for the branch without the fix. The 89.1% figure at batch 32 is itself inflated by batch noise, so it isn't a headline. It loses h-c-bff-owner (holdout), which is a margin case: main 0.4568 vs gate 0.45. The branch with the fix scores 0.4318, so Ben offers clarify with the right lesson ranked first.
- **BLOCKER before landing it:** the variant ran only through my scratch diag, never through `routing.eval.ts`. Drift, offered, refusal, and the `screenshot-catholic` assert are unmeasured for it. Run the full eval at the shipped BATCH=32 and all quality gates before merging.
- **Optional, same PR or separate:** keep content-bearing `:` sentences. A deliberate content call, not a chunking rule: the triangle sentence could be reworded in the MDX (for example ending with "."), which is a lesson edit for Liz to decide.
- **Separate follow-up PR (pre-existing bug, affects main too):** embed index chunks one at a time (`BATCH = 1`) so a chunk's vector doesn't depend on its batch neighbours. Index build time goes up (eval ~100s → ~180s; it hit the 180s hookTimeout here). Until then, any chunk-count change will move the eval ±2pt by noise alone.
- ADR-0001 check: no thresholds, exemplars, or cases touched. The fix is justified by lesson structure, not by which cases pass.

## Confidence

- High: batch-noise mechanism (identical-text score deltas, deterministic reruns); the c-solid-1 cause (traced through the chunker and the MDX lines 132–149); the fragment harm (texts as shipped).
- Medium: c-ai-2 classed as real (it passes at batch 1, but its best on-topic chunk lost 0.14).

## Verified / inferred / UNVERIFIED

- Verified: all scores above, from scratch runs. My judge reproduces official accuracy exactly (87.5/85.4 at batch 32, 86.5/87.0 at batch 1).
- Inferred: batch-padding is the source of the identical-text drift. Strongly implied (only batch membership differs), but I didn't isolate it at the ONNX level.
- UNVERIFIED (low confidence): the stripped-boundary fix at full quality gates (content:validate, npm test, lint, build, e2e were not run). How it affects narration/ListenButton (it uses `splitSentences`, not chunks; not checked). Whether `routing.eval.ts` gates passed in the batch-1 runs: beforeAll exceeded the 180s hookTimeout, so those 7 tests were skipped. The REPORT.md and diag numbers were still produced.
- Scratch worktrees under scratchpad/inv were removed after this report. Junctions were unlinked first.
