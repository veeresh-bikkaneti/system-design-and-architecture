# Council record: audio re-synthesis preflight (F7a) — branch `feat/audio-resynthesis-preflight`

Tier T2. Procedure: AGENTS.md §3 (Chair + Skeptic seats in the PSTACK arena/council,
`pstack-arena-council-2026-11-12.md` Part II, Branch 8), plus the advisor check.
Chair of record: the owner (Liz). Owners on the branch: Seat B (pre-flight
acceptance), Seat D (parked-terms record); Reality Checker dry-runs the checker
at SWARM (Seat C).

Round: 1 of 2.

Model diversity: no model diversity — the seats for this commission ran on one
model family; recorded per AGENTS.md §3 step 1.

Implementing agent: builder seat (model name withheld per commission instruction).

## Consensus Manifest summary (Branch 8, binding)

```text
CONSENSUS MANIFEST
Task: F7a — PREFLIGHT ONLY for the parked audio re-synthesis (F7). Build the
  runbook, neutralise the --only-missing trap, add the corpus test, and commit
  a recomputed pre-flight report. The synthesis itself (F7b) is RESERVED TO
  LIZ: this branch does NOT run synthesis, does NOT commit audio, and does NOT
  open any audio PR. Issue #178 closes on F7b evidence only, never on F7a.
Risk tier and rationale: T2 — material, multi-area (scripts/tts tooling, docs,
  test suite), but no T1 path is touched (no worker/, no session/gist/AuthBar).
Scenarios / acceptance conditions:
  (1) Runbook: exact per-voice re-synthesis commands, per-voice file list
      (164 files), expected ~313 MB delta, disk/time expectations — every
      figure sourced or confidence-marked.
  (2) Trap neutralised: --only-missing would skip all 82 packages (files
      exist), so a run can "succeed" synthesising nothing. Neutralised in the
      synthesize.py guard AND the runbook's first line — not a footnote.
  (3) New corpus test in the scripts/tts unittest run (npm run test:tts):
      for all 41 real lessons, extract_blocks() emits a Go deeper block AND a
      Sources block, and the cloud-native-architecture title is untruncated
      at the apostrophe. Existing 10/10 suite stays green.
  (4) Pre-flight report (script + committed output): per lesson x accent —
      extracted block count, tail sections present (Go deeper / Sources),
      recomputed hash vs manifest hash. Figures are RECOMPUTED at run time;
      any deviation from the Phase 1 expectation (82/82 mismatch, deficit
      529 blocks/accent = 254 Go deeper + 225 Sources + 50 mid-lesson drift)
      is a stop-and-report FINDING, not a target to reconcile to.
  (5) The hash-parity check lives in the report ONLY, never as a CI gate.
  (6) No text anywhere claims F7 "done": no .opus was decoded in Phase 1 or
      in this preflight; manifest evidence is likely, not a listening pass.
Failing tests or test contracts: the pre-flight report's mismatch census is
  this branch's failing-first evidence (item 4); the --only-missing guard
  carries its own failing-first test (red at HEAD, green after the guard).
  The corpus test is expected to PASS at HEAD (extractor fixed in PR #175,
  2026-11-02); the actual outcome is reported honestly, not manufactured red.
Scoped files: 7 — justified exception to the 3-file cap: every file is named
  in Branch 8's scope (record, guard, tests, preflight script, runbook,
  report output, EVIDENCE_LOG.md entry required for T2 by AGENTS.md §3/§11):
    docs/council/2026-11-12-audio-resynthesis-preflight.md (this record)
    scripts/tts/synthesize.py            (--only-missing guard only)
    scripts/tts/test_extract.py          (corpus test + guard tests)
    scripts/tts/preflight.py             (new: recomputed census script)
    docs/audio-resynthesis-runbook.md    (new: F7b owner runbook)
    docs/audio-preflight-report.md       (generated output of preflight.py)
    EVIDENCE_LOG.md                      (appended T2 entry)
Risks / unknowns: recomputed figures may deviate from Phase 1 (then: finding,
  stop-and-report); synthesis run time is UNVERIFIED (no timed full run is
  recorded in the repo); .opus contents are UNVERIFIED (never decoded).
Rejected alternatives and why: hash-parity as a CI gate (Seat B DROP — would
  keep main red until the owner run); running the synthesis in this branch
  (reserved to Liz, ~313 MB of permanent history); reconciling recomputed
  figures to the expected numbers (advisor condition: report, don't reconcile).
Token budget (maximum 15,000): per AGENTS.md §4 (commission-run; see PR body).
Approvals / votes / dissent: arena/council Branch 8 adopted (Seats B/C/D as
  recorded in pstack-arena-council-2026-11-12.md Part II); advisor verdict
  below — AGREE WITH NOTES, both notes NON-MATERIAL, preflight scope only.
Chair decision (including any veto): no veto recorded; merges remain the
  owner's per-PR word (AGENTS.md §2/§11). F7b remains Liz's explicit word only.
```

