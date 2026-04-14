"""Meeting-mode service — generate a short verbal-ready summary."""

import logging
from pathlib import Path

from schemas.planner import PlannerOutput
from services.ollama_client import ollama

logger = logging.getLogger(__name__)

_TEMPLATE_PATH = (
    Path(__file__).parent.parent.parent.parent
    / "packages"
    / "prompt-templates"
    / "meeting_summary_prompt.txt"
)


def _load_template() -> str:
    if not _TEMPLATE_PATH.exists():
        return (
            "Write 3–5 sentences a data analyst could say in a working session to explain the following SQL.\n"
            "Cover: what the query does, why that structure was chosen, and one assumption that still needs confirmation.\n\n"
            "SQL:\n{{SQL}}\n\nUser question: {{USER_PROMPT}}\nGrain: {{GRAIN}}"
        )
    return _TEMPLATE_PATH.read_text(encoding="utf-8")


async def generate_meeting_summary(sql: str, plan: PlannerOutput) -> str:
    template = _load_template()
    prompt = (
        template
        .replace("{{SQL}}", sql)
        .replace("{{USER_PROMPT}}", plan.user_prompt)
        .replace("{{GRAIN}}", plan.grain)
        .replace("{{ASSUMPTIONS}}", "; ".join(plan.assumptions) or "none")
        .replace("{{AMBIGUITIES}}", "; ".join(plan.ambiguities) or "none")
    )

    try:
        return await ollama.generate(prompt, temperature=0.2)
    except Exception as exc:
        logger.warning("Meeting summary LLM call failed (%s).", exc)
        return (
            f"This query answers: '{plan.user_prompt}'. "
            f"Each row represents {plan.grain or 'one result record'}. "
            f"Key patterns used: {', '.join(plan.patterns) or 'standard aggregation'}. "
            f"One assumption still to confirm: {plan.assumptions[0] if plan.assumptions else 'table names and join keys are correct'}."
        )
