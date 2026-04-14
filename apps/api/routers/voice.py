"""Voice transcription router — user-invoked only."""

from fastapi import APIRouter

from schemas.voice import TranscribeRequest, TranscribeResponse
from services.voice import transcribe

router = APIRouter(prefix="/api/voice", tags=["voice"])


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(req: TranscribeRequest):
    """Accept audio (base64 or path) and return a transcript.

    This endpoint is called only when the user explicitly clicks the mic button.
    No passive capture occurs.
    """
    return await transcribe(req)