## Advisor verdict for this branch — VERBATIM

Source: `advisor-agree-2026-11-12.md` §5 (PSTACK CORRECT advisor seat,
2026-11-12), reproduced exactly as written, including its scope limit:

## 5. Branch 8 — `feat/audio-resynthesis-preflight` (F7a, PREFLIGHT ONLY) — T2

**Verdict: AGREE WITH NOTES — this AGREE covers the preflight scope only. It does not cover, authorise, or pre-approve F7b.**

**Scope boundary — checked first, because it is the reserved item:** The branch text scopes in only the run manifest/runbook, neutralisation of the `--only-missing` trap, the new corpus test, and the committed pre-flight report; it scopes out executing the synthesis, committing audio, and opening the audio PR (Arena/Manifest §II.2 branch 8 — verified). F7b — the synthesis itself, ~313 MB of permanent history — is recorded in the same branch text as OWNER-RUN, on Liz's explicit word only, as the manifest's one reserved escalation (Arena/Manifest §II.2 branch 8; §II.1 standing order (1) — verified). That reservation is honoured by the branch as written, and this advisor verdict is expressly limited to match it.

**Faithfulness to evidence:** Verified. F7 SURVIVES and is fully explained: 0/82 packages contain a Go deeper or Sources block, deficit 529 blocks per accent (254 Go deeper + 225 Sources + 50 mid-lesson drift), 82/82 contentHashes stale, root-cause extractor bug fixed in code 2026-11-02 (PR #175), re-synthesis parked as PR 2b / issue #178, and the `--only-missing` trap documented (files exist, so it would skip all 82) (Interrogation §1 F7; §3 Act-on F7 — verified). The preflight's expected findings — 82/82 hash mismatch, deficit 529 blocks/accent = 254 + 225 + 50, `cloud-native-architecture` title untruncated at the apostrophe in the corpus test — match that record exactly (Arena/Manifest §II.2 branch 8 — verified).

**Tests / acceptance:** Verified sufficient — `npm run test:tts` with the existing 10/10 suite staying green, the new corpus test over all 41 real lessons, and the hash-parity check correctly placed in the pre-flight report rather than as a CI gate (Seat B DROP, branch 8 text — verified; a CI gate would keep main red until the owner run).

**Notes (all NON-MATERIAL):**
1. [NON-MATERIAL] The pre-flight report's figures must be recomputed by the committed script at run time. If the recomputation differs from the expected 82/82 mismatch or the 529-block deficit, the builder stops and reports the mismatch as a finding — the expected values are a prediction from Phase 1 evidence (Interrogation §1 F7 — verified), not a target to be reconciled to.
2. [NON-MATERIAL] The `--only-missing` trap must be neutralised in the script guard or the runbook's first line, not a footnote (Seat C, branch 8 text — verified), and no PR text on this branch may claim F7 "done": Phase 1 decoded no `.opus`, so manifest evidence for the audio itself is likely, not a listening pass (branch 8 scope-out — verified; Interrogation §5 item 5 — verified). Issue #178 closes on F7b evidence only, never on F7a merging (branch 8 text — verified).

**Conditions a builder must honour:** preflight artifacts only — no synthesis run, no audio files committed, no audio PR opened under this branch; Reality Checker dry-runs the checker at SWARM (Seat C, branch 8 owner line — verified); F7b closure, when Liz authorises it separately, requires post-run hashes 82/82, regenerated narration index, and a spot-listen of ≥3 lessons × both accents including the truncated title and one Go deeper block, all-82-or-not-merged per accent pair (branch 8 text — verified) — none of that is within this verdict.

---


## What this record authorises — and what it does not

The verdict above covers the PREFLIGHT ONLY. It does not authorise F7b (the
synthesis run, ~313 MB of permanent history), which stays reserved to Liz's
explicit word as parked PR 2b / issue #178 (verified: Branch 8 text,
`pstack-arena-council-2026-11-12.md` Part II; Phase 1 evidence
`pstack-interrogation-2026-11-12.md` §1 F7).
