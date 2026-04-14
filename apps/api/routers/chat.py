"""Meeting mode chat router — SSE streaming."""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from schemas.chat import MeetingChatRequest
from services.meeting_chat import stream_meeting_chat

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/meeting")
async def meeting_chat(req: MeetingChatRequest):
    """Stream meeting-mode chat responses as Server-Sent Events.

    Mode = 'assumptions': walks through each assumption one at a time with Y/N.
    Mode = 'chat': open streaming conversation about the query.
    """
    return StreamingResponse(
        stream_meeting_chat(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
