"""Split a law (one language column) into one chunk per article.

Rwandan laws follow a fixed structure: CHAPTER > Section > Sub-section > Article.
Each chunk keeps its article number (section_key "art-16", shared by the EN/FR/RW
versions), a human label ("Article 16"), the article title, its chapter/section and
the PDF pages it spans, so every answer can cite the exact provision.

The gazette starts with a table of contents that repeats every article heading;
those entries have no body and are used only to recover clean article titles.
"""

from __future__ import annotations

import bisect
import re
from dataclasses import dataclass

from app.ingest.pdf_extract import Block

_WORD_NUM = {"one": 1, "premier": 1, "première": 1, "mbere": 1}

PATTERNS = {
    "en": {
        "article": re.compile(r"\bArticle\s+(One|\d+)\s*:", re.IGNORECASE),
        "chapter": re.compile(r"\bCHAPTER\s+(ONE|[IVXLC]+)\s*:"),
        "section": re.compile(r"\b(?:Sub-section|Section)\s+(One|\d+)\s*:"),
        "label": "Article {n}",
        "end": re.compile(r"\(sé\)|\bKigali,\s+on\s+\d|\bDone at Kigali"),
    },
    "fr": {
        "article": re.compile(r"\bArticle\s+(premier|\d+)\s*:", re.IGNORECASE),
        "chapter": re.compile(r"\bCHAPITRE\s+(PREMIER|[IVXLC]+)\s*:"),
        "section": re.compile(r"\b(?:Sous-section|Section)\s+(premi[eè]re|\d+)\s*:", re.IGNORECASE),
        "label": "Article {n}",
        "end": re.compile(r"\(sé\)|\bKigali,\s+le\s+\d|\bFait à Kigali"),
    },
    "rw": {
        "article": re.compile(r"\bIngingo\s+ya\s+(mbere|\d+)\s*:", re.IGNORECASE),
        "chapter": re.compile(r"\bUMUTWE\s+WA\s+(MBERE|[IVXLC]+)\s*:"),
        "section": re.compile(r"\b(?:Akiciro|Icyiciro)\s+cya\s+(mbere|\d+)\s*:", re.IGNORECASE),
        "label": "Ingingo ya {n}",
        "end": re.compile(r"\(sé\)|\bKigali,\s+ku\s+wa\s+\d|\bBikorewe i Kigali"),
    },
}

MAX_WORDS = 330     # split longer articles into parts (E5 embeds at most 512 tokens)
TARGET_WORDS = 240


@dataclass
class LegalChunk:
    language: str
    section_key: str
    section_ref: str
    heading: str
    chapter: str | None
    page_start: int
    page_end: int
    text: str           # body only (heading excluded)
    part: int = 1
    parts: int = 1


def _num(token: str) -> int:
    t = token.lower()
    return _WORD_NUM.get(t) or int(t)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9à-ÿ]+", " ", s.lower()).strip()


class _Stream:
    """All blocks of one language joined into one string, with a char-offset -> page map."""

    def __init__(self, blocks: list[Block]):
        parts, self.offsets, self.pages = [], [], []
        pos = 0
        for b in blocks:
            self.offsets.append(pos)
            self.pages.append(b.page)
            parts.append(b.text)
            pos += len(b.text) + 1
        self.text = " ".join(parts)

    def page_at(self, pos: int) -> int:
        i = bisect.bisect_right(self.offsets, pos) - 1
        return self.pages[max(i, 0)] if self.pages else 1


def _upper_title(text: str) -> str:
    """Leading run of upper-case words (chapter titles are printed in capitals)."""
    out = []
    for tok in text.split():
        if any(c.islower() for c in tok):
            break
        out.append(tok)
    return " ".join(out)


def _title_from_toc_tail(seg: str) -> str:
    """The last TOC entry is followed by the law's title in capitals; keep the title only."""
    words = []
    for tok in seg.split():
        if words and tok.isupper() and len(tok) > 2:
            break
        words.append(tok)
    return " ".join(words)


def _split_long(body: str) -> list[str]:
    words = body.split()
    if len(words) <= MAX_WORDS:
        return [body]
    # Prefer to split before numbered paragraphs "(3)" or lettered items "(c)", else sentences.
    pieces = re.split(r"(?=\s\(\d+\)\s)|(?<=[.;:])\s+(?=[A-Z(])", body)
    chunks, cur = [], ""
    for p in pieces:
        if cur and len((cur + " " + p).split()) > TARGET_WORDS:
            chunks.append(cur.strip())
            cur = p
        else:
            cur = f"{cur} {p}" if cur else p
    if cur.strip():
        chunks.append(cur.strip())
    # Hard split anything still too long
    final = []
    for c in chunks:
        w = c.split()
        while len(w) > MAX_WORDS:
            final.append(" ".join(w[:TARGET_WORDS]))
            w = w[TARGET_WORDS - 30:]  # small overlap
        final.append(" ".join(w))
    return final


