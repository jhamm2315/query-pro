"""Whisper transcription backend.

Requires: pip install openai-whisper
Falls back gracefully — if whisper is not installed this module still imports;
the backend simply won't be registered in the BACKENDS dict.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class WhisperBackend:
    """Wraps openai-whisper for local, offline transcription."""

    def __init__(self, model_name: str = "base") -> None:
        import whisper  # deferred so missing package is a runtime error, not import error

        logger.info("Loading Whisper model '%s'…", model_name)
        self._model = whisper.load_model(model_name)
        logger.info("Whisper model '%s' ready.", model_name)

    async def transcribe(self, audio_path: Path, language: str) -> tuple[str, Optional[float]]:
        """Run Whisper in a thread pool to avoid blocking the event loop."""
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: self._model.transcribe(str(audio_path), language=language if language != "en" else None),
        )
        text: str = result.get("text", "").strip()
        # Whisper doesn't expose a simple confidence scalar; use None
        return text, None


def try_load(model_name: str = "base") -> Optional[WhisperBackend]:
    """Return a WhisperBackend if the package is available, otherwise None."""
    try:
        backend = WhisperBackend(model_name)
        logger.info("Whisper backend registered (model=%s).", model_name)
        return backend
    except ImportError:
        logger.info("openai-whisper not installed — Whisper backend unavailable.")
        return None
    except Exception as exc:
        logger.warning("Whisper backend failed to load: %s", exc)
        return None
