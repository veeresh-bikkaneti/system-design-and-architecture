# Triage PR #135 (fix/ben-chunk-fragments, head c7c31c7, main 5680606) - read-only, 2026-11-01
1. Merge: NOT clean (git merge-tree). Conflicts: EVIDENCE_LOG.md, evals/ben/REPORT.md, evals/ben/data.test.ts.
   Code files (chunk-lessons.mjs, build-index.mjs) auto-merge. REPORT.md/EVIDENCE_LOG are regenerable/appendable; data.test.ts needs hand-merge (#134 added tests). Branch base 636e15e predates #134.
2. T1 paths: none. Files: EVIDENCE_LOG.md, evals/ben/{REPORT.md,data.test.ts}, scripts/ben/{build-index,chunk-lessons}.mjs. Self-declared T2.
3. User value (from PR body/EVIDENCE_LOG; the diff has no separate CHUNK report): 189 of 779 sections were fragments. Cited broken chunks:
   a) designing-ai-systems#6 started lowercase mid-sentence;
   b) RAG "Generate." chunk began "narrow and careful at the bottom.";
   c) dangling "...spend an hour with Martin Kleppmann:" lead-in whose <VideoCard> was stripped (also "Watch it fan out:").
   Also: 700-char display trim no longer cuts mid-word with "…"; build now fails on fragments (regression guard). Gain is Ben source-snippet readability, not routing.
4. Must change before merge:
   - Rebase on main, resolve 3 conflicts; re-run eval:ben on merged tree (main baseline now 87.9% all/151 cases; PR's 87.5->85.4 numbers are stale).
   - Measure at BATCH=1 (never done; open eval-instrument ticket says BATCH=1 lands first). Compare on the same instrument, not BATCH=32.
   - Apply the ~3-line fix: stripped block = hard chunk boundary (recovers the real 1-2 cases from ':' lead-in packing).
   - Add exports to scripts/ben/chunk-lessons.d.mts: isFragment, splitSentences, STRIPPED (PR left it out; only evals/ imports it, untyped by tsc -b, so low risk, 3 lines, but d.mts becomes the 6th file; manifest cap is 3, already exceeded, needs a recorded exception).
   - Commit trailers: all 3 commits carry "Co-Authored-By: Claude Opus 5.5 ... Claude-Session: .../01Ta838Wu5qS..." ; session now requires "Claude Sonnet 5.5". Do NOT rewrite unless Liz asks; just use correct trailer on new commits (UNVERIFIED which she wants).
   - Update PR title/body numbers; re-run content:validate/check, npm test, lint, build (base path).
5. Effort: ~1-1.5h (rebase 15m, 3-line fix 10m, d.mts 5m, evals incl BATCH=1 ~30m, doc refresh). Priority 4: no T1 risk, but blocked on BATCH=1 instrument ticket; value is cosmetic, eval trade is unproven. Do after that ticket.
6. Integrity/behavior risk: course content - none (MDX untouched; only the derived index changes). Chatbot - real but measured: reported drift 1.4->2.9% (holdout 0->5%), h-d-ai-art answers off-course with a lesson; 7 newly missed cases (3 solid-principles). Mostly noise at BATCH=32 per investigation (UNVERIFIED at BATCH=1). Index shrinks 779->763 chunks, 41 lessons still present (test asserts).
UNVERIFIED: merge result beyond conflict list; semantics after rebase; eval numbers; Liz's trailer preference.
