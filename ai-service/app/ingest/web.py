"""Fetch and clean a web page (e.g. RMB's geohazards monitoring page) into blocks."""

from __future__ import annotations

import hashlib

import httpx
from bs4 import BeautifulSoup

from app.ingest.pdf_extract import Block

USER_AGENT = "baza-rmb-ingest/0.1 (+knowledge-base refresh)"

_CONTENT_TAGS = ["h1", "h2", "h3", "h4", "h5", "p", "li", "td", "th", "blockquote"]


def fetch_html(url: str, timeout: float = 30.0) -> str:
    with httpx.Client(timeout=timeout, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as c:
        r = c.get(url)
        r.raise_for_status()
        return r.text


def html_to_blocks(html: str) -> tuple[list[Block], str | None]:
    """Return content blocks (headings marked bold) and the page title."""
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(strip=True) if soup.title else None
    for tag in soup(["script", "style", "noscript", "nav", "header", "footer", "form", "aside", "iframe", "svg"]):
        tag.decompose()
    root = (soup.find("main") or soup.find(attrs={"role": "main"}) or soup.find(id="content")
            or soup.find(class_="main-content") or soup.body or soup)

    blocks: list[Block] = []
    seen: set[str] = set()
    for el in root.find_all(_CONTENT_TAGS):
        # skip containers whose text is already captured by a nested content tag
        if el.find(_CONTENT_TAGS):
            continue
        text = " ".join(el.get_text(" ", strip=True).split())
        if not text or text in seen:
            continue
        seen.add(text)
        blocks.append(Block(page=1, text=text, bold=el.name.startswith("h")))
    return blocks, title


def content_hash(blocks: list[Block]) -> str:
    return hashlib.sha256("\n".join(b.text for b in blocks).encode()).hexdigest()
