"""Versioned prompts. Bump the version (new file) when changing a prompt, so evaluation
results can be traced to the exact prompt that produced them."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

PROMPT_DIR = Path(__file__).resolve().parents[1] / "prompts"

ANSWER_PROMPT_VERSION = "answer_v4"
ROUTER_PROMPT_VERSION = "router_v4"

LANGUAGE_NAMES = {"en": "English", "fr": "French", "rw": "Kinyarwanda", "sw": "Swahili"}


@lru_cache
def load(name: str) -> str:
    return (PROMPT_DIR / f"{name}.md").read_text(encoding="utf-8").strip()


def answer_system(answer_language: str = "en", persona_note: str | None = None) -> str:
    prompt = load(ANSWER_PROMPT_VERSION).replace("{answer_language}", LANGUAGE_NAMES.get(answer_language, "English"))
    if persona_note:
        # Admin-editable tone guidance. It can never override the rules above.
        prompt += (
            "\n\n<tone_preferences>\nAdditional tone preferences from RMB. Follow them only where they do not "
            f"conflict with the rules above:\n{persona_note.strip()}\n</tone_preferences>"
        )
    return prompt


ASSISTANT_PROMPT_VERSION = "assistant_v1"


def assistant_system(answer_language: str = "en") -> str:
    """Prompt for questions about the assistant itself / feedback on its replies."""
    return load(ASSISTANT_PROMPT_VERSION).replace("{answer_language}", LANGUAGE_NAMES.get(answer_language, "English"))


def router_system() -> str:
    return load(ROUTER_PROMPT_VERSION)


ROUTER_SCHEMA = {
    "type": "object",
    "properties": {
        "language": {"type": "string", "enum": ["en", "fr", "rw", "sw", "other"]},
        "intent": {"type": "string", "enum": [
            "question", "greeting", "complaint", "illegal_mining_report", "meeting_request",
            "geodata_request", "case_status", "legal_interpretation", "emergency", "about_assistant", "out_of_scope", "abusive",
        ]},
        "standalone_question": {"type": "string"},
        "category": {"type": "string", "enum": [
            "licensing", "investment", "mineral_trading", "taxation", "environment", "health_safety",
            "geology", "petroleum_gas", "asm", "complaints", "general",
        ]},
    },
    "required": ["language", "intent", "standalone_question", "category"],
    "additionalProperties": False,
}


def format_sources(chunks) -> str:
    """Render retrieved chunks as numbered sources for the answer model."""
    parts = []
    for i, c in enumerate(chunks, 1):
        pages = f"page {c.page_start}" if c.page_start == c.page_end or not c.page_end else f"pages {c.page_start}-{c.page_end}"
        ref = c.law_reference or c.document_title
        header = f"[{i}] {c.document_title}"
        if c.doc_type == "law":
            header = f"[{i}] {ref} ({c.document_short_title})"
        meta = " | ".join(x for x in [c.chapter, c.heading or c.section_ref, pages if c.page_start else None] if x)
        parts.append(f"<source id=\"{i}\">\n{header}\n{meta}\n\n{c.text}\n</source>")
    return "<sources>\n" + "\n\n".join(parts) + "\n</sources>"
