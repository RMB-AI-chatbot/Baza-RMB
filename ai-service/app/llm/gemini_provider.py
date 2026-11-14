"""Google Gemini implementation of the LLM interface (google-genai SDK).

Select with LLM_PROVIDER=gemini and GEMINI_API_KEY. Models (configurable in .env):
  ROUTER_MODEL  classification + query rewriting (fast "flash-lite"/"flash" model)
  ANSWER_MODEL  grounded answers (streamed)
  OCR_MODEL     page transcription at ingestion time
"""

from __future__ import annotations

import base64
import inspect
import json
import logging

from google import genai
from google.genai import errors, types

from app.config import get_settings
from app.llm.base import LLMError, Usage

log = logging.getLogger(__name__)


def _thinking(model: str, level: str) -> types.ThinkingConfig | None:
    """Keep thinking minimal for latency. Gemini 3 uses levels; 2.5 uses token budgets."""
    m = model.lower()
    if "gemini-3" in m:
        return types.ThinkingConfig(thinking_level="low")
    if "2.5-pro" in m:
        return types.ThinkingConfig(thinking_budget=128)  # pro cannot disable thinking
    if "2.5" in m:
        return types.ThinkingConfig(thinking_budget=0 if level == "off" else 512)
    return None


def _usage(model: str, resp) -> Usage:
    um = getattr(resp, "usage_metadata", None)
    return Usage(
        model=model,
        input_tokens=getattr(um, "prompt_token_count", 0) or 0,
        output_tokens=(getattr(um, "candidates_token_count", 0) or 0) + (getattr(um, "thoughts_token_count", 0) or 0),
    )


def _blocked(resp) -> bool:
    fb = getattr(resp, "prompt_feedback", None)
    if fb is not None and getattr(fb, "block_reason", None):
        return True
    for c in getattr(resp, "candidates", None) or []:
        if str(getattr(c, "finish_reason", "")).upper().endswith(("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST")):
            return True
    return False


def _contents(messages: list[dict]) -> list[dict]:
    """Anthropic-style [{role, content}] -> Gemini contents (assistant -> model)."""
    return [
        {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
        for m in messages
    ]


class _GeminiAnswerStream:
    def __init__(self, provider: "GeminiProvider", system: str, messages: list[dict]):
        self._p = provider
        self._system = system
        self._messages = messages
        self.usage = Usage(model=provider.s.answer_model)

    async def __aiter__(self):
        s = self._p.s
        cfg = types.GenerateContentConfig(
            system_instruction=self._system,
            max_output_tokens=s.answer_max_tokens,
            temperature=0.2,
            thinking_config=_thinking(s.answer_model, "low"),
        )
        last = None
        try:
            it = self._p.client.aio.models.generate_content_stream(
                model=s.answer_model, contents=_contents(self._messages), config=cfg)
            if inspect.isawaitable(it):
                it = await it
            async for chunk in it:
                last = chunk
                if _blocked(chunk):
                    raise LLMError("answer model blocked the response")
                text = chunk.text if getattr(chunk, "candidates", None) else None
                if text:
                    yield text
        except errors.APIError as e:
            log.error("answer model error %s: %s", getattr(e, "code", "?"), str(e)[:300])
            raise LLMError(f"answer model error {getattr(e, 'code', '')}") from e
        if last is not None:
            self.usage = _usage(s.answer_model, last)


class GeminiProvider:
    def __init__(self):
        self.s = get_settings()
        if not self.s.gemini_api_key:
            raise LLMError("GEMINI_API_KEY is not set")
        self.client = genai.Client(api_key=self.s.gemini_api_key)

    async def classify(self, system: str, user: str, schema: dict) -> tuple[dict, Usage]:
        cfg = types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=600,
            temperature=0.0,
            response_mime_type="application/json",
            response_json_schema=schema,
            thinking_config=_thinking(self.s.router_model, "off"),
        )
        try:
            resp = await self.client.aio.models.generate_content(model=self.s.router_model, contents=user, config=cfg)
        except errors.APIError as e:
            log.error("router model error %s: %s", getattr(e, "code", "?"), str(e)[:300])
            raise LLMError(f"router model error {getattr(e, 'code', '')}") from e
        if _blocked(resp) or not resp.text:
            raise LLMError("router model returned no output")
        try:
            return json.loads(resp.text), _usage(self.s.router_model, resp)
        except json.JSONDecodeError as e:
            raise LLMError("router returned invalid JSON") from e

    def stream_answer(self, system: str, messages: list[dict]) -> _GeminiAnswerStream:
        return _GeminiAnswerStream(self, system, messages)

    def transcribe_image(self, b64_data: str, media_type: str, prompt: str) -> str:
        part = types.Part.from_bytes(data=base64.standard_b64decode(b64_data), mime_type=media_type)
        try:
            resp = self.client.models.generate_content(
                model=self.s.ocr_model,
                contents=[part, prompt],
                config=types.GenerateContentConfig(
                    temperature=0.0, max_output_tokens=16000,
                    thinking_config=_thinking(self.s.ocr_model, "off"),
                ),
            )
        except errors.APIError as e:
            raise LLMError(f"OCR error {getattr(e, 'code', '')}: {str(e)[:200]}") from e
        if _blocked(resp) or not resp.text:
            raise LLMError("OCR returned no text")
        return resp.text.strip()
