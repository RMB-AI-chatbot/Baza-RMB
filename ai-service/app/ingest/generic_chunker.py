"""Section-aware chunking for non-legal documents (prospectuses, guides, web pages, OCR output).

Blocks are grouped under the most recent heading. A chunk never mixes two headings and
stays around TARGET_WORDS, so citations can point to "heading, page N".
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.ingest.pdf_extract import Block

TARGET_WORDS = 220
MAX_WORDS = 300
MIN_WORDS = 25


@dataclass
class GenericChunk:
    language: str
    section_key: str
    section_ref: str
    heading: str | None
    page_start: int
    page_end: int
    text: str


def is_heading(block: Block) -> bool:
    t = block.text.strip()
    if t.startswith("#"):
        return True
    words = t.split()
    if not words or len(words) > 14 or t.endswith((".", ",", ";")):
        return False
    letters = [c for c in t if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) / len(letters) > 0.8 and len(letters) > 3:
        return True
    return block.bold and len(words) <= 12


def _clean_heading(t: str) -> str:
    return re.sub(r"^#+\s*", "", t).strip().rstrip(":")


def chunk_generic(blocks: list[Block], language: str, page_label: str = "p.") -> list[GenericChunk]:
    chunks: list[GenericChunk] = []
    heading: str | None = None
    buf: list[Block] = []

    def flush():
        nonlocal buf
        if not buf:
            return
        text = " ".join(b.text for b in buf).strip()
        if len(text.split()) >= MIN_WORDS or (chunks == [] and text):
            p0, p1 = buf[0].page, buf[-1].page
            pages = f"{page_label} {p0}" if p0 == p1 else f"{page_label} {p0}-{p1}"
            ref = f"{heading}, {pages}" if heading else pages
            chunks.append(GenericChunk(
                language=language, section_key=f"p{p0}-{len(chunks) + 1}",
                section_ref=ref[:200], heading=heading, page_start=p0, page_end=p1, text=text,
            ))
        elif chunks and chunks[-1].heading == heading:
            # tiny trailing piece: append to the previous chunk of the same section
            chunks[-1].text += " " + text
            chunks[-1].page_end = buf[-1].page
        buf = []

    words = 0
    for b in blocks:
        if is_heading(b):
            flush()
            words = 0
            heading = _clean_heading(b.text)[:150]
            continue
        n = len(b.text.split())
        if buf and words + n > MAX_WORDS:
            flush()
            words = 0
        buf.append(b)
        words += n
        if words >= TARGET_WORDS:
            flush()
            words = 0
    flush()
    return chunks


def markdown_to_blocks(md: str, page: int) -> list[Block]:
    """Turn OCR markdown for one page into blocks (headings stay separate, tables stay whole)."""
    blocks: list[Block] = []
    para: list[str] = []

    def end_para():
        if para:
            blocks.append(Block(page, " ".join(para).strip()))
            para.clear()

    lines = md.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line.strip():
            end_para()
        elif line.lstrip().startswith("#"):
            end_para()
            blocks.append(Block(page, line.strip(), bold=True))
        elif line.lstrip().startswith("|"):
            end_para()
            table = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                if not re.match(r"^\s*\|[\s:\-|]+\|\s*$", lines[i]):
                    table.append(lines[i].strip())
                i += 1
            blocks.append(Block(page, " ; ".join(table)))
            continue
        else:
            para.append(line.strip())
        i += 1
    end_para()
    return [b for b in blocks if b.text and b.text != "[NO TEXT]"]
