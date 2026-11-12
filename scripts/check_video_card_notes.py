#!/usr/bin/env python3
"""CI guard: VideoCard props must not carry provenance working notes.

Commit faea9fa ("swap 70 videos ... to verified sources", 2026-09-17)
left channel-provenance working notes inside VideoCard props in the
lessons — learner-visible via src/components/VideoCard.tsx. The notes
are the curator's verification scratchwork ("is this channel really
who the card claims?"), not lesson content. Once each attribution is
verified against the actual YouTube video (or the claim itself is
removed/reworded), the note must go, and this guard keeps the family
from coming back.

A line is a violation only when it is a `<VideoCard` line AND it
carries one of the provenance-note markers:

  - `Caveat:` — the caveat family ("non-trusted channel", "channel
    identity unverified", "channel unidentified", "no verified
    authoritative alternative found", "quick audio check advised")
  - `(unverified` — the source-prop attribution "(unverified —
    confirm channel on YouTube)"
  - `ID verified via third-party` — the verification-method working
    note ("ID verified via third-party summary page ...; channel
    attributed via ... links")

Deliberately NOT matched (negative fixtures in
scripts/test_check_video_card_notes.py prove each):
  - the ✅/◐/🔢 confidence glyphs — a by-design, in-lesson-explained
    convention in search-autocomplete, autocomplete-freshness-safety,
    back-of-envelope-estimation and estimation-reference-numbers;
  - ordinary prose, including prose that uses the word "Caveat:"
    outside a VideoCard, and VideoCards whose descriptions merely
    discuss verification as a topic.
"""

import glob
import re
import sys

PATTERNS = [
    re.compile(r"Caveat\s*:"),
    re.compile(r"\(\s*unverified\b"),
    re.compile(r"\bID verified via third-party\b"),
]


def check_lines(lines, path: str = "<fixture>") -> list[str]:
    violations = []
    for i, line in enumerate(lines, start=1):
        if "<VideoCard" not in line:
            continue
        if any(p.search(line) for p in PATTERNS):
            violations.append(
                f"{path}:{i}: VideoCard carries a provenance working note"
            )
    return violations


def check(path: str) -> list[str]:
    with open(path, encoding="utf-8") as fh:
        return check_lines(fh, path)


def main() -> int:
    violations: list[str] = []
    for path in sorted(glob.glob("content/lessons/*.mdx")):
        violations.extend(check(path))
    for v in violations:
        print(v, file=sys.stderr)
    if violations:
        print(f"\n{len(violations)} video-card note violation(s) found.", file=sys.stderr)
        return 1
    print("OK: no provenance working notes in VideoCard props.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
