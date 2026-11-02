# Council record: slice L3, TTS extractor (PR #175)

Tier T2. Procedure: AGENTS.md section 3 (Chair + Skeptic, plus the advisor check). Panel: **one seat** (Skeptic, sonnet), as the T2 rule requires. Council lead: Sonnet 5.5. Chair of record: the owner.

## Round 1

### Seat C (Skeptic), report, verbatim

VOTE: SUPPORT WITH CHANGES. I reproduced both defects and the fix direction is safe. The manifest needs one blocking change: it must say what ships between the code PR and the regenerated audio. Python ran with -I, in the scratchpad only, with nothing written to the repo. I compared the current `_drop_jsx_block` against a patched copy that also ends a skip on a bare `/>` line.

Claims
- (a) VERIFIED. Every lesson hits the "unclosed JSX block" path. For anti-corruption-layer, 35 blocks become 47 with the patch.
- (b) VERIFIED. The title comes out as "...Building for Someone Else", cut at the apostrophe.
- (d) VERIFIED. The patch adds exactly 516 blocks across the 41 lessons.
- (c) NOT RE-RUN. The 4 stale lessons were not compared against shipped manifests. Treat as the implementer's claim.
- (e) NOT TESTED. The venv/Kokoro check was not made; the manifest's "NO" is the implementer's finding.
- Issue R-09's own text (and so the "22" figure) is UNVERIFIED: triage/ISSUES-CONSOLIDATED.md was absent in the Skeptic's tree.

Findings
1. BLOCKING: the interim state is not addressed. If PR 2a merges and PR 2b does not, the repo's tests assert narration that the shipped audio does not contain. A re-extract would also differ from shipped for all 41 lessons. Required: add an acceptance condition "2a is not merged before 2b is ready", or state that shipped audio stays stale on purpose; say which is the truth. `listen.ts` skips only `not-prose`, `mermaid-diagram` and `diagram-panel` classes, so it already speaks Go deeper and Sources in the browser. The fix aligns recorded audio to the browser, and the browser is the truth.
2. NON-BLOCKING, verified safe: the patch is safe for every component in the lessons. 101 multi-line component opens (Quiz 41, StepThrough 18, VsToggle 13, PacketFlow 10, ScrollyDiagram 1); all end on a bare `/>` line; none has a nested capitalized tag or `/>` inside an interior line; the 282 `VideoCard` and single-use components close on one line; no `</X>` wrapper blocks are affected. The patched extractor added no blocks containing quiz or code text (3 keyword hits were citation lines). Add tests for: a StepThrough or VsToggle multi-line, an interior string containing `/>`, a nested tag. Keep `test_quiz_internals_are_never_spoken`.
3. NON-BLOCKING: the tests are not run by CI (no `unittest`/`test_extract` in package.json or workflows). Add a CI step or a package.json script, or record that they are manual-only; put them in the gate list.
4. NON-BLOCKING: tier T2 is right (no worker/, session.ts, gist-sync.ts, AuthBar.tsx, no secrets).
5. NON-BLOCKING, supports the split: the binaries are a repo-size problem more than a review problem. `.git` is 333 MB; rewriting 313 MB of opus roughly doubles clone size permanently. The Cloudflare per-asset cap is not a risk (largest opus 8.5 MB vs 25 MiB). No LFS (`*.opus` is binary in .gitattributes). Regenerate once, only after the extractor is final. Split into 2a (code and tests) and 2b (audio); 2b needs the owner's decision on history growth.
6. NON-BLOCKING: `validate_manifest.py` tolerates the changed block count (per-manifest structure only); `alignBlocks` in narration.ts fails soft on a count mismatch (old audio has no entries for new blocks, so they just will not highlight or play). `narration:index` not run.
7. NON-BLOCKING: fix the title regex properly: `title:\s*(['"])(.*?)\1\s*,`, mirroring the summary regex already in `_read_meta`.

### Verdict (council lead, Sonnet 5.5), round 1

Adopt all. Resolution of the blocking point: **shipped audio stays stale on purpose until the owner runs the synthesis; the browser reader is the truth (it already speaks Go deeper and Sources).** PR 2a (extractor fix + tests) may merge on its own because no CI check compares shipped manifests to a fresh extract (validate_manifest checks structure only; alignBlocks fails soft); the acceptance conditions say this explicitly. The regeneration (PR 2b: 164 tracked files, 313 MB, repo history growth) is a separate owner decision, tracked in an issue, and is not part of 2a. Also: extra tests for multi-line StepThrough/VsToggle, an interior `/>` string, and a nested tag; the title regex becomes `title:\s*(['"])(.*?)\1\s*,`; the python tests join the CI gate chain (package.json script run by the PR gates) or the manifest records them as manual-only; the manifest states the "22" in the issue is unverified and the measured figure is 516 blocks across 41 lessons.

Round count: 1 of 2. Sent to the advisor next; the reply is recorded in the following commit.

### Advisor (Opus), reply, round 1, verbatim (L3 part)

AGREE with the verdict, one material correction. The Skeptic reproduced (a), (b) and (d) itself and verified the fix is safe across all 101 multi-line component opens; that is real evidence, not assertion. Your verdict adopts all seven findings. Implement it. One material correction:

Your resolution of the blocking finding contradicts your own acceptance condition. You wrote that shipped audio stays stale on purpose and that PR 2a may merge alone because no CI check compares shipped manifests to a fresh extract. But the implementer's own failing test `test_trailing_sections_are_narrated_in_every_lesson` asserts exactly that comparison for all 41 lessons. If that test enters the CI chain (finding 3, which you also adopted), 2a merging without 2b leaves a test asserting narration the shipped audio does not have, which is the state the Skeptic flagged as blocking.

Pick one and say which in the manifest:
- The new tests assert extractor behaviour only (what the extractor now produces from current MDX), not shipped-manifest parity; then 2a is safe alone and `test_trailing_sections_...` must be scoped to the extractor's output, not the shipped files.
- Or they assert parity, and 2a cannot merge before 2b.

The first is almost certainly right and is the cheaper fix, but the test as described reads like the second. Have the implementer state which the test actually compares, with the assertion quoted.

Also note in the record: this Skeptic also could not find triage/ISSUES-CONSOLIDATED.md, the same gap as O1's. Two seats in a row read a tree without it. Check whether triage/ is present in a fresh worktree off main.

### Outcome

Round count: 1 of 2. Advisor: AGREE (one material note, applied). Decision: **the tests assert extractor behaviour only; no test compares shipped manifests; 2a merges alone; shipped audio stays stale until the owner runs the synthesis (PR 2b, separate owner decision on repo-history growth).** Blind-spot check: `triage/ISSUES-CONSOLIDATED.md` is tracked on origin/main (see the git ls-tree check in the PR comment); the seats read the owner's main checkout, which is on a feature branch where triage/ is untracked. Future seats are told to read it with `git show origin/main:triage/ISSUES-CONSOLIDATED.md`. Implementer: the L3 implementer agent (Sonnet-class) under council lead Sonnet 5.5. Status: phase 2 released.
