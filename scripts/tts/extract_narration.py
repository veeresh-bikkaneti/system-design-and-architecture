#!/usr/bin/env python3
"""
Extract speakable narration scripts from lesson MDX files.

For each content/lessons/<slug>.mdx, emits scripts/tts/narration/<slug>.json:

    {
      "slug": "scaling-web-service",
      "blocks": [
        {"kind": "title",   "text": "From Zero to Millions: ..."},
        {"kind": "summary", "text": "..."},
        {"kind": "prose",   "text": "..."},
        ...
      ]
    }

Mirrors the skip semantics of the runtime DOM extractor (src/lib/listen.ts):
code fences, mermaid diagrams, JSX lesson widgets (VideoCard, Quiz, ...),
tables that contain code, and imports/exports are never spoken. Only plain
prose blocks (headings, paragraphs, list items, blockquotes, plain tables)
survive, in reading order.

Usage:
    python3 scripts/tts/extract_narration.py                 # all lessons
    python3 scripts/tts/extract_narration.py scaling-web-service
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LESSONS_DIR = ROOT / "content" / "lessons"
OUT_DIR = Path(__file__).resolve().parent / "narration"

# Component names are Capitalized in MDX; anything matching is a lesson
# widget (VideoCard, Quiz, StepThrough, ...) and must be skipped.
JSX_OPEN_RE = re.compile(r"<[A-Z][A-Za-z0-9]*(\s[^<>]*)?/?>")
JSX_SELF_CLOSE_RE = re.compile(r"/>$")
FENCE_RE = re.compile(r"^\s*```")
META_RE = re.compile(r"export\s+const\s+meta\s*=\s*\{")


def _strip_inline_md(text: str) -> str:
    """Remove inline markdown, keeping the readable words."""
    # images -> alt text (or drop); links -> link text
    text = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    # inline code -> spoken as the word itself
    text = re.sub(r"`([^`]*)`", r"\1", text)
    # emphasis
    text = re.sub(r"(\*\*|__)(.*?)\1", r"\2", text)
    text = re.sub(r"(\*|_)(.*?)\1", r"\2", text)
    text = re.sub(r"~~(.*?)~~", r"\1", text)
    # stray HTML-ish tags that slipped through
    text = re.sub(r"<[^>]+>", "", text)
    return text


def _speakable_punct(text: str) -> str:
    """Replace symbols that TTS would mangle with their spoken form."""
    text = text.replace("->", " to ").replace("=>", " to ")
    text = text.replace("&", " and ")
    text = re.sub(r"(?<=\d)%", " percent", text)
    text = text.replace("~", " about ")
    return text


def _clean_block(text: str) -> str:
    text = _strip_inline_md(text)
    text = _speakable_punct(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _read_meta(lines: list[str]) -> tuple[str, str]:
    """Pull slug + title + summary out of `export const meta = {...}`."""
    joined = "\n".join(lines)
    m = META_RE.search(joined)
    if not m:
        return "", "", ""
    depth = 0
    start = m.start()
    end = start
    for i, ch in enumerate(joined[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    body = joined[start:end]
    slug = re.search(r"slug:\s*['\"]([^'\"]+)['\"]", body)
    title = re.search(r"title:\s*['\"]([^'\"]+)['\"]", body)
    summary_m = re.search(r"summary:\s*(['\"])(.*?)\1\s*,", body, re.S)
    summary = summary_m.group(2) if summary_m else ""
    summary = re.sub(r"\s+", " ", summary).strip()
    return (
        slug.group(1) if slug else "",
        title.group(1) if title else "",
        summary,
    )


def _meta_line_span(lines: list[str]) -> tuple[int, int]:
    """Return (start, end) line indexes of the `export const meta = {...}` block."""
    start = next(
        (n for n, line in enumerate(lines) if META_RE.search(line)), None
    )
    if start is None:
        return (-1, -1)
    depth = 0
    for n in range(start, len(lines)):
        depth += lines[n].count("{") - lines[n].count("}")
        if depth == 0 and "{" in "".join(lines[start : n + 1]):
            return (start, n)
    return (start, len(lines) - 1)


def _drop_jsx_block(lines: list[str], i: int) -> int:
    """Skip a JSX component usage starting at lines[i]; return next index."""
    first = lines[i]
    m = re.match(r"\s*<([A-Z][A-Za-z0-9]*)", first)
    name = m.group(1) if m else ""
    if JSX_SELF_CLOSE_RE.search(first.rstrip()):
        return i + 1
    close_tag = f"</{name}>"
    j = i + 1
    while j < len(lines):
        if close_tag in lines[j]:
            return j + 1
        # a new capitalized JSX tag at line start ends an unclosed one
        if re.match(r"\s*<[A-Z]", lines[j]) and JSX_SELF_CLOSE_RE.search(
            lines[j].rstrip()
        ):
            return j
        j += 1
    # Unclosed JSX block: scanning ran to EOF, which would silently swallow
    # the rest of the lesson. Warn loudly (build-time, visible in logs) so a
    # stray "<Note:" in prose gets fixed instead of muting narration.
    if j - i > 50:
        print(
            f"WARNING: unclosed JSX block <{name}> at line {i + 1} ran to EOF "
            f"({j - i} lines skipped); check for a missing </{name}>",
            flush=True,
        )
    return j


def extract_blocks(source: str) -> list[dict]:
    lines = source.splitlines()
    slug, title, summary = _read_meta(lines)

    blocks: list[dict] = []
    if title:
        blocks.append({"kind": "title", "text": _clean_block(title)})
    if summary:
        blocks.append({"kind": "summary", "text": _clean_block(summary)})

    # --- strip meta export, imports, fences, JSX, comments ---
    body: list[str] = []
    meta_start, meta_end = _meta_line_span(lines)
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if meta_start <= i <= meta_end:
            i += 1
            continue

        if stripped.startswith("import "):
            i += 1
            continue
        if FENCE_RE.match(line):
            i += 1
            while i < len(lines) and not FENCE_RE.match(lines[i]):
                i += 1
            i += 1  # closing fence
            continue
        if re.match(r"\s*<[A-Z]", line):
            i = _drop_jsx_block(lines, i)
            continue
        if stripped.startswith("<!--"):
            while i < len(lines) and "-->" not in lines[i]:
                i += 1
            i += 1
            continue
        body.append(line)
        i += 1

    # --- markdown -> prose blocks ---
    current: list[str] = []
    table_rows: list[str] = []
    # Lines of the list item currently being accumulated. A wrapped list
    # item's continuation lines (indented, no new marker) belong to the same
    # spoken block — splitting them would pause mid-sentence and the pieces
    # would never match the single rendered <li>.
    pending_item: list[str] = []

    def flush_paragraph() -> None:
        if current:
            text = _clean_block(" ".join(current))
            if text:
                blocks.append({"kind": "prose", "text": text})
            current.clear()

    def flush_item() -> None:
        if pending_item:
            text = _clean_block(" ".join(pending_item))
            if text:
                blocks.append({"kind": "prose", "text": text})
            pending_item.clear()

    def flush_table() -> None:
        nonlocal table_rows
        rows = [r for r in table_rows if not re.match(r"^\s*\|?\s*:?-{2,}", r)]
        table_rows = []
        if not rows:
            return
        # Skip tables that contain code (mirrors the DOM extractor).
        if any("`" in r for r in rows):
            return
        for row in rows:
            cells = [c.strip() for c in row.strip().strip("|").split("|")]
            cells = [_clean_block(c) for c in cells if _clean_block(c)]
            if cells:
                blocks.append({"kind": "prose", "text": ", ".join(cells)})

    for line in body:
        stripped = line.strip()
        if not stripped:
            flush_paragraph()
            flush_table()
            flush_item()
            continue
        if re.match(r"^(\*\*\*|---|___)\s*$", stripped):
            flush_paragraph()
            flush_table()
            flush_item()
            continue
        # table row?
        if stripped.startswith("|") and stripped.endswith("|"):
            flush_paragraph()
            flush_item()
            table_rows.append(stripped)
            continue
        if table_rows:
            flush_table()
        # heading
        m = re.match(r"^(#{1,6})\s+(.*)", stripped)
        if m:
            flush_paragraph()
            flush_item()
            text = _clean_block(m.group(2))
            if text:
                blocks.append({"kind": "prose", "text": text})
            continue
        # blockquote
        if stripped.startswith(">"):
            flush_item()
            current.append(stripped.lstrip(">").strip())
            continue
        # list item
        m = re.match(r"^(\s*[-*+]|\s*\d+[.)])\s+(.*)", line)
        if m:
            flush_paragraph()
            flush_item()
            pending_item.append(m.group(2).strip())
            continue
        # Indented continuation of a wrapped list item: same spoken block.
        if pending_item and line[:1] in (" ", "\t"):
            pending_item.append(stripped)
            continue
        flush_item()
        current.append(stripped)

    flush_paragraph()
    flush_table()
    flush_item()
    return blocks


def main(argv: list[str]) -> int:
    only = set(argv[1:])
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(LESSONS_DIR.glob("*.mdx"))
    total_blocks = 0
    total_words = 0
    for path in files:
        if only and path.stem not in only:
            continue
        blocks = extract_blocks(path.read_text(encoding="utf-8"))
        words = sum(len(b["text"].split()) for b in blocks)
        total_blocks += len(blocks)
        total_words += words
        out = OUT_DIR / f"{path.stem}.json"
        out.write_text(
            json.dumps({"slug": path.stem, "blocks": blocks}, indent=1),
            encoding="utf-8",
        )
        print(f"{path.stem}: {len(blocks)} blocks, {words} words")
    print(f"TOTAL: {total_blocks} blocks, {total_words} words")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
