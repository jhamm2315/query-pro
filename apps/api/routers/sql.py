"""SQL generation and validation router."""

import asyncio
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.database import get_db
from schemas.planner import PlanRequest, PlannerOutput
from schemas.sql import GenerateRequest, GenerateResponse, ValidateRequest, ValidateResponse
from services import history as history_svc
from services.explainer import explain_sql, short_explain
from services.meeting_summary import generate_meeting_summary
from services.plan_and_generate import plan_and_generate
from services.reviewer import review_sql
from services.validator import validate_sql

router = APIRouter(prefix="/api/sql", tags=["sql"])


@router.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest, db: Session = Depends(get_db)):
    """Fast pipeline — one LLM call for plan+SQL, explain/meeting loaded lazily."""
    # 1. Plan + SQL in a single LLM call
    plan, primary_sql = await plan_and_generate(req.prompt, dialect=req.dialect)

    # 2. Short explanation — instant, no LLM
    short_exp = short_explain(plan)

    # 3. Validate (sync — fast)
    validation = validate_sql(primary_sql, dialect=req.dialect)

    # 4. Persist with placeholder explanation/meeting (filled lazily)
    thread_id = req.thread_id or str(uuid.uuid4())
    saved_turn = history_svc.save_turn(
        db,
        thread_id=thread_id,
        prompt=req.prompt,
        sql=primary_sql,
        explanation=short_exp,
        meeting_mode="",
        dialect=req.dialect,
        confidence=validation.confidence,
    )

    return GenerateResponse(
        thread_id=thread_id,
        turn_id=saved_turn.turn_id,
        plan=plan,
        sql=primary_sql,
        optimized_sql=None,
        short_explanation=short_exp,
        explanation=short_exp,   # placeholder — UI fetches /explain on demand
        meeting_mode="",          # placeholder — UI fetches /meeting-summary on demand
        validation=validation,
        dialect=req.dialect,
    )


# ── Lazy endpoints — called by the UI only when the user opens a tab ──────────

class ExplainRequest(BaseModel):
    sql: str
    plan: PlannerOutput


class ExplainResponse(BaseModel):
    explanation: str


@router.post("/explain", response_model=ExplainResponse)
async def explain(req: ExplainRequest):
    """Generate the full SQL walk-through. Called lazily when the Why tab opens."""
    explanation = await explain_sql(req.sql, req.plan)
    return ExplainResponse(explanation=explanation)


class MeetingSummaryRequest(BaseModel):
    sql: str
    plan: PlannerOutput


class MeetingSummaryResponse(BaseModel):
    meeting_mode: str


@router.post("/meeting-summary", response_model=MeetingSummaryResponse)
async def meeting_summary(req: MeetingSummaryRequest):
    """Generate the meeting-mode summary. Called lazily when the Meeting tab opens."""
    summary = await generate_meeting_summary(req.sql, req.plan)
    return MeetingSummaryResponse(meeting_mode=summary)


# ── Review / correction ────────────────────────────────────────────────────────

class ReviewRequest(BaseModel):
    sql: str = Field(..., min_length=1)
    dialect: str = "postgresql"


@router.post("/review")
async def review(req: ReviewRequest):
    """Find bugs, syntax errors, and optimisation issues — return fixed SQL + summary."""
    return await review_sql(req.sql, dialect=req.dialect)


# ── Legacy / utility endpoints ─────────────────────────────────────────────────

@router.post("/validate", response_model=ValidateResponse)
async def validate(req: ValidateRequest):
    return validate_sql(req.sql, dialect=req.dialect)
