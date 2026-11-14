"""Official FAQ answers written by RMB staff.

Workflow (four-eyes principle):
  1. A staff member answers a knowledge gap or a case question -> draft entry.
  2. A DIFFERENT staff member publishes it -> it is embedded and stored as a chunk of the
     document "rmb-official-faq", so the bot can retrieve and cite it like any other source.
  3. Retiring (or unpublishing) removes the chunk; the entry stays for the audit trail.

Users' questions never change the knowledge base by themselves: only approved entries do.
"""

from __future__ import annotations

from datetime import date

import anyio

from app.db import connection
from app.embeddings import embed_passages

FAQ_DOC_ID = "rmb-official-faq"
FAQ_TITLE = "RMB Official FAQ"


class FaqError(ValueError):
    pass


def _chunk_text(entry: dict) -> tuple[str, str]:
    """(stored text, text to embed)."""
    text = f"Question: {entry['question']}\nAnswer: {entry['answer']}"
    return text, f"{FAQ_TITLE} | {entry.get('category') or 'general'}\n{text}"


async def _index(conn, entry: dict) -> None:
    text, embed_text = _chunk_text(entry)
    [vec] = await anyio.to_thread.run_sync(embed_passages, [embed_text])
    async with conn.transaction():
        await conn.execute("DELETE FROM kb.chunks WHERE document_id=%s AND section_key=%s",
                           (FAQ_DOC_ID, f"faq-{entry['id']}"))
        await conn.execute(
            """INSERT INTO kb.chunks (document_id, language, chunk_index, section_key, section_ref, heading,
                   page_start, page_end, text, token_estimate, embedding)
               VALUES (%s, 'en', %s, %s, %s, %s, NULL, NULL, %s, %s, %s)""",
            (FAQ_DOC_ID, entry["id"], f"faq-{entry['id']}", f"FAQ #{entry['id']}", entry["question"][:300],
             text, int(len(text.split()) * 1.4), vec),
        )
        await _refresh_doc(conn)


async def _unindex(conn, entry_id: int) -> None:
    async with conn.transaction():
        await conn.execute("DELETE FROM kb.chunks WHERE document_id=%s AND section_key=%s",
                           (FAQ_DOC_ID, f"faq-{entry_id}"))
        await _refresh_doc(conn)


async def _refresh_doc(conn) -> None:
    await conn.execute(
        """UPDATE kb.documents SET chunk_count = (SELECT count(*) FROM kb.chunks WHERE document_id=%s),
               processing_status='indexed', indexed_at=now(), updated_at=now() WHERE id=%s""",
        (FAQ_DOC_ID, FAQ_DOC_ID),
    )


async def _get(conn, entry_id: int) -> dict:
    cur = await conn.execute("SELECT * FROM kb.faq_entries WHERE id=%s", (entry_id,))
    row = await cur.fetchone()
    if not row:
        raise FaqError("FAQ entry not found")
    return row


async def list_entries(status: str | None) -> list[dict]:
    async with connection() as conn:
        cur = await conn.execute(
            "SELECT * FROM kb.faq_entries WHERE (%s::text IS NULL OR status=%s) ORDER BY updated_at DESC",
            (status, status))
        return await cur.fetchall()


async def create(question: str, answer: str, owner: str, created_by: str, category: str | None = None,
                 review_date: date | None = None, source_type: str = "manual", source_ref: str | None = None) -> dict:
    if len(question.strip()) < 5 or len(answer.strip()) < 5:
        raise FaqError("question and answer are required")
    async with connection() as conn:
        cur = await conn.execute(
            """INSERT INTO kb.faq_entries (question, answer, category, owner, created_by, review_date, source_type, source_ref)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (question.strip(), answer.strip(), category, owner.strip(), created_by.strip(), review_date,
             source_type, source_ref),
        )
        return await cur.fetchone()


async def update(entry_id: int, changes: dict, actor: str) -> dict:
    """Edit an entry. Editing an active entry sends it back to draft (it needs re-approval)."""
    allowed = {k: v for k, v in changes.items() if k in {"question", "answer", "category", "owner", "review_date"}}
    if not allowed:
        raise FaqError("nothing to update")
    async with connection() as conn:
        entry = await _get(conn, entry_id)
        if entry["status"] == "retired":
            raise FaqError("retired entries cannot be edited")
        sets = ", ".join(f"{k}=%s" for k in allowed)
        cur = await conn.execute(
            f"""UPDATE kb.faq_entries SET {sets}, status='draft', created_by=%s, approved_by=NULL, approved_at=NULL,
                    updated_at=now() WHERE id=%s RETURNING *""",
            [*allowed.values(), actor.strip(), entry_id],
        )
        row = await cur.fetchone()
        if entry["status"] == "active":
            await _unindex(conn, entry_id)
        return row


async def publish(entry_id: int, approved_by: str) -> dict:
    async with connection() as conn:
        entry = await _get(conn, entry_id)
        if entry["status"] != "draft":
            raise FaqError(f"only drafts can be published (status is {entry['status']})")
        if approved_by.strip().lower() == entry["created_by"].strip().lower():
            raise FaqError("a different staff member must approve this answer (four-eyes rule)")
        cur = await conn.execute(
            """UPDATE kb.faq_entries SET status='active', approved_by=%s, approved_at=now(), updated_at=now()
               WHERE id=%s RETURNING *""",
            (approved_by.strip(), entry_id),
        )
        row = await cur.fetchone()
        await _index(conn, row)
        if row["source_type"] == "gap" and row["source_ref"] and row["source_ref"].isdigit():
            await conn.execute(
                """UPDATE chat.unanswered SET status='resolved', resolved_at=now(),
                       note=coalesce(note || ' | ', '') || %s WHERE id=%s""",
                (f"answered by FAQ #{entry_id}", int(row["source_ref"])),
            )
        return row


async def retire(entry_id: int, actor: str) -> dict:
    async with connection() as conn:
        await _get(conn, entry_id)
        cur = await conn.execute(
            "UPDATE kb.faq_entries SET status='retired', updated_at=now() WHERE id=%s RETURNING *", (entry_id,))
        row = await cur.fetchone()
        await _unindex(conn, entry_id)
        return row


def rebuild_rows_sync(conn) -> list[dict]:
    """Active entries, for a full re-index from the ingestion pipeline (sync connection)."""
    return conn.execute("SELECT * FROM kb.faq_entries WHERE status='active' ORDER BY id").fetchall()
