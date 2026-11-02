# Triage: PR #132 "docs: beginner-honest Ben setup after #131" (read-only)

Base c4b17dd, main 5680606 (includes #133, #134). Files: README.md, docs/ai-tutor.md, docs/ben-arena-setup.md (new), docs/ben-history.md.

1. **Merge:** VERIFIED clean. `git merge-tree --write-tree origin/main origin/docs/ben-setup-honest` exit 0, no conflicts. #134/#133 touch no PR file (EVIDENCE_LOG, evals/ben, public/robots.txt, scripts/seo, src/ai/local/semantic). GitHub mergeable still UNKNOWN.
2. **Stale/wrong after #134:** Doc quote matches `setupAnswer()` on main (turn.ts:169) exactly. Confidence label "High confidence · from How this tutor runs" matches test asserts. Stale: `docs/ben-arena-setup.md` "Four-token follow-up (#131)" and "Pick" omit #134 (the `set up my AI env` / `ai env` pin via `isTutorSetupQuestion`, router.ts:~140). Not wrong, incomplete. `docs/ben-history.md` says series "#127–#131", omits #133/#134. `ai-tutor.md` "Try asking" has no `ai env` example (not required; add if wanted).
   - `ai env` phrasing: ai-tutor.md and README never mention it. Nothing contradicts it.
3. **Unverified browser claims:** UNVERIFIED: "Firefox ... Its sidebar or Smart Window is the browser's own chrome" (Smart Window name not checked). UNVERIFIED: "Some Chromium browsers expose ... many do not." Arena doc "Same text in Chrome, Edge, and Firefox" is a reported live observation, not checked here. "Firefox has no page Prompt API" matches known facts. Doc does not claim Edge preview status (good).
4. **Scope:** VERIFIED docs-only. `git diff --name-only origin/main...origin/docs/ben-setup-honest` has no src/ or content/ paths. No chatbot behavior change.
5. **Before merge:**
   - Trim `docs/ben-arena-setup.md`: the "Cross-judge was skipped ... harness could not spawn ... Grok parent" line is tooling noise; add #134 to the pick and the four-token section.
   - Either drop the "Smart Window" phrase or mark UNVERIFIED; drop "many do not" or soften.
   - Note in PR (not a blocker): `src/ai/local/cards.ts:36` "How this tutor runs" card body still says "(Chrome's Prompt API)". The pill cites this card, so students can read "Chrome" after the docs say "page-callable". Out of scope here; needs a src PR plus `npm run eval:ben` per AGENTS.md.
6. **Priority:**
   1. Trim/update `ben-arena-setup.md` for #134 and the process note (15 min).
   2. Soften or verify the unverified Firefox/Chromium sentences in `ai-tutor.md` (10 min).
   3. Update `ben-history.md` series range to #134 (2 min, optional).
   4. Optional `ai env` example in "Try asking" (2 min).
   5. Separate follow-up: fix cards.ts:36 Chrome wording, with tests and eval:ben (1-2 h, src/ai/local, higher risk).

Limits: no build/test run (docs only). Live browser behavior UNVERIFIED.
