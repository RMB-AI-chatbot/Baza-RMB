"""Triage of submitted forms: relevant / unclear / spam, plus a priority.

Spam is never deleted or hidden permanently; it is only listed separately so staff read
real cases first, and staff can override any label. If the model is unavailable, simple
rules decide (danger words -> urgent, otherwise "unclear"/normal so a human looks at it).
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

from app.chat.safety import is_strong_emergency
from app.llm import LLMError, get_llm
from app.rag.prompts import load

log = logging.getLogger(__name__)

TRIAGE_PROMPT_VERSION = "triage_v1"
SCHEMA = {
    "type": "object",
    "properties": {
        "relevance": {"type": "string", "enum": ["relevant", "unclear", "spam"]},
        "priority": {"type": "string", "enum": ["urgent", "high", "normal", "low"]},
        "reason": {"type": "string"},
    },
    "required": ["relevance", "priority", "reason"],
    "additionalProperties": False,
}

_URGENT_RE = re.compile(
    r"\b(injur|dead|died|death|killed|trapped|collaps|explosi|dynamite|child(ren)? (labou?r|work)|"
    r"mercury|cyanide|spill|pollut|bagwiriwe|yapfuye|impanuka)\w*", re.IGNORECASE)


@dataclass
class Triage:
    relevance: str
    priority: str
    reason: str
    by: str = "ai"


def rule_based(text: str) -> Triage:
    letters = sum(c.isalpha() for c in text)
    if letters < 8 or re.fullmatch(r"\s*(test|testing|asdf+|hello|hi|ok)\W*", text, re.IGNORECASE):
        return Triage("spam", "low", "Too short or a test message (automatic rule).", "rules")
    if is_strong_emergency(text) or _URGENT_RE.search(text):
        return Triage("relevant", "urgent", "Mentions danger to people or serious damage (automatic rule).", "rules")
    return Triage("unclear", "normal", "Not classified automatically; please review.", "rules")


async def triage(form_type: str, details: dict) -> Triage:
    text = "\n".join(f"{k}: {v}" for k, v in details.items())
    guess = rule_based(text)
    user = f"<form type=\"{form_type}\">\n{text[:4000]}\n</form>"
    try:
        data, _ = await get_llm().classify(load(TRIAGE_PROMPT_VERSION), user, SCHEMA)
        t = Triage(data["relevance"], data["priority"], (data.get("reason") or "")[:300])
    except (LLMError, KeyError, json.JSONDecodeError) as e:
        log.warning("triage model failed (%s); using rules", e)
        return guess
    # Safety net: never let the model downgrade a message the rules see as dangerous.
    if guess.priority == "urgent" and t.priority != "urgent":
        t.priority, t.relevance = "urgent", "relevant"
        t.reason += " (raised to urgent: mentions danger)"
    return t
