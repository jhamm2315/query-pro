"""Unit tests for the prompt cleaner service."""

from services.prompt_cleaner import clean_prompt


def test_strips_leading_whitespace():
    assert clean_prompt("  hello  ").startswith("Hello")


def test_removes_filler_words():
    result = clean_prompt("um, like, find me the latest invoice per vendor")
    assert "um" not in result.lower()
    assert "like" not in result.lower()


def test_capitalises_first_letter():
    result = clean_prompt("find the top customers")
    assert result[0].isupper()


def test_adds_trailing_period():
    result = clean_prompt("find the top customers")
    assert result.endswith(".")


def test_does_not_double_punctuate():
    result = clean_prompt("what is the total spend?")
    assert not result.endswith("?.")
    assert result.endswith("?")


def test_collapses_whitespace():
    result = clean_prompt("find   the   latest   invoice")
    assert "  " not in result
