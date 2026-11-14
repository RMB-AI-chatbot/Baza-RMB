"""LLM adapter. Choose the provider with LLM_PROVIDER (anthropic | gemini | groq).
Add a provider by implementing app.llm.base.LLMProvider."""

from __future__ import annotations

from functools import lru_cache

from app.llm.base import LLMError, LLMProvider, Usage  # noqa: F401


@lru_cache
def get_llm() -> LLMProvider:
    from app.config import get_settings

    provider = get_settings().llm_provider.lower()
    if provider == "gemini":
        from app.llm.gemini_provider import GeminiProvider

        return GeminiProvider()
    if provider == "groq":
        from app.llm.groq_provider import GroqProvider

        return GroqProvider()
    if provider == "anthropic":
        from app.llm.anthropic_provider import AnthropicProvider

        return AnthropicProvider()
    raise LLMError(f"unknown LLM_PROVIDER: {provider}")


def llm_configured() -> bool:
    from app.config import get_settings

    s = get_settings()
    keys = {"gemini": s.gemini_api_key, "groq": s.groq_api_key, "anthropic": s.anthropic_api_key}
    return bool(keys.get(s.llm_provider.lower()))
