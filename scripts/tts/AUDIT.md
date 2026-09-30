# TTS Tooling Audit — build-time narration pipeline

Date: 2026-09-29 · Branch: `feat/listen-natural-tts` · Auditor: Track A (implementation lead)

> Standing rule: audit purpose, trusted source, license, and security *before*
> downloading anything. Veeresh approved this exact set on 2026-09-29
> ("complete the work"). This file is the due-diligence record.

All three components are **build-time only**. Nothing below ships to learners:
no new runtime dependency is added to the course app (`package.json`
unchanged). The only artifacts committed to the repo are generated
`.opus` audio and `.json` timing files — plain data.

## 1. `kokoro` (PyPI) — neural TTS engine

- **Purpose:** synthesize lesson prose into natural human-like speech at build
  time. CPU-only inference on the dev VM.
- **Trusted source:** PyPI package `kokoro`, published from the official repo
  https://github.com/hexgrad/kokoro by hexgrad (the model's author).
  Installed from the default PyPI index; versions pinned in
  `scripts/tts/requirements.txt`. **CPU-only PyTorch:** `requirements.txt`
  installs `torch==2.14.0+cpu` from the official CPU-only PyTorch index
  (`https://download.pytorch.org/whl/cpu`) — a deliberate choice, since the
  dev VM has no GPU; it avoids the multi-GB CUDA build while remaining
  identical for Kokoro CPU inference.
- **License:** Apache-2.0 (repo LICENSE; matches the model card). Permits
  commercial and private use, modification, distribution — no copyleft
  obligations on our generated audio.
- **Security:** pure-Python + PyTorch wrapper; no network calls at inference
  time; no known CVE/advisory against the `kokoro` package itself (checked
  2026-09-29). Transitive note: the widely-reported `transformers`
  GHSA-xrqw-3rrv-vx5w (CVE-2026-9856) does **not** apply — Kokoro does not
  depend on `transformers`. The model weights are a pickle-based `.pth`;
  arbitrary-code risk from `torch.load` is mitigated by downloading **only**
  from the official Hugging Face repo and verifying SHA-256 against the
  upstream-published hash before first use (see §2).
- **Runtime cost:** $0 — runs once on the dev VM; output is static files.

## 2. Kokoro-82M model weights (~330 MB)

- **Purpose:** the actual voice model `kokoro` runs.
- **Trusted source:** the author's official Hugging Face repo
  https://huggingface.co/hexgrad/Kokoro-82M (files `kokoro-v1_0.pth` and
  `voices/*.pt`), fetched via `huggingface_hub` with checksum verification.
- **License:** Apache-2.0 per the official model card — weights may be used
  for any purpose, including generating audio we distribute.
- **Security:** binary weight file; SHA-256 verified against the
  upstream-published digest after download. Never executed as code; loaded
  only through the audited `kokoro` package. Not committed to the repo
  (stays in `scripts/tts/.cache/hf/`, git-ignored).
- **Runtime cost:** $0.

## 3. `espeakng-loader` + `misaki` — build-time phonemizer

- **Purpose:** grapheme-to-phoneme conversion that Kokoro was trained against.
  Used **only** inside the local synthesis script to turn words into phonemes.
