"""Planner service — turns a cleaned prompt into a structured PlannerOutput."""

import json
import logging
from pathlib import Path

from schemas.planner import PlannerOutput
from services.ollama_client import ollama
from services.prompt_cleaner import clean_prompt

logger = logging.getLogger(__name__)

_TEMPLATE_PATH = Path(__file__).parent.parent.parent.parent / "packages" / "prompt-templates" / "planner_prompt.txt"


def _load_template() -> str:
    return _TEMPLATE_PATH.read_text(encoding="utf-8")


def _build_prompt(user_prompt: str, cleaned_prompt: str, dialect: str) -> str:
    template = _load_template()
    return (
        template
        .replace("{{USER_PROMPT}}", user_prompt)
        .replace("{{CLEANED_PROMPT}}", cleaned_prompt)
        .replace("{{DIALECT}}", dialect)
    )


async def run_planner(user_prompt: str, dialect: str = "postgresql") -> PlannerOutput:
    """Call the LLM planner and return a validated PlannerOutput."""
    cleaned = clean_prompt(user_prompt)
    prompt = _build_prompt(user_prompt, cleaned, dialect)

    try:
        raw: dict = await ollama.generate_json(prompt)
    except Exception as exc:
        logger.warning("Ollama planner call failed (%s) — returning stub plan.", exc)
        raw = {}

    # Merge defaults so missing keys don't break Pydantic validation
    raw.setdefault("user_prompt", user_prompt)
    raw.setdefault("cleaned_prompt", cleaned)
    raw.setdefault("dialect", dialect)

    try:
        return PlannerOutput(**raw)
    except Exception as exc:
        logger.warning("PlannerOutput validation failed (%s) — returning minimal plan.", exc)
        return PlannerOutput(
            user_prompt=user_prompt,
            cleaned_prompt=cleaned,
            dialect=dialect,
            confidence_rationale="Plan validation failed — LLM returned unexpected structure.",
        )
