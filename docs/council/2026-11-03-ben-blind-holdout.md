# Council record: Ben blind holdout result and index variance (PR #199, issues #180, #198)

Tier T2. Procedure: AGENTS.md section 3 (Chair + Skeptic, then the advisor). Panel: one seat (Skeptic, sonnet). Council lead: Sonnet 5.5. Decided by council and advisor under the owner's standing instruction of 2026-11-02.

## Facts put to the council (council lead, verified from logs and PR #199)

- Blind set: 106 new cases written by a fresh agent from a copy of content/lessons/ only (input directory listing sha256 92ebea600015e56ec64ee4f11fc0ad13b74b7ec954f244737e831d4fc274b2b0; labels checked by grep only, so some course labels may be imperfect; one disclosed exception: a python interpreter path shown by `which python`, no repo file read).
- Semantic router: 87.1% on the 201 tuned cases, 67.0% (71 of 106) on the blind set; combined 307 cases: accuracy 80.1 (gate 85, FAIL), drift 5.6 (gate 3.0, FAIL), offered 7.5, refusal 3.8, lessonTop3 96.8; data.test.ts hygiene test fails on 3 collisions with voting exemplars.
- Index bytes: chunkVectors f9feac54... on slow runners (about 16-17 s, also the Windows laptop) and 1837cd2f... on fast runners (about 6-9 s), all ubuntu-24.04; in one deploy run the Pages artifact got f9fe... and the Cloudflare mirror 1837cd...; eval numbers equal on both for the 201 set. The earlier claim "Linux is authoritative" is RETRACTED.

## Round 1

### Seat C (Skeptic), report, verbatim

VOTE: SUPPORT WITH CHANGES. Hold #199 open and unmerged. Fix the index with a pinned artifact. Treat the 67% as a real product gap, mostly router error. The one correction below changes how the misses should be read.

BLOCKING
1. The REPORT.md "got ... (slug)" parenthetical is the top-ranked lesson, not the question's topic. The "tech->redirect (cap-theorem, graphql-vs-rest, idempotency, nosql)" reading is wrong. The tech misses in holdout.json are n-t-055 "center a div with css", 057 "sql left join vs inner join", 060 "undo my last git commit", 062 "chmod 755", 063 "csv with pandas", 067 "docker volumes". (verified)
2. Merging #199 as holdout turns the main deploy red. routing.eval.ts GATES (accuracy 85, drift 3, offered 10, refusal 8, top3 90) run on the pooled set via summarize('', semantic). Combined accuracy is 80.1 and drift 5.6, and data.test.ts fails on 3 collisions. (verified)
3. The determinism work cannot be a hash-equality test on an arbitrary CPU. (see A)

NON-BLOCKING
- The 201-set drift gate has 0.1 point of slack (2.9 vs 3.0).
- Cloudflare and Pages ship different index bytes today. (verified in the same deploy run, per the facts)

A. Index variance
- Likely cause (INFERRED, low confidence): embedder.mjs:145 runs transformers.js in Node, which uses onnxruntime-node (native), not the WASM build. Its MLAS kernels dispatch on CPU features (AVX2 vs AVX512/VNNI), so the quantized matmul accumulates differently on different runners.
- The mechanism is unconfirmed. No numThreads, SIMD or backend setting appears in build-index.mjs or embedder.mjs. I could not confirm the CPU class from the logs.
- Rounding already exists. Vectors are stored as int8 with a per-row scale (build-index.mjs:34-47) and the hash covers that, so option (iii) is already in place. Coarser rounding only lowers the flip rate; it does not remove it.
- Pinning config (i) cannot fix the ISA choice in native ORT. Forcing the WASM backend in Node might, since WASM SIMD128 is a fixed ISA and it matches the browser query path. That is an experiment, UNVERIFIED.
- (iv) is not testable in CI, because we cannot choose the runner CPU.
- Recommendation: (ii). Commit the pinned index, invalidated by the content hash plus the model SHA, with a CI check that fails on a stale hash. It is the only option that unifies the Cloudflare mirror, which builds outside GitHub Actions.
- Failure mode: the lesson-edit PR must also refresh the artifact (main is ruleset-gated, so no bot commit). Artifact size is UNVERIFIED.
- Determinism test on any CPU: content hash equal; rebuild versus pinned: cosine >= 0.999 per row, and int8 differences <= 1 LSB; zero changed routing decisions on all cases; exact bytes only for two builds on the same machine; BEN_REQUIRE_MODEL=1 makes a missing model a hard failure.

