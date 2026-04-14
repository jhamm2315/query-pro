"""Health-check router."""

from fastapi import APIRouter
from services.ollama_client import ollama
from services.voice import BACKENDS as VOICE_BACKENDS

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    ollama_ok = await ollama.is_available()
    return {
        "status": "ok",
        "ollama": "available" if ollama_ok else "unavailable",
        "model": ollama.model,
        "voice_backends": list(VOICE_BACKENDS.keys()),
    }
