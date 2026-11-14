"""Case-intake forms returned to the widget when a conversation needs a human.

The bot never collects case details by free chat: it returns one of these form
definitions (action="form") and the widget renders it. The widget then POSTs the
filled form to /api/v1/cases. This keeps personal data structured, minimal and
validated, and makes anonymity explicit.
"""

from __future__ import annotations

from typing import Any

CONTACT_FIELDS = [
    {"name": "name", "label": "Your name", "type": "text", "required": False, "max_length": 120, "contact": True},
    {"name": "phone", "label": "Phone number", "type": "tel", "required": False, "max_length": 30, "contact": True},
    {"name": "email", "label": "Email", "type": "email", "required": False, "max_length": 160, "contact": True},
]

FORMS: dict[str, dict[str, Any]] = {
    "grievance": {
        "title": "Submit a complaint or grievance",
        "anonymous_allowed": True,
        "fields": [
            {"name": "description", "label": "What happened?", "type": "textarea", "required": True, "max_length": 3000},
            {"name": "location", "label": "Location (district, sector, site name)", "type": "text", "required": False, "max_length": 200},
            {"name": "company", "label": "Company or operator involved (if known)", "type": "text", "required": False, "max_length": 200},
            {"name": "date", "label": "When did it happen?", "type": "date", "required": False},
            *CONTACT_FIELDS,
        ],
    },
    "illegal_mining_report": {
        "title": "Report illegal mining (confidential)",
        "anonymous_allowed": True,
        "anonymous_default": True,
        "confidential": True,
        "fields": [
            {"name": "description", "label": "What did you see?", "type": "textarea", "required": True, "max_length": 3000},
            {"name": "location", "label": "Location (district, sector, village)", "type": "text", "required": True, "max_length": 200},
            {"name": "date", "label": "When?", "type": "date", "required": False},
            *CONTACT_FIELDS,
        ],
    },
    "meeting_request": {
        "title": "Request a meeting with RMB",
        "anonymous_allowed": False,
        "fields": [
            {"name": "organisation", "label": "Organisation / company", "type": "text", "required": True, "max_length": 200},
            {"name": "topic", "label": "Topic of the meeting", "type": "textarea", "required": True, "max_length": 2000},
            {"name": "preferred_dates", "label": "Preferred dates", "type": "text", "required": False, "max_length": 200},
            {"name": "name", "label": "Your name", "type": "text", "required": True, "max_length": 120, "contact": True},
            {"name": "email", "label": "Email", "type": "email", "required": True, "max_length": 160, "contact": True},
            {"name": "phone", "label": "Phone number", "type": "tel", "required": False, "max_length": 30, "contact": True},
        ],
    },
    "geodata_request": {
        "title": "Request geological data or laboratory services",
        "anonymous_allowed": False,
        "fields": [
            {"name": "request", "label": "What data or service do you need?", "type": "textarea", "required": True, "max_length": 2000},
            {"name": "area", "label": "Area of interest", "type": "text", "required": False, "max_length": 200},
            {"name": "purpose", "label": "Purpose", "type": "text", "required": False, "max_length": 300},
            {"name": "organisation", "label": "Organisation", "type": "text", "required": False, "max_length": 200},
            {"name": "name", "label": "Your name", "type": "text", "required": True, "max_length": 120, "contact": True},
            {"name": "email", "label": "Email", "type": "email", "required": True, "max_length": 160, "contact": True},
        ],
    },
    "case_status": {
        "title": "Check the status of a request",
        "anonymous_allowed": True,
        "lookup": True,  # not a new case: the widget calls GET /api/v1/cases/{reference}
        "fields": [
            {"name": "reference", "label": "Reference number (e.g. RMB-2026-AB12CD)", "type": "text", "required": True, "max_length": 40},
        ],
    },
    "legal_question": {
        "title": "Send your question to RMB's legal team",
        "anonymous_allowed": False,
        "fields": [
            {"name": "question", "label": "Your question", "type": "textarea", "required": True, "max_length": 3000},
            {"name": "name", "label": "Your name", "type": "text", "required": True, "max_length": 120, "contact": True},
            {"name": "email", "label": "Email", "type": "email", "required": False, "max_length": 160, "contact": True},
            {"name": "phone", "label": "Phone number", "type": "tel", "required": False, "max_length": 30, "contact": True},
        ],
    },
    "general_enquiry": {
        "title": "Send your question to RMB",
        "anonymous_allowed": False,
        "fields": [
            {"name": "question", "label": "Your question", "type": "textarea", "required": True, "max_length": 3000},
            {"name": "name", "label": "Your name", "type": "text", "required": False, "max_length": 120, "contact": True},
            {"name": "email", "label": "Email", "type": "email", "required": False, "max_length": 160, "contact": True},
            {"name": "phone", "label": "Phone number", "type": "tel", "required": False, "max_length": 30, "contact": True},
        ],
    },
}

INTENT_TO_FORM = {
    "complaint": "grievance",
    "illegal_mining_report": "illegal_mining_report",
    "meeting_request": "meeting_request",
    "geodata_request": "geodata_request",
    "case_status": "case_status",
}


def form_payload(form_type: str, prefill: dict[str, str] | None = None) -> dict:
    spec = FORMS[form_type]
    return {"type": form_type, **spec, "prefill": prefill or {}}


class FormError(ValueError):
    pass


