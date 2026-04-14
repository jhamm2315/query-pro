"""History / thread schemas."""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class ThreadSummary(BaseModel):
    thread_id: str
    title: str
    dialect: str
    category: str = "General"
    created_at: datetime
    updated_at: datetime
    turn_count: int = 0


class Turn(BaseModel):
    turn_id: str
    thread_id: str
    prompt: str
    sql: str
    explanation: str
    meeting_mode: str
    dialect: str
    confidence: str
    confirmed_assumptions: List[str] = Field(default_factory=list)
    created_at: datetime


class ThreadDetail(BaseModel):
    thread_id: str
    title: str
    dialect: str
    category: str = "General"
    created_at: datetime
    updated_at: datetime
    turns: List[Turn] = Field(default_factory=list)


class CreateThreadRequest(BaseModel):
    title: Optional[str] = Field(default=None, description="Auto-generated from first prompt if omitted")
    dialect: str = Field(default="postgresql")
