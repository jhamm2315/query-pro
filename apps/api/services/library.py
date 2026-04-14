"""CRUD service for the saved-query library."""

from sqlalchemy.orm import Session

from db import models
from schemas.library import SaveQueryRequest, SavedQueryOut


def list_saved(db: Session) -> list[SavedQueryOut]:
    rows = (
        db.query(models.SavedQuery)
        .order_by(models.SavedQuery.created_at.desc())
        .all()
    )
    return [SavedQueryOut.model_validate(r) for r in rows]


def save_query(db: Session, req: SaveQueryRequest) -> SavedQueryOut:
    row = models.SavedQuery(
        label=req.label,
        sql=req.sql,
        prompt=req.prompt,
        dialect=req.dialect,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return SavedQueryOut.model_validate(row)


def delete_saved(db: Session, query_id: str) -> bool:
    row = db.query(models.SavedQuery).filter(models.SavedQuery.id == query_id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True
