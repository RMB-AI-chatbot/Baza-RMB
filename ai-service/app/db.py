"""PostgreSQL connection pool (psycopg 3, async) with pgvector support."""

from __future__ import annotations

from contextlib import asynccontextmanager

from pgvector.psycopg import register_vector_async
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.config import get_settings

_pool: AsyncConnectionPool | None = None


async def _configure(conn: AsyncConnection) -> None:
    await register_vector_async(conn)
    conn.row_factory = dict_row


async def open_pool(min_size: int = 1, max_size: int = 10) -> AsyncConnectionPool:
    global _pool
    if _pool is None:
        _pool = AsyncConnectionPool(
            get_settings().database_url,
            min_size=min_size,
            max_size=max_size,
            configure=_configure,
            # autocommit: each statement commits on its own; multi-statement work uses
            # `async with conn.transaction()`. Also keeps configure() from leaving a transaction open.
            kwargs={"autocommit": True},
            open=False,
        )
        await _pool.open(wait=True, timeout=30)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def connection():
    pool = await open_pool()
    async with pool.connection() as conn:
        yield conn
