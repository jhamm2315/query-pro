"""Thin async client for the local Ollama API."""

import json
import os
from typing import Any, AsyncGenerator, Dict, Optional

import httpx

OLLAMA_BASE_URL  = os.getenv("OLLAMA_BASE_URL",  "http://localhost:11434")
OLLAMA_MODEL     = os.getenv("OLLAMA_MODEL",     "llama3.2")
OLLAMA_TIMEOUT   = float(os.getenv("OLLAMA_TIMEOUT",   "120"))
# Cap token output — prevents runaway generation that wastes time.
# Combined plan+sql needs ~600 tokens; explain/meeting ~300 each.
OLLAMA_NUM_PREDICT = int(os.getenv("OLLAMA_NUM_PREDICT", "700"))
# Smaller context = faster prefill on large prompts.
OLLAMA_NUM_CTX     = int(os.getenv("OLLAMA_NUM_CTX",     "4096"))


class OllamaClient:
    def __init__(
        self,
        base_url: str = OLLAMA_BASE_URL,
        model: str = OLLAMA_MODEL,
        timeout: float = OLLAMA_TIMEOUT,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    # ------------------------------------------------------------------
    # Core generation
    # ------------------------------------------------------------------

    async def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: float = 0.0,
        format: Optional[str] = None,
    ) -> str:
        """Send a prompt and return the full response string."""
        payload: Dict[str, Any] = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": OLLAMA_NUM_PREDICT,
                "num_ctx": OLLAMA_NUM_CTX,
            },
        }
        if system:
            payload["system"] = system
        if format:
            payload["format"] = format

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(f"{self.base_url}/api/generate", json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data.get("response", "")

    async def generate_json(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: float = 0.0,
    ) -> Dict[str, Any]:
        """Request JSON output and parse it."""
        raw = await self.generate(prompt, system=system, temperature=temperature, format="json")
        # Ollama sometimes wraps in markdown fences — strip them
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)

    async def stream_generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: float = 0.0,
    ) -> AsyncGenerator[str, None]:
        """Yield response tokens as they arrive."""
        payload: Dict[str, Any] = {
            "model": self.model,
            "prompt": prompt,
            "stream": True,
            "options": {"temperature": temperature},
        }
        if system:
            payload["system"] = system

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream("POST", f"{self.base_url}/api/generate", json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    token = data.get("response", "")
                    if token:
                        yield token
                    if data.get("done"):
                        break

    # ------------------------------------------------------------------
    # Health-check
    # ------------------------------------------------------------------

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                return resp.status_code == 200
        except Exception:
            return False


# Singleton used by services
ollama = OllamaClient()