def chunk_law(blocks: list[Block], language: str) -> tuple[list[LegalChunk], dict]:
    """Return article chunks plus a small report (counts, missing article numbers)."""
    pat = PATTERNS[language]
    st = _Stream(blocks)
    text = st.text

    end_m = None
    heads = list(pat["article"].finditer(text))
    if heads:
        end_m = pat["end"].search(text, heads[-1].end())
    text_end = end_m.start() if end_m else len(text)

    # The table of contents lists every article first; the body repeats them.
    # The TOC ends where an article number appears for the second time.
    seen: set[int] = set()
    toc_count = 0
    for i, m in enumerate(heads):
        n = _num(m.group(1))
        if n in seen:
            toc_count = i
            break
        seen.add(n)
    if toc_count and toc_count < len(heads) // 3:
        toc_count = 0  # repeated number early on: not a real TOC

    # Segment text between consecutive article headings.
    segs = []
    for i, m in enumerate(heads):
        stop = heads[i + 1].start() if i + 1 < len(heads) else text_end
        seg = text[m.end():stop].strip()
        if i == toc_count - 1:
            # last TOC entry runs into the title page / preamble: keep only a title-length piece
            seg = " ".join(seg.split()[:15])
        segs.append((i < toc_count, m, seg))

    toc_titles: dict[int, str] = {}
    best: dict[int, tuple[re.Match, str]] = {}
    for in_toc, m, seg in segs:
        n = _num(m.group(1))
        # cut off structural headings that trail into the segment
        cut = len(seg)
        for key in ("chapter", "section"):
            mm = pat[key].search(seg)
            if mm:
                cut = min(cut, mm.start())
        seg_clean = seg[:cut].strip()
        if in_toc:
            if toc_count and m is heads[toc_count - 1]:
                seg_clean = _title_from_toc_tail(seg_clean)
            toc_titles.setdefault(n, seg_clean)
            continue
        if n not in best or len(seg_clean) > len(best[n][1]):
            best[n] = (m, seg_clean)

    # Structural headings (outside the table of contents) for chapter context.
    first_body = min((m.start() for m, _ in best.values()), default=0)
    chapters = [
        (cm.start(), f"{cm.group(0)} {_upper_title(text[cm.end():cm.end() + 300])}".strip())
        for cm in pat["chapter"].finditer(text)
    ]
    chapter_pos = [c[0] for c in chapters]

    chunks: list[LegalChunk] = []
    for n in sorted(best):
        m, body = best[n]
        title = toc_titles.get(n, "")
        if title and _norm(body).startswith(_norm(title)):
            # drop the title words from the body
            words_t = len(title.split())
            body = " ".join(body.split()[words_t:])
        elif not title:
            # no TOC entry: title runs until the first numbered paragraph or 15 words
            mm = re.match(r"(.{3,160}?)\s+(?=\(1\)|\(a\)|[A-Z][a-z]+\s)", body)
            title = mm.group(1) if mm else " ".join(body.split()[:12])
            body = body[len(title):].strip()
        label = pat["label"].format(n=n)
        heading = f"{m.group(0).rstrip(':').strip()}: {title}".strip()
        ci = bisect.bisect_right(chapter_pos, m.start()) - 1
        chapter = chapters[ci][1] if ci >= 0 and chapters[ci][0] >= first_body - 2000 else None

        start_page = st.page_at(m.start())
        parts = _split_long(body) if body else [""]
        pos = m.end()
        for k, part in enumerate(parts, 1):
            found = text.find(part[:40], pos) if part else -1
            p0 = st.page_at(found) if found >= 0 else start_page
            p1 = st.page_at(found + len(part)) if found >= 0 else p0
            if found >= 0:
                pos = found
            chunks.append(LegalChunk(
                language=language, section_key=f"art-{n}", section_ref=label,
                heading=heading, chapter=chapter,
                page_start=start_page if k == 1 else p0, page_end=max(p1, start_page),
                text=part, part=k, parts=len(parts),
            ))

    numbers = sorted(best)
    missing = [i for i in range(1, (numbers[-1] if numbers else 0) + 1) if i not in best]
    report = {"articles": len(best), "chunks": len(chunks), "missing_articles": missing,
              "toc_titles": len(toc_titles)}
    return chunks, report