def validate_submission(form_type: str, fields: dict[str, Any], anonymous: bool) -> tuple[dict, dict | None]:
    """Return (details, contact). Raises FormError on invalid input."""
    spec = FORMS.get(form_type)
    if not spec or spec.get("lookup"):
        raise FormError(f"unknown form type: {form_type}")
    if anonymous and not spec.get("anonymous_allowed"):
        raise FormError("this request cannot be anonymous")
    details, contact = {}, {}
    known = {f["name"]: f for f in spec["fields"]}
    for name in fields:
        if name not in known:
            raise FormError(f"unexpected field: {name}")
    for name, f in known.items():
        raw = fields.get(name)
        value = str(raw).strip() if raw is not None else ""
        if f.get("contact") and anonymous:
            continue  # never store contact details for anonymous submissions
        if f.get("required") and not value:
            raise FormError(f"'{f['label']}' is required")
        if value and len(value) > f.get("max_length", 3000):
            raise FormError(f"'{f['label']}' is too long")
        if value and f["type"] == "email" and "@" not in value:
            raise FormError("invalid email address")
        if value:
            (contact if f.get("contact") else details)[name] = value
    return details, (contact or None)


# --------------------------------------------------------------------------- translations
# Drafts: MUST be reviewed by RMB-approved translators before public launch.

I18N: dict[str, dict[str, str]] = {
    "fr": {
        # titles
        "Submit a complaint or grievance": "Déposer une plainte ou une réclamation",
        "Report illegal mining (confidential)": "Signaler une exploitation minière illégale (confidentiel)",
        "Request a meeting with RMB": "Demander un rendez-vous avec RMB",
        "Request geological data or laboratory services": "Demander des données géologiques ou des services de laboratoire",
        "Check the status of a request": "Vérifier l'état d'une demande",
        "Send your question to RMB's legal team": "Envoyer votre question au service juridique de RMB",
        "Send your question to RMB": "Envoyer votre question à RMB",
        # labels
        "Your name": "Votre nom", "Phone number": "Numéro de téléphone", "Email": "E-mail",
        "What happened?": "Que s'est-il passé ?",
        "Location (district, sector, site name)": "Lieu (district, secteur, nom du site)",
        "Company or operator involved (if known)": "Entreprise ou exploitant concerné (si connu)",
        "When did it happen?": "Quand cela s'est-il produit ?",
        "What did you see?": "Qu'avez-vous vu ?",
        "Location (district, sector, village)": "Lieu (district, secteur, village)",
        "When?": "Quand ?",
        "Organisation / company": "Organisation / entreprise",
        "Topic of the meeting": "Objet du rendez-vous",
        "Preferred dates": "Dates souhaitées",
        "What data or service do you need?": "De quelles données ou de quel service avez-vous besoin ?",
        "Area of interest": "Zone d'intérêt", "Purpose": "Objectif", "Organisation": "Organisation",
        "Reference number (e.g. RMB-2026-AB12CD)": "Numéro de référence (ex. RMB-2026-AB12CD)",
        "Your question": "Votre question",
    },
    "rw": {
        "Submit a complaint or grievance": "Tanga ikirego cyangwa akarengane",
        "Report illegal mining (confidential)": "Tanga amakuru ku bucukuzi butemewe (ibanga)",
        "Request a meeting with RMB": "Saba guhura na RMB",
        "Request geological data or laboratory services": "Saba amakuru ya jewoloji cyangwa serivisi za laboratwari",
        "Check the status of a request": "Reba aho ubusabe bwawe bugeze",
        "Send your question to RMB's legal team": "Ohereza ikibazo cyawe ku ishami ry'amategeko rya RMB",
        "Send your question to RMB": "Ohereza ikibazo cyawe kuri RMB",
        "Your name": "Amazina yawe", "Phone number": "Nimero ya telefoni", "Email": "Imeyili",
        "What happened?": "Byagenze bite?",
        "Location (district, sector, site name)": "Aho byabereye (akarere, umurenge, izina ry'ahantu)",
        "Company or operator involved (if known)": "Ikigo cyangwa ukora ubucukuzi bireba (niba ubizi)",
        "When did it happen?": "Byabaye ryari?",
        "What did you see?": "Ni iki wabonye?",
        "Location (district, sector, village)": "Aho ari (akarere, umurenge, umudugudu)",
        "When?": "Ryari?",
        "Organisation / company": "Urwego / ikigo",
        "Topic of the meeting": "Icyo inama izaganiraho",
        "Preferred dates": "Amatariki wifuza",
        "What data or service do you need?": "Ni ayahe makuru cyangwa serivisi ukeneye?",
        "Area of interest": "Agace bireba", "Purpose": "Impamvu", "Organisation": "Urwego",
        "Reference number (e.g. RMB-2026-AB12CD)": "Nimero y'ikirego (urugero: RMB-2026-AB12CD)",
        "Your question": "Ikibazo cyawe",
    },
}


def _tr(text: str, lang: str) -> str:
    return I18N.get(lang, {}).get(text, text)


_base_form_payload = form_payload


def form_payload(form_type: str, prefill: dict[str, str] | None = None, lang: str = "en") -> dict:  # noqa: F811
    """Form definition with title and labels in the user's language (names/validation unchanged)."""
    p = _base_form_payload(form_type, prefill)
    if lang == "en":
        return p
    p["title"] = _tr(p["title"], lang)
    p["fields"] = [{**f, "label": _tr(f["label"], lang)} for f in p["fields"]]
    return p
