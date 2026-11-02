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
