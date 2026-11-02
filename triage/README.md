# Round-2 triage — handoff (read this first on a new device)

> **Newest state and the paste-in prompt for the next agent: [`NEXT-AGENT.md`](NEXT-AGENT.md).** The PR-state section below is older.

Everything needed to continue is in this folder and in the open PRs. Nothing lives only on the original machine.

**Open the board:** download `triage/dashboard.html` from this branch and open it in a browser. Its status/owner boxes are saved in *that browser only* (localStorage), so statuses do **not** follow you between devices. Treat the board as the plan; track real progress in PRs (or ask to move it to GitHub issues: decision D7 below).

## What is here
| File | What |
|---|---|
| `dashboard.html` | Slices, P0-P3, 5 dev chunks, PR overlap table, copy-able agent briefs |
| `ISSUES-CONSOLIDATED.md` | Source list. **Truncated**: 56 of 94 findings (QA R-01..28, INT R-01..28) |
| `rc-140-round1.md`, `rc-140-round2.md` | Reality Checker reports for PR #140 |

## Blocked on missing input
INT R-29..R-52 (minus struck R-45) and 15 `INT NEW*` items have **no titles**. Need `REPORT-round2.md` from `coursework-integrity` (path in the source file: `~/workspace/sdm-ben-arena/coursework-integrity/`, not found on the machine used). Placeholders only until it is supplied. Nothing was guessed.

## State of PRs (verified with `gh`, 2026-11-02, after merges)
- **#132 docs: MERGED** (6b8110f).
- **#140 pin order: MERGED** (31792e4) after four Reality Checker rounds (reports `rc-140-round1..4.md`). Accepted trade-off and known gaps are in `EVIDENCE_LOG.md` (2026-11-02, "Setup pin ahead of the off-topic redirect").
- **#141 triage docs: MERGED** (9374c55). **#142 constitution: MERGED** (db6bf2a): never merge unfixed work; remote is the source of truth (AGENTS.md section 2, annex `docs/agent-notes.md`).
- **#135 chunker:** conflicts; needs deadline + re-measure after BATCH work. This is slice C1.
- **#125 contact (T1), #109 PWA (T1):** parked; each collides with several slices (see board).
- **Held:** `fix/ben-index-batch-1` (66a3ef0), pushed, no PR, owner hold. Do not merge.
- **Open owner item:** #168 ruleset hardening (main ruleset has no required checks or thread resolution; admin bypass always on).

## Owner decisions still open
| ID | Decision | Unblocks |
|---|---|---|
| D1 (DEC-1) | Assessment semantics: what completion, badges, credential require | exam bank, gist merge, badges |
| D2 | Reject non-gist-only GitHub tokens at sign-in? (QA R-08) | S1 |
| D3 | Response headers on mirror Worker; accept Pages residual (QA R-22) | S2 |
| D4 | Ben history TTL / forget-on-close + retention wording 30d vs ~60d | S3, panel copy |
| D5 | Is a build/version stamp required (QA R-27)? | M1 |
| D6 | Is #135 in flight; which branch is chunker base | C1 |
| D7 | ~~Track in GitHub issues~~ **DONE 2026-11-02**: one issue per slice, #143-#167 (table below) | portability |
| D8 | ~~Push `fix/ben-index-batch-1`~~ **DONE**: pushed at 66a3ef0, HELD, no PR, do not merge | portability |
| D9 | ~~Merge #140~~ **DONE** (31792e4) | Ben routing |
| D10 | Keep or shelve #125 and #109 (before panel/auth slices start) | Dev B, Dev D |

## Order of work
1. Decisions D1-D10 (D7, D8, D9 done). 3. If kept: #125, then #109. 4. BATCH decision, then #135 re-measure. 5. Slices per the board; every fix needs an approved Consensus Manifest first (`AGENTS.md`), T1 = full council, one branch per task, never merge without the owner's per-PR word.

## Obsolete tickets (marked on the board)
INT R-45 (struck), INT NEW3-4 (informational), INT NEW4-5 (no defect), INT NEW1-3 (duplicate of INT R-22). No merged PR since review SHA 915725c closed a real finding: INT R-02, R-16, R-17, R-18 re-checked on main 6b8110f and are STILL OPEN.

## Tooling notes
- User-level `~/.claude/settings.json` sets `skipDangerousModePermissionPrompt: true`; project `.claude/settings.json` hooks do not ask. A user-level setting `blockReadsOutsideWorkingDirectories: true` plus a `PermissionRequest` hook (`orca-agent-hook.exe`) are the likely sources of any remaining prompts. UNVERIFIED which one the owner saw.
- Local-only worktrees/branches on the original machine are scratch; the work is in the PRs.

## GitHub issues (source of truth for status; the browser board is only a view)
Filter by label: `round-2-triage`, `dev:A`..`dev:E`, `priority:P0`..`P3`, `tier:T1`, `decision`, `blocked`.

| Slice | Issue |
|---|---|
| A1 | #143 |
| C1 | #144 |
| C2 | #145 |
| C3 | #146 |
| G0 | #147 |
| L1 | #148 |
| L2 | #149 |
| L3 | #150 |
| L4 | #151 |
| L5 | #152 |
| M1 | #153 |
| O1 | #154 |
| P1a | #155 |
| P1b | #156 |
| P1c | #157 |
| P1e | #158 |
| Q1 | #159 |
| S1 | #160 |
| S2 | #161 |
| S3 | #162 |
| W1 | #163 |
| W2 | #164 |
| W3 | #165 |
| W4 | #166 |
| X1 | #167 |

## Constitution added by the owner (PR #142, AGENTS.md section 2)
1. Never merge anything that is not fixed; do not ask about it; fix, re-verify, re-review.
2. The remote is the source of truth: no work or decision only on one machine.
