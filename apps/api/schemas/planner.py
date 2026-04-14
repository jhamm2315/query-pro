"""Planner schemas — the structured decomposition of a user SQL prompt."""

from typing import Any, List, Optional
from pydantic import BaseModel, Field, field_validator

# Fields that must always be lists. LLMs sometimes return "" or a plain
# string instead of []. The validator below coerces those safely.
_LIST_FIELDS = (
    "tables", "join_keys", "joins", "filters", "aggregations",
    "window_functions", "group_by", "order_by", "patterns",
    "output_columns", "assumptions", "ambiguities",
    "verification_checks", "optimization_notes",
)


def _coerce_list(v: Any) -> List[str]:
    """Accept list, comma-separated string, or empty string — always return list."""
    if v is None:
        return []
    if isinstance(v, list):
        return [str(item) for item in v if item != ""]
    if isinstance(v, str):
        return [item.strip() for item in v.split(",") if item.strip()] if v.strip() else []
    return [str(v)]


class PlannerOutput(BaseModel):
    user_prompt: str = Field(default="", description="Original user prompt, unmodified")
    cleaned_prompt: str = Field(default="", description="Normalised version of the prompt")
    dialect: str = Field(default="postgresql", description="Target SQL dialect")
    query_type: str = Field(default="", description="SELECT / INSERT / UPDATE / DELETE / DDL")
    grain: str = Field(default="", description="What one output row represents")
    tables: List[str] = Field(default_factory=list, description="Tables / CTEs referenced")
    join_keys: List[str] = Field(default_factory=list, description="Columns used as join keys")
    joins: List[str] = Field(default_factory=list, description="Join descriptions")
    filters: List[str] = Field(default_factory=list, description="WHERE / HAVING predicates")
    aggregations: List[str] = Field(default_factory=list, description="Aggregate functions used")
    window_functions: List[str] = Field(default_factory=list, description="Window / analytic functions")
    group_by: List[str] = Field(default_factory=list, description="GROUP BY columns")
    order_by: List[str] = Field(default_factory=list, description="ORDER BY expressions")
    patterns: List[str] = Field(default_factory=list, description="Design patterns: latest-row, ranking, running-total, dedup …")
    output_columns: List[str] = Field(default_factory=list, description="Projected output columns")
    assumptions: List[str] = Field(default_factory=list, description="Implicit assumptions made")
    ambiguities: List[str] = Field(default_factory=list, description="Things left undefined by the user")
    verification_checks: List[str] = Field(default_factory=list, description="Steps to verify correctness")
    optimization_notes: List[str] = Field(default_factory=list, description="Index / rewrite suggestions")
    confidence_rationale: str = Field(default="", description="Why the confidence level was chosen")

    # Coerce all list fields — LLMs sometimes return "" or a plain string
    @field_validator(*_LIST_FIELDS, mode="before")
    @classmethod
    def coerce_to_list(cls, v: Any) -> List[str]:
        return _coerce_list(v)


class PlanRequest(BaseModel):
    prompt: str = Field(..., min_length=3, description="Business question or data request")
    dialect: str = Field(default="postgresql", description="SQL dialect")
    thread_id: Optional[str] = Field(default=None, description="Existing thread to continue")
