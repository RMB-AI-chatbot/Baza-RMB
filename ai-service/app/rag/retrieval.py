"""Hybrid retrieval over kb.chunks: vector similarity + full-text search, fused with RRF.

Why hybrid: embeddings capture meaning ("can I sell my licence?" ~ "transfer of a mining
licence") but are weak on exact tokens such as article numbers, percentages or mineral
names; Postgres full-text search covers those. Explicit references like "Article 16" are
boosted directly via section_key.

Public interface (used by the chat service and the eval script):

    result = await retrieve(query, languages=["en"], top_k=6)
    result.chunks           -> list[RetrievedChunk] ordered by fused rank
    result.max_vector_score -> best cosine similarity (confidence signal)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.config import get_settings
from app.db import connection
from app.embeddings import embed_query

RRF_K = 60
# Fusion weights (tuned with eval/run_eval.py --retrieval). The keyword arm is noisy in this corpus
# (almost every chunk says "mining licence"), so it counts less than the vector arm.
VECTOR_WEIGHT = 1.0
HEADING_WEIGHT = 0.15  # top-3 heading matches only; eval v1: hit@6 97% -> 100% (0.3+ starts to crowd out body matches)
KEYWORD_WEIGHT = 0.05  # tie-breaker; eval v1: 0.0-0.05 -> hit@6 100%, 0.5 -> 95%, 1.0 -> 89%
FTS_CONFIG = {"en": "english", "fr": "french"}

_ARTICLE_RE = re.compile(r"\b(?:article|art\.?|ingingo\s+ya)\s*(\d{1,3}|one|premier|mbere)\b", re.IGNORECASE)
_WORD_NUM = {"one": 1, "premier": 1, "mbere": 1}

# Document hints so "article 16 of the petroleum law" targets the right law.
_DOC_HINTS = {
    "petroleum": "law-13-2016-petroleum", "peteroli": "law-13-2016-petroleum", "pétrole": "law-13-2016-petroleum",
    "tax": "law-056-2024-mineral-tax", "royalt": "law-056-2024-mineral-tax", "impôt": "law-056-2024-mineral-tax",
    "umusoro": "law-056-2024-mineral-tax",
    "mining": "law-072-2024-mining-quarry", "quarry": "law-072-2024-mining-quarry", "minière": "law-072-2024-mining-quarry",
    "ubucukuzi": "law-072-2024-mining-quarry",
}


@dataclass
class RetrievedChunk:
    id: int
    document_id: str
    document_title: str
    document_short_title: str
    doc_type: str
    law_reference: str | None
    source_url: str | None
    language: str
    section_key: str | None
    section_ref: str | None
    heading: str | None
    chapter: str | None
    page_start: int | None
    page_end: int | None
    text: str
    vector_score: float = 0.0
    keyword_score: float = 0.0
    rrf: float = 0.0
    exact_match: bool = False

    def citation(self) -> dict:
        pages = None
        if self.page_start:
            pages = str(self.page_start) if self.page_start == self.page_end or not self.page_end \
                else f"{self.page_start}-{self.page_end}"
        return {
            "document_id": self.document_id,
            "document": self.document_title,
            "short_title": self.document_short_title,
            "section": self.section_ref,
            "heading": self.heading,
            "page": pages,
            "url": self.source_url + (f"#page={self.page_start}" if self.source_url and self.source_url.endswith(".pdf") and self.page_start else "")
            if self.source_url else None,
            "language": self.language,
        }


@dataclass
class RetrievalResult:
    query: str
    chunks: list[RetrievedChunk] = field(default_factory=list)
    max_vector_score: float = 0.0
    keyword_hits: int = 0
    exact_matches: int = 0

    @property
    def confident(self) -> bool:
        """Enough evidence to try answering (the answer model still checks sufficiency)."""
        return (self.max_vector_score >= get_settings().min_vector_score
                or self.exact_matches > 0
                or (self.keyword_hits >= 3 and self.max_vector_score >= get_settings().min_vector_score - 0.04))


def _article_refs(query: str) -> tuple[list[str], str | None]:
    keys = []
    for m in _ARTICLE_RE.finditer(query):
        tok = m.group(1).lower()
        n = _WORD_NUM.get(tok) or int(tok)
        keys.append(f"art-{n}")
    q = query.lower()
    doc = next((d for hint, d in _DOC_HINTS.items() if hint in q), None)
    return keys, doc


# People's words -> the words the laws use. Added to the KEYWORD part of the search only (the vector
# search keeps the question as asked). Found by testing expected questions against the laws.
_LEGAL_SYNONYMS = [
    (re.compile(r"\b(revok\w*|withdraw\w*|take (it|my licen[cs]e) away|lose my licen[cs]e)\b", re.I), "cancellation cancel suspension"),
    (re.compile(r"\b(clos(e|es|ing|ure)|stop(s|ping)? mining|give up|abandon\w*|leav(e|ing) the site)\b", re.I), "relinquishment rehabilitation"),
    (re.compile(r"\b(not|never|didn'?t|don'?t|fail\w*) (to )?start\w*", re.I), "failure start operations cancellation"),
    (re.compile(r"\b(cost|price|fees?|how much .{0,20}(pay|apply|licen[cs]e))\b", re.I), "service fees regulations"),
    (re.compile(r"\b(landowner|land-owner|my (land|field|farm|plot|property))\b", re.I), "land owner compensation"),
    (re.compile(r"\b(smuggl\w*|black market|illegal(ly)? (sell|trad|buy)\w*)\b", re.I), "trading illegally extracted minerals"),
    (re.compile(r"\b(hire|employ\w*|jobs?|local (people|companies|suppliers|content)|rwandans?)\b", re.I), "local procurement Rwandan contractors"),
    (re.compile(r"\b(community|communities|villagers?|neighbou?rs?)\b", re.I), "development social welfare district"),
    (re.compile(r"\b(when|deadline|due)\b.{0,30}\b(pay|declare)\w*", re.I), "declaration payment within days"),
    (re.compile(r"\bexport tax|raw (form|minerals)|unprocessed\b", re.I), "export tax raw form"),
    (re.compile(r"\b(online|portal|website|internet|e-?service|system)\b", re.I), "GIMCS MCIS online portal"),
    (re.compile(r"\b(samples?|laborator\w*|lab|assay\w*|analys\w*|test(ing)?)\b", re.I), "laboratory sample export permit testing"),
]


def _keyword_query(query: str) -> str:
    extra = [terms for rx, terms in _LEGAL_SYNONYMS if rx.search(query)]
    return f"{query} {' '.join(extra)}" if extra else query


_SQL = """
WITH vec AS (
    SELECT c.id, 1 - (c.embedding <=> %(qvec)s) AS vscore,
           row_number() OVER (ORDER BY c.embedding <=> %(qvec)s) AS vrank
    FROM kb.chunks c JOIN kb.documents d ON d.id = c.document_id
    WHERE d.status = 'active' AND c.language = ANY(%(langs)s)
    ORDER BY c.embedding <=> %(qvec)s
    LIMIT %(n)s
),
qry AS (
    -- question terms OR-ed together ("types | mine | licenc"), so partial matches still rank
    SELECT CASE WHEN numnode(plainto_tsquery(%(cfg)s::regconfig, %(q)s)) = 0 THEN NULL
                ELSE replace(plainto_tsquery(%(cfg)s::regconfig, %(q)s)::text, '&', '|')::tsquery END AS query
),
kw AS (
    SELECT c.id, ts_rank_cd(c.tsv, q.query, 32) AS kscore,
           row_number() OVER (ORDER BY ts_rank_cd(c.tsv, q.query, 32) DESC) AS krank
    FROM kb.chunks c
    JOIN kb.documents d ON d.id = c.document_id
    CROSS JOIN qry q
    WHERE d.status = 'active' AND c.language = ANY(%(langs)s)
      AND q.query IS NOT NULL AND c.tsv @@ q.query
    ORDER BY kscore DESC
    LIMIT %(n)s
),
head AS (
    -- Article titles are the most informative text in a law ("Types of licences of mining operations").
    SELECT c.id,
           row_number() OVER (ORDER BY ts_rank(to_tsvector(%(cfg)s::regconfig, c.heading), q.query, 1) DESC) AS hrank
    FROM kb.chunks c
    JOIN kb.documents d ON d.id = c.document_id
    CROSS JOIN qry q
    WHERE d.status = 'active' AND c.language = ANY(%(langs)s) AND c.heading IS NOT NULL
      AND q.query IS NOT NULL AND to_tsvector(%(cfg)s::regconfig, c.heading) @@ q.query
    ORDER BY hrank
    LIMIT 3
),
exact AS (
    SELECT c.id, row_number() OVER (ORDER BY (c.document_id = %(doc_hint)s) DESC, c.chunk_index) AS erank
    FROM kb.chunks c JOIN kb.documents d ON d.id = c.document_id
    WHERE d.status = 'active' AND c.language = ANY(%(langs)s)
      AND c.section_key = ANY(%(keys)s)
      AND (%(doc_hint)s::text IS NULL OR c.document_id = %(doc_hint)s)
    LIMIT 6
),
fused AS (
    SELECT id, sum(contrib) AS rrf, max(vscore) AS vscore, max(kscore) AS kscore, bool_or(exact) AS exact
    FROM (
        SELECT id, %(vw)s / (%(rrf_k)s + vrank) AS contrib, vscore, 0.0 AS kscore, false AS exact FROM vec
        UNION ALL SELECT id, %(kw)s / (%(rrf_k)s + krank), 0.0, kscore, false FROM kw
        UNION ALL SELECT id, %(hw)s / (%(rrf_k)s + hrank), 0.0, 0.0, false FROM head
        UNION ALL SELECT id, 2.0 / (%(rrf_k)s + erank), 0.0, 0.0, true FROM exact
    ) x
    GROUP BY id
)
SELECT f.vscore, f.kscore, f.exact, f.rrf,
       c.id, c.document_id, c.language, c.section_key, c.section_ref, c.heading, c.chapter,
       c.page_start, c.page_end, c.text, c.embedding <=> %(qvec)s AS dist,
       d.title, d.short_title, d.doc_type, d.law_reference, d.source_url
