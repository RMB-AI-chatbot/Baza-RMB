"""Public endpoints used by the chat widget."""

from __future__ import annotations

import json
import logging
import re

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app import settings_store
from app.cases_client import CaseServiceError, case_status, create_case
from app.chat import forms, store
from app.chat.service import ChatService
from app.chat.texts import t
from app.chat.triage import triage
from app.config import get_settings
from app.schemas import (
    CaseCreateRequest,
    CaseCreateResponse,
    CaseStatusResponse,
    ChatRequest,
    ChatResponse,
    FeedbackRequest,
    WidgetConfig,
)
from app.security import client_hash, limiter

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["public"])

_REF_RE = re.compile(r"^RMB-\d{4}-[A-Z0-9]{6}$")


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


@router.post("/chat", response_model=ChatResponse, responses={200: {"content": {"text/event-stream": {}}}})
async def chat(req: ChatRequest, request: Request):
    """Ask a question. With `stream: true` the response is Server-Sent Events:
    `meta` (session, intent), `delta` (answer text pieces) and `final` (full ChatResponse)."""
    ch = client_hash(request)
    if not limiter.check(ch):
        lang = req.language or "en"
        raise HTTPException(status_code=429, detail=t("rate_limited", lang))

    events = ChatService().handle(req.message, req.session_id, req.language, ch)

    if req.stream:
        async def gen():
            try:
                async for name, data in events:
                    yield _sse(name, data)
            except Exception:
                log.exception("chat stream failed")
                yield _sse("error", {"message": t("error", req.language or "en")})

        return StreamingResponse(gen(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    final = None
    try:
        async for name, data in events:
            if name == "final":
                final = data
    except Exception:
        log.exception("chat failed")
        raise HTTPException(status_code=500, detail=t("error", req.language or "en"))
    return final


@router.post("/cases", response_model=CaseCreateResponse, status_code=201)
async def submit_case(req: CaseCreateRequest, request: Request):
    """Submit a case-intake form returned by /chat (complaint, report, meeting request...)."""
    if not limiter.check(client_hash(request)):
        raise HTTPException(status_code=429, detail=t("rate_limited", "en"))
    try:
        details, contact = forms.validate_submission(req.type, req.fields, req.anonymous)
    except forms.FormError as e:
        raise HTTPException(status_code=422, detail=str(e))

    spec = forms.FORMS[req.type]
    excerpt = await store.conversation_excerpt(req.session_id) if req.session_id else []
    summary_src = details.get("description") or details.get("question") or details.get("topic") or details.get("request") or ""
    payload = {
        "type": req.type,
        "summary": (summary_src[:240] + ("…" if len(summary_src) > 240 else "")) or spec["title"],
        "details": details,
        "contact": None if req.anonymous else contact,
        "anonymous": req.anonymous,
        "confidential": bool(spec.get("confidential")),
        # Anonymous reports are not linked to the chat session.
        "session_id": None if req.anonymous else req.session_id,
        "conversation_excerpt": excerpt,
    }
    # Triage (relevant / unclear / spam + priority). The person always gets a reference
    # number, whatever the label: staff can re-label, and nothing is deleted.
    tri = await triage(req.type, details)
    payload.update({"triage_relevance": tri.relevance, "triage_priority": tri.priority,
                    "triage_reason": tri.reason, "triage_by": tri.by})
    try:
        res = await create_case(payload)
    except CaseServiceError as e:
        raise HTTPException(status_code=e.status, detail="Your request could not be registered right now. Please try again later.")
    return CaseCreateResponse(
        reference_number=res["reference_number"],
        routed_to=res["routed_to"],
        expected_response_time=res["expected_response_time"],
        message=f"Your request has been registered. Your reference number is {res['reference_number']}. Keep it to check the status.",
    )


@router.get("/cases/{reference}", response_model=CaseStatusResponse)
async def get_case_status(reference: str, request: Request):
    """Status lookup by reference number. Returns no personal data."""
    if not limiter.check(client_hash(request)):
        raise HTTPException(status_code=429, detail=t("rate_limited", "en"))
    reference = reference.strip().upper()
    if not _REF_RE.match(reference):
        raise HTTPException(status_code=422, detail="invalid reference number")
    try:
        res = await case_status(reference)
    except CaseServiceError:
        raise HTTPException(status_code=502, detail="status service unavailable")
    if not res:
        raise HTTPException(status_code=404, detail="no request found with this reference")
    return res


@router.post("/feedback", status_code=204)
async def feedback(req: FeedbackRequest):
    ok = await store.set_feedback(req.message_id, req.session_id, req.rating, req.comment)
    if not ok:
        raise HTTPException(status_code=404, detail="message not found")


@router.get("/widget-config", response_model=WidgetConfig)
async def widget_config(lang: str = "en"):
    s = await settings_store.get_all()
    welcome = s["welcome_message"].get(lang) or s["welcome_message"].get("en", "")
    sugg = s["suggestions"].get(lang) or s["suggestions"].get("en", [])
    return WidgetConfig(
        assistant_name=s["assistant_name"], enabled=bool(s["widget_enabled"]), welcome_message=welcome,
        suggestions=sugg, languages=get_settings().answer_languages, contacts=s["rmb_contacts"],
    )


@router.get("/health", include_in_schema=False)
async def health():
    from app.db import connection
    try:
        async with connection() as conn:
            await conn.execute("SELECT 1")
        return {"status": "ok"}
    except Exception:
        return JSONResponse({"status": "db_unavailable"}, status_code=503)
