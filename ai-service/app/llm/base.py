"""Provider-neutral LLM interface. The rest of the service only talks to this."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Protocol


class LLMError(RuntimeError):
    """Raised when the provider fails or refuses; callers fall back to a safe message."""


@dataclass
class Usage:
    model: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    stop_reason: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


class AnswerStream(Protocol):
    """Async iterator of text deltas; `usage` is filled once iteration finishes."""

    usage: Usage

    def __aiter__(self) -> AsyncIterator[str]: ...


class LLMProvider(Protocol):
    async def classify(self, system: str, user: str, schema: dict) -> tuple[dict, Usage]:
        """Return JSON matching `schema` (fast, cheap model)."""

    def stream_answer(self, system: str, messages: list[dict]) -> AnswerStream:
        """Stream a grounded answer (answer model)."""

    def transcribe_image(self, b64_data: str, media_type: str, prompt: str) -> str:
        """OCR / transcription of one image (sync; used at ingestion time)."""
