"""Voice transcription schemas."""

from typing import Optional
from pydantic import BaseModel, Field


class TranscribeRequest(BaseModel):
    audio_b64: Optional[str] = Field(default=None, description="Base64-encoded audio bytes")
    audio_path: Optional[str] = Field(default=None, description="Path to a local audio file")
    language: str = Field(default="en", description="BCP-47 language code")
    backend: str = Field(default="stub", description="whisper | vosk | stub")


class TranscribeResponse(BaseModel):
    transcript: str
    backend_used: str
    confidence: Optional[float] = None
    language: str = "en"
