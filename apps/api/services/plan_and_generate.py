"""Merged plan + SQL generation — one LLM call instead of two.

Saves one full inference round-trip (~10-20s on CPU, ~2-4s on GPU).
"""

import json
import logging
import re
from pathlib import Path
from typing import Optional

from schemas.planner import PlannerOutput
from services.ollama_client import ollama
from services.prompt_cleaner import clean_prompt

logger = logging.getLogger(__name__)

_TEMPLATE_PATH = (
    Path(__file__).parent.parent.parent.parent
    / "packages" / "prompt-templates" / "plan_and_generate_prompt.txt"
)

_SQL_PLACEHOLDER = (
    "-- SQL generation failed. Check Ollama is running: ollama serve\n"
    "-- Pull a fast model: ollama pull qwen2.5-coder:1.5b"
)


def _load_template() -> str:
    return _TEMPLATE_PATH.read_text(encoding="utf-8")


def _extract_sql(text: str) -> str:
    """Pull SQL from <sql>…</sql>, a ``` fence, or raw SQL after the SQL: marker."""
    # 1. Explicit <sql> tags
    m = re.search(r"<sql>(.*?)</sql>", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    # 2. Markdown code fence (```sql or plain ```)
    m = re.search(r"```(?:sql|tsql|mssql)?\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()
    # 3. Everything after "SQL:" marker (catches models that skip the fence/tags)
    m = re.search(r"SQL:\s*\n([\s\S]+)", text, re.IGNORECASE)
    if m:
        candidate = m.group(1).strip()
        # Make sure it looks like SQL (starts with a keyword)
        if re.match(r"^(SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|ALTER|DECLARE|;|--)", candidate, re.IGNORECASE):
            return candidate
    # 4. Last-resort: find the first SELECT/WITH/DECLARE block in the response
    m = re.search(r"((?:WITH|SELECT|DECLARE)\b[\s\S]+?)(?:\n\n|\Z)", text, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return _SQL_PLACEHOLDER


def _extract_plan_json(text: str) -> dict:
    """Pull the JSON object that follows 'PLAN:'."""
    m = re.search(r"PLAN:\s*(\{.*?\})\s*SQL:", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    # Fallback: find any JSON object in the text
    m = re.search(r"\{[^{}]{20,}\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return {}


async def plan_and_generate(
    user_prompt: str,
    dialect: str = "postgresql",
) -> tuple[PlannerOutput, str]:
    """Return (plan, sql) from a single LLM call."""
    cleaned = clean_prompt(user_prompt)
    template = _load_template()
    prompt = (
        template
        .replace("{{DIALECT}}", dialect)
        .replace("{{CLEANED_PROMPT}}", cleaned)
    )

    try:
        raw_text = await ollama.generate(prompt, temperature=0.0)
    except Exception as exc:
        logger.warning("plan_and_generate LLM call failed: %s", exc)
        raw_text = ""

    raw_plan = _extract_plan_json(raw_text)
    raw_plan.setdefault("user_prompt", user_prompt)
    raw_plan.setdefault("cleaned_prompt", cleaned)
    raw_plan.setdefault("dialect", dialect)

    try:
        plan = PlannerOutput(**raw_plan)
    except Exception as exc:
        logger.warning("PlannerOutput validation failed: %s", exc)
        plan = PlannerOutput(
            user_prompt=user_prompt,
            cleaned_prompt=cleaned,
            dialect=dialect,
            confidence_rationale="Plan parsing failed — check model output.",
        )

    sql = _extract_sql(raw_text) if raw_text else _SQL_PLACEHOLDER
    return plan, sql
