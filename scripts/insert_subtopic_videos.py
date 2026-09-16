"""Insert one verified tutorial video line at the end of each instructional
subsection across all course MDX lessons.

Input: ~/workspace/video-research/final-276.json (keys: lesson, subtopic, url, title, channel, reason)
Treatment per subtopic (inserted as the last block of its ## section):
    🎥 **Learn more:** [title](url) — channel. reason

Safety:
- Matches `## <subtopic>` headings exactly; fails loudly on missing/duplicate headings.
- Insertion point is the end of the section (next `## ` heading outside fenced
  code blocks, or EOF); trailing blank lines are normalized, content untouched.
- Skips records whose URL is already present in the target section (idempotent).
- Never touches Takeaways / Go deeper / Sources sections (no such subtopics exist
  in the dataset, verified separately).
"""
import json
import re
import sys
from collections import defaultdict

RESEARCH = '/home/hatch/workspace/video-research/final-276.json'
LESSONS_DIR = '/home/hatch/workspace/repo-review/content/lessons'
TREATMENT_MARK = '🎥 **Learn more:**'


def video_line(r):
    title = r['title'].replace('[', '\\[').replace(']', '\\]')
    if '](' in r['title']:
        raise ValueError(f"title breaks markdown link syntax: {r['title']!r}")
    return f"{TREATMENT_MARK} [{title}]({r['url']}) — {r['channel']}. {r['reason']}"


def find_section(lines, heading):
    """Return (heading_idx, section_end_idx). section_end_idx is the index of the
    next `## ` heading outside fenced code blocks, or len(lines)."""
    target = f'## {heading}'
    hits = [i for i, l in enumerate(lines) if l.rstrip('\n') == target]
    if not hits:
        return None, f'missing heading: {target}'
    if len(hits) > 1:
        return None, f'duplicate heading ({len(hits)}x): {target}'
    h = hits[0]
    in_fence = False
    for i in range(h + 1, len(lines)):
        s = lines[i]
        if s.lstrip().startswith('```'):
            in_fence = not in_fence
        if not in_fence and s.startswith('## '):
            return h, i
    return h, len(lines)


def main():
    records = json.load(open(RESEARCH))
    by_lesson = defaultdict(list)
    for r in records:
        by_lesson[r['lesson']].append(r)

    total_inserted = 0
    total_skipped = 0
    errors = []

    for lesson in sorted(by_lesson):
        path = f'{LESSONS_DIR}/{lesson}.mdx'
        try:
            text = open(path).read()
        except FileNotFoundError:
            errors.append(f'{lesson}: file not found')
            continue
        lines = text.split('\n')
        changed = False
        for r in by_lesson[lesson]:
            res = find_section(lines, r['subtopic'])
            if res[0] is None:
                errors.append(f'{lesson}: {res[1]}')
                continue
            h, end = res
            section = '\n'.join(lines[h:end])
            if r['url'] in section:
                total_skipped += 1
                continue
            # strip trailing blank lines of the section, then append the video line
            while end > h + 1 and lines[end - 1].strip() == '':
                del lines[end - 1]
                end -= 1
            lines[end:end] = ['', video_line(r), '']
            changed = True
            total_inserted += 1
        if changed:
            open(path, 'w').write('\n'.join(lines))
        # verify count for this lesson
        got = open(path).read().count(TREATMENT_MARK)
        want = len(by_lesson[lesson])
        status = 'OK ' if got == want else 'COUNT-MISMATCH '
        print(f'{status}{lesson}: {got}/{want} video lines')

    print(f'\ninserted={total_inserted} skipped-already-present={total_skipped} errors={len(errors)}')
    for e in errors:
        print('ERROR:', e)
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
