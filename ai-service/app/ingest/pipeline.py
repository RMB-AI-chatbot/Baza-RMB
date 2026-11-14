"""Ingestion pipeline: source file -> extraction -> chunks -> embeddings -> kb.chunks.

Repeatable and idempotent: re-running re-indexes only documents whose file changed
(or everything with force=True). Synchronous by design (CPU-bound); the API runs it in
a worker thread.
"""

from __future__ import annotations

import hashlib
import time
import json
import logging
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import psycopg
import pymupdf
import yaml
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row

from app.config import get_settings
from app.embeddings import embed_passages
from app.ingest import web
from app.ingest.generic_chunker import chunk_generic, markdown_to_blocks
from app.ingest.legal_chunker import chunk_law
from app.ingest.ocr import ocr_available, ocr_page
from app.ingest.pdf_extract import (
    Block,
    detect_layout,
    extract_gazette_trilingual,
    extract_simple,
)

log = logging.getLogger(__name__)

REGISTER_FIELDS = [
    "title", "short_title", "doc_type", "category", "law_reference", "source_url", "file_path",
    "layout", "languages", "owner", "version", "effective_date", "review_date", "status", "options",
]


@dataclass
class ChunkRow:
    language: str
    section_key: str | None
    section_ref: str | None
    heading: str | None
    chapter: str | None
    page_start: int | None
    page_end: int | None
    text: str
    embed_text: str = ""


@dataclass
class IngestReport:
    document_id: str
    status: str = "skipped"
    chunks: int = 0
    pages: int = 0
    ocr_pages: int = 0
    warnings: list[str] = field(default_factory=list)
    details: dict = field(default_factory=dict)


def connect() -> psycopg.Connection:
    conn = psycopg.connect(get_settings().database_url, row_factory=dict_row)
    register_vector(conn)
    return conn


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Register (sources.yaml -> kb.documents)
# ---------------------------------------------------------------------------

def load_register(path: Path | None = None) -> list[dict]:
    path = path or get_settings().data_dir / "sources.yaml"
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    docs = data.get("documents", [])
    for d in docs:
        d["file_path"] = d.pop("file", None)
        d.setdefault("options", {})
        for k in ("effective_date", "review_date"):
            if isinstance(d.get(k), str):
                d[k] = date.fromisoformat(d[k])
    return docs


def upsert_document(conn: psycopg.Connection, spec: dict) -> None:
    cols = ["id"] + REGISTER_FIELDS
    values = [spec.get("id")] + [
        json.dumps(spec.get(c) or {}) if c == "options" else spec.get(c) for c in REGISTER_FIELDS
    ]
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in REGISTER_FIELDS)
    conn.execute(
        f"INSERT INTO kb.documents ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))}) "
        f"ON CONFLICT (id) DO UPDATE SET {updates}, updated_at = now()",
        values,
    )


def sync_register(conn: psycopg.Connection) -> list[str]:
    ids = []
    for spec in load_register():
        upsert_document(conn, spec)
        ids.append(spec["id"])
    conn.commit()
    return ids


# ---------------------------------------------------------------------------
# Extraction per layout
# ---------------------------------------------------------------------------

def _law_rows(doc_row: dict, pdf: pymupdf.Document, report: IngestReport) -> list[ChunkRow]:
    opts = doc_row["options"] or {}
    columns = opts.get("columns", ["rw", "en", "fr"])
    page_range = tuple(opts["page_range"]) if opts.get("page_range") else None
    ex = extract_gazette_trilingual(pdf, columns, page_range)
    report.warnings += ex.warnings
    rows: list[ChunkRow] = []
    for lang in [l for l in doc_row["languages"] if l in get_settings().index_languages]:
        if lang not in ex.blocks:
            report.warnings.append(f"language {lang} not in columns {columns}")
            continue
        chunks, rep = chunk_law(ex.blocks[lang], lang)
        report.details[lang] = rep
        if rep["missing_articles"]:
            report.warnings.append(f"{lang}: articles not found {rep['missing_articles']}")
        for c in chunks:
            part = f" (part {c.part}/{c.parts})" if c.parts > 1 else ""
            header = f"{doc_row['short_title']}" + (f" | {c.chapter}" if c.chapter else "")
            rows.append(ChunkRow(
                language=lang, section_key=c.section_key, section_ref=c.section_ref + part,
                heading=c.heading, chapter=c.chapter, page_start=c.page_start, page_end=c.page_end,
                text=c.text, embed_text=f"{header}\n{c.heading}\n{c.text}",
            ))
    return rows


