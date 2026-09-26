"""Unit tests for ilike wildcard escaping (PostgREST exact-match lookups)."""
import os
import sys
import unittest

os.environ.setdefault("ENV", "development")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import _escape_ilike, safe_search_term


class TestIlikeEscape(unittest.TestCase):
    def test_escape_ilike_percent_and_underscore(self):
        self.assertEqual(_escape_ilike("100%"), r"100\%")
        self.assertEqual(_escape_ilike("a_b"), r"a\_b")
        self.assertEqual(_escape_ilike("x%_y"), r"x\%\_y")

    def test_escape_ilike_empty_and_none(self):
        self.assertEqual(_escape_ilike(""), "")
        self.assertEqual(_escape_ilike(None), "")

    def test_escape_ilike_plain_value_unchanged(self):
        self.assertEqual(_escape_ilike("tanvir"), "tanvir")
        self.assertEqual(_escape_ilike("user@example.com"), "user@example.com")

    def test_safe_search_term_strips_filter_grammar(self):
        self.assertNotIn(",", safe_search_term('a,b(c)"d\\e'))
        self.assertNotIn("(", safe_search_term("a(b)"))
        self.assertEqual(safe_search_term("hello%"), r"hello\%")


if __name__ == "__main__":
    unittest.main()
