"""SQL generation service."""

import logging
import re
from pathlib import Path
from typing import Optional

from schemas.planner import PlannerOutput
from services.ollama_client import ollama

logger = logging.getLogger(__name__)

_TEMPLATE_PATH = Path(__file__).parent.parent.parent.parent / "packages" / "prompt-templates" / "sql_generator_prompt.txt"

_PLACEHOLDER = (
    "-- SQL generation failed. Ensure Ollama is running and a model is loaded.\n"
    "-- Run: ollama pull llama3.2\n"
    "-- Then restart the API server."
)


def _load_template() -> str:
    return _TEMPLATE_PATH.read_text(encoding="utf-8")


def _plan_to_text(plan: PlannerOutput) -> str:
    lines = [
        f"Query type   : {plan.query_type}",
        f"Grain        : {plan.grain}",
        f"Tables       : {', '.join(plan.tables) or 'unknown'}",
        f"Join keys    : {', '.join(plan.join_keys) or 'none'}",
        f"Joins        : {'; '.join(plan.joins) or 'none'}",
        f"Filters      : {'; '.join(plan.filters) or 'none'}",
        f"Aggregations : {'; '.join(plan.aggregations) or 'none'}",
        f"Window fns   : {'; '.join(plan.window_functions) or 'none'}",
        f"Group by     : {', '.join(plan.group_by) or 'none'}",
        f"Order by     : {', '.join(plan.order_by) or 'none'}",
        f"Patterns     : {', '.join(plan.patterns) or 'none'}",
        f"Output cols  : {', '.join(plan.output_columns) or 'not specified'}",
        f"Assumptions  : {'; '.join(plan.assumptions) or 'none'}",
        f"Ambiguities  : {'; '.join(plan.ambiguities) or 'none'}",
    ]
    return "\n".join(lines)


def _extract_block(text: str, tag: str) -> Optional[str]:
    """Extract content between <tag>…</tag> delimiters."""
    pattern = rf"<{tag}>(.*?)</{tag}>"
    match = re.search(pattern, text, re.DOTALL)
    if match:
        return match.group(1).strip()
    # Fallback: try a SQL code fence
    if tag == "sql":
        fence = re.search(r"```(?:sql)?\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
        if fence:
            return fence.group(1).strip()
    return None


async def generate_sql(plan: PlannerOutput, include_optimized: bool = False) -> tuple[str, Optional[str]]:
    """Return (primary_sql, optimized_sql | None).

    Uses plain-text output with XML delimiters to avoid JSON-escaping problems
    with SQL that contains commas, quotes, and newlines.
    """
    template = _load_template()
    prompt = (
        template
        .replace("{{DIALECT}}", plan.dialect)
        .replace("{{CLEANED_PROMPT}}", plan.cleaned_prompt)
        .replace("{{PLAN_SUMMARY}}", _plan_to_text(plan))
        .replace("{{INCLUDE_OPTIMIZED}}", "yes" if include_optimized else "no")
    )

    try:
        raw_text = await ollama.generate(prompt, temperature=0.0)
    except Exception as exc:
        logger.warning("Ollama SQL generation failed (%s) — returning placeholder.", exc)
        return _PLACEHOLDER, None

    primary = _extract_block(raw_text, "sql") or _PLACEHOLDER
    optimized: Optional[str] = None
    if include_optimized:
        optimized = _extract_block(raw_text, "optimized_sql")

    return primary, optimized
