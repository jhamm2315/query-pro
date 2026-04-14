"""SQLAlchemy ORM models for local persistence."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


class Thread(Base):
    __tablename__ = "threads"

    thread_id = Column(String, primary_key=True, default=_uuid)
    title = Column(String, nullable=False, default="Untitled thread")
    dialect = Column(String, nullable=False, default="postgresql")
    category = Column(String, nullable=False, default="General")
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    turns = relationship("Turn", back_populates="thread", cascade="all, delete-orphan", order_by="Turn.created_at")


class SavedQuery(Base):
    __tablename__ = "saved_queries"

    id = Column(String, primary_key=True, default=_uuid)
    label = Column(String, nullable=False)
    sql = Column(Text, nullable=False)
    prompt = Column(Text, nullable=False, default="")
    dialect = Column(String, nullable=False, default="postgresql")
    created_at = Column(DateTime, default=_now)


class Turn(Base):
    __tablename__ = "turns"

    turn_id = Column(String, primary_key=True, default=_uuid)
    thread_id = Column(String, ForeignKey("threads.thread_id"), nullable=False)
    prompt = Column(Text, nullable=False)
    sql = Column(Text, nullable=False, default="")
    explanation = Column(Text, nullable=False, default="")
    meeting_mode = Column(Text, nullable=False, default="")
    dialect = Column(String, nullable=False, default="postgresql")
    confidence = Column(String, nullable=False, default="low")
    confirmed_assumptions = Column(Text, nullable=False, default="[]")  # JSON array
    created_at = Column(DateTime, default=_now)

    thread = relationship("Thread", back_populates="turns")