- **Trusted source:** `espeakng-loader` (0.2.4) and `misaki` from PyPI
  (`espeakng-loader` bundles the espeak-ng library — hexgrad's G2P library).
  No system packages: an `apt-get install espeak-ng` attempt was abandoned
  as unnecessary (see §5); nothing outside the venv + bundled loader is used.
- **License:** espeak-ng is **GPL-3.0-or-later** — and that is fine here,
  deliberately: it is a *build-time tool*, never distributed, never linked
  into the course app, never shipped to learners. GPL obligations attach to
  distribution of the program, not to private use of a tool; the generated
  `.opus`/`.json` artifacts are data output, not a derivative work of
  espeak-ng. `misaki` itself is Apache-2.0.
- **Security:** espeak-ng is used here only as the native shared library bundled
  inside the `espeakng-loader` wheel — loaded in-process by the loader, no
  separate binary or distro package installed. It is fed only our own lesson
  text at build time; no network, no untrusted input. `misaki` is a small
  pure-Python wrapper; no known advisories.
- **Runtime cost:** $0.

## 4. `ffmpeg` (already on the VM)

- Used only to encode synthesized WAV → `.opus` (Opus in Ogg) for small,
  streamable web audio. Already installed (8.1.2); no download needed.

## Verdict

| Component | Source | License | Ships to users? | Approved |
|---|---|---|---|---|
| `kokoro` (pip) | PyPI / hexgrad | Apache-2.0 | No (build-time) | ✅ |
| Kokoro-82M weights | HF `hexgrad/Kokoro-82M` | Apache-2.0 | No (build-time) | ✅ |
| `espeakng-loader` (pip) | PyPI (espeak-ng bundle) | GPL-3.0-or-later, build-time tool only | No | ✅ |
| `misaki` (pip) | PyPI / hexgrad | Apache-2.0 | No (build-time) | ✅ |

## 5. Post-install verification (2026-09-29, continuation lead)

**Weight download — full disclosure.** Fetched from the official
`hexgrad/Kokoro-82M` Hugging Face repo via `huggingface_hub` into
`scripts/tts/.cache/hf/` (git-ignored, never committed):
- `kokoro-v1_0.pth` — 327,212,226 bytes (~312 MiB)
- `voices/af_heart.pt` — 523,425 bytes (~0.5 MiB)
- Download took ~10.5 min over the sandbox egress proxy. (Note: the first
  attempt failed on a malformed `no_proxy` env entry breaking httpx URL
  parsing; retried with a sanitized `no_proxy=localhost,127.0.0.1` — the
  proxy itself and the downloaded files were unaffected.)
- Follow-up: the remaining repo files (full 72-file snapshot — `config.json`,
  all `voices/*.pt`, docs, samples; ~35 MiB beyond the two files above)
  were fetched the same way into the same git-ignored cache, because
  `KModel` requires `config.json` at load time. Total cache ≈ 362 MiB.

**SHA-256 verification — PASS.**
- `kokoro-v1_0.pth`: `496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4`
- Matches `EXPECTED_WEIGHT_SHA256` pinned in `scripts/tts/synthesize.py`
  exactly. `synthesize.py` re-verifies this hash on every run and aborts on
  mismatch — unverified weights can never produce shipped audio.
- `voices/af_heart.pt`: `0ab5709b8ffab19bfd849cd11d98f75b60af7733253ad0d67b12382a102cb4ff`
  (recorded for reference; no upstream-published digest for voice files).

**`pip-audit` on `scripts/tts/.venv` — CLEAN (after one fix).**
- First run: 4 known vulnerabilities, all in `setuptools 78.1.0`
  (PYSEC-2025-49, PYSEC-2026-3447 — install-time tool, not used during
  inference, but fixed anyway).
- Fix: upgraded venv setuptools to >= 83.0.0. Re-run: **"No known
  vulnerabilities found."**
- Skipped (expected): `torch 2.14.0+cpu` (installed from the official
  `download.pytorch.org` CPU wheel index, not PyPI) and `en-core-web-sm`
  (spacy model package, not a PyPI distribution).

**PyTorch advisory — manual check (2026-09-29).** pip-audit skips the
`torch` CPU wheel because of its non-PyPI index origin, so this manual
check stands in for it. CVE-2026-24747 / PYSEC-2026-2286: an unpickler RCE
in `torch.load(weights_only=True)` (CVSS 8.8), fixed in PyTorch 2.10.0.
Our pin `torch==2.14.0+cpu` is newer than the fixed-in version → **not
affected**. Residual exposure is minimal regardless: torch runs only in
this build-time synthesis tool (never ships to learners, never runs in
the browser app); weights come only from the official Hugging Face repo
`hexgrad/Kokoro-82M`; and `synthesize.py` SHA-256-verifies
`kokoro-v1_0.pth` against the pinned `EXPECTED_WEIGHT_SHA256` before
synthesis proceeds — it aborts on mismatch, so unverified weights can
never produce shipped audio.

**`espeak-ng` system binary — NOT REQUIRED (correction to §3).**
- The phonemization path works entirely through the pip `espeakng-loader`
  (0.2.4), which bundles the espeak-ng library: verified live —
  `misaki.en.G2P` phonemizes English text with correct output and no system
  binary present.
- An `apt-get install espeak-ng` was attempted for completeness but
  `apt-get update` stalled for 20+ minutes on the sandbox egress proxy with
  zero output; the attempt was killed and abandoned as unnecessary. No
  system packages were installed or modified — §3 above already records the
  correct source (PyPI `espeakng-loader` bundle).
