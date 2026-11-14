"""Deterministic safety checks that run BEFORE any model call.

Emergency messages must get contacts instantly, even if the LLM provider is down,
so strong emergency signals are matched with patterns here. Weaker signals (the
word "accident" in a question about safety rules) are left to the router model.
"""

from __future__ import annotations

import re

# Strong signals: someone is in danger now.
_STRONG = [
    # English
    r"\b(trapped|buried|stuck)\b.{0,40}\b(mine|pit|shaft|tunnel|rubble|underground)\b",
    r"\b(mine|pit|shaft|tunnel|quarry)\b.{0,30}\b(collapsed?|caved? in|fell in)\b",
    r"\b(collapsed?|caved? in)\b.{0,30}\b(mine|pit|shaft|tunnel|quarry)\b",
    r"\b(people|miners?|workers?|someone|children|child|person)\b.{0,30}\b(trapped|buried|injured|unconscious|dead|died|drowning)\b",
    r"\b(explosion|exploded|blast(ed)?)\b.{0,40}\b(mine|site|quarry|people|injured)\b",
    r"\b(gas leak|leaking gas|toxic gas|fuel spill|oil spill|chemical spill|mercury spill|cyanide)\b",
    r"\blandslide\b.{0,40}\b(people|houses?|homes?|buried|trapped|killed)\b",
    # French
    r"\b(effondrement|éboulement|s'est effondré|ensevelis?|coincés?|piégés?)\b",
    r"\b(fuite de gaz|déversement|explosion)\b",
    r"\b(blessés?|morts?)\b.{0,30}\b(mine|carrière|puits)\b",
    # Kinyarwanda (to be reviewed by native speakers)
    r"\b(ikirombe|umwobo)\b.{0,30}\b(cyaguye|cyariduse|wariduse|byaguye)\b",
    r"\b(bagwiriwe|yagwiriwe|bagwiriye|yagwiriye|baheze|yaheze)\b",
    r"\b(impanuka)\b.{0,30}\b(ikirombe|ubucukuzi|kariyeri)\b",
    r"\b(inkongi|guturika|gaze iri gusohoka)\b",
]
_STRONG_RE = [re.compile(p, re.IGNORECASE) for p in _STRONG]

# A plea for help with no details ("help now please", "emergency please"). It is treated as an
# emergency unless the message describes something that is a report, not a danger to people
# ("emergency please, I found someone mining in my field" -> illegal-mining report form).
_PLEA_RE = re.compile(r"\b(help|urgent|emergency|sos)\b.{0,20}\b(now|please|quick(ly)?|immediately)\b", re.IGNORECASE)
_REPORT_CONTEXT_RE = re.compile(
    r"\b(mining|mine[sd]?|miners?|digging|dig|dug|extract\w*|quarry\w*|smuggl\w*|illegal\w*|unlicen[cs]ed|"
    r"without (a )?(licen[cs]e|permit)|my (field|land|farm|plot|property|garden)|"
    r"complain\w*|report\w*|exploitation|creus\w*|mon (champ|terrain)|ubucukuzi butemewe|bacukura|isambu)\b",
    re.IGNORECASE)
_DANGER_RE = re.compile(
    r"\b(trapped|buried|stuck|injur\w*|hurt|bleeding|unconscious|dead|died|dying|drown\w*|collaps\w*|fell|fallen|"
    r"fire|explo\w*|leak\w*|spill\w*|landslide|accident|blessé\w*|effondr\w*|impanuka|yaguye|bagwiriwe)\b",
    re.IGNORECASE)

# Weak signals: let the router decide; if it says "emergency", we show contacts.
_WEAK_RE = re.compile(
    r"\b(accident|collapse|injur|spill|leak|fire|explosion|landslide|flood|impanuka|accidenté|blessure)\w*",
    re.IGNORECASE,
)


def is_strong_emergency(message: str) -> bool:
    if any(r.search(message) for r in _STRONG_RE):
        return True
    if _PLEA_RE.search(message):
        return bool(_DANGER_RE.search(message)) or not _REPORT_CONTEXT_RE.search(message)
    return False


def mentions_urgency(message: str) -> bool:
    """The user calls it urgent or an emergency (keeps the emergency numbers visible on a report form)."""
    return bool(_URGENCY_RE.search(message))


_URGENCY_RE = re.compile(r"\b(urgent|urgently|emergency|urgence|sos|byihutirwa)\b", re.IGNORECASE)


def has_weak_emergency_signal(message: str) -> bool:
    return bool(_WEAK_RE.search(message))


# Prompt-injection / abuse heuristics: logged for review; the answer prompt is already
# hardened, this just avoids wasting a model call on obvious attempts.
_INJECTION_RE = re.compile(
    r"(ignore (all |the )?(previous|above|prior) (instructions|rules)|system prompt|you are now|"
    r"jailbreak|developer mode|reveal (your|the) (prompt|instructions))",
    re.IGNORECASE,
)


def looks_like_injection(message: str) -> bool:
    return bool(_INJECTION_RE.search(message))


# Very small language guess for replies that skip the model (emergencies).
_RW_HINT = re.compile(
    r"\b(ni|na|kandi|ku|mu|ari|cyangwa|rwo|ryo|byo|uko|iki|imyaka|uruhushya|impushya|amabuye|agaciro|itegeko|"
    r"ingingo|ubucukuzi|umusoro|abantu|ikirombe|umwobo|ubufasha|mudufashe|turi|bari|cyaguye|yaguye|bagwiriwe)\b"
    r"|\b(?:y|w|z|cy|ry|rw|bw|by|tw|k)['’]\w",  # Kinyarwanda contractions (y'agaciro, rw'ubucukuzi)
    re.IGNORECASE)
_FR_HINT = re.compile(r"\b(le|la|les|des|une|est|sont|dans|mine|aidez|secours|personnes|effondr\w*)\b", re.IGNORECASE)


def guess_language(message: str, default: str = "en") -> str:
    rw, fr = len(_RW_HINT.findall(message)), len(_FR_HINT.findall(message))
    if rw >= 2 and rw >= fr:
        return "rw"
    if fr >= 2:
        return "fr"
    return default
