#!/usr/bin/env python3
"""CI guard: validate lesson MDX frontmatter and quiz integrity.

Each content/lessons/*.mdx file must start with:
    export const meta = { slug, title, tier, order, summary, estimatedMinutes,
                          difficulty?, topics? };

Per-file checks:
  - `export const meta = {...}` exists and parses
  - required fields present with correct types
  - slug matches the filename (rate-limiting.mdx -> slug 'rate-limiting')
  - tier is one of beginner | intermediate | advanced
  - order is a positive int, estimatedMinutes a positive number
  - difficulty, when present, is an int in 1..5
  - topics, when present, is a list of non-empty strings
  - every quiz question's correctIndex is within its options range,
    every question has text and >= 2 options

Cross-file checks:
  - slugs are unique, orders are unique

Why this exists: lessons.ts reads meta at module-evaluation time with no
validation, so one malformed lesson throws before React mounts and the whole
site renders blank. This script is the build-time schema check tsc cannot do
(@types/mdx can't type non-component exports).
"""

import glob
import os
import re
import sys

LESSON_GLOB = "content/lessons/*.mdx"
REQUIRED_FIELDS = ["slug", "title", "tier", "order", "summary", "estimatedMinutes"]
TIERS = {"beginner", "intermediate", "advanced"}


def extract_meta_block(text: str) -> str | None:
    """Return the raw text of `export const meta = { ... };`, balanced braces."""
    m = re.search(r"export\s+const\s+meta\s*=\s*\{", text)
    if not m:
        return None
    depth = 0
    for i in range(m.start(), len(text)):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[m.start() : i + 1]
    return None  # unbalanced


def field_str(block: str, name: str) -> str | None:
    m = re.search(name + r"\s*:\s*'((?:[^'\\]|\\.)*)'", block)
    if m:
        return m.group(1)
    m = re.search(name + r'\s*:\s*"((?:[^"\\]|\\.)*)"', block)
    return m.group(1) if m else None


def field_int(block: str, name: str) -> int | None:
    m = re.search(name + r"\s*:\s*(\d+)", block)
    return int(m.group(1)) if m else None


def field_topics(block: str) -> list[str] | None:
    m = re.search(r"topics\s*:\s*\[([^\]]*)\]", block, re.DOTALL)
    if not m:
        return None
    return re.findall(r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"", m.group(1))


def check_quizzes(path: str, text: str) -> list[str]:
    """Every correctIndex must point at a real option of its own question."""
    violations = []
    lines = text.splitlines(keepends=True)
    # Line numbers (1-based) inside fenced code blocks: a ```mermaid diagram
    # could contain the words "options"/"correctIndex" without being a quiz.
    fenced: set[int] = set()
    in_fence = False
    for i, line in enumerate(lines, start=1):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            fenced.add(i)

    def line_of(pos: int) -> int:
        return text.count("\n", 0, pos) + 1

    def in_code(pos: int) -> bool:
        return line_of(pos) not in fenced

    for m in re.finditer(r"correctIndex\s*:\s*(\d+)", text):
        if not in_code(m.start()):
            continue
        correct = int(m.group(1))
        opt_pos = text.rfind("options:", 0, m.start())
        if opt_pos == -1 or not in_code(opt_pos):
            violations.append(f"{path}: correctIndex={correct} has no preceding options block")
            continue
        bracket = text.find("[", opt_pos)
        if bracket == -1 or bracket > m.start():
            violations.append(f"{path}: correctIndex={correct} has malformed options block")
            continue
        # Count string literals inside options:[ ... ] at bracket depth 0.
        depth = 0
        count = 0
        i = bracket
        in_str: str | None = None
        while i < len(text):
            ch = text[i]
            if in_str:
                if ch == "\\":
                    i += 2
                    continue
                if ch == in_str:
                    in_str = None
                    if depth == 1:
                        count += 1
            elif ch in ("'", '"'):
                in_str = ch
            elif ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        if depth != 0:
            violations.append(f"{path}:{line_of(m.start())}: unbalanced options block")
        elif not (0 <= correct < count):
            violations.append(
                f"{path}:{line_of(m.start())}: correctIndex={correct} out of range "
                f"for {count} options"
            )
        elif count < 2:
            violations.append(
                f"{path}:{line_of(m.start())}: question has fewer than 2 options"
            )

    # Every rendered question needs text. The backreference requires the same
    # quote to open and close, so `question: "'Read-your-writes' ..."` (a
    # single-quoted phrase inside a double-quoted string) is not flagged.
    for m in re.finditer(r"question\s*:\s*(['\"])\s*\1", text):
        if in_code(m.start()):
            violations.append(
                f"{path}:{line_of(m.start())}: quiz question has empty text"
            )
    return violations


