"""Voice transcription service abstraction.

Currently ships a stub backend only.
Drop in whisper.py or vosk.py next to this file and register them in BACKENDS.
All transcription is user-invoked — no passive or covert capture.
"""

from __future__ import annotations

import base64
import logging
import tempfile
from pathlib import Path
from typing import Optional, Protocol

from schemas.voice import TranscribeRequest, TranscribeResponse

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Backend protocol — implement this interface for new engines
# ---------------------------------------------------------------------------

class TranscriptionBackend(Protocol):
    async def transcribe(self, audio_path: Path, language: str) -> tuple[str, Optional[float]]:
        """Return (transcript, confidence_0_to_1)."""
        ...


# ---------------------------------------------------------------------------
# Stub backend (returns placeholder for development)
# ---------------------------------------------------------------------------

class StubBackend:
    async def transcribe(self, audio_path: Path, language: str) -> tuple[str, Optional[float]]:
        logger.info("StubBackend: returning placeholder transcript for %s", audio_path)
        return (
            "[Stub transcript] — install Whisper or Vosk and set VOICE_BACKEND env var.",
            None,
        )


# ---------------------------------------------------------------------------
# Backend registry — extend here to add real engines
# ---------------------------------------------------------------------------

import os as _os

BACKENDS: dict[str, TranscriptionBackend] = {
    "stub": StubBackend(),
}

# Auto-register Whisper if the package is installed
from services import whisper_backend as _wb  # noqa: E402

_whisper = _wb.try_load(_os.getenv("WHISPER_MODEL", "base"))
if _whisper is not None:
    BACKENDS["whisper"] = _whisper


def _get_backend(name: str) -> TranscriptionBackend:
    backend = BACKENDS.get(name)
    if backend is None:
        logger.warning("Unknown voice backend '%s', falling back to stub.", name)
        return BACKENDS["stub"]
    return backend


# ---------------------------------------------------------------------------
# Public service function
# ---------------------------------------------------------------------------

async def transcribe(req: TranscribeRequest) -> TranscribeResponse:
    """User-invoked transcription only — never called automatically."""
    backend = _get_backend(req.backend)

    if req.audio_path:
        audio_path = Path(req.audio_path)
    elif req.audio_b64:
        raw = base64.b64decode(req.audio_b64)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(raw)
            audio_path = Path(tmp.name)
    else:
        return TranscribeResponse(
            transcript="",
            backend_used=req.backend,
            confidence=None,
            language=req.language,
        )

    transcript, confidence = await backend.transcribe(audio_path, req.language)
    return TranscribeResponse(
        transcript=transcript,
        backend_used=req.backend,
        confidence=confidence,
        language=req.language,
    )
