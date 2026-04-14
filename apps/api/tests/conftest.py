"""Shared pytest fixtures for Query Pro API tests."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from unittest.mock import patch

from sqlalchemy.pool import StaticPool

from db.database import Base, get_db
from db import models  # noqa: F401 — ensure models are registered
from main import app

# In-memory SQLite with StaticPool so all sessions share one connection
TEST_DB_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

# Create tables once at module load so they exist before the first TestClient starts
Base.metadata.create_all(bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client():
    """TestClient with in-memory DB and suppressed lifespan init_db call."""
    app.dependency_overrides[get_db] = override_get_db
    # Suppress lifespan's init_db so it doesn't write to the real DB path
    with patch("main.init_db"):
        with TestClient(app) as c:
            yield c
    app.dependency_overrides.clear()
