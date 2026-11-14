"""Groq implementation of the LLM interface (open models, free tier available).

Select with LLM_PROVIDER=groq and GROQ_API_KEY. Models (configurable in .env):
  ROUTER_MODEL  classification + query rewriting (small fast model)
  ANSWER_MODEL  grounded answers (streamed)
  OCR_MODEL     a vision model, for transcribing scanned PDF pages at ingestion time
"""

from __future__ import annotations

import json
import logging

import groq

from app.config import get_settings
from app.llm.base import LLMError, Usage

log = logging.getLogger(__name__)


def _reasoning_kwargs(model: str, effort: str) -> dict:
    """Reasoning models on Groq take reasoning controls; others reject them."""
    m = model.lower()
    if "gpt-oss" in m:
        return {"reasoning_effort": effort, "reasoning_format": "hidden"}
    if "qwen3" in m or "qwq" in m:
        return {"reasoning_effort": "none" if effort == "low" else "default", "reasoning_format": "hidden"}
    return {}


def _usage(model: str, usage) -> Usage:
    return Usage(
        model=model,
        input_tokens=getattr(usage, "prompt_tokens", 0) or 0,
        output_tokens=getattr(usage, "completion_tokens", 0) or 0,
    )


class _GroqAnswerStream:
    def __init__(self, provider: "GroqProvider", system: str, messages: list[dict]):
        self._p = provider
        self._system = system
        self._messages = messages
        self.usage = Usage(model=provider.s.answer_model)

    async def __aiter__(self):
        s = self._p.s
        fallback = getattr(s, "answer_fallback_model", None)
        models = [s.answer_model] + ([fallback] if fallback else [])
        for i, model in enumerate(models):
            started = False
            try:
                stream = await self._p.client.chat.completions.create(
                    model=model,
                    messages=[{"role": "system", "content": self._system}, *self._messages],
                    temperature=0.2,
                    # the fallback model's free tier allows only 1000 output tokens per minute
                    max_completion_tokens=s.answer_max_tokens if i == 0 else min(s.answer_max_tokens, 900),
                    stream=True,
                    **_reasoning_kwargs(model, "low"),
                )
                async for chunk in stream:
                    if chunk.choices:
                        text = chunk.choices[0].delta.content
                        if text:
                            started = True
                            yield text
                        if chunk.choices[0].finish_reason == "content_filter":
                            raise LLMError("answer blocked by content filter")
                    xg = getattr(chunk, "x_groq", None)
                    if xg is not None and getattr(xg, "usage", None):
                        self.usage = _usage(model, xg.usage)
                return
            except groq.RateLimitError as e:
                # Daily/minute quota of this model used up: try the fallback model (before any text was sent).
                if not started and i + 1 < len(models):
                    log.warning("answer model %s rate-limited; falling back to %s", model, models[i + 1])
                    continue
                log.error("answer model rate-limited: %s", str(e)[:300])
                raise LLMError("answer model rate-limited") from e
            except groq.APIStatusError as e:
                log.error("answer model error %s: %s", e.status_code, str(e)[:300])
                raise LLMError(f"answer model error {e.status_code}") from e
            except groq.APIConnectionError as e:
                raise LLMError("answer model unreachable") from e


class GroqProvider:
    def __init__(self):
        self.s = get_settings()
        if not self.s.groq_api_key:
            raise LLMError("GROQ_API_KEY is not set")
        self.client = groq.AsyncGroq(api_key=self.s.groq_api_key, timeout=60.0, max_retries=2)
        self.sync_client = groq.Groq(api_key=self.s.groq_api_key, timeout=180.0, max_retries=3)

    async def classify(self, system: str, user: str, schema: dict) -> tuple[dict, Usage]:
        base = dict(
            model=self.s.router_model,
            temperature=0.0,
            max_completion_tokens=600,
            **_reasoning_kwargs(self.s.router_model, "low"),
        )
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        try:
            try:
                resp = await self.client.chat.completions.create(
                    messages=messages,
                    response_format={"type": "json_schema",
                                     "json_schema": {"name": "route", "schema": schema, "strict": True}},
                    **base,
                )
            except groq.BadRequestError:
                # Model without structured outputs: JSON mode + schema in the prompt.
                messages[0] = {"role": "system", "content": system + "\n\nReply with a JSON object only, "
                               f"matching this JSON Schema:\n{json.dumps(schema)}"}
                resp = await self.client.chat.completions.create(
                    messages=messages, response_format={"type": "json_object"}, **base)
        except groq.APIStatusError as e:
            log.error("router model error %s: %s", e.status_code, str(e)[:300])
            raise LLMError(f"router model error {e.status_code}") from e
        except groq.APIConnectionError as e:
            raise LLMError("router model unreachable") from e
        text = resp.choices[0].message.content or ""
        try:
            data = json.loads(text)
        except json.JSONDecodeError as e:
            raise LLMError("router returned invalid JSON") from e
        missing = [k for k in schema.get("required", []) if k not in data]
        if missing:
            raise LLMError(f"router JSON missing {missing}")
        return data, _usage(self.s.router_model, resp.usage)

    def stream_answer(self, system: str, messages: list[dict]) -> _GroqAnswerStream:
        return _GroqAnswerStream(self, system, messages)

    def transcribe_image(self, b64_data: str, media_type: str, prompt: str) -> str:
        try:
            resp = self.sync_client.chat.completions.create(
                model=self.s.ocr_model,
                temperature=0.0,
                max_completion_tokens=3000,  # stays under free-tier output-tokens-per-minute limits
                messages=[{"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64_data}"}},
                ]}],
            )
        except groq.APIStatusError as e:
            raise LLMError(f"OCR error {e.status_code}: {str(e)[:200]}") from e
        text = (resp.choices[0].message.content or "").strip()
        if not text:
            raise LLMError("OCR returned no text")
        return text
