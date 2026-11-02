"""Unit tests for the MDX narration extractor (INT R-09, issue #150).

Stdlib unittest only, same as test_align.py:

    cd scripts/tts && python -m unittest test_extract -v

These tests assert EXTRACTOR behaviour only: what extract_blocks() produces from
MDX source (inline snippets or content/lessons/*.mdx). None reads public/audio or
a committed narration manifest; shipped audio stays stale until the owner runs
synthesis (PR 2b), and the browser reader (src/lib/listen.ts) is the truth.

Two bugs these pin down, both reproduced on the real lessons:

1. A multi-line widget such as `<Quiz\\n  questions={[...]}\\n/>` has no `</Quiz>`
   and its opening line does not end in `/>`, so `_drop_jsx_block` runs to EOF
   and silently swallows every prose block after it ("Go deeper", "Sources &
   further reading").
2. `_read_meta` matches the title with `['\"]([^'\"]+)['\"]`, so a double-quoted
   title containing an apostrophe is cut at the apostrophe.
"""

import re
import unittest
from pathlib import Path

from extract_narration import LESSONS_DIR, extract_blocks

# Real tail of content/lessons/anti-corruption-layer.mdx (trimmed): the Quiz,
# then two prose sections that are rendered on the page and must be narrated.
QUIZ_TAIL = """\
## Takeaways

1. The ACL keeps the foreign model out of your domain.

<Quiz
  questions={[
    {
      question: "What is the failure mode of an ACL that becomes a dumping ground?",
      options: ["It leaks", "It becomes the junk drawer"],
    },
  ]}
/>

---

## Go deeper

Want to keep pulling this thread? These talks go further than we did here:

- [The Anti-corruption layer pattern](https://example.com/acl) - a talk.

## Sources & further reading

- Eric Evans, *Domain-Driven Design* (Addison-Wesley, 2003) - the ACL pattern.
"""

# Real meta shape of content/lessons/cloud-native-architecture.mdx.
APOSTROPHE_META = """\
export const meta = {
  slug: 'cloud-native-architecture',
  title: "Cloud-Native Architecture: Building for Someone Else's Computer",
  tier: 'advanced',
  summary:
    'Rent, do not own.',
};

Body paragraph.
"""


def texts(source: str) -> list[str]:
    return [b["text"] for b in extract_blocks(source)]


class WidgetSkipTests(unittest.TestCase):
    def test_self_closed_widget_is_not_spoken(self):
        src = '<VideoCard videoId="x" title="Spoken?" />\n\nReal prose.\n'
        self.assertEqual(texts(src), ["Real prose."])

    def test_quiz_internals_are_never_spoken(self):
        spoken = " ".join(texts(QUIZ_TAIL))
        self.assertNotIn("junk drawer", spoken)
        self.assertNotIn("questions", spoken)


def widget_then_prose(widget: str) -> list[str]:
    return texts("Before.\n\n" + widget + "\n\nAfter the widget.\n")


class MultilineWidgetShapeTests(unittest.TestCase):
    """Skipped multi-line self-closing components end on their own bare `/>`."""

    def test_multiline_stepthrough(self):
        w = "\n".join([
            "<StepThrough",
            '  stages={["Client", "Server"]}',
            "  steps={[",
            '    { caption: "Hidden caption one" },',
            "  ]}",
            "/>",
        ])
        self.assertEqual(widget_then_prose(w), ["Before.", "After the widget."])

    def test_multiline_vstoggle(self):
        w = "\n".join([
            "<VsToggle",
            '  left={{ label: "Hidden left" }}',
            '  right={{ label: "Hidden right" }}',
            "/>",
        ])
        self.assertEqual(widget_then_prose(w), ["Before.", "After the widget."])

    def test_interior_string_containing_self_close_marker(self):
        w = "\n".join([
            "<StepThrough",
            "  steps={[",
            '    { caption: "Write <br/> or a tag like <Foo /> here" },',
            '    { caption: "this one ends with />" },',
            "  ]}",
            "/>",
        ])
        self.assertEqual(widget_then_prose(w), ["Before.", "After the widget."])

    def test_nested_tag_inside_widget(self):
        w = "\n".join([
            "<Outer",
            "  render={",
            "    <Inner",
            '      label="Hidden inner"',
            "    />",
            "  }",
            "/>",
        ])
        self.assertEqual(widget_then_prose(w), ["Before.", "After the widget."])


class MultilineWidgetTests(unittest.TestCase):
    def test_prose_after_multiline_quiz_survives(self):
        spoken = texts(QUIZ_TAIL)
        self.assertIn("Go deeper", spoken)
        self.assertIn("Sources and further reading", spoken)
        self.assertTrue(any(t.startswith("Eric Evans") for t in spoken), spoken)


class TitleTests(unittest.TestCase):
    def test_double_quoted_title_keeps_apostrophe(self):
        blocks = extract_blocks(APOSTROPHE_META)
        self.assertEqual(
            blocks[0],
            {
                "kind": "title",
                "text": "Cloud-Native Architecture: Building for Someone Else's Computer",
            },
        )


class RealLessonTests(unittest.TestCase):
    """Run the extractor over the shipped MDX, not just snippets."""

    def lessons(self):
        files = sorted(LESSONS_DIR.glob("*.mdx"))
        self.assertTrue(files, f"no lessons under {LESSONS_DIR}")
        return files

    def test_trailing_sections_are_narrated_in_every_lesson(self):
        """Extractor output vs MDX source: the last `## ` heading outside code
        fences (e.g. "Sources & further reading") must be a spoken
        block in extract_blocks(source)."""
        bad = []
        for path in self.lessons():
            src = path.read_text(encoding="utf-8")
            in_fence, heading = False, None
            for line in src.splitlines():
                if line.lstrip().startswith("```"):
                    in_fence = not in_fence
                elif not in_fence and line.startswith("## "):
                    heading = line[3:].strip()
            if heading is None:
                continue
            spoken = texts(src)
            want = re.sub(r"\s+", " ", heading.replace("&", " and ")).strip()
            if want not in spoken:
                bad.append(path.stem)
        self.assertEqual(bad, [], f"{len(bad)} lessons lose their final section")

    def test_title_matches_meta_in_every_lesson(self):
        """Extractor block 0 vs the `title:` string in the MDX meta."""
        bad = []
        for path in self.lessons():
            src = path.read_text(encoding="utf-8")
            m = re.search(r"title:\s*(['\"])(.*?)\1\s*,", src[:1500], re.S)
            if not m:
                continue
            want = re.sub(r"\s+", " ", m.group(2).replace("&", " and ")).strip()
            if extract_blocks(src)[0]["text"] != want:
                bad.append(path.stem)
        self.assertEqual(bad, [])


if __name__ == "__main__":
    unittest.main()
