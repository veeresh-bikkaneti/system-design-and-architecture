#!/usr/bin/env python3
"""Fixtures for scripts/check_video_card_notes.py.

Run: python3 -m unittest scripts.test_check_video_card_notes
(or: python3 scripts/test_check_video_card_notes.py)

Positive fixtures are the three provenance-note markers as they
appeared at HEAD (one per marker family). Negative fixtures prove the
guard does NOT match:
  - the ✅/◐/🔢 confidence-glyph convention (by design, explained
    in-lesson, in 4 other lessons — a hard fence for this cleanup);
  - ordinary prose, including a prose "Caveat:" outside a VideoCard;
  - a clean VideoCard, and a VideoCard that merely discusses
    verification as its teaching topic.
"""

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from check_video_card_notes import check_lines  # noqa: E402

POSITIVE = [
    # Caveat: family
    '<VideoCard videoId="3NzIxASfy5k" title="What is a Load Balancer" source="Dargslan" description="Explainer. Caveat: non-trusted channel — quick audio check advised" />',
    '<VideoCard videoId="XSZQescGmco" title="What is Load Balancing?" source="Learn CS" description="Walkthrough. Caveat: channel identity unverified; description is detailed human-written" />',
    '<VideoCard videoId="RwctwkYUi7Q" title="Kafka Offsets Explained" source="Code with Sam" description="Offsets. Caveat: channel unidentified; description is expert-level human writing" />',
    '<VideoCard videoId="-NDKW8Bfujk" title="When Everything Burns" source="Nat &amp; Leo (certquests)" description="Outages. Caveat: also exam-prep oriented; no verified authoritative alternative found" />',
    # (unverified — confirm channel on YouTube) family
    '<VideoCard videoId="zEUfss3Jork" title="Amazon S3 Explained" source="Hired in IT (unverified — confirm channel on YouTube)" description="Object storage." />',
    # ID verified via third-party family
    '<VideoCard videoId="oUJbuFMyBDk" title="What is a MESSAGE QUEUE" source="Gaurav Sen (InterviewReady)" description="Pizza-shop analogy. ID verified via third-party summary page carrying the exact title; channel attributed via InterviewReady links" />',
]

NEGATIVE = [
    # Confidence-glyph convention in ordinary prose (by design).
    'shift in search." ✅ The room understood the demo instantly.',
    "search engine's own query rate. 🔢 (The math is below; check it.)",
    "correction included. ◐",
    # Ordinary prose caveat outside a VideoCard is lesson content.
    "Caveat: this estimate assumes a single region and no failover.",
    # Clean VideoCard.
    '<VideoCard videoId="xErwDaOc-Gs" title="What is a Message Queue?" source="IBM Technology" description="Shows how a queue turns an 8-second upload into async work" />',
    # VideoCard whose topic is verification itself — no working note.
    '<VideoCard videoId="5eDVGSZ7ynM" title="Identity Is the New Perimeter" source="CyberSecurityByDesign" description="Uses a hotel keycard to show why verified identity — not network location — now decides who gets in." />',
    '<VideoCard videoId="c8A8vgAZrag" title="The Real-Time Verification System Behind Zero Trust" source="CyberTechHaus" description="Explains the policy engine and enforcement points that re-verify every access request in real time." />',
]


class TestVideoCardNotes(unittest.TestCase):
    def test_positive_fixtures_all_flagged(self):
        for line in POSITIVE:
            with self.subTest(line=line[:60]):
                self.assertEqual(len(check_lines([line])), 1)

    def test_negative_fixtures_none_flagged(self):
        self.assertEqual(check_lines(NEGATIVE), [])

    def test_one_violation_per_line_not_per_pattern(self):
        # load-balancers:67 at HEAD matched two markers on one line;
        # it is one note, so it must count once.
        line = '<VideoCard videoId="XSZQescGmco" title="t" source="s" description="Caveat: channel identity unverified" />'
        self.assertEqual(len(check_lines([line])), 1)


if __name__ == "__main__":
    unittest.main()
