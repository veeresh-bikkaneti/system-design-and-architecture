#!/usr/bin/env python3
"""Build-time Kokoro narration synthesizer.

Reads narration scripts produced by extract_narration.py
(scripts/tts/narration/<slug>.json) and synthesizes one .opus file
plus a word-timestamp manifest per lesson under public/audio/<slug>/.

Word timings come from Kokoro's own duration predictor: KPipeline populates
misaki MToken.start_ts / end_ts via join_timestamps, so timings match the
rendered audio exactly -- no second-model estimation.

Manifest words use the SURFACE text (tokenized with the same contract as
src/lib/narration.ts), while timings are mapped from the SPOKEN token
stream via sequential fuzzy alignment (misaki expands numbers/symbols, e.g.
"3" -> "three", "$5" -> "five dollars").

Usage:
    .venv/bin/python scripts/tts/synthesize.py [options]
    .venv/bin/python scripts/tts/synthesize.py --slugs scaling,caching --limit-blocks 3
    .venv/bin/python scripts/tts/synthesize.py --only-missing   # resume

Requires: pip install -r scripts/tts/requirements.txt, espeakng-loader
(PyPI; bundles the espeak-ng shared library — no system espeak-ng binary needed),
spacy en_core_web_sm, and Kokoro weights (auto-downloaded from
hexgrad/Kokoro-82M on first run into scripts/tts/.cache/hf).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

TTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = TTS_DIR.parent.parent
CACHE_DIR = TTS_DIR / ".cache"
NARRATION_DIR = TTS_DIR / "narration"
AUDIO_OUT = REPO_ROOT / "public" / "audio"
HF_CACHE = CACHE_DIR / "hf"

# ---------------------------------------------------------------------------
# Tokenization contract -- must mirror src/lib/narration.ts tokenizeWords()
# ---------------------------------------------------------------------------

# TS: /[\p{L}\p{N}]+(?:['\u2019][\p{L}\p{N}]+)*/gu
WORD_RE = re.compile(r"[^\W_]+(?:['\u2019][^\W_]+)*", re.UNICODE)


def tokenize_words(text: str) -> list[str]:
    return WORD_RE.findall(text)


def normalize_token(text: str) -> str:
    return re.sub(r"[^\w]", "", text.lower(), flags=re.UNICODE)


def expand_number(word: str) -> str | None:
    """Best-effort digit expansion to match misaki's spoken form."""
    try:
        from num2words import num2words
    except ImportError:
        return None
    if not re.fullmatch(r"\d+(?:\.\d+)?", word):
        return None
    try:
        return normalize_token(num2words(word))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Kokoro weight integrity
# ---------------------------------------------------------------------------

# SHA-256 published for kokoro-v1_0.pth (upstream hexgrad/Kokoro-82M, v1.0).
# If the computed hash differs, synthesis aborts -- never silently ship
# audio from unverified weights.
EXPECTED_WEIGHT_SHA256 = "496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def content_hash(block_texts: list[str]) -> str:
    """Fingerprint of the narration source text for staleness detection.

    SHA-256 over the extracted block texts joined with "\\n". Written into
    the manifest so CI / maintainers can tell whether a manifest still
    matches the lesson prose it was generated from. The player itself does
    not need this field: it detects staleness at runtime via the
    aligned-block ratio and tolerates manifests that predate the field.
    """
    h = hashlib.sha256()
    for t in block_texts:
        h.update(t.encode("utf-8"))
        h.update(b"\n")
    return h.hexdigest()


def locate_weights() -> Path:
    for base in (HF_CACHE, Path.home() / ".cache" / "huggingface"):
        for cand in base.rglob("kokoro-v1_0.pth"):
            return cand
    raise FileNotFoundError(
        "kokoro-v1_0.pth not found. Run once with network access so "
        "huggingface_hub can download hexgrad/Kokoro-82M."
    )


def enforce_hf_offline_mode() -> None:
    """Restore huggingface_hub's documented offline behavior when requested.

    HF_HUB_OFFLINE=1 is meant to make every Hub HTTP request raise
    OfflineModeIsEnabled, letting hf_hub_download fall back to the local
    cache. huggingface_hub 1.33 no longer enforces that inside get_session(),
    so a fully-cached download still builds an httpx client -- which crashes
    in this environment because the runtime proxy URL contains characters
    httpx cannot parse (``httpx.InvalidURL: Invalid port``). Patching the
    session factory only under HF_HUB_OFFLINE=1 keeps default (online)
    behavior untouched while making offline builds hermetic.
    """
    if not os.environ.get("HF_HUB_OFFLINE"):
        return
    from huggingface_hub.errors import OfflineModeIsEnabled
    from huggingface_hub.utils import _http as _hf_http

    def _offline_get_session(*args, **kwargs):  # noqa: ANN001, ANN002, ANN202
        raise OfflineModeIsEnabled("HF_HUB_OFFLINE=1: network disabled")

    _hf_http.get_session = _offline_get_session


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------