def check_file(path: str) -> tuple[list[str], dict | None]:
    violations: list[str] = []
    text = open(path, encoding="utf-8").read()
    expected_slug = os.path.splitext(os.path.basename(path))[0]

    block = extract_meta_block(text)
    if block is None:
        return [f"{path}: missing `export const meta = {{...}}`"], None

    for name in REQUIRED_FIELDS:
        if not re.search(name + r"\s*:", block):
            violations.append(f"{path}: meta missing required field '{name}'")

    slug = field_str(block, "slug")
    title = field_str(block, "title")
    tier = field_str(block, "tier")
    order = field_int(block, "order")
    minutes = field_int(block, "estimatedMinutes")
    difficulty = field_int(block, "difficulty")
    topics = field_topics(block)
    summary = field_str(block, "summary")

    if slug != expected_slug:
        violations.append(
            f"{path}: slug {slug!r} does not match filename (expected {expected_slug!r})"
        )
    if not title:
        violations.append(f"{path}: title must be a non-empty string")
    if tier not in TIERS:
        violations.append(f"{path}: tier {tier!r} not in {sorted(TIERS)}")
    if order is None or order < 1:
        violations.append(f"{path}: order must be a positive int, got {order!r}")
    if minutes is None or minutes < 1:
        violations.append(f"{path}: estimatedMinutes must be positive, got {minutes!r}")
    if not summary:
        violations.append(f"{path}: summary must be a non-empty string")
    if re.search(r"difficulty\s*:", block) and (difficulty is None or not 1 <= difficulty <= 5):
        violations.append(f"{path}: difficulty must be an int in 1..5, got {difficulty!r}")
    if re.search(r"topics\s*:", block):
        if topics is None:
            violations.append(f"{path}: topics must be a list of strings")
        else:
            flat = [a or b for a, b in topics]
            if any(not t.strip() for t in flat):
                violations.append(f"{path}: topics contains an empty string")

    violations.extend(check_quizzes(path, text))
    return violations, {"slug": slug, "order": order}


def main() -> int:
    violations: list[str] = []
    seen_slugs: dict[str, str] = {}
    seen_orders: dict[int, str] = {}

    for path in sorted(glob.glob(LESSON_GLOB)):
        file_violations, meta = check_file(path)
        violations.extend(file_violations)
        if meta:
            slug, order = meta["slug"], meta["order"]
            if slug in seen_slugs:
                violations.append(f"{path}: duplicate slug {slug!r} (also in {seen_slugs[slug]})")
            else:
                seen_slugs[slug] = path
            if order in seen_orders:
                violations.append(
                    f"{path}: duplicate order {order} (also in {seen_orders[order]})"
                )
            else:
                seen_orders[order] = path

    for v in violations:
        print(v, file=sys.stderr)
    if violations:
        print(f"\n{len(violations)} lesson validation error(s) found.", file=sys.stderr)
        return 1
    print(f"OK: {len(seen_slugs)} lessons validated (slugs/orders unique, quizzes in range).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
