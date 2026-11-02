# Ben session records (2026-11-01 to 2026-11-02)

Council votes, skeptic/historian notes, drift measurements, manifests, reviewer reports and probe scripts from the Ben routing session (#134, #137, #139, #140, BATCH=1 hold, #135). Preserved here so nothing lives only on one machine (AGENTS.md section 2).

| Group | Files |
|---|---|
| Council seats | `council-3-*.md`, `council-4-*.md`, `council-brief.md`, `council-4-brief.md` |
| Skeptic / review | `skeptic-*.md`, `drift-review-c2.md`, `review-137.md` |
| Drift and BATCH=1 | `drift-manifest-draft.md`, `drift-measure-2.md`, `drift-measure-3.md`, `miss-investigation.md`, `batch1.patch`, `c1p-c2.diff`, `probe-*.txt` |
| Design | `capsule-inference-ladder.md`, `browser-ai-research.md`, `manifest-pr-eval.md`, `ticket-measuring-tool.md` |
| Reality Checker | `rc-139.md`, `rc-140.md` (round 1), `rc-140-round2.md`, `-round3.md`, `-round4.md` |
| Probe scripts | `rc140b-probe*.ts.txt` (renamed from .test.ts so vitest does not collect them; copy next to router.ts as .test.ts to rerun), `keaton-main.mts`, `skC.cjs`, `tab.cjs`, `run.sh` |

Not included on purpose: `diag-b1.json` and `diag-b32.json` (about 290 KB each, regenerable with `npm run eval:ben`) and scratch copies of `router.ts` versions (they are in git history). The experiment worktrees are on the remote as branches `experiment/drift-m3` and `experiment/drift-m4` (WIP, not for merge).

These are historical records. Some files name local paths or state that is out of date after the merges.
