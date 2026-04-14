"""Explanation service — generates a plain-English walk-through of the SQL."""

import logging
from pathlib import Path

from schemas.planner import PlannerOutput
from services.ollama_client import ollama

logger = logging.getLogger(__name__)


def short_explain(plan: PlannerOutput) -> str:
    """Instant 2-3 sentence summary derived from the plan — zero LLM calls."""
    grain = plan.grain or "records"
    patterns = ", ".join(plan.patterns) if plan.patterns else "standard aggregation"
    tables = " + ".join(plan.tables) if plan.tables else "source tables"
    agg = plan.aggregations[0] if plan.aggregations else None
    win = plan.window_functions[0] if plan.window_functions else None

    action = f"Uses {patterns} pattern"
    if win:
        action += f" with {win.split('(')[0].strip()} window function"
    elif agg:
        action += f" computing {agg}"

    assumption = f" Key assumption to confirm: {plan.assumptions[0]}" if plan.assumptions else ""

    return (
        f"Each row represents {grain} pulled from {tables}. "
        f"{action}. "
        f"Confidence: {plan.confidence_rationale or 'see plan tab for details'}."
        f"{assumption}"
    )

_TEMPLATE_PATH = Path(__file__).parent.parent.parent.parent / "packages" / "prompt-templates" / "explainer_prompt.txt"


def _load_template() -> str:
    return _TEMPLATE_PATH.read_text(encoding="utf-8")


async def explain_sql(sql: str, plan: PlannerOutput) -> str:
    """Return a structured plain-English explanation of the SQL."""
    template = _load_template()
    prompt = (
        template
        .replace("{{DIALECT}}", plan.dialect)
        .replace("{{USER_PROMPT}}", plan.user_prompt)
        .replace("{{SQL}}", sql)
        .replace("{{GRAIN}}", plan.grain)
        .replace("{{ASSUMPTIONS}}", "\n".join(f"- {a}" for a in plan.assumptions) or "None stated")
        .replace("{{AMBIGUITIES}}", "\n".join(f"- {a}" for a in plan.ambiguities) or "None identified")
        .replace("{{PATTERNS}}", ", ".join(plan.patterns) or "standard SELECT")
    )

    try:
        return await ollama.generate(prompt, temperature=0.1)
    except Exception as exc:
        logger.warning("Explainer LLM call failed (%s).", exc)
        return (
            "Explanation unavailable — Ollama is not reachable.\n\n"
            f"Plan grain: {plan.grain}\n"
            f"Patterns used: {', '.join(plan.patterns) or 'none'}\n"
            f"Assumptions: {'; '.join(plan.assumptions) or 'none'}"
        )
