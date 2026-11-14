"""Anthropic (Claude) implementation of the LLM interface.

Models (configurable in .env):
  ROUTER_MODEL  claude-haiku-5-5   intent/language classification + query rewriting
  ANSWER_MODEL  claude-sonnet-5-5  grounded answers (streamed)
  OCR_MODEL     claude-sonnet-5-5  page transcription at ingestion time
"""

from __future__ import annotations

import json
import logging

import anthropic

from app.config import get_settings
from app.llm.base import LLMError, Usage

log = logging.getLogger(__name__)

FALLBACK_BETA = "server-side-fallback-2026-07-01"


class _AnthropicAnswerStream:
    def __init__(self, provider: "AnthropicProvider", system: str, messages: list[dict]):
        self._p = provider
        self._system = system
        self._messages = messages
        self.usage = Usage(model=provider.s.answer_model)

    async def __aiter__(self):
        s = self._p.s
        kwargs = dict(
            model=s.answer_model,
            max_tokens=s.answer_max_tokens,
            # Stable system prompt is cached; retrieved sources go in the user turn.
            system=[{"type": "text", "text": self._system, "cache_control": {"type": "ephemeral"}}],
            messages=self._messages,
            output_config={"effort": s.answer_effort},
        )
        try:
            if s.use_server_fallbacks and s.answer_model.startswith(("claude-sonnet-5-5", "claude-opus-5")):
                cm = self._p.client.beta.messages.stream(betas=[FALLBACK_BETA], fallbacks="default", **kwargs)
            else:
                cm = self._p.client.messages.stream(**kwargs)
            async with cm as stream:
                async for text in stream.text_stream:
                    yield text
                final = await stream.get_final_message()
        except anthropic.APIStatusError as e:
            log.error("answer model error %s: %s", e.status_code, e.message)
            raise LLMError(f"answer model error {e.status_code}") from e
        except anthropic.APIConnectionError as e:
            log.error("answer model connection error: %s", e)
            raise LLMError("answer model unreachable") from e

        self.usage = Usage(
            model=final.model,
            input_tokens=final.usage.input_tokens,
            output_tokens=final.usage.output_tokens,
            stop_reason=final.stop_reason,
            extra={"cache_read": getattr(final.usage, "cache_read_input_tokens", 0) or 0},
        )
        if final.stop_reason == "refusal":
            raise LLMError("answer model refused")


class AnthropicProvider:
    def __init__(self):
        self.s = get_settings()
        if not self.s.anthropic_api_key:
            raise LLMError("ANTHROPIC_API_KEY is not set")
        self.client = anthropic.AsyncAnthropic(api_key=self.s.anthropic_api_key, timeout=60.0, max_retries=2)
        self.sync_client = anthropic.Anthropic(api_key=self.s.anthropic_api_key, timeout=180.0, max_retries=3)

    async def classify(self, system: str, user: str, schema: dict) -> tuple[dict, Usage]:
        try:
            resp = await self.client.messages.create(
                model=self.s.router_model,
                max_tokens=600,
                system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": user}],
                thinking={"type": "disabled"},
                output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
            )
        except anthropic.APIStatusError as e:
            log.error("router model error %s: %s", e.status_code, e.message)
            raise LLMError(f"router model error {e.status_code}") from e
        except anthropic.APIConnectionError as e:
            raise LLMError("router model unreachable") from e
        if resp.stop_reason == "refusal":
            raise LLMError("router model refused")
        text = next((b.text for b in resp.content if b.type == "text"), "{}")
        usage = Usage(resp.model, resp.usage.input_tokens, resp.usage.output_tokens, resp.stop_reason)
        try:
            return json.loads(text), usage
        except json.JSONDecodeError as e:
            raise LLMError("router returned invalid JSON") from e

    def stream_answer(self, system: str, messages: list[dict]) -> _AnthropicAnswerStream:
        return _AnthropicAnswerStream(self, system, messages)

    def transcribe_image(self, b64_data: str, media_type: str, prompt: str) -> str:
        with self.sync_client.messages.stream(
            model=self.s.ocr_model,
            max_tokens=16000,
            output_config={"effort": "low"},
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64_data}},
                    {"type": "text", "text": prompt},
                ],
            }],
        ) as stream:
            msg = stream.get_final_message()
        if msg.stop_reason == "refusal":
            raise LLMError("OCR refused")
        return "".join(b.text for b in msg.content if b.type == "text").strip()
