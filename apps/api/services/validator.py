"""SQL validation service using SQLGlot for parsing + heuristic checks."""

import re
from typing import List

import sqlglot
import sqlglot.errors

from schemas.sql import ConfidenceLevel, ValidateResponse, ValidationWarning

# ---------------------------------------------------------------------------
# Dialect mapping  (our names → SQLGlot dialect names)
# ---------------------------------------------------------------------------

_DIALECT_MAP = {
    "postgresql": "postgres",
    "tsql": "tsql",
    "mysql": "mysql",
    "sqlite": "sqlite",
}


# ---------------------------------------------------------------------------
# Heuristic detectors
# ---------------------------------------------------------------------------

def _detect_cartesian_join(sql: str) -> bool:
    """Crude check: a JOIN keyword with no ON / USING clause nearby."""
    joins = list(re.finditer(r"\bJOIN\b", sql, re.IGNORECASE))
    ons = list(re.finditer(r"\bON\b|\bUSING\b", sql, re.IGNORECASE))
    return len(joins) > len(ons)


def _detect_where_having_misuse(sql: str) -> bool:
    """Warn when aggregate functions appear in a WHERE clause."""
    where_blocks = re.findall(r"\bWHERE\b(.+?)(?:\bGROUP BY\b|\bHAVING\b|\bORDER BY\b|$)", sql, re.IGNORECASE | re.DOTALL)
    for block in where_blocks:
        if re.search(r"\b(SUM|COUNT|AVG|MIN|MAX)\s*\(", block, re.IGNORECASE):
            return True
    return False


def _detect_select_star(sql: str) -> bool:
    return bool(re.search(r"SELECT\s+\*", sql, re.IGNORECASE))


def _detect_grain_ambiguity(sql: str) -> bool:
    """Flag when there is a JOIN but no GROUP BY and no window function — grain may be inflated."""
    has_join = bool(re.search(r"\bJOIN\b", sql, re.IGNORECASE))
    has_group = bool(re.search(r"\bGROUP\s+BY\b", sql, re.IGNORECASE))
    has_window = bool(re.search(r"\bOVER\s*\(", sql, re.IGNORECASE))
    return has_join and not has_group and not has_window


def _detect_duplicate_inflation_risk(sql: str) -> bool:
    """Warn when a one-to-many join pattern is suspected (e.g. joining a detail table without dedup)."""
    has_join = bool(re.search(r"\bJOIN\b", sql, re.IGNORECASE))
    has_distinct = bool(re.search(r"\bDISTINCT\b", sql, re.IGNORECASE))
    has_group = bool(re.search(r"\bGROUP\s+BY\b", sql, re.IGNORECASE))
    has_window = bool(re.search(r"\bOVER\s*\(", sql, re.IGNORECASE))
    return has_join and not (has_distinct or has_group or has_window)


# ---------------------------------------------------------------------------
# Main validator
# ---------------------------------------------------------------------------

def validate_sql(sql: str, dialect: str = "postgresql") -> ValidateResponse:
    sqlglot_dialect = _DIALECT_MAP.get(dialect, "postgres")
    warnings: List[ValidationWarning] = []
    parsed_ok = False

    # Parse attempt
    try:
        statements = sqlglot.parse(sql, dialect=sqlglot_dialect, error_level=sqlglot.errors.ErrorLevel.RAISE)
        parsed_ok = bool(statements)
    except sqlglot.errors.ParseError as exc:
        warnings.append(ValidationWarning(
            code="PARSE_ERROR",
            message=f"SQLGlot could not parse this SQL: {exc}",
            severity="error",
        ))

    # Dialect compatibility transpile check
    if parsed_ok and sqlglot_dialect != "postgres":
        try:
            sqlglot.transpile(sql, read=sqlglot_dialect, write="postgres")
        except Exception as exc:
            warnings.append(ValidationWarning(
                code="DIALECT_COMPAT",
                message=f"Possible dialect-specific syntax: {exc}",
                severity="warning",
            ))

    # Heuristics
    if _detect_cartesian_join(sql):
        warnings.append(ValidationWarning(
            code="CARTESIAN_JOIN",
            message="JOIN detected without a matching ON/USING clause — possible Cartesian product.",
            severity="error",
        ))

    if _detect_where_having_misuse(sql):
        warnings.append(ValidationWarning(
            code="WHERE_HAVING_MISUSE",
            message="Aggregate function detected inside a WHERE clause — use HAVING for post-aggregation filters.",
            severity="warning",
        ))

    if _detect_grain_ambiguity(sql):
        warnings.append(ValidationWarning(
            code="GRAIN_AMBIGUITY",
            message="JOIN present but no GROUP BY or window function — output grain may be unintentionally expanded.",
            severity="warning",
        ))

    if _detect_duplicate_inflation_risk(sql):
        warnings.append(ValidationWarning(
            code="DUPLICATE_INFLATION",
            message="JOIN without DISTINCT, GROUP BY, or window dedup — risk of duplicate row inflation.",
            severity="warning",
        ))

    if _detect_select_star(sql):
        warnings.append(ValidationWarning(
            code="SELECT_STAR",
            message="SELECT * returns all columns — prefer explicit column list for production use.",
            severity="info",
        ))

    # Confidence scoring
    error_count = sum(1 for w in warnings if w.severity == "error")
    warn_count = sum(1 for w in warnings if w.severity == "warning")

    if error_count > 0:
        confidence: ConfidenceLevel = "low"
        rationale = "Parse errors or structural problems detected."
    elif warn_count >= 2:
        confidence = "medium"
        rationale = "Multiple warnings suggest review is needed before running in production."
    elif warn_count == 1:
        confidence = "medium"
        rationale = "One warning detected — review recommended."
    else:
        confidence = "high"
        rationale = "No errors or warnings detected; SQL looks structurally sound."

    return ValidateResponse(
        is_valid=error_count == 0,
        parsed_ok=parsed_ok,
        warnings=warnings,
        confidence=confidence,
        confidence_rationale=rationale,
    )