B. What 67% means
- My method: I read all 35 questions against holdout.json, and grepped lessons for strangler, big bang, RAG and "partition tolerance". The grep hits confirmed those topics are covered.
- Count: about 7 are label or strictness issues and about 28 are router errors. The 7: n-c-007, 009, 010, 012 and 036 answered from a plausible but different lesson, plus n-s-106 and 107, which are arguably not "self". Crediting the five wrong-lesson answers gives 76/106 = 71.7%, still far below the 85 gate.
- Verdict: a real product problem, and tuning overfit is plausible. About 1 in 3 fresh questions miss, and 18 course misses are mostly clarify or redirect.
- Cause hypothesis (INFERRED): exemplars and thresholds were tuned on questions phrased like lesson prose. The blind set uses symptom phrasing ("my payment goes twice", "dominoes"). The exemplar bank has 34 tech vs 54 off_topic examples.
- Caveat: 106 cases give an SE of about +-4.6 points.

C. PR #199
- Decision: (a), without merging the combined set. Keep #199 open as a draft. Split by a fixed id hash. Half goes into cases.json as diagnosis data with the router fix; half stays scored. Write a fresh blind set after the fix.
- Reject (b) unless the set lives in a separate non-gating file with an ADR section 7 note. Do not change thresholds under any option.
- Drop the 3 hygiene collisions ("who should i vote for", "capital of australia", "who are you") from the blind set as non-blind, and record the ids. Verify no collision in the remaining set after dropping.

D. Smallest next step
- Step: a read-only diagnostic that prints the vote intent, vote confidence and topScore for the 35 misses.
- Reading the router code (router.ts:352-372): a tech question reaches parametric_fallback whenever the vote is tech. So tech->redirect means the vote was not tech. That is an exemplar-bank or vote problem, not a threshold one.
- Course->clarify means topScore fell between 0.33 and 0.45. The levers are exemplar and chunk coverage or the clarify policy. Do not lower the 0.45 lesson threshold blind, because drift is already at the gate.
- Tier: T2. router.ts and exemplars.json are not on the T1 path list. npm run eval:ben and an ADR 0001 read are required.

E. Owner
- AGENTS.md has no explicit owner-list for this. The technical decisions (A, C, D) belong to the council plus advisor. The owner is needed for: merge approval (section 11 ruleset); whether general-coding questions should be answered or redirected, which is scope policy; any public claim such as "Ben answers course questions" (I could not find such a claim stated; its existence is UNVERIFIED).

Manifest changes: add "#199 merges only with all 7 gates green; no threshold changes"; add the id-fixed split and the 3 drops; add the tolerance-based determinism test; change the retraction of "Linux is authoritative"; list .github/workflows/* as a justified exception to the 3-file cap.

Cannot be verified in CI: both CPU variants on demand; whether the WASM backend removes the variance (needs a run until both runner classes appear); eval parity on the 307-case set across variants.

### Verdict (council lead, Sonnet 5.5), round 1

Adopt with these decisions.
- Correction of record: the council lead had relayed the miss list wrongly to the owner (the bracketed slug is the top-ranked lesson, not the question topic). Corrected: the six tech misses are general coding questions routed to redirect; the course misses are mostly symptom-style phrasing routed to clarify or redirect.
- #199: stays a DRAFT and is NOT merged. It merges only when all 7 gates are green; no threshold changes under any option. The 3 collisions (n-d-078, n-o-098, n-s-100) are dropped from the blind set as non-blind, with ids recorded in the ADR. The ids-hash split (half to cases.json as diagnosis data, half stays scored) happens together with the router fix; a fresh blind set is written after the fix.
- Step 1 (read-only, no router change): diagnostic printing vote intent, vote confidence and topScore for every miss in the 307-case run, and for the tech and course groups the nearest exemplars, to name the cause (exemplar bank, vote, or clarify band).
- Scope policy: the ADR 0001 routing table already sends a tech vote to parametric_fallback, so answering general software questions is existing, decided behaviour, not a new policy; the router fix aligns behaviour with the ADR. Not an owner question. If the diagnostic shows the ADR itself should change (for example, redirecting general-coding questions), that goes back to the council and, because it changes what the product promises, to the owner as a domain question.
- Index variance: do NOT commit a pinned artifact first. Run the cheap experiment (force the WASM backend in Node for the index builder, which also matches the browser query path; record BEN_INDEX_HASH on both runner classes via repeated CI runs and a fixed-seed local test). If the WASM path produces one hash across runner classes, no artifact is needed. If not, adopt the Skeptic's option (ii): a pinned index invalidated by content hash plus model SHA, with the tolerance-based determinism test (content hash equal, cosine >= 0.999 per row, int8 difference <= 1 LSB, zero changed routing decisions; exact bytes only for two builds on the same machine). A hash-equality test on an arbitrary CPU is rejected.
- Tier T2. Manifests: #199 stays the data PR; the diagnostic and router work are a new manifest (D2) opened after Step 1.

Round count: 1 of 2. Sent to the advisor next; the reply is recorded in the following commit.
