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
  (stays in `scripts/tts/.cache/`, git-ignored).
- **Runtime cost:** $0.

## 3. `espeak-ng` + `misaki` — build-time phonemizer

- **Purpose:** grapheme-to-phoneme conversion that Kokoro was trained against.
  Used **only** inside the local synthesis script to turn words into phonemes.
- **Trusted source:** `espeak-ng` from the Ubuntu 24.04 (noble) official
  package archive via `apt`; `misaki` from PyPI (hexgrad's G2P library).
- **License:** espeak-ng is **GPL-3.0-or-later** — and that is fine here,
  deliberately: it is a *build-time tool*, never distributed, never linked
  into the course app, never shipped to learners. GPL obligations attach to
  distribution of the program, not to private use of a tool; the generated
  `.opus`/`.json` artifacts are data output, not a derivative work of
  espeak-ng. `misaki` itself is Apache-2.0.
- **Security:** espeak-ng is a decades-old, distro-packaged C program fed only
  our own lesson text; no network, no untrusted input. `misaki` is a small
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
| `espeak-ng` | Ubuntu archive | GPL-3.0-or-later, build-time tool only | No | ✅ |
| `misaki` (pip) | PyPI / hexgrad | Apache-2.0 | No (build-time) | ✅ |

Post-install step: run `pip-audit` on the venv and record the result here.
