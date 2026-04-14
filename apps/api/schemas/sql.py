"""SQL generation and validation schemas."""

from typing import List, Literal, Optional
from pydantic import BaseModel, Field

from .planner import PlannerOutput

DialectType = Literal["postgresql", "tsql", "mysql", "sqlite"]
ConfidenceLevel = Literal["high", "medium", "low"]


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=3)
    dialect: DialectType = Field(default="postgresql")
    thread_id: Optional[str] = None
    include_optimized: bool = Field(default=False, description="Also return a rewritten/optimized variant")


class ValidationWarning(BaseModel):
    code: str = Field(..., description="Machine-readable warning code, e.g. CARTESIAN_JOIN")
    message: str
    severity: Literal["error", "warning", "info"] = "warning"


class ValidateRequest(BaseModel):
    sql: str = Field(..., min_length=1)
    dialect: DialectType = Field(default="postgresql")


class ValidateResponse(BaseModel):
    is_valid: bool
    parsed_ok: bool = Field(..., description="SQLGlot could parse without errors")
    warnings: List[ValidationWarning] = Field(default_factory=list)
    confidence: ConfidenceLevel
    confidence_rationale: str = ""


class GenerateResponse(BaseModel):
    thread_id: str
    turn_id: str
    plan: PlannerOutput
    sql: str
    optimized_sql: Optional[str] = None
    short_explanation: str = ""   # 2-3 sentences, instant (no LLM)
    explanation: str              # full walk-through, loaded on demand
    meeting_mode: str
    validation: ValidateResponse
    dialect: DialectType
