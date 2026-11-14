"""Command line for knowledge-base operations.

    python -m app.cli ingest --all            # sync data/sources.yaml and index changed documents
    python -m app.cli ingest --doc <id> --force
    python -m app.cli refresh-web             # re-fetch live web pages (geohazards) and re-index
    python -m app.cli stats                   # documents and chunk counts
    python -m app.cli search "question"       # debug retrieval
    python -m app.cli purge                   # delete conversations older than CHAT_RETENTION_DAYS
    python -m app.cli check-config            # are the settings safe for production?
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys

from app.config import get_settings


def _ingest(args) -> int:
    from app.ingest.pipeline import connect, ingest_document, sync_register

    with connect() as conn:
        ids = sync_register(conn)
        targets = ids if args.all else [args.doc]
        failed = 0
        for doc_id in targets:
            r = ingest_document(conn, doc_id, force=args.force, refetch_web=getattr(args, "refetch", False))
            print(f"{doc_id:34s} {r.status:13s} chunks={r.chunks:4d} pages={r.pages:3d} ocr={r.ocr_pages}")
            for w in r.warnings:
                print(f"    ! {w}")
            failed += r.status == "failed"
        return 1 if failed else 0


def _refresh_web(args) -> int:
    from app.ingest.pipeline import connect, ingest_document, sync_register

    with connect() as conn:
        sync_register(conn)
        rows = conn.execute("SELECT id FROM kb.documents WHERE layout='webpage' AND status<>'retired'").fetchall()
        targets = [args.doc] if args.doc else [r["id"] for r in rows]
        for doc_id in targets:
            r = ingest_document(conn, doc_id, force=False, refetch_web=True)
            print(f"{doc_id:34s} {r.status:13s} chunks={r.chunks}")
    return 0


def _stats(args) -> int:
    from app.ingest.pipeline import connect

    with connect() as conn:
        for r in conn.execute(
            """SELECT d.id, d.status, d.processing_status, d.chunk_count, d.page_count, d.ocr_pages,
                      (SELECT string_agg(language || '=' || n, ' ') FROM
                         (SELECT language, count(*) n FROM kb.chunks c WHERE c.document_id = d.id GROUP BY language) x) AS langs
               FROM kb.documents d ORDER BY d.id"""
        ).fetchall():
            print(f"{r['id']:34s} {r['status']:7s} {r['processing_status']:12s} chunks={r['chunk_count']:4d} "
                  f"pages={r['page_count'] or 0:3d} ocr={r['ocr_pages']:3d} [{r['langs'] or ''}]")
    return 0


def _search(args) -> int:
    from app.db import close_pool
    from app.rag.retrieval import retrieve

    async def run():
        res = await retrieve(args.query, languages=[args.lang], top_k=args.k)
        await close_pool()
        return res

    res = asyncio.run(run())
    print(f"max vector score {res.max_vector_score:.3f}  keyword hits {res.keyword_hits}")
    for i, c in enumerate(res.chunks, 1):
        print(f"[{i}] {c.vector_score:.3f} kw={c.keyword_score:.3f} rrf={c.rrf:.4f} {c.document_short_title} | "
              f"{c.section_ref} p{c.page_start}-{c.page_end} | {c.heading or ''}")
        if args.verbose:
            print("    " + c.text[:400].replace("\n", " "))
    return 0


def _purge(args) -> int:
    """Data retention: delete conversations (and their messages) not seen for CHAT_RETENTION_DAYS,
    and sign-in throttling records older than 90 days. Cases, FAQ answers and the audit log are kept."""
    from app.ingest.pipeline import connect

    days = args.days if args.days is not None else get_settings().chat_retention_days
    with connect() as conn:
        if days > 0:
            n = conn.execute("DELETE FROM chat.sessions WHERE last_seen_at < now() - make_interval(days => %s)", (days,)).rowcount
            print(f"deleted {n} conversations older than {days} days")
        else:
            print("CHAT_RETENTION_DAYS=0: conversations are kept")
        n = conn.execute("DELETE FROM portal.login_attempts WHERE created_at < now() - interval '90 days'").rowcount
        print(f"deleted {n} sign-in throttling records older than 90 days")
        conn.commit()
    return 0


def _check_config(args) -> int:
    s = get_settings()
    problems = s.production_problems()
    for p in problems:
        print(f"PROBLEM: {p}")
    print("configuration OK for production" if not problems else f"{len(problems)} problem(s)")
    return 1 if problems else 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=get_settings().log_level, format="%(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(prog="python -m app.cli")
    sub = p.add_subparsers(dest="cmd", required=True)

    pi = sub.add_parser("ingest", help="index documents from data/sources.yaml")
    g = pi.add_mutually_exclusive_group(required=True)
    g.add_argument("--all", action="store_true")
    g.add_argument("--doc")
    pi.add_argument("--force", action="store_true", help="re-index even if the file is unchanged")
    pi.add_argument("--refetch", action="store_true", help="re-download web pages")
    pi.set_defaults(fn=_ingest)

    pr = sub.add_parser("refresh-web", help="re-fetch web pages and re-index if they changed")
    pr.add_argument("--doc")
    pr.set_defaults(fn=_refresh_web)

    ps = sub.add_parser("stats")
    ps.set_defaults(fn=_stats)

    pq = sub.add_parser("search", help="debug hybrid retrieval")
    pq.add_argument("query")
    pq.add_argument("--lang", default="en")
    pq.add_argument("-k", type=int, default=6)
    pq.add_argument("-v", "--verbose", action="store_true")
    pq.set_defaults(fn=_search)

    pp = sub.add_parser("purge", help="delete conversations older than CHAT_RETENTION_DAYS")
    pp.add_argument("--days", type=int)
    pp.set_defaults(fn=_purge)

    pc = sub.add_parser("check-config", help="check the settings are safe for production")
    pc.set_defaults(fn=_check_config)

    args = p.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())  # psycopg async on Windows
    sys.exit(main())
