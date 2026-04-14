"""SQL generation and validation router."""

import json
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.database import get_db
from schemas.planner import PlanRequest, PlannerOutput
from schemas.sql import GenerateRequest, GenerateResponse, ValidateRequest, ValidateResponse
from services import history as history_svc
from services.explainer import explain_sql, short_explain
from services.meeting_summary import generate_meeting_summary
from services.executor import execute_sql
from services.plan_and_generate import plan_and_generate, stream_plan_and_generate
from services.reviewer import review_sql
from services.validator import validate_sql

router = APIRouter(prefix="/api/sql", tags=["sql"])


def _get_history(db: Session, thread_id: str | None) -> list:
    """Fetch the last few turns from a thread as plain dicts for prompt injection."""
    if not thread_id:
        return []
    detail = history_svc.get_thread(db, thread_id)
    if not detail:
        return []
    return [{"prompt": t.prompt, "sql": t.sql} for t in detail.turns[-4:]]


@router.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest, db: Session = Depends(get_db)):
    """Fast pipeline — one LLM call for plan+SQL, explain/meeting loaded lazily."""
    history = _get_history(db, req.thread_id)

    # 1. Plan + SQL in a single LLM call (with conversation history + schema context)
    plan, primary_sql = await plan_and_generate(
        req.prompt,
        dialect=req.dialect,
        history=history,
        schema_context=req.schema_context,
    )

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


@router.post("/stream")
async def stream_generate(req: GenerateRequest, db: Session = Depends(get_db)):
    """Stream plan+SQL generation as SSE tokens, then persist and emit a 'done' event.

    SSE event types:
      {type: "token",  text: "..."}          — raw LLM tokens
      {type: "done",   sql, plan, validation, thread_id, turn_id, short_explanation}
      {type: "error",  message: "..."}
    """
    history = _get_history(db, req.thread_id)

    async def event_stream():
        sql = ""
        plan_dict = {}

        async for chunk in stream_plan_and_generate(
            req.prompt,
            dialect=req.dialect,
            history=history,
            schema_context=req.schema_context,
        ):
            # Parse to intercept the 'done' event and enrich it
            try:
                data = json.loads(chunk.removeprefix("data: ").rstrip())
            except Exception:
                yield chunk
                continue

            if data.get("type") == "done":
                sql = data.get("sql", "")
                plan_dict = data.get("plan", {})

                short_exp = ""
                try:
                    from schemas.planner import PlannerOutput
                    plan_obj = PlannerOutput(**plan_dict)
                    short_exp = short_explain(plan_obj)
                except Exception:
                    pass

                validation = validate_sql(sql, dialect=req.dialect)
                thread_id = req.thread_id or str(uuid.uuid4())
                saved_turn = history_svc.save_turn(
                    db,
                    thread_id=thread_id,
                    prompt=req.prompt,
                    sql=sql,
                    explanation=short_exp,
                    meeting_mode="",
                    dialect=req.dialect,
                    confidence=validation.confidence,
                )

                enriched = {
                    "type": "done",
                    "sql": sql,
                    "plan": plan_dict,
                    "validation": validation.model_dump(),
                    "thread_id": thread_id,
                    "turn_id": saved_turn.turn_id,
                    "short_explanation": short_exp,
                    "dialect": req.dialect,
                }
                yield f"data: {json.dumps(enriched)}\n\n"
            else:
                yield chunk

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
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


# ── Execution sandbox ─────────────────────────────────────────────────────────

class ExecuteRequest(BaseModel):
    sql: str = Field(..., min_length=1)


@router.post("/execute")
async def execute(req: ExecuteRequest):
    """Run SQL in an isolated DuckDB in-memory sandbox and return rows + columns."""
    result = await execute_sql(req.sql)
    return result.to_dict()


# ── Legacy / utility endpoints ─────────────────────────────────────────────────

@router.post("/validate", response_model=ValidateResponse)
async def validate(req: ValidateRequest):
    return validate_sql(req.sql, dialect=req.dialect)
