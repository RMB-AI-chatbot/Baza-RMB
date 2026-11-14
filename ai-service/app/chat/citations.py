"""Normalise citation markers across models.

Some models (e.g. gpt-oss) cite as 【1】, 【1†L1-L2】 or [1†source] instead of [1].
CitationNormalizer rewrites them to [n] while text is streaming; a marker split across
two deltas is held back until it is complete.
"""

from __future__ import annotations

import re

_MARKER_RE = re.compile(r"【\s*(\d{1,2})(?:†[^】]*)?\s*】|\[\s*(\d{1,2})\s*†[^\]]*\]|\[\s*(\d{1,2})\s*\]")
_MULTI_RE = re.compile(r"\[(\d{1,2}(?:\s*,\s*\d{1,2})+)\]")  # [1, 2] -> [1][2]
_OPENERS = ("【", "[")
_MAX_HOLD = 40


def normalize(text: str) -> str:
    text = _MARKER_RE.sub(lambda m: f"[{m.group(1) or m.group(2) or m.group(3)}]", text)
    return _MULTI_RE.sub(lambda m: "".join(f"[{n.strip()}]" for n in m.group(1).split(",")), text)


class CitationNormalizer:
    def __init__(self):
        self._pending = ""

    def feed(self, delta: str) -> str:
        text = self._pending + delta
        self._pending = ""
        # Hold back an unfinished marker at the end (e.g. "…licence 【1†L").
        cut = max(text.rfind(o) for o in _OPENERS)
        if cut != -1:
            closer = "】" if text[cut] == "【" else "]"
            if closer not in text[cut:] and len(text) - cut < _MAX_HOLD:
                self._pending = text[cut:]
                text = text[:cut]
        return normalize(text)

    def flush(self) -> str:
        out, self._pending = normalize(self._pending), ""
        return out
