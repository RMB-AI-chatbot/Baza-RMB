"""PDF text extraction.

Three layouts are supported:

* ``gazette_trilingual`` - Rwanda Official Gazette pages printed in three side-by-side
  columns (Kinyarwanda | English | French). Each column is extracted separately so that
  the languages never get mixed inside a chunk.
* ``simple``  - ordinary single-flow documents with a usable text layer.
* ``ocr``     - documents whose text layer is missing or garbage (e.g. fonts without a
  Unicode map). Pages are transcribed with a vision model (see ocr.py).

``detect_layout`` picks one automatically for uploaded documents.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import pymupdf

# Lines that are page furniture, not content.
_HEADER_RE = re.compile(
    r"^\s*(Official Gazette n°.*|Igazeti ya Leta n°.*|Journal Officiel n°.*|\d{1,4})\s*$",
    re.IGNORECASE,
)


@dataclass
class Block:
    """A paragraph-like block of text on one page."""

    page: int          # 1-based PDF page number
    text: str
    x0: float = 0.0
    y0: float = 0.0
    bold: bool = False


@dataclass
class Extraction:
    # language -> ordered list of blocks
    blocks: dict[str, list[Block]] = field(default_factory=dict)
    page_count: int = 0
    ocr_pages: int = 0
    warnings: list[str] = field(default_factory=list)


def clean_block_text(text: str) -> str:
    """Join the lines of a block into one paragraph and normalise whitespace.

    Justified gazette text is often extracted one word per line ("Ingingo | ya | 17:"),
    so lines inside a block are joined with spaces. Hyphenated line breaks are merged.
    """
    text = text.replace("­", "")  # soft hyphen
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    text = re.sub(r"\s*\n\s*", " ", text)
    text = re.sub(r"[ \t ]+", " ", text)
    return text.strip()


def text_quality(text: str) -> float:
    """Share of characters that look like real text (letters, digits, punctuation, spaces).

    PDFs exported with non-Unicode fonts produce private-use / control characters;
    a low score means the page needs OCR.
    """
    if not text:
        return 0.0
    good = sum(
        1 for ch in text
        if ch.isalnum() or ch.isspace() or ch in ".,;:!?()[]{}'\"%/-–—’‘“”°&+=*@#€$£«»…"
    )
    letters = sum(1 for ch in text if ch.isalpha())
    if letters < 0.3 * len(text.strip() or "x"):
        return min(good / len(text), 0.4)
    return good / len(text)


def _page_blocks(page: pymupdf.Page) -> list[tuple[float, float, float, float, str, bool]]:
    """Return (x0, y0, x1, y1, text, is_bold) for each text block on the page."""
    out = []
    data = page.get_text("dict", sort=True)
    for b in data.get("blocks", []):
        if b.get("type") != 0:
            continue
        lines, bold_chars, total_chars = [], 0, 0
        for line in b.get("lines", []):
            spans = line.get("spans", [])
            lines.append("".join(s.get("text", "") for s in spans))
            for s in spans:
                n = len(s.get("text", "").strip())
                total_chars += n
                if "bold" in s.get("font", "").lower() or (s.get("flags", 0) & 16):
                    bold_chars += n
        text = "\n".join(lines)
        if text.strip():
            x0, y0, x1, y1 = b["bbox"]
            out.append((x0, y0, x1, y1, text, total_chars > 0 and bold_chars / total_chars > 0.6))
    return out


def _column_boundaries(doc: pymupdf.Document, pages: list[int], n_cols: int) -> list[float]:
    """Find x positions that separate the columns, using 1-D k-means on block x0."""
    xs: list[float] = []
    width = 0.0
    for pno in pages:
        page = doc[pno - 1]
        width = max(width, page.rect.width)
        xs.extend(b[0] for b in _page_blocks(page))
    if not xs:
        return [width * (i + 1) / n_cols for i in range(n_cols - 1)]

    centers = [width * (i + 0.15) / n_cols for i in range(n_cols)]
    for _ in range(25):
        groups: list[list[float]] = [[] for _ in centers]
        for x in xs:
            groups[min(range(n_cols), key=lambda i: abs(x - centers[i]))].append(x)
        new = [sum(g) / len(g) if g else centers[i] for i, g in enumerate(groups)]
        if all(abs(a - b) < 0.5 for a, b in zip(new, centers)):
            break
        centers = new
    centers.sort()
    # A boundary sits just left of where the next column's blocks start (ignore outliers).
    bounds = []
    for i in range(n_cols - 1):
        right = sorted(x for x in xs if abs(x - centers[i + 1]) < abs(x - centers[i]))
        start = right[max(0, int(len(right) * 0.02))] if right else (centers[i] + centers[i + 1]) / 2
        bounds.append(start - 15)
    return bounds


def extract_gazette_trilingual(
    doc: pymupdf.Document,
    columns: list[str],
    page_range: tuple[int, int] | None = None,
) -> Extraction:
    """Extract each language column of a trilingual Official Gazette as its own block list."""
    first, last = page_range or (1, doc.page_count)
    pages = [p for p in range(first, last + 1) if doc[p - 1].rect.width > doc[p - 1].rect.height]
    ex = Extraction(page_count=doc.page_count, blocks={lang: [] for lang in columns})
    if not pages:
        ex.warnings.append("no landscape (multi-column) pages found")
        return ex

    bounds = _column_boundaries(doc, pages, len(columns))
    for pno in pages:
        for x0, y0, x1, y1, text, bold in _page_blocks(doc[pno - 1]):
            col = sum(1 for b in bounds if x0 >= b)
            cleaned = clean_block_text(text)
            if not cleaned or _HEADER_RE.match(cleaned):
                continue
            # Running header centred across the page: skip
            if y0 < 60 and cleaned.lower().startswith(("official gazette", "igazeti", "journal officiel")):
                continue
            ex.blocks[columns[col]].append(Block(pno, cleaned, x0, y0, bold))
    for lang in columns:
        ex.blocks[lang].sort(key=lambda b: (b.page, b.y0, b.x0))
    return ex


def extract_simple(
    doc: pymupdf.Document,
    language: str = "en",
    page_range: tuple[int, int] | None = None,
) -> tuple[Extraction, list[int]]:
    """Extract a single-flow document. Returns the extraction and the pages that need OCR."""
    first, last = page_range or (1, doc.page_count)
    ex = Extraction(page_count=doc.page_count, blocks={language: []})
    needs_ocr: list[int] = []
    for pno in range(first, last + 1):
        page = doc[pno - 1]
        raw = page.get_text()
        if len(raw.strip()) < 20 or text_quality(raw) < 0.85:
            needs_ocr.append(pno)
            continue
        for x0, y0, x1, y1, text, bold in _page_blocks(page):
            cleaned = clean_block_text(text)
            if cleaned and not _HEADER_RE.match(cleaned):
                ex.blocks[language].append(Block(pno, cleaned, x0, y0, bold))
    return ex, needs_ocr


def detect_layout(doc: pymupdf.Document) -> str:
    """Guess the layout of an uploaded PDF: gazette_trilingual | simple | ocr."""
    sample = list(range(min(doc.page_count, 12)))
    landscape = [i for i in sample if doc[i].rect.width > doc[i].rect.height]
    text = "".join(doc[i].get_text() for i in sample)
    if text_quality(text) < 0.85 or len(text.strip()) < 200:
        return "ocr"
    if landscape and re.search(r"Official Gazette|Igazeti ya Leta", text) and len(landscape) >= len(sample) // 2:
        return "gazette_trilingual"
    return "simple"
