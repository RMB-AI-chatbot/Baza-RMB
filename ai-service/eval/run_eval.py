"""Evaluate retrieval (no API key needed) and full answers (needs ANTHROPIC_API_KEY).

    python -m eval.run_eval --retrieval        # hit@k for answerable questions + score distribution
    python -m eval.run_eval --full             # end-to-end through ChatService (calls the models)
    python -m eval.run_eval --full --only m01,t02

Results are written to data/eval_results/<timestamp>-<mode>.md (send to the content analyst).
"""

from __future__ import annotations

import argparse
import re
import asyncio
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

import yaml

from app.chat.safety import guess_language
from app.config import get_settings
from app.db import close_pool
from app.rag.prompts import ANSWER_PROMPT_VERSION, ROUTER_PROMPT_VERSION
from app.rag.retrieval import retrieve

HERE = Path(__file__).resolve().parent


def load(only: set[str] | None):
    qs = yaml.safe_load((HERE / "questions.yaml").read_text(encoding="utf-8"))["questions"]
    return [q for q in qs if not only or q["id"] in only]


def _hit(chunks, expected) -> int | None:
    """1-based rank of the first chunk matching an expected (doc, section) pair."""
    for rank, c in enumerate(chunks, 1):
        for doc, sec in expected:
            if c.document_id == doc and (sec is None or c.section_key == sec):
                return rank
    return None


async def eval_retrieval(qs, k: int) -> str:
    rows, ans_scores, nc_scores, ranks = [], [], [], []
    for q in qs:
        e = q["expect"]
        if e["type"] not in ("answer", "not_covered"):
            continue
        res = await retrieve(q["q"], languages=["en"], top_k=k)
        top = res.chunks[0] if res.chunks else None
        if e["type"] == "answer":
            r = _hit(res.chunks, e["sources"])
            ranks.append(r)
            ans_scores.append(res.max_vector_score)
            status = f"hit@{r}" if r else "MISS"
        else:
            nc_scores.append(res.max_vector_score)
            status = "would answer" if res.confident else "declines"
        rows.append(f"| {q['id']} | {status} | {res.max_vector_score:.3f} | {res.confident} | "
                    f"{(top.document_short_title + ' ' + (top.section_ref or '')) if top else '-'} | {q['q']} |")

    n = len(ranks)
    hit1 = sum(1 for r in ranks if r == 1) / n if n else 0
    hitk = sum(1 for r in ranks if r) / n if n else 0
    mrr = sum(1 / r for r in ranks if r) / n if n else 0
    floor = get_settings().min_vector_score
    false_decline = sum(1 for s in ans_scores if s < floor)
    lines = [
        f"# Retrieval evaluation ({datetime.now():%Y-%m-%d %H:%M})",
        f"embedding: {get_settings().embedding_model} | top_k={k} | min_vector_score={floor}",
        "",
        f"- answerable questions: {n} | hit@1 **{hit1:.0%}** | hit@{k} **{hitk:.0%}** | MRR {mrr:.2f}",
        f"- answerable max-score: min {min(ans_scores, default=0):.3f} / median {statistics.median(ans_scores or [0]):.3f}",
        f"- not-covered max-score: min {min(nc_scores, default=0):.3f} / median {statistics.median(nc_scores or [0]):.3f} / max {max(nc_scores, default=0):.3f}",
        f"- answerable below floor (would be refused before generation): {false_decline}",
        "",
        "| id | result | max score | confident | top chunk | question |",
        "|---|---|---|---|---|---|",
        *rows,
    ]
    return "\n".join(lines)


async def eval_full(qs) -> str:
    from app.chat.service import ChatService

    rows, ok_count, latencies = [], 0, []
    for q in qs:
        e = q["expect"]
        t0 = time.monotonic()
        final = None
        # Multi-turn tests: earlier user messages ("turns") run first in the same session.
        sid = None
        for prev in q.get("turns", []):
            async for name, data in ChatService().handle(prev, sid, "en", "eval"):
                if name == "final":
                    sid = data["session_id"]
        async for name, data in ChatService().handle(q["q"], sid, "en", "eval"):
            if name == "final":
                final = data
        latencies.append(time.monotonic() - t0)
        action, answer = final["action"], final["answer"]
        if e["type"] == "answer":
            cited = {(s["document_id"], None) for s in final["sources"]}
            exp_docs = {d for d, _ in e["sources"]}
            ok = action == "none" and any(d in exp_docs for d, _ in cited) and "[" in answer
            flat = re.sub(r"[\s\-‐-― ]+", " ", answer.lower())  # "tax‑clearance" == "tax clearance"
            for frag in e.get("must_include", []):
                ok = ok and re.sub(r"[\s\-]+", " ", frag.lower()) in flat
            if e.get("lang"):
                ok = ok and final["language"] == e["lang"] and guess_language(answer, "en") == e["lang"]
        elif e["type"] == "not_covered":
            ok = action == "not_covered"
        elif e["type"] == "declines":  # either "not in my documents" or "outside my scope": never an answer
            ok = action == "not_covered" or final["intent"] == "out_of_scope"
        else:
            ok = (("intent" not in e or final["intent"] == e["intent"]) and
                  ("action" not in e or action == e["action"]))
        ok_count += ok
        src = "; ".join(f"{s['short_title']} {s.get('section') or ''}" for s in final["sources"])
        short = answer.replace("\n", " ")[:220]
        rows.append(f"| {q['id']} | {'PASS' if ok else 'FAIL'} | {final['intent']} | {action} | {src} | {short} |")

    lines = [
        f"# End-to-end evaluation ({datetime.now():%Y-%m-%d %H:%M})",
        f"answer model: {get_settings().answer_model} (effort {get_settings().answer_effort}) | "
        f"router: {get_settings().router_model} | prompts: {ANSWER_PROMPT_VERSION}, {ROUTER_PROMPT_VERSION}",
        "",
        f"- pass rate: **{ok_count}/{len(qs)}** | median latency {statistics.median(latencies):.1f}s",
        "",
        "| id | result | intent | action | sources | answer (start) |",
        "|---|---|---|---|---|---|",
        *rows,
    ]
    return "\n".join(lines)


async def main():
    p = argparse.ArgumentParser()
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--retrieval", action="store_true")
    g.add_argument("--full", action="store_true")
    p.add_argument("-k", type=int, default=6)
    p.add_argument("--only")
    a = p.parse_args()
    qs = load(set(a.only.split(",")) if a.only else None)
    report = await (eval_retrieval(qs, a.k) if a.retrieval else eval_full(qs))
    await close_pool()
    out = get_settings().data_dir / "eval_results" / f"{datetime.now():%Y%m%d-%H%M}-{'retrieval' if a.retrieval else 'full'}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report, encoding="utf-8")
    print(report)
    print(f"\nsaved to {out}")


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