VOICE = "af_heart"  # natural American-English female voice used for all lessons
SAMPLE_RATE = 24000


class Synthesizer:
    def __init__(self, device: str = "cpu", speed: float = 1.0):
        # Set BEFORE importing kokoro: huggingface_hub freezes HF_HUB_CACHE
        # at import time, so setdefault must run first or the cache dir is
        # silently ignored and every run re-downloads (or fails offline).
        # Run with HF_HUB_OFFLINE=1 for hermetic builds: everything needed
        # is already in the pinned cache, and the offline shim below makes
        # huggingface_hub serve it without touching the network (avoids
        # proxy/DNS failures mid-batch).
        os.environ.setdefault("HF_HUB_CACHE", str(HF_CACHE))
        enforce_hf_offline_mode()
        from kokoro import KPipeline

        self.speed = speed
        print("Loading Kokoro pipeline (weights download on first run)...", flush=True)
        self.pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M", device=device)
        # This VM has few vCPUs and no swap: cap torch's thread pool so
        # inference doesn't oversubscribe the box (or balloon per-thread
        # workspace memory) while the agent runtime is also working.
        import torch

        torch.set_num_threads(2)
        weights = locate_weights()
        digest = sha256_file(weights)
        if digest != EXPECTED_WEIGHT_SHA256:
            raise SystemExit(
                f"Weight integrity check FAILED for {weights}\n"
                f"  expected: {EXPECTED_WEIGHT_SHA256}\n"
                f"  actual:   {digest}\n"
                "Refusing to synthesize from unverified weights."
            )
        print(f"Weight SHA-256 verified: {digest[:16]}...", flush=True)
        self.pack = self.pipeline.load_voice(VOICE)

    # -- token -> word alignment -------------------------------------------

    def _spoken_tokens(self, tokens) -> list[tuple[str, float, float]]:
        """Flatten misaki MTokens to (text, start, end) spoken word stream."""
        out: list[tuple[str, float, float]] = []
        for t in tokens:
            if not t.phonemes:  # punctuation / pure whitespace carry no audio
                continue
            text = (t.text or "").strip()
            if not text:
                continue
            start = t.start_ts if t.start_ts is not None else 0.0
            end = t.end_ts if t.end_ts is not None else start
            out.append((text, float(start), float(end)))
        return out

    def _align_words(
        self, surface: list[str], spoken: list[tuple[str, float, float]]
    ) -> list[tuple[str, float, float]]:
        """Map spoken timings onto surface words via sequential fuzzy match.

        Returns [(surface_word, start, end)] in surface order. Spoken tokens
        with no surface counterpart (e.g. "dollars" from "$5") extend the
        previous surface word's end time; unmatched surface words get a
        zero-length span (frontend falls back gracefully).
        """
        result: list[tuple[str, float, float]] = []
        si = 0
        pending: list[tuple[str, float, float]] = []  # spoken tokens awaiting a surface word

        def surface_key(w: str) -> set[str]:
            n = normalize_token(w)
            keys = {n}
            exp = expand_number(n)
            if exp:
                keys.add(exp)
                keys.add(exp.replace(" ", ""))
            return keys

        def spoken_key(t: str) -> str:
            return normalize_token(t)

        for text, start, end in spoken:
            sk = spoken_key(text)
            matched = False
            # Look ahead a few surface words for the match (misaki may merge
            # or split tokens relative to the surface tokenization).
            for look in range(0, 4):
                idx = si + look
                if idx >= len(surface):
                    break
                if sk in surface_key(surface[idx]):
                    # Attach any pending spoken audio to the gap words as
                    # blockers, then emit the matched word.
                    for g in range(si, idx):
                        wstart = pending[0][1] if pending else start
                        wend = pending[-1][2] if pending else start
                        result.append((surface[g], wstart, wend))
                    wstart = pending[0][1] if pending else start
                    result.append((surface[idx], wstart, end))
                    pending = []
                    si = idx + 1
                    matched = True
                    break
            if not matched:
                pending.append((text, start, end))

        # Trailing surface words: extend with any leftover audio.
        for g in range(si, len(surface)):
            wstart = pending[0][1] if pending else 0.0
            wend = pending[-1][2] if pending else 0.0
            result.append((surface[g], wstart, wend))

        # Monotonic clamp: folding expansion words (e.g. "dollars" from "$5")
        # into neighboring surface words can otherwise produce overlapping or
        # regressing spans. The player binary-searches on non-decreasing
        # starts, so enforce start[i+1] >= end[i] here; overlapped words
        # become zero-length (counted as dropped downstream).
        clamped: list[tuple[str, float, float]] = []
        prev_end = 0.0
        for w, s, e in result:
            s = max(s, prev_end)
            e = max(e, s)
            clamped.append((w, s, e))
            prev_end = e
        return clamped

    # -- per-block synthesis -----------------------------------------------

    def synthesize_block(self, text: str) -> tuple[list[float], list[tuple[str, float, float]], int]:
        """Synthesize one narration block.

        Returns (audio_samples, surface_words_with_times, dropped_words).
        Timings are offset so they are absolute within the block.
        """
        import numpy as np
        import torch

        surface = tokenize_words(text)
        chunks: list[list[float]] = []
        spoken_all: list[tuple[str, float, float]] = []
        offset = 0.0

        for result in self.pipeline(text, voice=self.pack, speed=self.speed):
            audio = result.audio
            if audio is None:
                continue
            samples = audio.detach().cpu().tolist()
            chunks.append(samples)
            dur = len(samples) / SAMPLE_RATE
            for tok_text, s, e in self._spoken_tokens(result.tokens or []):
                spoken_all.append((tok_text, s + offset, e + offset))
            offset += dur

        audio_flat = [s for c in chunks for s in c]
        aligned = self._align_words(surface, spoken_all)
        dropped = sum(1 for _, s, e in aligned if e <= s)
        return audio_flat, aligned, dropped

    # -- per-lesson ----------------------------------------------------------

    def synthesize_lesson(
        self, slug: str, limit_blocks: int = 0, block_dir: Path | None = None
    ) -> dict:
        """Synthesize every block of a lesson.

        Block audio is streamed to per-block WAV files in ``block_dir``
        (created by the caller) instead of accumulating the whole lesson as
        Python floats: a 15-minute lesson is ~21M samples (~500MB as a
        float list), which OOM-kills the synth on small VMs. The returned
        dict carries the WAV paths under ``"block_wavs"`` for the caller
        to concatenate; word timings are identical to the in-memory
        version (same sample counts, same offsets).
        """
        import numpy as np
        import soundfile as sf

        src = NARRATION_DIR / f"{slug}.json"
        with src.open("r", encoding="utf-8") as f:
            narration = json.load(f)

        blocks = narration["blocks"]
        if limit_blocks:
            blocks = blocks[:limit_blocks]
        if block_dir is None:
            raise ValueError("block_dir is required (streaming synthesis)")

        block_wavs: list[str] = []
        manifest_blocks: list[dict] = []
        total_dropped = 0
        total_samples = 0
        t0 = time.time()

        for i, block in enumerate(blocks):
            text = block["text"]
            if not text.strip():
                continue
            samples, words, dropped = self.synthesize_block(text)
            start = total_samples / SAMPLE_RATE
            wav_path = block_dir / f"block_{i:04d}.wav"
            sf.write(str(wav_path), np.asarray(samples, dtype=np.float32), SAMPLE_RATE)
            total_samples += len(samples)
            del samples  # free the block's audio before the next one
            end = total_samples / SAMPLE_RATE
            block_wavs.append(str(wav_path))
            total_dropped += dropped
            manifest_blocks.append(
                {
                    "index": i,
                    "kind": block["kind"],
                    "text": text,
                    "start": round(start, 3),
                    "end": round(end, 3),
                    # Words must be lesson-absolute (media time): synthesize_block
                    # returns block-relative timings, so shift by the block's
                    # start offset. The player binary-searches flattened words
                    # against audio.currentTime.
                    "words": [
                        {"text": w, "start": round(s + start, 3), "end": round(e + start, 3)}
                        for w, s, e in words
                    ],
                }
            )
            if (i + 1) % 10 == 0 or i + 1 == len(blocks):
                el = time.time() - t0
                print(f"  [{slug}] block {i + 1}/{len(blocks)} ({el:.0f}s elapsed)", flush=True)

        duration = total_samples / SAMPLE_RATE
        print(
            f"  [{slug}] done: {len(manifest_blocks)} blocks, "
            f"{duration / 60:.1f} min audio, {total_dropped} zero-length words",
            flush=True,
        )
        chash = content_hash([b["text"] for b in manifest_blocks])
        print(f"  [{slug}] contentHash: {chash}", flush=True)
        return {
            "slug": slug,
            "voice": VOICE,
            "sampleRate": SAMPLE_RATE,
            "duration": round(duration, 3),
            "contentHash": chash,
            "blocks": manifest_blocks,
            "block_wavs": block_wavs,
        }


