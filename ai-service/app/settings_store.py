"""Runtime settings editable from the admin portal (stored in app.settings).

Only safe, bounded knobs are exposed. The grounding rules of the answer prompt are
NOT editable: admins can add tone preferences (persona_note) that the prompt treats
as lower priority than its rules.
"""

from __future__ import annotations

import json
import time
from typing import Any

from app.db import connection

# Contacts come from RMB's own Lake Kivu Basin prospectus (p. 11). Emergency numbers
# are examples until RMB confirms them (proposal: placeholders must be labelled).
DEFAULTS: dict[str, Any] = {
    "assistant_name": "Baza-RMB",
    "widget_enabled": True,
    "welcome_message": {
        "en": "Hello! I'm Baza-RMB. Ask me about mining licences, the mining, tax and petroleum laws, investment opportunities or geohazards.",
        "fr": "Bonjour ! Je suis Baza-RMB. Posez-moi vos questions sur les permis miniers, les lois minière, fiscale et pétrolière, les opportunités d'investissement ou les géorisques.",
        "rw": "Muraho! Ndi Baza-RMB. Mumbaze ku mpushya z'ubucukuzi, amategeko agenga ubucukuzi, imisoro na peteroli, amahirwe y'ishoramari cyangwa ibiza bikomoka ku miterere y'ubutaka.",
    },
    "suggestions": {
        "en": [
            "What types of mining licences exist?",
            "What are the mining royalty tax rates?",
            "How can I report illegal mining?",
            "What investment opportunities exist in the Lake Kivu Basin?",
        ],
        "fr": [
            "Quels sont les types de permis miniers ?",
            "Quels sont les taux de la redevance minière ?",
            "Comment signaler une exploitation minière illégale ?",
            "Quelles opportunités d'investissement dans le bassin du lac Kivu ?",
        ],
        "rw": [
            "Ni ubuhe bwoko bw'impushya z'ubucukuzi buhari?",
            "Umusoro w'ikirombe ungana ute?",
            "Natanga nte amakuru ku bucukuzi butemewe?",
            "Ni ayahe mahirwe y'ishoramari ari mu kibaya cy'ikiyaga cya Kivu?",
        ],
    },
    "persona_note": "",
    "emergency_contacts": [
        {"label": "Rwanda emergency line (example - to be confirmed by RMB)", "value": "112", "placeholder": True},
        {"label": "RMB toll-free line", "value": "2930", "placeholder": True},
        {"label": "RMB phone", "value": "+250 788 386 220", "placeholder": True},
    ],
    "rmb_contacts": {
        "email": "info@rmb.gov.rw",
        "phone": "+250 788 386 220",
        "toll_free": "2930",
        "address": "KN 3 Avenue, Nyarugenge, Kigali - P.O. Box 937, Kigali",
        "website": "https://www.rmb.gov.rw",
        "source": "Lake Kivu Basin prospectus, p. 11",
    },
    # Retrieval confidence floor (cosine similarity). Bounded to avoid misconfiguration.
    "min_vector_score": None,
}

BOUNDS = {"min_vector_score": (0.70, 0.92)}
EDITABLE = set(DEFAULTS)

_cache: dict[str, Any] = {}
_cache_at = 0.0
TTL = 30.0


async def get_all(force: bool = False) -> dict[str, Any]:
    global _cache, _cache_at
    if not force and _cache and time.monotonic() - _cache_at < TTL:
        return _cache
    merged = dict(DEFAULTS)
    try:
        async with connection() as conn:
            cur = await conn.execute("SELECT key, value FROM app.settings")
            for r in await cur.fetchall():
                if r["key"] in EDITABLE:
                    merged[r["key"]] = r["value"]
    except Exception:
        if _cache:
            return _cache
    _cache, _cache_at = merged, time.monotonic()
    return merged


async def get(key: str) -> Any:
    return (await get_all()).get(key, DEFAULTS.get(key))


class SettingsError(ValueError):
    pass


async def update(values: dict[str, Any], updated_by: str) -> dict[str, Any]:
    for k, v in values.items():
        if k not in EDITABLE:
            raise SettingsError(f"setting '{k}' is not editable")
        if k in BOUNDS and v is not None:
            lo, hi = BOUNDS[k]
            if not (isinstance(v, (int, float)) and lo <= v <= hi):
                raise SettingsError(f"{k} must be between {lo} and {hi}")
        if k == "persona_note" and isinstance(v, str) and len(v) > 2000:
            raise SettingsError("persona_note is limited to 2000 characters")
    async with connection() as conn:
        for k, v in values.items():
            await conn.execute(
                """INSERT INTO app.settings (key, value, updated_by) VALUES (%s, %s::jsonb, %s)
                   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by,
                   updated_at = now()""",
                (k, json.dumps(v), updated_by),
            )
    return await get_all(force=True)
