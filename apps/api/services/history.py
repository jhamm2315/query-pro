"""History service — CRUD for threads and turns in SQLite."""

import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from db.models import Thread, Turn
from schemas.history import CreateThreadRequest, ThreadDetail, ThreadSummary
from schemas.history import Turn as TurnSchema
from services.categorizer import categorize


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Threads
# ---------------------------------------------------------------------------

def list_threads(db: Session, limit: int = 50, offset: int = 0) -> List[ThreadSummary]:
    rows = (
        db.query(Thread)
        .order_by(Thread.updated_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        ThreadSummary(
            thread_id=t.thread_id,
            title=t.title,
            dialect=t.dialect,
            category=t.category or "General",
            created_at=t.created_at,
            updated_at=t.updated_at,
            turn_count=len(t.turns),
        )
        for t in rows
    ]


def get_thread(db: Session, thread_id: str) -> Optional[ThreadDetail]:
    row = db.query(Thread).filter(Thread.thread_id == thread_id).first()
    if not row:
        return None
    return ThreadDetail(
        thread_id=row.thread_id,
        title=row.title,
        dialect=row.dialect,
        category=row.category or "General",
        created_at=row.created_at,
        updated_at=row.updated_at,
        turns=[
            TurnSchema(
                turn_id=t.turn_id,
                thread_id=t.thread_id,
                prompt=t.prompt,
                sql=t.sql,
                explanation=t.explanation,
                meeting_mode=t.meeting_mode,
                dialect=t.dialect,
                confidence=t.confidence,
                confirmed_assumptions=json.loads(t.confirmed_assumptions or "[]"),
                created_at=t.created_at,
            )
            for t in row.turns
        ],
    )


def create_thread(db: Session, req: CreateThreadRequest) -> ThreadDetail:
    thread = Thread(
        thread_id=str(uuid.uuid4()),
        title=req.title or "Untitled thread",
        dialect=req.dialect,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return ThreadDetail(
        thread_id=thread.thread_id,
        title=thread.title,
        dialect=thread.dialect,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
        turns=[],
    )


# ---------------------------------------------------------------------------
# Turns
# ---------------------------------------------------------------------------

def save_turn(
    db: Session,
    *,
    thread_id: str,
    prompt: str,
    sql: str,
    explanation: str,
    meeting_mode: str,
    dialect: str,
    confidence: str,
    confirmed_assumptions: Optional[List[str]] = None,
) -> TurnSchema:
    category = categorize(prompt, sql)

    # Ensure thread exists (auto-create if needed)
    thread = db.query(Thread).filter(Thread.thread_id == thread_id).first()
    if not thread:
        thread = Thread(
            thread_id=thread_id,
            title=prompt[:60],
            dialect=dialect,
            category=category,
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(thread)
    else:
        # Re-categorize if category is still default
        if thread.category in (None, "General"):
            thread.category = category

    turn = Turn(
        turn_id=str(uuid.uuid4()),
        thread_id=thread_id,
        prompt=prompt,
        sql=sql,
        explanation=explanation,
        meeting_mode=meeting_mode,
        dialect=dialect,
        confidence=confidence,
        confirmed_assumptions=json.dumps(confirmed_assumptions or []),
        created_at=_now(),
    )
    db.add(turn)
    thread.updated_at = _now()
    db.commit()
    db.refresh(turn)

    return TurnSchema(
        turn_id=turn.turn_id,
        thread_id=turn.thread_id,
        prompt=turn.prompt,
        sql=turn.sql,
        explanation=turn.explanation,
        meeting_mode=turn.meeting_mode,
        dialect=turn.dialect,
        confidence=turn.confidence,
        confirmed_assumptions=json.loads(turn.confirmed_assumptions or "[]"),
        created_at=turn.created_at,
    )


def update_confirmed_assumptions(
    db: Session, *, turn_id: str, confirmed: List[str]
) -> bool:
    turn = db.query(Turn).filter(Turn.turn_id == turn_id).first()
    if not turn:
        return False
    turn.confirmed_assumptions = json.dumps(confirmed)
    db.commit()
    return True