# ---------------------------------------------------------------------------
# Encoding + packaging
# ---------------------------------------------------------------------------


def encode_concat_opus(wav_paths: list[str], out_path: Path) -> None:
    """Concatenate per-block WAVs and encode straight to Opus.

    The ffmpeg concat demuxer joins the identical-PCM block files with no
    re-encode between them, so the result is sample-identical to encoding
    one concatenated WAV -- while never holding the whole lesson in RAM.
    """
    if not wav_paths:
        raise ValueError("no audio blocks synthesized; refusing to write empty opus")
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".txt", delete=False, encoding="utf-8"
    ) as list_file:
        for wav in wav_paths:
            # Absolute paths + -safe 0: no quoting surprises from block names.
            list_file.write(f"file '{Path(wav).resolve()}'\n")
        list_path = list_file.name
    try:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                "ffmpeg", "-y", "-v", "error",
                "-f", "concat", "-safe", "0",
                "-i", list_path,
                "-c:a", "libopus", "-b:a", "48k",
                str(out_path),
            ],
            check=True,
        )
    finally:
        Path(list_path).unlink(missing_ok=True)


def write_lesson_package(synth: Synthesizer, slug: str, limit_blocks: int = 0) -> Path:
    lesson_out = AUDIO_OUT / slug
    lesson_out.mkdir(parents=True, exist_ok=True)
    # Block WAVs live in a temp dir that is always cleaned up, even when
    # synthesis or encoding fails mid-lesson.
    with tempfile.TemporaryDirectory(prefix=f"{slug}-blocks-", dir=str(AUDIO_OUT)) as tmp:
        lesson = synth.synthesize_lesson(slug, limit_blocks, block_dir=Path(tmp))
        opus_path = lesson_out / "narration.opus"
        encode_concat_opus(lesson.pop("block_wavs"), opus_path)

    # The player (src/lib/narration.ts) resolves the audio URL from this
    # field; it must be present or the manifest is rejected as invalid.
    lesson["audio"] = "narration.opus"

    manifest_path = lesson_out / "narration.json"
    with manifest_path.open("w", encoding="utf-8") as f:
        json.dump(lesson, f, ensure_ascii=False)
    return lesson_out


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def list_slugs() -> list[str]:
    content_dir = REPO_ROOT / "src" / "content" / "lessons"
    return sorted(p.stem for p in content_dir.glob("*.mdx"))


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Synthesize Kokoro narration for lessons.")
    p.add_argument("--slugs", default="", help="Comma-separated lesson slugs (default: all)")
    p.add_argument("--limit-blocks", type=int, default=0, help="Only synthesize the first N blocks per lesson (smoke tests)")
    p.add_argument("--only-missing", action="store_true", help="Skip lessons that already have narration.opus + narration.json")
    p.add_argument("--device", default="cpu")
    p.add_argument("--speed", type=float, default=1.0)
    return p.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    slugs = [s for s in args.slugs.split(",") if s] or list_slugs()
    if args.only_missing:
        slugs = [
            s for s in slugs
            if not ((AUDIO_OUT / s / "narration.opus").exists() and (AUDIO_OUT / s / "narration.json").exists())
        ]
    if not slugs:
        print("Nothing to synthesize.")
        return 0

    print(f"Synthesizing {len(slugs)} lesson(s): {', '.join(slugs)}")
    synth = Synthesizer(device=args.device, speed=args.speed)
    failed: list[str] = []
    for slug in slugs:
        if not (NARRATION_DIR / f"{slug}.json").exists():
            print(f"  [{slug}] narration script missing -- run extract_narration.py first; skipping")
            failed.append(f"{slug} (no narration script)")
            continue
        t0 = time.time()
        try:
            out_dir = write_lesson_package(synth, slug, limit_blocks=args.limit_blocks)
        except Exception as e:  # noqa: BLE001 -- one bad lesson must not kill the batch
            print(f"  [{slug}] FAILED after {time.time() - t0:.0f}s: {e}")
            failed.append(f"{slug} ({type(e).__name__}: {e})")
            continue
        print(f"  [{slug}] wrote {out_dir} in {time.time() - t0:.0f}s")
    if failed:
        print(f"\n{len(failed)} lesson(s) failed:")
        for f in failed:
            print(f"  - {f}")
        print("Re-run with --only-missing to retry just these.")
        return 1
    print("\nAll lessons synthesized.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
