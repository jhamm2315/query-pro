"""Pydantic schemas for the saved-query library."""

from datetime import datetime

from pydantic import BaseModel, Field


class SaveQueryRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=200)
    sql: str = Field(..., min_length=1)
    prompt: str = ""
    dialect: str = "postgresql"


class SavedQueryOut(BaseModel):
    id: str
    label: str
    sql: str
    prompt: str
    dialect: str
    created_at: datetime

    model_config = {"from_attributes": True}
