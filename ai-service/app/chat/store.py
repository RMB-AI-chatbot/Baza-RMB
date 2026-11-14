"""Persistence for chat sessions, messages and unanswered questions.

History is kept per session only (no cross-visit memory). Raw IPs are never stored:
only a salted hash used for rate limiting and unique-visitor counts.
"""

from __future__ import annotations

import json
import uuid
from datetime import timedelta

from app.config import get_settings
from app.db import connection


async def get_or_create_session(session_id: str | None, client_hash: str | None, language: str | None) -> str:
    ttl = timedelta(minutes=get_settings().session_ttl_minutes)
    async with connection() as conn:
        if session_id:
            try:
                sid = uuid.UUID(session_id)
            except ValueError:
                sid = None
            if sid:
                cur = await conn.execute(
                    "UPDATE chat.sessions SET last_seen_at = now() WHERE id = %s AND last_seen_at > now() - %s RETURNING id",
                    (sid, ttl),
                )
                row = await cur.fetchone()
                if row:
                    return str(row["id"])
        cur = await conn.execute(
            "INSERT INTO chat.sessions (client_hash, language) VALUES (%s, %s) RETURNING id",
            (client_hash, language),
        )
        return str((await cur.fetchone())["id"])


async def history(session_id: str, turns: int) -> list[dict]:
    async with connection() as conn:
        cur = await conn.execute(
            """SELECT role, content, action, intent, standalone_query, sources FROM chat.messages WHERE session_id = %s
               ORDER BY id DESC LIMIT %s""",
            (session_id, turns * 2),
        )
        rows = await cur.fetchall()
    return list(reversed(rows))


async def add_message(session_id: str, role: str, content: str, **meta) -> int:
    cols = ["session_id", "role", "content"]
    vals = [session_id, role, content]
    for k, v in meta.items():
        cols.append(k)
        vals.append(json.dumps(v) if k == "sources" and v is not None else v)
    async with connection() as conn:
        cur = await conn.execute(
            f"INSERT INTO chat.messages ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))}) RETURNING id",
            vals,
        )
        return (await cur.fetchone())["id"]


async def add_unanswered(message_id: int | None, question: str, language: str | None, category: str | None,
                         reason: str, top_score: float | None) -> None:
    async with connection() as conn:
        await conn.execute(
            """INSERT INTO chat.unanswered (message_id, question, language, category, reason, top_score)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (message_id, question, language, category, reason, top_score),
        )


async def conversation_excerpt(session_id: str, limit: int = 10) -> list[dict]:
    async with connection() as conn:
        cur = await conn.execute(
            """SELECT role, content, created_at FROM chat.messages WHERE session_id = %s
               ORDER BY id DESC LIMIT %s""",
            (session_id, limit),
        )
        rows = await cur.fetchall()
    return [{"role": r["role"], "content": r["content"][:2000], "at": r["created_at"].isoformat()} for r in reversed(rows)]


async def set_feedback(message_id: int, session_id: str, rating: int, comment: str | None) -> bool:
    async with connection() as conn:
        cur = await conn.execute(
            """UPDATE chat.messages SET feedback = %s, feedback_comment = %s
               WHERE id = %s AND session_id = %s AND role = 'assistant' RETURNING id""",
            (rating, (comment or "")[:1000] or None, message_id, session_id),
        )
        return await cur.fetchone() is not None
