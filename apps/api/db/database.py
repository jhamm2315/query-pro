"""SQLite connection and session management via SQLAlchemy."""

import os
import sqlite3
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DB_PATH = Path(os.getenv("DB_PATH", "sql_copilot.db"))
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row[1] == column for row in rows)


def _migrate_sqlite_schema() -> None:
    if not DB_PATH.exists():
        return

    with sqlite3.connect(DB_PATH) as conn:
        if _column_exists(conn, "threads", "category") is False:
            conn.execute("ALTER TABLE threads ADD COLUMN category VARCHAR NOT NULL DEFAULT 'General'")

        if _column_exists(conn, "turns", "confirmed_assumptions") is False:
            conn.execute("ALTER TABLE turns ADD COLUMN confirmed_assumptions TEXT NOT NULL DEFAULT '[]'")

        conn.commit()


def init_db() -> None:
    from . import models  # noqa: F401 – ensure models are registered
    Base.metadata.create_all(bind=engine)
    _migrate_sqlite_schema()
