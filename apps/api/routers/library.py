"""Saved-query library router."""

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.database import get_db
from schemas.library import SaveQueryRequest, SavedQueryOut
from services import library as lib_svc

router = APIRouter(prefix="/api/library", tags=["library"])

_BANK_PATH = (
    Path(__file__).parent.parent.parent.parent
    / "packages" / "query-bank" / "common_queries.json"
)


@router.get("/bank")
def get_query_bank():
    """Return the full pre-built query bank JSON."""
    if not _BANK_PATH.exists():
        return {"version": "1.0", "categories": []}
    return json.loads(_BANK_PATH.read_text(encoding="utf-8"))


@router.get("", response_model=list[SavedQueryOut])
def list_saved(db: Session = Depends(get_db)):
    return lib_svc.list_saved(db)


@router.post("", response_model=SavedQueryOut, status_code=201)
def save_query(req: SaveQueryRequest, db: Session = Depends(get_db)):
    return lib_svc.save_query(db, req)


@router.delete("/{query_id}", status_code=204)
def delete_saved(query_id: str, db: Session = Depends(get_db)):
    if not lib_svc.delete_saved(db, query_id):
        raise HTTPException(status_code=404, detail="Saved query not found")
