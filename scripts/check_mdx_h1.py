#!/usr/bin/env python3
"""CI guard: lesson MDX files must not contain top-level `# ` headings.

The lesson page renders its own <h1> (the lesson title); a Markdown `#`
heading would create a second h1 on the page. Lessons start their own
content at `##`. This script fails the build if any content/lessons/*.mdx
file has a line starting with `# ` (outside fenced code blocks).
"""

import glob
import sys


def check(path: str) -> list[str]:
    violations = []
    in_fence = False
    for i, line in enumerate(open(path, encoding="utf-8"), start=1):
        stripped = line.lstrip()
        if stripped.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if line.startswith("# "):
            violations.append(f"{path}:{i}: top-level h1 heading is not allowed")
    return violations


def main() -> int:
    violations: list[str] = []
    for path in sorted(glob.glob("content/lessons/*.mdx")):
        violations.extend(check(path))
    for v in violations:
        print(v, file=sys.stderr)
    if violations:
        print(f"\n{len(violations)} h1 violation(s) found.", file=sys.stderr)
        return 1
    print("OK: no h1 headings in lesson MDX.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