def _generic_rows(doc_row: dict, blocks: list[Block], language: str, page_label: str = "p.") -> list[ChunkRow]:
    rows = []
    for c in chunk_generic(blocks, language, page_label):
        header = doc_row["short_title"] + (f" | {c.heading}" if c.heading else "")
        rows.append(ChunkRow(
            language=language, section_key=c.section_key, section_ref=c.section_ref, heading=c.heading,
            chapter=None, page_start=c.page_start, page_end=c.page_end, text=c.text,
            embed_text=f"{header}\n{c.text}",
        ))
    return rows


def _ocr_blocks(pdf: pymupdf.Document, doc_id: str, pages: list[int], report: IngestReport) -> list[Block]:
    blocks: list[Block] = []
    if not ocr_available():
        report.warnings.append(f"{len(pages)} page(s) need OCR but no LLM API key is configured: {pages[:20]}")
        return blocks
    for p in pages:
        for attempt in range(3):
            try:
                md = ocr_page(pdf, doc_id, p)
                blocks += markdown_to_blocks(md, p)
                report.ocr_pages += 1
                break
            except Exception as e:  # keep going; the page is reported
                if "429" in str(e) and attempt < 2:
                    # per-minute token limits (free tiers): wait for the window to reset
                    log.info("OCR page %s rate-limited; waiting 65 s", p)
                    time.sleep(65)
                    continue
                report.warnings.append(f"OCR failed on page {p}: {e}")
                break
    return blocks


def _pdf_rows(doc_row: dict, path: Path, report: IngestReport) -> list[ChunkRow]:
    pdf = pymupdf.open(path)
    report.pages = pdf.page_count
    layout = doc_row["layout"] if doc_row["layout"] != "auto" else detect_layout(pdf)
    report.details["layout"] = layout
    lang = (doc_row["languages"] or ["en"])[0]
    opts = doc_row["options"] or {}
    page_range = tuple(opts["page_range"]) if opts.get("page_range") else None

    if layout == "gazette_trilingual":
        return _law_rows(doc_row, pdf, report)
    if layout == "ocr":
        first, last = page_range or (1, pdf.page_count)
        blocks = _ocr_blocks(pdf, doc_row["id"], list(range(first, last + 1)), report)
        return _generic_rows(doc_row, blocks, lang)
    # simple
    ex, needs_ocr = extract_simple(pdf, lang, page_range)
    blocks = ex.blocks[lang]
    if needs_ocr:
        blocks = sorted(blocks + _ocr_blocks(pdf, doc_row["id"], needs_ocr, report), key=lambda b: (b.page, b.y0))
    return _generic_rows(doc_row, blocks, lang)


