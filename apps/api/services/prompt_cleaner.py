"""Normalise a raw user prompt before sending it to the LLM."""

import re


_FILLER = re.compile(
    r"\b(um|uh|like|you know|basically|actually|literally|i mean|so|right|okay|ok)\b",
    re.IGNORECASE,
)
_WHITESPACE = re.compile(r"\s{2,}")


def clean_prompt(raw: str) -> str:
    """Return a lightly normalised version of the raw prompt.

    - Strip leading/trailing whitespace
    - Collapse runs of whitespace
    - Remove common filler words that add no semantic value
    - Ensure the string ends with a question mark or period
    """
    text = raw.strip()
    text = _FILLER.sub("", text)
    text = _WHITESPACE.sub(" ", text).strip()

    # Capitalise first letter
    if text:
        text = text[0].upper() + text[1:]

    # Add trailing punctuation if missing
    if text and text[-1] not in ".?!":
        text += "."

    return text
