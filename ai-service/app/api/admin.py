"""Admin endpoints for the RMB staff dashboard (Figma: Dashboard, Conversations, AI Knowledge,
Analytics, Settings). Authenticated with the X-Admin-Key header; the admin portal owns
staff login, roles and 2FA and calls these endpoints server-to-server.

Case management (list/assign/close cases) is served by the PHP case service.
"""

from __future__ import annotations

import re
import uuid
from datetime import date
from pathlib import Path as FsPath
from typing import Any, Literal

import anyio
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Path, Query, UploadFile
from pydantic import BaseModel

from app import settings_store
from app.config import get_settings
from app.db import connection
from app.ingest.pipeline import connect, ingest_document
from app.security import require_admin

router = APIRouter(prefix="/api/v1/admin", tags=["admin"], dependencies=[Depends(require_admin)])

MAX_UPLOAD = 50 * 1024 * 1024
_ID_RE = re.compile(r"[^a-z0-9]+")


# --------------------------------------------------------------------------- documents

@router.get("/documents")
async def list_documents(status: str | None = None):
    async with connection() as conn:
        cur = await conn.execute(
            """SELECT id, title, short_title, doc_type, category, law_reference, source_url, layout, languages,
                      owner, version, effective_date, review_date, status, processing_status, processing_error,
                      page_count, ocr_pages, chunk_count, file_sha256, uploaded_by, created_at, indexed_at,
                      (review_date IS NOT NULL AND review_date < current_date) AS review_overdue
               FROM kb.documents WHERE (%s::text IS NULL OR status = %s) ORDER BY created_at""",
            (status, status),
        )
        docs = await cur.fetchall()
        cur = await conn.execute("SELECT count(*) AS n FROM kb.chunks")
        total_chunks = (await cur.fetchone())["n"]
    summary = {
        "documents": len(docs),
        "active": sum(d["status"] == "active" for d in docs),
        "indexed_chunks": total_chunks,
        "processing": sum(d["processing_status"] in ("pending", "processing") for d in docs),
        "needs_review": sum(d["processing_status"] in ("needs_review", "failed") for d in docs),
        "review_overdue": sum(bool(d["review_overdue"]) for d in docs),
    }
    return {"summary": summary, "documents": docs}


def _run_ingest(doc_id: str, force: bool = True):
    with connect() as conn:
        ingest_document(conn, doc_id, force=force, refetch_web=True)


@router.post("/documents", status_code=202)
async def upload_document(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    short_title: str | None = Form(None),
    doc_type: Literal["law", "regulation", "prospectus", "guide", "faq", "directory", "other"] = Form("other"),
    category: str | None = Form(None),
    law_reference: str | None = Form(None),
    owner: str = Form(...),
    version: str | None = Form(None),
    effective_date: date | None = Form(None),
    review_date: date | None = Form(None),
    source_url: str | None = Form(None),
    uploaded_by: str = Form(...),
):
    """Upload a PDF. It is indexed in the background and stays in `draft` (not used for
    answers) until a staff member sets status=active after checking it."""
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(422, "only PDF files are supported for now")
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "file larger than 50 MB")
    if not data.startswith(b"%PDF"):
        raise HTTPException(422, "not a valid PDF")

    doc_id = (_ID_RE.sub("-", (short_title or title).lower()).strip("-")[:50] or "doc") + "-" + uuid.uuid4().hex[:6]
    rel = FsPath("uploads") / f"{doc_id}.pdf"
    dest = get_settings().data_dir / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)

    async with connection() as conn:
        await conn.execute(
            """INSERT INTO kb.documents (id, title, short_title, doc_type, category, law_reference, source_url,
                   file_path, layout, languages, owner, version, effective_date, review_date, status, uploaded_by)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'auto','{en,fr,rw}',%s,%s,%s,%s,'draft',%s)""",
            (doc_id, title, short_title or title, doc_type, category, law_reference, source_url, rel.as_posix(),
             owner, version, effective_date, review_date, uploaded_by),
        )
    background.add_task(anyio.to_thread.run_sync, _run_ingest, doc_id)
    return {"id": doc_id, "status": "draft", "processing_status": "pending"}


class DocumentPatch(BaseModel):
    status: Literal["draft", "active", "retired"] | None = None
    title: str | None = None
    short_title: str | None = None
    category: str | None = None
    law_reference: str | None = None
    reference_confirmed: bool | None = None
    owner: str | None = None
    version: str | None = None
    effective_date: date | None = None
    review_date: date | None = None


@router.patch("/documents/{doc_id}")
async def update_document(doc_id: str, patch: DocumentPatch):
    """Publish (active), unpublish (draft) or retire a document, or edit its register metadata."""
    values = patch.model_dump(exclude_unset=True)
    if not values:
        raise HTTPException(422, "nothing to update")
    sets = ", ".join(f"{k} = %s" for k in values)
    async with connection() as conn:
        cur = await conn.execute(
            f"UPDATE kb.documents SET {sets}, updated_at = now() WHERE id = %s RETURNING id, status",
            [*values.values(), doc_id],
        )
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "document not found")
    return row


