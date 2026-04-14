"""SQL review and correction service."""

import logging
import re
from pathlib import Path

from services.ollama_client import ollama
from services.validator import validate_sql

logger = logging.getLogger(__name__)

_PROMPT_PATH = (
    Path(__file__).parent.parent.parent.parent
    / "packages" / "prompt-templates" / "sql_review_prompt.txt"
)


def _load_prompt() -> str:
    if _PROMPT_PATH.exists():
        return _PROMPT_PATH.read_text(encoding="utf-8")
    return (
        "Review this {{DIALECT}} SQL for bugs and optimisation issues.\n\n"
        "SQL:\n{{SQL}}\n\n"
        "Respond with:\n### Issues Found\n### Fixed SQL\n```sql\n...\n```\n### Summary\n\n## REVIEW:"
    )


def _extract_fixed_sql(text: str) -> str:
    m = re.search(r"```(?:sql|tsql|mssql)?\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return ""


def _extract_section(text: str, header: str) -> str:
    pattern = rf"###\s*{re.escape(header)}\s*\n(.*?)(?=###|\Z)"
    m = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
    return m.group(1).strip() if m else ""


async def review_sql(sql: str, dialect: str = "postgresql") -> dict:
    """Return issues, fixed SQL, and a summary for the given SQL."""
    # Fast structural check first
    validation = validate_sql(sql, dialect=dialect)

    prompt = (
        _load_prompt()
        .replace("{{DIALECT}}", dialect)
        .replace("{{SQL}}", sql)
    )

    try:
        raw = await ollama.generate(prompt, temperature=0.0)
    except Exception as exc:
        logger.warning("SQL review LLM call failed: %s", exc)
        raw = ""

    fixed_sql = _extract_fixed_sql(raw) or sql
    issues_text = _extract_section(raw, "Issues Found")
    summary = _extract_section(raw, "Summary")

    # Merge structural warnings from the validator into the issues list
    structural = []
    for w in validation.warnings:
        structural.append(f"[{w.severity.upper()}] {w.code}: {w.message}")

    return {
        "original_sql": sql,
        "fixed_sql": fixed_sql,
        "has_changes": fixed_sql.strip() != sql.strip(),
        "issues_text": issues_text,
        "structural_warnings": structural,
        "summary": summary,
        "validation": validation,
        "dialect": dialect,
    }
