"""OCR for pages without a usable text layer, using the configured LLM's vision.

Each page is rendered to PNG and transcribed to Markdown (tables kept as tables).
Results are cached in DATA_DIR/extracted/<document_id>/page-NNN.md, so a document is
only sent to the API once; re-ingestion reads the cache. Commit the cache or keep it on
the server's data volume.
"""

from __future__ import annotations

import base64
import logging
import re
from pathlib import Path

import pymupdf

from app.config import get_settings
from app.llm import get_llm, llm_configured

log = logging.getLogger(__name__)

OCR_PROMPT = """Transcribe the document text printed on this page, as Markdown.

Rules:
- Copy the text exactly as printed. Do not summarise, translate, correct or add anything.
- Transcribe only the document's own text: headings, paragraphs, captions, tables, chart labels and numbers.
- IGNORE any text that appears inside photographs (signs, banners, posters, booths, clothing, vehicles, machinery, product labels).
- Use '#'/'##' for headings that are visually headings.
- Reproduce tables as Markdown tables; reproduce figures/infographic labels and numbers as short lines of text.
- Keep the natural reading order (columns left to right, top to bottom). Write each piece of text once.
- If the page has no document text, output exactly: [NO TEXT]
Output only the transcription."""

MAX_IMAGE_SIDE = 1800


def clean_ocr(text: str) -> str:
    """Remove repetition loops that OCR models sometimes fall into ("The\\nThe\\nThe…",
    or a sign read over and over). A line or 2-line group repeated back-to-back is kept once,
    and any line seen more than 3 times on the page is dropped after its third occurrence."""
    out = [l.rstrip() for l in text.splitlines()]  # blank lines kept: they separate paragraphs
    # Collapse a group of k lines (k = 1..4, blank lines included) that repeats the k lines before it.
    changed = True
    while changed:
        changed = False
        for k in (1, 2, 3, 4):
            i = k
            while i + k <= len(out):
                if out[i:i + k] == out[i - k:i]:
                    del out[i:i + k]
                    changed = True
                else:
                    i += 1
    seen: dict[str, int] = {}
    final = []
    for line in out:
        key = line.strip()
        if key:
            seen[key] = seen.get(key, 0) + 1
            if seen[key] > 3:
                continue
        final.append(line)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(final)).strip()


def cache_path(document_id: str, page: int) -> Path:
    return get_settings().data_dir / "extracted" / document_id / f"page-{page:03d}.md"


def render_page_jpeg(page: pymupdf.Page) -> bytes:
    zoom = min(2.0, MAX_IMAGE_SIDE / max(page.rect.width, page.rect.height))
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
    return pix.tobytes("jpg", jpg_quality=85)


def ocr_page(doc: pymupdf.Document, document_id: str, page_no: int, force: bool = False) -> str:
    path = cache_path(document_id, page_no)
    if path.exists() and not force:
        return clean_ocr(path.read_text(encoding="utf-8"))

    img = render_page_jpeg(doc[page_no - 1])
    llm = get_llm()
    text = clean_ocr(llm.transcribe_image(base64.standard_b64encode(img).decode(), "image/jpeg", OCR_PROMPT))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    log.info("OCR %s page %s: %d chars", document_id, page_no, len(text))
    return text


def ocr_available() -> bool:
    return llm_configured()