@router.post("/documents/{doc_id}/reindex", status_code=202)
async def reindex_document(doc_id: str, background: BackgroundTasks):
    async with connection() as conn:
        cur = await conn.execute(
            "UPDATE kb.documents SET processing_status='pending' WHERE id=%s RETURNING id", (doc_id,))
        if not await cur.fetchone():
            raise HTTPException(404, "document not found")
    background.add_task(anyio.to_thread.run_sync, _run_ingest, doc_id)
    return {"id": doc_id, "processing_status": "pending"}


@router.get("/documents/{doc_id}/chunks")
async def document_chunks(doc_id: str, language: str = "en", limit: int = Query(50, le=500), offset: int = 0):
    """Inspect how a document was split (for checking citations against the source)."""
    async with connection() as conn:
        cur = await conn.execute(
            """SELECT id, chunk_index, section_ref, heading, chapter, page_start, page_end, text
               FROM kb.chunks WHERE document_id=%s AND language=%s ORDER BY chunk_index LIMIT %s OFFSET %s""",
            (doc_id, language, limit, offset),
        )
        return await cur.fetchall()


# --------------------------------------------------------------------------- conversations

@router.get("/conversations")
async def list_conversations(days: int = Query(30, le=365), category: str | None = None,
                             q: str | None = None, limit: int = Query(50, le=2000), offset: int = 0):
    async with connection() as conn:
        cur = await conn.execute(
            # The topic shown is the first real request (a greeting such as "hiii" is skipped), and the
            # category is taken from real requests only, so a "hello" does not make a conversation "General".
            """WITH sessions AS (
                   SELECT session_id, min(created_at) AS created_at FROM chat.messages
                   GROUP BY session_id HAVING min(created_at) > now() - make_interval(days => %s)),
               msgs AS (
                   SELECT m.session_id, m.id, m.role, m.content,
                          lead(m.intent) OVER (PARTITION BY m.session_id ORDER BY m.id) AS reply_intent
                   FROM chat.messages m JOIN sessions s USING (session_id)),
               firsts AS (
                   SELECT DISTINCT ON (session_id) session_id, content AS first_question
                   FROM msgs WHERE role = 'user'
                   ORDER BY session_id, (coalesce(reply_intent, '') IN ('greeting', 'about_assistant')), id),
               cats AS (
                   SELECT session_id,
                          coalesce(mode() WITHIN GROUP (ORDER BY category)
                                     FILTER (WHERE intent NOT IN ('greeting', 'about_assistant', 'out_of_scope', 'abusive')),
                                   'general') AS category,
                          bool_or(action = 'not_covered') AS had_unanswered, bool_or(action = 'emergency') AS had_emergency,
                          bool_or(action = 'form') AS had_form, bool_or(action = 'handover') AS had_handover,
                          bool_or(answered) AS had_answer, bool_or(intent NOT IN ('greeting', 'about_assistant')) AS had_request,
                          count(*) AS replies, max(created_at) AS last_at, avg(latency_ms)::int AS avg_latency_ms
                   FROM chat.messages WHERE role = 'assistant' GROUP BY session_id)
               SELECT s.session_id, f.first_question, s.created_at, c.category, c.had_unanswered, c.had_emergency,
                      c.had_form, c.had_handover, c.had_answer, c.had_request, c.replies, c.last_at, c.avg_latency_ms
               FROM sessions s JOIN firsts f USING (session_id) JOIN cats c USING (session_id)
               WHERE (%s::text IS NULL OR c.category = %s)
                 AND (%s::text IS NULL OR EXISTS (SELECT 1 FROM chat.messages x WHERE x.session_id = s.session_id
                                                  AND x.role = 'user' AND x.content ILIKE '%%' || %s || '%%'))
               ORDER BY s.created_at DESC LIMIT %s OFFSET %s""",
            (days, category, category, q, q, limit, offset),
        )
        return await cur.fetchall()


@router.get("/conversations/{session_id}")
async def conversation_detail(session_id: uuid.UUID):
    async with connection() as conn:
        cur = await conn.execute(
            """SELECT id, role, content, language, intent, category, action, standalone_query, sources, top_score,
                      answered, model, input_tokens, output_tokens, latency_ms, feedback, feedback_comment, created_at
               FROM chat.messages WHERE session_id = %s ORDER BY id""",
            (session_id,),
        )
        rows = await cur.fetchall()
    if not rows:
        raise HTTPException(404, "conversation not found")
    return {"session_id": session_id, "messages": rows}


