"""Unit tests for the build-time TTS alignment pipeline.

Covers `_align_words` (fuzzy spoken->surface matching, pending-token
attribution, the monotonic clamp), the tokenizer cross-language contract,
and the manifest content hash. Run with the build venv's Python (stdlib
unittest only — no extra test dependencies):

    cd scripts/tts && .venv/bin/python -m unittest test_align -v
"""

import unittest
import unittest.mock

from synthesize import (
    Synthesizer,
    content_hash,
    enforce_hf_offline_mode,
    expand_number,
    normalize_token,
    tokenize_words,
)

try:
    import num2words  # noqa: F401

    HAS_NUM2WORDS = True
except ImportError:
    HAS_NUM2WORDS = False


def align(surface, spoken):
    # _align_words is an instance method but uses no instance state;
    # call it unbound so tests don't need a Kokoro pipeline.
    return Synthesizer._align_words(None, surface, spoken)


class TokenizerParityTest(unittest.TestCase):
    # This exact sample is also asserted in src/lib/narration.test.ts
    # (tokenizeWords). Both sides must produce this sequence — the DOM
    # tagger consumes manifest words with the TS rule, so any drift here
    # breaks word highlighting. If you change tokenization, change both.
    SAMPLE = "The cache sits in front of the database, and it doesn't blink."
    EXPECTED = [
        "The", "cache", "sits", "in", "front", "of", "the",
        "database", "and", "it", "doesn't", "blink",
    ]

    def test_sample_tokenizes_to_expected_sequence(self):
        self.assertEqual(tokenize_words(self.SAMPLE), self.EXPECTED)

    def test_normalize_token(self):
        self.assertEqual(normalize_token("Hello!"), "hello")
        self.assertEqual(normalize_token("don't"), "dont")


class AlignWordsTest(unittest.TestCase):
    def test_exact_match_passthrough(self):
        surface = ["hello", "world"]
        spoken = [("hello", 0.0, 0.5), ("world", 0.5, 1.0)]
        self.assertEqual(
            align(surface, spoken),
            [("hello", 0.0, 0.5), ("world", 0.5, 1.0)],
        )

    @unittest.skipUnless(HAS_NUM2WORDS, "num2words not installed")
    def test_pending_audio_folds_into_next_matched_word(self):
        # misaki speaks "$5" as "five dollars": the unmatched "dollars"
        # audio is attributed to the following surface word ("5"), whose
        # start is pulled back to cover it. (Needs num2words so "five"
        # fuzzy-matches the surface token "5".)
        surface = ["pay", "5"]
        spoken = [("pay", 0.0, 0.3), ("dollars", 0.3, 0.5), ("five", 0.5, 0.9)]
        self.assertEqual(
            align(surface, spoken),
            [("pay", 0.0, 0.3), ("5", 0.3, 0.9)],
        )

    def test_skipped_surface_words_become_zero_length_blockers(self):
        # "b" has no spoken counterpart; it becomes a zero-length span so
        # the player's binary search never sticks on it.
        surface = ["a", "b", "c"]
        spoken = [("a", 0.0, 0.2), ("c", 0.5, 0.8)]
        self.assertEqual(
            align(surface, spoken),
            [("a", 0.0, 0.2), ("b", 0.5, 0.5), ("c", 0.5, 0.8)],
        )

    def test_monotonic_clamp_enforces_non_decreasing_starts(self):
        # The player binary-searches on non-decreasing starts; overlapping
        # spans must collapse to zero-length, never regress.
        surface = ["a", "b"]
        spoken = [("a", 0.0, 0.5), ("b", 0.3, 0.4)]
        result = align(surface, spoken)
        self.assertEqual(result, [("a", 0.0, 0.5), ("b", 0.5, 0.5)])
        starts = [s for _, s, _ in result]
        self.assertTrue(all(b >= a for a, b in zip(starts, starts[1:])))
        for _, s, e in result:
            self.assertLessEqual(s, e)

    def test_trailing_surface_words_absorb_leftover_audio(self):
        surface = ["go", "now"]
        spoken = [("go", 0.0, 0.4)]
        # "now" has no audio; the clamp pulls its zero-length span up to
        # the previous word's end so starts never regress.
        self.assertEqual(
            align(surface, spoken),
            [("go", 0.0, 0.4), ("now", 0.4, 0.4)],
        )


@unittest.skipUnless(HAS_NUM2WORDS, "num2words not installed")
class ExpandNumberTest(unittest.TestCase):
    def test_digit_expansion_matches_misaki_spoken_forms(self):
        self.assertEqual(expand_number("3"), "three")
        self.assertIn("hundred", expand_number("120"))
        self.assertIsNone(expand_number("hello"))
        self.assertIsNone(expand_number("12a"))


class ContentHashTest(unittest.TestCase):
    def test_deterministic_and_sensitive_to_text(self):
        texts = ["Hello world", "Second block"]
        self.assertEqual(content_hash(texts), content_hash(texts))
        self.assertNotEqual(content_hash(texts), content_hash(["Hello world"]))
        self.assertNotEqual(
            content_hash(["Hello world"]), content_hash(["Hello World"])
        )
        # 64 hex chars (SHA-256).
        self.assertRegex(content_hash(texts), r"^[0-9a-f]{64}$")


class OfflineShimTest(unittest.TestCase):
    def test_noop_without_env_var(self):
        import os

        from huggingface_hub.utils import _http as hf_http

        with unittest.mock.patch.dict(os.environ):
            os.environ.pop("HF_HUB_OFFLINE", None)
            before = hf_http.get_session
            enforce_hf_offline_mode()
            self.assertIs(hf_http.get_session, before)

    def test_session_raises_offline_when_env_var_set(self):
        import os

        from huggingface_hub.errors import OfflineModeIsEnabled
        from huggingface_hub.utils import _http as hf_http

        real = hf_http.get_session
        try:
            with unittest.mock.patch.dict(
                os.environ, {"HF_HUB_OFFLINE": "1"}
            ):
                enforce_hf_offline_mode()
                with self.assertRaises(OfflineModeIsEnabled):
                    hf_http.get_session()
        finally:
            hf_http.get_session = real

    def test_ignores_falsy_values(self):
        import os

        from huggingface_hub.utils import _http as hf_http

        with unittest.mock.patch.dict(os.environ, {"HF_HUB_OFFLINE": "0"}):
            before = hf_http.get_session
            enforce_hf_offline_mode()
            self.assertIs(hf_http.get_session, before)

    def test_real_download_path_serves_pinned_cache_offline(self):
        # Proves the patch reaches the actual consumer: hf_hub_download
        # must resolve from the pinned cache with zero network. (Without
        # the patch this crashes in this environment: httpx cannot parse
        # the runtime proxy URL and raises InvalidURL.)
        import os

        from huggingface_hub import hf_hub_download
        from huggingface_hub.utils import _http as hf_http

        # Cache dir derived from this file's location, not the CWD, so the
        # test works however it is invoked. Passed as a parameter (not via
        # the HF_HUB_CACHE env var) because huggingface_hub freezes the env
        # value at import time.
        cache_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache", "hf")
        real = hf_http.get_session
        try:
            with unittest.mock.patch.dict(os.environ, {"HF_HUB_OFFLINE": "1"}):
                enforce_hf_offline_mode()
                path = hf_hub_download(
                    repo_id="hexgrad/Kokoro-82M",
                    filename="config.json",
                    cache_dir=cache_dir,
                )
                self.assertTrue(path.endswith("config.json"))
                self.assertTrue(os.path.exists(path))
        finally:
            hf_http.get_session = real


if __name__ == "__main__":
    unittest.main()
