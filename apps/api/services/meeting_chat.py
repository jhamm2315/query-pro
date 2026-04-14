"""Meeting mode chat service — assumption Y/N flow + open streaming chat."""

import json
import logging
from pathlib import Path
from typing import AsyncGenerator, List

from schemas.chat import ChatMessage, MeetingChatRequest
from services.ollama_client import ollama

logger = logging.getLogger(__name__)

_CHAT_PROMPT_PATH = (
    Path(__file__).parent.parent.parent.parent
    / "packages" / "prompt-templates" / "meeting_chat_prompt.txt"
)

_SUMMARY_PROMPT_PATH = (
    Path(__file__).parent.parent.parent.parent
    / "packages" / "prompt-templates" / "meeting_summary_after_assumptions_prompt.txt"
)


def _load_chat_prompt() -> str:
    if _CHAT_PROMPT_PATH.exists():
        return _CHAT_PROMPT_PATH.read_text(encoding="utf-8")
    return (
        "You are a data analyst assistant in a working session. "
        "The user is asking questions about this SQL query.\n\n"
        "SQL:\n{{SQL}}\n\nGrain: {{GRAIN}}\nPatterns: {{PATTERNS}}\n\n"
        "Confirmed assumptions:\n{{CONFIRMED}}\n\n"
        "Conversation so far:\n{{HISTORY}}\n\n"
        "Answer concisely (2-4 sentences). If something is ambiguous, ask for clarification."
    )


def _is_answered(assumption: str, confirmed: List[str]) -> bool:
    """True if the assumption has been confirmed (Y) or flagged (N)."""
    return assumption in confirmed or f"[FLAGGED] {assumption}" in confirmed


def _assumption_question(assumption: str, index: int, total: int) -> str:
    return (
        f"**Assumption {index}/{total}:** {assumption}\n\n"
        "Is this correct? Reply **Y** to confirm or **N** to flag it."
    )


async def stream_meeting_chat(req: MeetingChatRequest) -> AsyncGenerator[str, None]:
    """Yield SSE-formatted data chunks for the meeting chat response."""

    def sse(data: dict) -> str:
        return f"data: {json.dumps(data)}\n\n"

    last_user_msg = req.messages[-1].content.strip().upper() if req.messages else ""
    total = len(req.assumptions)

    # ── Assumption flow ────────────────────────────────────────────────────────
    if req.mode == "assumptions" and total > 0:
        confirmed = list(req.confirmed_assumptions)

        # Process the last Y/N reply if there was one
        if last_user_msg in ("Y", "YES", "N", "NO") and req.messages:
            # The assumption being answered is the previous bot question's subject
            # Find last assistant message to know which assumption was asked
            for msg in reversed(req.messages[:-1]):
                if msg.role == "assistant":
                    for a in req.assumptions:
                        if a in msg.content and a not in confirmed:
                            if last_user_msg in ("Y", "YES"):
                                confirmed.append(a)
                            else:
                                confirmed.append(f"[FLAGGED] {a}")
                            break
                    break

        next_a = next(
            (a for a in req.assumptions if not _is_answered(a, confirmed)),
            None,
        )
        remaining = [a for a in req.assumptions if not _is_answered(a, confirmed)]

        if remaining and next_a:
            idx = req.assumptions.index(next_a) + 1
            text = _assumption_question(next_a, idx, total)
            yield sse({"type": "assumption", "text": text, "confirmed": confirmed})
            yield sse({"type": "done", "confirmed": confirmed, "mode": "assumptions"})
        else:
            # All assumptions answered — stream an auto-summary + follow-up questions
            confirmed_clean = [a for a in confirmed if not a.startswith("[FLAGGED]")]
            flagged = [a.replace("[FLAGGED] ", "") for a in confirmed if a.startswith("[FLAGGED]")]

            confirmed_text = "\n".join(f"- {a}" for a in confirmed_clean) or "None"
            flagged_text = "\n".join(f"- {a}" for a in flagged) or "None"

            template = (
                _SUMMARY_PROMPT_PATH.read_text(encoding="utf-8")
                if _SUMMARY_PROMPT_PATH.exists()
                else "Summarise what this SQL does and suggest 3 follow-up questions.\n\nSQL:\n{{SQL}}\nConfirmed:\n{{CONFIRMED}}\nFlagged:\n{{FLAGGED}}\n\n## ASSISTANT:"
            )
            prompt = (
                template
                .replace("{{SQL}}", req.sql or "(no SQL context)")
                .replace("{{GRAIN}}", req.grain or "unknown")
                .replace("{{PATTERNS}}", ", ".join(req.patterns) if req.patterns else "standard")
                .replace("{{CONFIRMED}}", confirmed_text)
                .replace("{{FLAGGED}}", flagged_text)
            )

            # Signal to the frontend that the assumption loop is complete before streaming
            yield sse({"type": "assumption_done", "text": "", "confirmed": confirmed})

            try:
                async for token in ollama.stream_generate(prompt, temperature=0.2):
                    yield sse({"type": "token", "text": token})
            except Exception as exc:
                logger.warning("Auto-summary stream failed: %s", exc)
                yield sse({"type": "token", "text": "Ollama is not reachable. Check that it is running."})

            yield sse({"type": "done", "confirmed": confirmed, "mode": "chat"})
        return

    # ── Open chat mode (stream LLM tokens) ────────────────────────────────────
    history_text = "\n".join(
        f"{m.role.upper()}: {m.content}" for m in req.messages[-6:]
    )
    confirmed_text = "\n".join(f"- {a}" for a in req.confirmed_assumptions) or "None confirmed yet"

    template = _load_chat_prompt()
    prompt = (
        template
        .replace("{{SQL}}", req.sql or "(no SQL context)")
        .replace("{{GRAIN}}", req.grain or "unknown")
        .replace("{{PATTERNS}}", ", ".join(req.patterns) or "standard")
        .replace("{{CONFIRMED}}", confirmed_text)
        .replace("{{HISTORY}}", history_text)
    )

    try:
        async for token in ollama.stream_generate(prompt, temperature=0.2):
            yield sse({"type": "token", "text": token})
    except Exception as exc:
        logger.warning("Meeting chat stream failed: %s", exc)
        yield sse({"type": "token", "text": "Ollama is not reachable. Check that it is running."})

    yield sse({"type": "done", "confirmed": list(req.confirmed_assumptions), "mode": "chat"})
