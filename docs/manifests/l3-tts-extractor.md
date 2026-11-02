# Consensus Manifest: L3 TTS extractor (issue #150, INT R-09)

Status: APPROVED for phase 2 (council record: docs/council/2026-11-02-l3-tts-extractor.md). This manifest covers PR 2a only; PR 2b is tracked in #178.


## Amendments after council round 1 (these supersede the text below where they differ)

- **Tests assert EXTRACTOR behaviour only.** No test reads `public/audio` or any committed narration manifest. They compare `extract_blocks()` output with MDX source (snippets or `content/lessons/*.mdx`). Shipped audio stays stale on purpose until the owner runs synthesis (PR 2b, #178); the browser reader (`src/lib/listen.ts`) is the truth. PR 2a can merge alone.
- **The issue's "22" is UNVERIFIED.** The measured figure is 516 blocks across 41 lessons (2114 before, 2630 after; verified by running the extractor).
- **Scope of PR 2a (supersedes the 3-file framing and the "exception" for generated files):** `scripts/tts/extract_narration.py`, `scripts/tts/test_extract.py`, `package.json` (script `test:tts`), `.github/workflows/pr-gates.yml` (one step), this manifest, the council record, and an `EVIDENCE_LOG.md` entry. NO audio, NO `public/audio`, NO narration manifests are regenerated or touched.
- **Fix:** a skipped multi-line self-closing component ends on a bare `/>` line at or above the opening tag's indent (nested `/>` is deeper; `/>` inside strings is never bare). Title regex is `title:\s*(['"])(.*?)\s*,`, mirroring the summary regex.
- **CI:** `npm run test:tts` (stdlib `unittest discover -s scripts/tts -p test_extract.py`, no venv) runs in the "PR Frontend gates" job. `test_align.py` is NOT in the gate: it imports `synthesize`, which needs `huggingface_hub`/torch (venv); it stays manual.
- **PR 2b** (owner-run synthesis, 164 files / 313 MB, history-growth decision): issue #178.

```text
CONSENSUS MANIFEST
Task: Fix scripts/tts/extract_narration.py so (a) prose after a multi-line widget
  (<Quiz ... />) is kept and (b) a double-quoted title containing an apostrophe is
  not truncated; then re-extract, validate and regenerate the affected narration.

Risk tier and rationale: T2. A narration-pipeline change touching every lesson's
  shipped audio package. No auth, secrets, or T1 path (worker/, session.ts,
  gist-sync.ts, AuthBar.tsx) is involved. Review path: Chair + Skeptic (C).

Measured scope (current code, current MDX, worktree at f739912; all VERIFIED):
  1. Dropped prose: 41/41 lessons. _drop_jsx_block looks for "</Quiz>" or a
     "/>"-ending line that starts with "<[A-Z]". A multi-line "<Quiz\n ...\n/>"
     has neither, so it scans to EOF and logs "unclosed JSX block <Quiz> ...
     ran to EOF" (the warning fires for every lesson). Everything after the Quiz
     is lost: "Go deeper" and "Sources & further reading". A prototype that also
     accepts a bare "/>" line ends the skip correctly and recovers 516 blocks
     across 41 lessons (+8 to +23 per lesson; e.g. anti-corruption-layer 35 -> 47).
     The runtime DOM extractor (src/lib/listen.ts) skips only widget classes, so
     those sections ARE spoken in browser TTS; the recorded narration omits them.
  2. Truncated title: 1 lesson, cloud-native-architecture. _read_meta uses
     ['"]([^'"]+)['"], so the title stops at the apostrophe: shipped
     public/audio/cloud-native-architecture/{us,uk}/narration.json block 0 reads
     "...Building for Someone Else" (source: "...Someone Else's Computer").
  3. Naming caveat: the issue calls (1) "ACL prose". UNVERIFIED which lesson the
     original reviewer meant; the defect reproduced here is the Quiz skip, which
     hits the anti-corruption-layer lesson (73 lines lost) and the other 40.
  4. NEW4-1 ("22 blocks") and NEW4-2 ("re-extract"): titles are not in the
     available source file (MISSING part). The 22 is NOT reproduced: the measured
     figure is 516 blocks. NEW4-2 is covered by the re-extract step below.
     UNVERIFIED how 22 relates to 516.
  5. Separate finding, out of scope: shipped manifests for 4 lessons
     (autocomplete-freshness-safety, back-of-envelope-estimation,
     estimation-reference-numbers, search-autocomplete) differ from a fresh
     extract in 43 blocks even ignoring the extractor bug (MDX edited after
     synthesis; stale audio). Regeneration covers them as a side effect.

Scenarios / acceptance conditions:
  A1. A multi-line self-closing widget ends at its "/>" line; prose after it is spoken.
  A2. Widget internals (Quiz questions/options) are still never spoken.
  A3. Single-line self-closed widgets and "<X>...</X>" blocks behave as today.
  A4. Titles with apostrophes keep them, in both quote styles.
  A5. No "unclosed JSX block" warning on any current lesson.
  A6. After re-extract: validate_manifest.py passes for all slugs and both accents;
      narration index regenerated; npm test, lint, build green.

Failing tests (added in this PR, scripts/tts/test_extract.py; run:
  cd scripts/tts && python -m unittest test_extract -v ; 6 tests, 4 FAIL, 2 pass as controls):
  FAIL MultilineWidgetTests.test_prose_after_multiline_quiz_survives
       AssertionError: 'Go deeper' not found in ['Takeaways', 'The ACL keeps the foreign model out of your domain.']
  FAIL TitleTests.test_double_quoted_title_keeps_apostrophe
       'Cloud-Native Architecture: Building for Someone Else' != "...Someone Else's Computer"
  FAIL RealLessonTests.test_trailing_sections_are_narrated_in_every_lesson  (41 lessons)
  FAIL RealLessonTests.test_title_matches_meta_in_every_lesson  (['cloud-native-architecture'])
  ok   WidgetSkipTests.test_self_closed_widget_is_not_spoken (control)
  ok   WidgetSkipTests.test_quiz_internals_are_never_spoken (control; must stay green)

Scoped files (maximum 3):
  Code change (phase 2), 2 files:
    1. scripts/tts/extract_narration.py   (_drop_jsx_block end condition; _read_meta title regex)
    2. scripts/tts/test_extract.py        (this PR, phase 1)
  Plus this manifest docs/manifests/l3-tts-extractor.md (phase 1 only) = 3 files in
  the authored set.
  EXCEPTION requested: the re-extract regenerates tracked generated artifacts:
    public/audio/<slug>/{us,uk}/narration.{json,opus} for 41 lessons (164 tracked files)
    plus the narration index output of generate_narration_index.py, and
    EVIDENCE_LOG.md (mandatory T1/T2 entry). Justification: these are machine output
    of the fixed extractor, not hand edits; the alternative (not regenerating) leaves
    the shipped audio missing the Sources/Go deeper sections and the wrong title.
  Size: public/audio is 313 MB in total today; a full regeneration rewrites all of
  it (~2.5 MB opus + ~70 KB json per accent per lesson). Git churn ~313 MB in one PR.
  Proposed to split: PR 2a code + tests only (this branch); PR 2b generated audio,
  so review of logic is not buried in binaries. Chair to decide.

Can regeneration run in this environment? NO (VERIFIED): no scripts/tts/.venv, torch
  and kokoro not installed (python -c import fails), Kokoro-82M weights not cached.
  ffmpeg is present, python 3.12.8 is present. Not attempted. Extraction alone
  (extract_narration.py) runs here and is what the tests use.
  Owner must run (on a machine with the venv, per scripts/tts/requirements.txt):
    python3 scripts/tts/extract_narration.py
    python3 scripts/tts/synthesize.py            (all slugs, both accents; CPU, long)
    python3 scripts/tts/validate_manifest.py <slug> us|uk   (each)
    npm run narration:index
  Cheaper variant for the Chair to consider: synthesize --slugs cloud-native-architecture
  only (title fix) now, trailing-section regeneration batched later. Not recommended:
  it leaves 40 lessons silent on their Sources section.

Risks / unknowns:
  - Fix must end a widget on "/>" without mis-ending on a nested "/>" inside
    props (e.g. "<Foo bar={<Baz />}"): a nested self-close would be indented and not
    a bare "/>" line; prototype matched only a stripped-equal "/>" line. Verify per
    lesson that Quiz internals stay unspoken (test A2).
  - ScrollyDiagram / PacketFlow / VsToggle also use multi-line forms; the prototype
    changed outputs only through the post-Quiz recovery (check in phase 2 that no
    mid-lesson widget now leaks prose).
  - Longer audio: +8 to +23 blocks per lesson changes duration, contentHash, and the
    narration index; player seek model reads manifests, no code change expected
    (UNVERIFIED until e2e).
  - "ACL prose" naming mismatch and the NEW4 titles are unresolved (see above).
  - Budget: 41 x 2 synthesis runs are slow on CPU; not measured here.

Rejected alternatives and why:
  - Strip the Quiz via a regex over the whole file: brittle against future widgets.
  - Make "unclosed JSX" warning fatal only: detects, does not fix.
  - Patch the 41 MDX files to add </Quiz>: edits lesson content to suit a script;
    the MDX is valid as is.
  - Hand-edit shipped narration.json: breaks word timings and contentHash.
  - Re-synthesize only the title lesson: see above.

Token budget (maximum 15,000): phase 1 spent roughly 14k estimated (unreliable;
  not measured by the harness). Phase 2 expected small for code, dominated by the
  owner-run synthesis which costs no model tokens.

Approvals / votes / dissent: none yet. Skeptic (C) review requested.
Chair decision (including any veto): pending.
```

## Process improvement proposals (max 2)

1. Add `python -m unittest test_extract` (and `test_align`) to CI; neither Python suite runs in a workflow today (grep of `.github/workflows` found no reference, VERIFIED).
2. Make the extractor's "unclosed JSX" warning fail the narration step, so this cannot ship silently again.