def _web_rows(doc_row: dict, report: IngestReport, refetch: bool) -> tuple[list[ChunkRow], str]:
    s = get_settings()
    snapshot = s.data_dir / (doc_row["file_path"] or f"raw/web/{doc_row['id']}.html")
    if refetch or not snapshot.exists():
        html = web.fetch_html(doc_row["source_url"])
        snapshot.parent.mkdir(parents=True, exist_ok=True)
        snapshot.write_text(html, encoding="utf-8")
    html = snapshot.read_text(encoding="utf-8")
    blocks, title = web.html_to_blocks(html)
    report.pages = 1
    lang = (doc_row["languages"] or ["en"])[0]
    return _generic_rows(doc_row, blocks, lang, page_label="web page"), web.content_hash(blocks)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def ingest_document(conn: psycopg.Connection, doc_id: str, force: bool = False, refetch_web: bool = False) -> IngestReport:
    report = IngestReport(document_id=doc_id)
    doc_row = conn.execute("SELECT * FROM kb.documents WHERE id = %s", (doc_id,)).fetchone()
    if not doc_row:
        raise ValueError(f"unknown document {doc_id}")

    s = get_settings()
    try:
        if doc_row["layout"] == "faq":
            # Rebuilt from approved entries in kb.faq_entries (see app/faq.py), not from a file.
            from app.faq import _chunk_text, rebuild_rows_sync

            entries = rebuild_rows_sync(conn)
            rows = []
            for e in entries:
                text, embed_text = _chunk_text(e)
                rows.append(ChunkRow(language="en", section_key=f"faq-{e['id']}", section_ref=f"FAQ #{e['id']}",
                                     heading=e["question"][:300], chapter=None, page_start=None, page_end=None,
                                     text=text, embed_text=embed_text))
            fingerprint = hashlib.sha256("\n".join(r.text for r in rows).encode()).hexdigest()
            if not rows:
                conn.execute("DELETE FROM kb.chunks WHERE document_id=%s", (doc_id,))
                conn.execute("UPDATE kb.documents SET processing_status='indexed', chunk_count=0, indexed_at=now() "
                             "WHERE id=%s", (doc_id,))
                conn.commit()
                report.status = "indexed"
                return report
            force = True
        elif doc_row["layout"] == "webpage":
            rows, fingerprint = _web_rows(doc_row, report, refetch=refetch_web)
        else:
            path = s.data_dir / (doc_row["file_path"] or "")
            if not path.is_file():
                raise FileNotFoundError(f"source file not found: {path}")
            fingerprint = sha256_file(path)
            if (not force and fingerprint == doc_row["file_sha256"]
                    and doc_row["processing_status"] == "indexed"):
                report.status = "unchanged"
                return report
            conn.execute("UPDATE kb.documents SET processing_status='processing', updated_at=now() WHERE id=%s", (doc_id,))
            conn.commit()
            rows = _pdf_rows(doc_row, path, report)

        if not force and fingerprint == doc_row["file_sha256"] and doc_row["processing_status"] == "indexed":
            report.status = "unchanged"
            return report
        if not rows:
            raise RuntimeError("no text could be extracted" + (f": {report.warnings}" if report.warnings else ""))

        embed_langs = set(s.embed_languages)
        to_embed = [i for i, r in enumerate(rows) if r.language in embed_langs]
        log.info("%s: %d chunks, embedding %d", doc_id, len(rows), len(to_embed))
        vectors = [None] * len(rows)
        for i, vec in zip(to_embed, embed_passages([rows[i].embed_text for i in to_embed])):
            vectors[i] = vec

        with conn.transaction():
            conn.execute("DELETE FROM kb.chunks WHERE document_id = %s", (doc_id,))
            with conn.cursor() as cur:
                cur.executemany(
                    """INSERT INTO kb.chunks (document_id, language, chunk_index, section_key, section_ref,
                           heading, chapter, page_start, page_end, text, token_estimate, embedding)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    [
                        (doc_id, r.language, i, r.section_key, r.section_ref, r.heading, r.chapter,
                         r.page_start, r.page_end, r.text, int(len(r.text.split()) * 1.4), vec)
                        for i, (r, vec) in enumerate(zip(rows, vectors))
                    ],
                )
            needs_review = any("OCR" in w or "not found" in w for w in report.warnings)
            conn.execute(
                """UPDATE kb.documents SET processing_status=%s, processing_error=%s, chunk_count=%s,
                       page_count=%s, ocr_pages=%s, file_sha256=%s, indexed_at=now(), updated_at=now()
                   WHERE id=%s""",
                ("needs_review" if needs_review else "indexed",
                 "\n".join(report.warnings) or None, len(rows), report.pages, report.ocr_pages,
                 fingerprint, doc_id),
            )
        report.status = "needs_review" if needs_review else "indexed"
        report.chunks = len(rows)
        return report
    except Exception as e:
        conn.rollback()
        log.exception("ingestion failed for %s", doc_id)
        conn.execute(
            "UPDATE kb.documents SET processing_status='failed', processing_error=%s, updated_at=now() WHERE id=%s",
            (str(e)[:2000], doc_id),
        )
        conn.commit()
        report.status = "failed"
        report.warnings.append(str(e))
        return report
