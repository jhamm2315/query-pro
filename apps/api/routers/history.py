"""Thread history router."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from schemas.history import CreateThreadRequest, ThreadDetail, ThreadSummary
from services import history as history_svc

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("/threads", response_model=List[ThreadSummary])
def list_threads(limit: int = 50, offset: int = 0, db: Session = Depends(get_db)):
    return history_svc.list_threads(db, limit=limit, offset=offset)


@router.get("/threads/{thread_id}", response_model=ThreadDetail)
def get_thread(thread_id: str, db: Session = Depends(get_db)):
    result = history_svc.get_thread(db, thread_id)
    if not result:
        raise HTTPException(status_code=404, detail="Thread not found")
    return result


@router.post("/threads", response_model=ThreadDetail, status_code=201)
def create_thread(req: CreateThreadRequest, db: Session = Depends(get_db)):
    return history_svc.create_thread(db, req)


class ConfirmedAssumptionsRequest(BaseModel):
    confirmed: List[str]


@router.patch("/turns/{turn_id}/assumptions", status_code=204)
def patch_assumptions(turn_id: str, req: ConfirmedAssumptionsRequest, db: Session = Depends(get_db)):
    if not history_svc.update_confirmed_assumptions(db, turn_id=turn_id, confirmed=req.confirmed):
        raise HTTPException(status_code=404, detail="Turn not found")