# --------------------------------------------------------------------------- unanswered (content gaps)

@router.get("/unanswered")
async def list_unanswered(status: Literal["open", "resolved", "ignored"] = "open", limit: int = Query(100, le=500)):
    async with connection() as conn:
        cur = await conn.execute(
            """SELECT id, question, language, category, reason, top_score, status, note, created_at, resolved_at
               FROM chat.unanswered WHERE status = %s ORDER BY created_at DESC LIMIT %s""",
            (status, limit),
        )
        return await cur.fetchall()


class UnansweredPatch(BaseModel):
    status: Literal["open", "resolved", "ignored"]
    note: str | None = None


@router.patch("/unanswered/{item_id}")
async def update_unanswered(item_id: int, patch: UnansweredPatch):
    async with connection() as conn:
        cur = await conn.execute(
            """UPDATE chat.unanswered SET status=%s, note=coalesce(%s, note),
                   resolved_at = CASE WHEN %s = 'open' THEN NULL ELSE now() END
               WHERE id=%s RETURNING id, status""",
            (patch.status, patch.note, patch.status, item_id),
        )
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "not found")
    return row


# --------------------------------------------------------------------------- analytics

@router.get("/analytics/summary")
async def analytics_summary(days: int = Query(30, ge=1, le=365), category: str | None = None):
    """Numbers for the Dashboard and Analytics screens (all computed from real logs)."""
    async with connection() as conn:
        cur = await conn.execute(
            """SELECT
                 count(DISTINCT session_id)                                         AS conversations,
                 count(*) FILTER (WHERE role='user')                                AS questions,
                 count(*) FILTER (WHERE role='assistant' AND intent='question')     AS information_requests,
                 count(*) FILTER (WHERE role='assistant' AND intent='question' AND answered) AS answered,
                 count(*) FILTER (WHERE role='assistant' AND action='not_covered')  AS not_covered,
                 count(*) FILTER (WHERE role='assistant' AND action='form')         AS forms_offered,
                 count(*) FILTER (WHERE role='assistant' AND action='emergency')    AS emergencies,
                 count(*) FILTER (WHERE role='assistant' AND action='handover')     AS handovers,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE role='assistant') AS median_latency_ms,
                 percentile_cont(0.9) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE role='assistant') AS p90_latency_ms,
                 count(*) FILTER (WHERE feedback = 1)                               AS thumbs_up,
                 count(*) FILTER (WHERE feedback = -1)                              AS thumbs_down,
                 coalesce(sum(input_tokens), 0)                                     AS input_tokens,
                 coalesce(sum(output_tokens), 0)                                    AS output_tokens
               FROM chat.messages m WHERE created_at > now() - make_interval(days => %s)
                 AND (%s::text IS NULL OR m.session_id IN (SELECT session_id FROM chat.messages WHERE role='assistant' AND category = %s))""",
            (days, category, category),
        )
        totals = await cur.fetchone()
        cur = await conn.execute(
            """SELECT category, count(*) AS n
               FROM chat.messages m WHERE role='assistant' AND created_at > now() - make_interval(days => %s)
                 AND (%s::text IS NULL OR m.session_id IN (SELECT session_id FROM chat.messages WHERE role='assistant' AND category = %s))
               GROUP BY category ORDER BY n DESC""",
            (days, category, category),
        )
        by_category = await cur.fetchall()
        cur = await conn.execute(
            """SELECT date_trunc('day', created_at)::date AS day, count(DISTINCT session_id) AS conversations,
                      count(*) FILTER (WHERE role='user') AS questions
               FROM chat.messages m WHERE created_at > now() - make_interval(days => %s)
                 AND (%s::text IS NULL OR m.session_id IN (SELECT session_id FROM chat.messages WHERE role='assistant' AND category = %s))
               GROUP BY 1 ORDER BY 1""",
            (days, category, category),
        )
        daily = await cur.fetchall()
        cur = await conn.execute(
            """SELECT s->>'document_id' AS document_id, s->>'short_title' AS document, count(*) AS citations
               FROM chat.messages m, jsonb_array_elements(coalesce(m.sources, '[]'::jsonb)) s
               WHERE m.role='assistant' AND m.created_at > now() - make_interval(days => %s)
                 AND (%s::text IS NULL OR m.session_id IN (SELECT session_id FROM chat.messages WHERE role='assistant' AND category = %s))
               GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10""",
            (days, category, category),
        )
        top_documents = await cur.fetchall()
        cur = await conn.execute("SELECT count(*) AS n FROM chat.unanswered WHERE status='open'")
        open_gaps = (await cur.fetchone())["n"]

    info = totals["information_requests"] or 0
    totals["answer_rate"] = round(totals["answered"] / info, 3) if info else None
    totals["open_knowledge_gaps"] = open_gaps
    return {"days": days, "totals": totals, "by_category": by_category, "daily": daily, "top_documents": top_documents}


