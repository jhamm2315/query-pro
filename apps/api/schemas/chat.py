"""Meeting mode chat schemas."""

from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class MeetingChatRequest(BaseModel):
    thread_id: str
    messages: List[ChatMessage] = Field(default_factory=list)
    # Plan context forwarded from the generate response
    sql: str = ""
    grain: str = ""
    patterns: List[str] = Field(default_factory=list)
    assumptions: List[str] = Field(default_factory=list)
    ambiguities: List[str] = Field(default_factory=list)
    confirmed_assumptions: List[str] = Field(default_factory=list)
    # Mode switches automatically once all assumptions answered
    mode: Literal["assumptions", "chat"] = "assumptions"