FROM fused f
JOIN kb.chunks c ON c.id = f.id
JOIN kb.documents d ON d.id = c.document_id
ORDER BY f.rrf DESC
LIMIT %(top_k)s
"""


async def retrieve(query: str, languages: list[str] | None = None, top_k: int | None = None) -> RetrievalResult:
    s = get_settings()
    languages = languages or ["en"]
    top_k = top_k or s.retrieval_top_k
    qvec = await embed_query(query)
    keys, doc_hint = _article_refs(query)
    cfg = FTS_CONFIG.get(languages[0], "simple")

    async with connection() as conn:
        async with conn.transaction():
            # Filtered HNSW search: keep scanning until enough rows pass the language filter.
            await conn.execute("SET LOCAL hnsw.ef_search = 100")
            await conn.execute("SET LOCAL hnsw.iterative_scan = relaxed_order")
            cur = await conn.execute(_SQL, {
                "qvec": qvec, "langs": languages, "n": s.retrieval_candidates, "cfg": cfg,
                "q": _keyword_query(query) if cfg == "english" else query,
                "keys": keys or ["__none__"], "doc_hint": doc_hint, "rrf_k": RRF_K, "top_k": top_k,
                "vw": VECTOR_WEIGHT, "kw": KEYWORD_WEIGHT, "hw": HEADING_WEIGHT,
            })
            rows = await cur.fetchall()

    result = RetrievalResult(query=query)
    for r in rows:
        vscore = 1 - float(r["dist"])  # true similarity even for rows found only by keyword/exact
        result.chunks.append(RetrievedChunk(
            id=r["id"], document_id=r["document_id"], document_title=r["title"],
            document_short_title=r["short_title"], doc_type=r["doc_type"], law_reference=r["law_reference"],
            source_url=r["source_url"], language=r["language"], section_key=r["section_key"],
            section_ref=r["section_ref"], heading=r["heading"], chapter=r["chapter"],
            page_start=r["page_start"], page_end=r["page_end"], text=r["text"],
            vector_score=vscore, keyword_score=float(r["kscore"]), rrf=float(r["rrf"]), exact_match=r["exact"],
        ))
    result.max_vector_score = max((c.vector_score for c in result.chunks), default=0.0)
    result.keyword_hits = sum(1 for c in result.chunks if c.keyword_score > 0)
    result.exact_matches = sum(1 for c in result.chunks if c.exact_match)
    return result


# --------------------------------------------------------------------------- official translations

MAX_LOCALIZED_WORDS = 700


async def localize(chunks: list[RetrievedChunk], language: str) -> list[RetrievedChunk]:
    """Swap retrieved chunks for the official text in `language` where it exists.

    Gazette laws are printed in Kinyarwanda, English and French; chunks share a
    section_key ("art-16") across languages. Search runs in English; this replaces each
    English article with the same article in the user's language, so answers use RMB's
    official wording and citations point to that version. Documents without a version in
    that language (prospectuses, web pages, FAQ) are kept in English.
    """
    if language == "en" or not chunks:
        return chunks
    keys = [(c.document_id, c.section_key) for c in chunks if c.section_key and c.section_key.startswith("art-")]
    if not keys:
        return chunks
    async with connection() as conn:
        cur = await conn.execute(
            """SELECT document_id, section_key, section_ref, heading, chapter, page_start, page_end, text
               FROM kb.chunks
               WHERE language = %s AND (document_id, section_key) IN (SELECT * FROM unnest(%s::text[], %s::text[]))
               ORDER BY document_id, section_key, chunk_index""",
            (language, [k[0] for k in keys], [k[1] for k in keys]),
        )
        rows = await cur.fetchall()
    parts: dict[tuple[str, str], list[dict]] = {}
    for r in rows:
        parts.setdefault((r["document_id"], r["section_key"]), []).append(r)

    out: list[RetrievedChunk] = []
    seen: set[tuple[str, str]] = set()
    for c in chunks:
        key = (c.document_id, c.section_key)
        found = parts.get(key)
        if not found:
            out.append(c)  # no official version in this language: keep English
            continue
        if key in seen:
            continue       # English article split in parts -> one localized article
        seen.add(key)
        words = " ".join(p["text"] for p in found).split()
        text = " ".join(words[:MAX_LOCALIZED_WORDS]) + (" …" if len(words) > MAX_LOCALIZED_WORDS else "")
        first = found[0]
        out.append(RetrievedChunk(
            id=c.id, document_id=c.document_id, document_title=c.document_title,
            document_short_title=c.document_short_title, doc_type=c.doc_type, law_reference=c.law_reference,
            source_url=c.source_url, language=language, section_key=c.section_key,
            section_ref=first["section_ref"].split(" (part")[0], heading=first["heading"], chapter=first["chapter"],
            page_start=min(p["page_start"] for p in found), page_end=max(p["page_end"] for p in found),
            text=text, vector_score=c.vector_score, keyword_score=c.keyword_score, rrf=c.rrf,
            exact_match=c.exact_match,
        ))
    return out
