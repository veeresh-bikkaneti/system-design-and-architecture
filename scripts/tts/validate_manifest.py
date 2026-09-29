#!/usr/bin/env python3
"""Validate a generated narration package against the player contract.

Checks public/audio/<slug>/narration.json + narration.opus against every
assumption in src/lib/narration.ts / src/components/LessonNarrator.tsx:

- manifest has slug/voice/sampleRate/duration/audio/blocks
- manifest.audio == "narration.opus" and the file exists and is non-empty
- every block has kind in {title, summary, prose}, text, and words
- every word has text (NOT "t"), start, end with 0 <= start <= end <= duration
- word start times are non-decreasing within the lesson
- block [start, end] spans cover their words

Usage: .venv/bin/python scripts/tts/validate_manifest.py <slug>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
AUDIO_OUT = REPO_ROOT / "public" / "audio"
VALID_KINDS = {"title", "summary", "prose"}


def fail(msg: str) -> int:
    print(f"INVALID: {msg}")
    return 1


def main(slug: str) -> int:
    out_dir = AUDIO_OUT / slug
    manifest_path = out_dir / "narration.json"
    opus_path = out_dir / "narration.opus"
    if not manifest_path.exists():
        return fail(f"{manifest_path} missing")
    if not opus_path.exists() or opus_path.stat().st_size == 0:
        return fail(f"{opus_path} missing or empty")

    m = json.loads(manifest_path.read_text(encoding="utf-8"))
    for key in ("slug", "voice", "sampleRate", "duration", "audio", "blocks"):
        if key not in m:
            return fail(f"manifest missing key '{key}'")
    if m["audio"] != "narration.opus":
        return fail(f"manifest.audio = {m['audio']!r}, player expects 'narration.opus'")
    if m["slug"] != slug:
        return fail(f"manifest.slug = {m['slug']!r}, expected {slug!r}")
    duration = m["duration"]
    if not isinstance(duration, (int, float)) or duration <= 0:
        return fail(f"bad duration {duration!r}")
    if not m["blocks"]:
        return fail("manifest has no blocks")

    prev_end = 0.0
    total_words = 0
    for i, b in enumerate(m["blocks"]):
        if b.get("kind") not in VALID_KINDS:
            return fail(f"block {i}: bad kind {b.get('kind')!r}")
        if not isinstance(b.get("text"), str) or not b["text"].strip():
            return fail(f"block {i}: missing/empty text")
        words = b.get("words")
        if not isinstance(words, list) or not words:
            return fail(f"block {i}: missing/empty words")
        b_start, b_end = b.get("start"), b.get("end")
        for j, w in enumerate(words):
            if not isinstance(w.get("text"), str) or not w["text"]:
                return fail(f"block {i} word {j}: missing 'text' (got keys {sorted(w.keys())})")
            s, e = w.get("start"), w.get("end")
            if not (isinstance(s, (int, float)) and isinstance(e, (int, float))):
                return fail(f"block {i} word {j}: non-numeric timestamps")
            if not (0 <= s <= e <= duration + 0.5):
                return fail(f"block {i} word {j}: timestamp out of range [{s}, {e}]")
            if s < prev_end - 1e-6:
                return fail(f"block {i} word {j}: start {s} regresses before {prev_end}")
            prev_end = max(prev_end, e)
            total_words += 1
        if isinstance(b_start, (int, float)) and isinstance(b_end, (int, float)):
            w_first, w_last = words[0], words[-1]
            if not (b_start <= w_first["start"] + 0.01 and w_last["end"] <= b_end + 0.5):
                return fail(f"block {i}: block span [{b_start}, {b_end}] does not cover words")

    print(
        f"VALID: {slug}: {len(m['blocks'])} blocks, {total_words} words, "
        f"{duration:.1f}s audio, {opus_path.stat().st_size / 1024:.0f} KiB opus"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