# --------------------------------------------------------------------------- settings

@router.get("/settings")
async def get_settings_endpoint():
    s = get_settings()
    return {
        "editable": await settings_store.get_all(force=True),
        "read_only": {
            "answer_model": s.answer_model, "router_model": s.router_model, "answer_effort": s.answer_effort,
            "embedding_model": s.embedding_model, "default_min_vector_score": s.min_vector_score,
            "answer_languages": s.answer_languages, "index_languages": s.index_languages,
            "rate_limit_per_minute": s.rate_limit_per_minute,
        },
    }


class SettingsUpdate(BaseModel):
    values: dict[str, Any]
    updated_by: str


@router.put("/settings")
async def put_settings(body: SettingsUpdate):
    try:
        return await settings_store.update(body.values, body.updated_by)
    except settings_store.SettingsError as e:
        raise HTTPException(422, str(e))


# --------------------------------------------------------------------------- cases (proxied to the PHP case service)

from fastapi.responses import JSONResponse  # noqa: E402

from app import cases_client  # noqa: E402

_REF = r"^RMB-\d{4}-[A-Z0-9]{6}$"


def _proxy(result: tuple[int, object]) -> JSONResponse:
    status, body = result
    return JSONResponse(body, status_code=status)


@router.get("/cases")
async def admin_list_cases(status: str | None = None, type: str | None = None,
                           relevance: Literal["inbox", "relevant", "unclear", "spam", "all"] = "inbox",
                           limit: int = Query(50, le=200), offset: int = 0):
    """Default view ("inbox") = relevant + unclear cases, urgent first. Spam is listed with relevance=spam."""
    try:
        return _proxy(await cases_client.list_cases(status, type, limit, offset, relevance))
    except cases_client.CaseServiceError as e:
        raise HTTPException(502, str(e))


@router.get("/cases/routing")
async def admin_routing():
    try:
        return _proxy(await cases_client.routing_table())
    except cases_client.CaseServiceError as e:
        raise HTTPException(502, str(e))


@router.get("/cases/{reference}")
async def admin_case_details(reference: str = Path(..., pattern=_REF)):
    try:
        return _proxy(await cases_client.case_details(reference))
    except cases_client.CaseServiceError as e:
        raise HTTPException(502, str(e))


class CasePatch(BaseModel):
    status: Literal["new", "assigned", "in_progress", "waiting_for_user", "resolved", "closed"] | None = None
    assigned_to: str | None = None
    triage_relevance: Literal["relevant", "unclear", "spam"] | None = None
    triage_priority: Literal["urgent", "high", "normal", "low"] | None = None
    note: str | None = None
    actor: str


@router.patch("/cases/{reference}")
async def admin_update_case(patch: CasePatch, reference: str = Path(..., pattern=_REF)):
    try:
        return _proxy(await cases_client.update_case(reference, patch.model_dump(exclude_none=True)))
    except cases_client.CaseServiceError as e:
        raise HTTPException(502, str(e))


# --------------------------------------------------------------------------- official FAQ answers

from app import faq  # noqa: E402


class FaqCreate(BaseModel):
    question: str
    answer: str
    owner: str
    created_by: str
    category: str | None = None
    review_date: date | None = None
    source_type: Literal["gap", "case", "manual"] = "manual"
    source_ref: str | None = None


class FaqUpdate(BaseModel):
    actor: str
    question: str | None = None
    answer: str | None = None
    category: str | None = None
    owner: str | None = None
    review_date: date | None = None


class FaqAction(BaseModel):
    actor: str


def _faq_call(fn):
    async def run(*a, **kw):
        try:
            return await fn(*a, **kw)
        except faq.FaqError as e:
            raise HTTPException(422, str(e))
    return run


@router.get("/faq")
async def faq_list(status: Literal["draft", "active", "retired"] | None = None):
    return await faq.list_entries(status)


@router.post("/faq", status_code=201)
async def faq_create(body: FaqCreate):
    """Write an official answer (draft). Another staff member must publish it before the bot uses it."""
    return await _faq_call(faq.create)(**body.model_dump())


@router.patch("/faq/{entry_id}")
async def faq_update(entry_id: int, body: FaqUpdate):
    """Edit an answer. Editing a published answer takes it offline until it is approved again."""
    changes = body.model_dump(exclude_unset=True, exclude={"actor"})
    return await _faq_call(faq.update)(entry_id, changes, body.actor)


@router.post("/faq/{entry_id}/publish")
async def faq_publish(entry_id: int, body: FaqAction):
    return await _faq_call(faq.publish)(entry_id, body.actor)


@router.post("/faq/{entry_id}/retire")
async def faq_retire(entry_id: int, body: FaqAction):
    return await _faq_call(faq.retire)(entry_id, body.actor)
