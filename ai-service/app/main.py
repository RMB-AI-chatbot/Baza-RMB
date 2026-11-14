"""baza-RMB AI service (FastAPI)."""

from __future__ import annotations

import asyncio
import logging
import sys
from contextlib import asynccontextmanager

import anyio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, public
from app.config import get_settings
from app.db import close_pool, open_pool
from app.embeddings import warm_up

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())  # psycopg async on Windows

s = get_settings()
logging.basicConfig(level=s.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if s.is_production and (problems := s.production_problems()):
        for p in problems:
            logging.getLogger("baza").critical("configuration: %s", p)
        raise RuntimeError("Refusing to start in production with an unsafe configuration (see the log above).")
    await open_pool()
    await anyio.to_thread.run_sync(warm_up)  # load the embedding model before the first request
    yield
    await close_pool()


app = FastAPI(
    title="baza-RMB AI service",
    version="0.1.0",
    description="RAG chat API for the Rwanda Mines, Petroleum and Gas Board. "
                "Public endpoints under /api/v1, staff endpoints under /api/v1/admin (X-Admin-Key).",
    lifespan=lifespan,
    docs_url=None if s.is_production else "/docs",
    redoc_url=None,
    openapi_url=None if s.is_production else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=s.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    allow_credentials=False,
)

app.include_router(public.router)
app.include_router(admin.router)

if s.serve_test_page:
    # Development only: serve web/index.html at "/" so no nginx is needed locally.
    from fastapi.staticfiles import StaticFiles

    from app.config import REPO_ROOT

    app.mount("/", StaticFiles(directory=REPO_ROOT / "web", html=True), name="test-page")
