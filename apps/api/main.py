"""Query Pro — FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()  # Must run before any service import reads os.getenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.database import init_db
from routers import chat, health, history, library, sql, voice

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initialising SQLite database…")
    init_db()
    logger.info("Database ready.")
    yield
    logger.info("Shutting down.")


app = FastAPI(
    title="Query Pro",
    description=(
        "A local-first, privacy-first SQL workspace that converts business questions "
        "into structured SQL plans, dialect-specific SQL, and plain-English explanations."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(sql.router)
app.include_router(library.router)
app.include_router(chat.router)
app.include_router(history.router)
app.include_router(voice.router)


@app.get("/")
async def root():
    return {
        "app": "Query Pro",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health",
    }
