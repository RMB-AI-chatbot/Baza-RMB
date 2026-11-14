"""Chat orchestration: one user message in, a stream of events out.

Pipeline (each step can end the turn early):

  1. Session + history                 (store.py)
  2. Strong emergency patterns          -> emergency contacts, no model call   (safety.py)
  3. Router model: language, intent, standalone question, category            (Haiku)
  4. Intent dispatch:
       emergency            -> contacts
       complaint/report/... -> case-intake form                               (forms.py)
       legal_interpretation -> relevant provisions + handover form, no generation
       greeting/out_of_scope/abusive -> fixed text
       question             -> 5
  5. Hybrid retrieval; weak evidence    -> "not covered" + enquiry form, logged as unanswered
  6. Answer model streams a cited answer; it may still reply <<NOT_COVERED>>
  7. Persist assistant message with sources, scores, tokens, latency

Events yielded (also the SSE event names):
  meta   {session_id, language, intent, category}
  delta  {text}
  final  {ChatResponse fields}
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import asdict, dataclass, field
from typing import Any, AsyncIterator

from app.chat import forms, store
from app.chat.citations import CitationNormalizer
from app.chat.safety import (guess_language, has_weak_emergency_signal, is_strong_emergency, looks_like_injection,
                             mentions_urgency)
from app.chat.texts import t
from app.config import get_settings
from app.llm import LLMError, get_llm
from app.rag import prompts
from app.rag.retrieval import RetrievalResult, localize, retrieve
from app import settings_store

log = logging.getLogger(__name__)
NL = chr(10)

NOT_COVERED = "<<NOT_COVERED>>"
_CITE_RE = re.compile(r"\[(\d{1,2})\]")
_HOW_ARE_YOU = re.compile(r"\b(how are (you|u)|how r u|how's it going|how do you do|ça va|comment (vas-tu|allez-vous)|"
                          r"amakuru|bite|mumeze mute|umeze ute)\b", re.IGNORECASE)
REGULATORY_TYPES = {"law", "regulation"}


@dataclass
class ChatResult:
    session_id: str
    message_id: int | None = None
    answer: str = ""
    language: str = "en"
    intent: str = "question"
    category: str = "general"
    action: str = "none"            # none | form | emergency | handover | not_covered
    sources: list[dict] = field(default_factory=list)
    disclaimer: str | None = None
    form: dict | None = None
    emergency_contacts: list[dict] | None = None
    notice: str | None = None       # e.g. language note

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class _Route:
    language: str
    intent: str
    standalone_question: str
    category: str
    usage: Any = None


async def _route(message: str, hist: list[dict], language_hint: str | None) -> _Route:
    # Give the classifier what each turn WAS (intent, what was searched), not just the text,
    # so follow-ups ("in mining", "I don't have a phone") are read in context.
    lines = []
    for m in hist[-8:]:
        if m["role"] == "user":
            lines.append(f"USER: {m['content'][:500]}")
        else:
            tag = m.get("intent") or "answer"
            if m.get("action") and m["action"] != "none":
                tag += f"/{m['action']}"
            q = f" (searched: {m['standalone_query']})" if m.get("standalone_query") else ""
            lines.append(f"ASSISTANT [{tag}]{q}: {m['content'][:300]}")
    convo = "\n".join(lines)
    user = (f"<conversation>\n{convo}\n</conversation>\n\n" if convo else "") + \
           f"<latest_user_message>\n{message}\n</latest_user_message>"
    try:
        data, usage = await get_llm().classify(prompts.router_system(), user, prompts.ROUTER_SCHEMA)
        return _Route(data["language"], data["intent"], data.get("standalone_question") or message,
                      data.get("category", "general"), usage)
    except (LLMError, KeyError) as e:
        log.warning("router failed (%s); falling back to question intent", e)
        return _Route(language_hint or "en", "question", message, "general")


def _answer_language(lang: str) -> str:
    return lang if lang in get_settings().answer_languages else "en"


def _sources_for(chunks, cited: set[int]) -> list[dict]:
    out, seen = [], set()
    for i, c in enumerate(chunks, 1):
        if cited and i not in cited:
            continue
        cit = c.citation()
        cit["n"] = i
        key = (cit["document_id"], cit["section"])
        if key in seen:
            continue
        seen.add(key)
        out.append(cit)
    return out


class ChatService:
    def __init__(self):
        self.s = get_settings()

    async def handle(self, message: str, session_id: str | None, language_hint: str | None,
                     client_hash: str | None) -> AsyncIterator[tuple[str, dict]]:
        started = time.monotonic()
        message = message.strip()[: self.s.max_message_chars]
        sid = await store.get_or_create_session(session_id, client_hash, language_hint)
        hist = await store.history(sid, self.s.max_history_turns)
        user_msg_id = await store.add_message(sid, "user", message, language=language_hint)
        settings = await settings_store.get_all()
        result = ChatResult(session_id=sid, language=language_hint or "en")

        # --- 2. strong emergency: no model call at all
        if is_strong_emergency(message):
            result.intent, result.category = "emergency", "health_safety"
            result.language = guess_language(message, language_hint or "en")
            async for ev in self._finish_emergency(result, settings, started, user_msg_id, hist):
                yield ev
            return

        # --- 3. route
        route = await _route(message, hist, language_hint)
        result.language, result.intent, result.category = route.language, route.intent, route.category
        if route.intent == "question" and looks_like_injection(message):
            log.info("possible prompt injection in session %s", sid)
        yield "meta", {"session_id": sid, "language": route.language, "intent": route.intent, "category": route.category}

        ans_lang = _answer_language(route.language)
        if ans_lang != route.language:
            result.notice = t("language_note", route.language if route.language in ("fr", "rw", "sw") else "other")

        # --- 4. dispatch
        last_bot = next((m for m in reversed(hist) if m["role"] == "assistant"), None)
        after_emergency = bool(last_bot and last_bot.get("action") == "emergency")
        if after_emergency and route.intent in ("out_of_scope", "abusive") and len(message) < 200:
            # Safety net: right after an emergency, a short reply is about that emergency
            # ("I don't have a phone"), never brushed off as off-topic. A greeting or thanks
            # ("how are you", "thank you") is answered as one, with the numbers kept visible.
            route.intent = "emergency"
            result.intent, result.category = "emergency", "health_safety"
        if route.intent == "emergency":
            async for ev in self._finish_emergency(result, settings, started, user_msg_id, hist):
                yield ev
            return
        if route.intent == "question" and has_weak_emergency_signal(message):
            # e.g. "what should a company do after a spill?": answer, but keep contacts visible
            result.emergency_contacts = settings.get("emergency_contacts")
        if route.intent == "about_assistant":
            async for ev in self._about_assistant(result, started, route, hist, message, ans_lang):
                yield ev
            return
        if route.intent in forms.INTENT_TO_FORM:
            form_type = forms.INTENT_TO_FORM[route.intent]
            prefill = {"description": message} if form_type in ("grievance", "illegal_mining_report") else {}
            result.action, result.form = "form", forms.form_payload(form_type, prefill, ans_lang)
            result.answer = t("form_intro", ans_lang)
            if mentions_urgency(message):
                # "Emergency! someone is mining in my field": the report form, plus the numbers
                # in case anyone is in danger.
                result.answer = t("form_intro_urgent", ans_lang)
                result.emergency_contacts = settings.get("emergency_contacts")
            async for ev in self._finish(result, started, route):
                yield ev
            return
        if route.intent in ("greeting", "out_of_scope", "abusive"):
            already_greeted = any(m["role"] == "assistant" for m in hist)
            key = "greeting_again" if route.intent == "greeting" and already_greeted else route.intent
            if route.intent == "greeting" and _HOW_ARE_YOU.search(message):
                key = "how_are_you"
            result.answer = t(key, ans_lang)
            if after_emergency and route.intent == "greeting":
                result.emergency_contacts = settings.get("emergency_contacts")
            async for ev in self._finish(result, started, route):
                yield ev
            return
        if route.intent == "legal_interpretation":
            res = await retrieve(route.standalone_question, languages=["en"], top_k=4)
            res.chunks = await localize(res.chunks, ans_lang)
            result.action = "handover"
            result.answer = t("legal_handover", ans_lang)
            result.sources = _sources_for(res.chunks[:3], set()) if res.confident else []
            result.disclaimer = t("disclaimer", ans_lang)
            result.form = forms.form_payload("legal_question", {"question": message}, ans_lang)
            async for ev in self._finish(result, started, route, top_score=res.max_vector_score):
                yield ev
            return

        # --- 5. retrieval
        res = await retrieve(route.standalone_question, languages=["en"])
        floor = settings.get("min_vector_score") or self.s.min_vector_score
        confident = res.confident if floor == self.s.min_vector_score else (
            res.max_vector_score >= floor or res.exact_matches > 0)
        if not res.chunks or not confident:
            async for ev in self._not_covered(result, started, route, res, ans_lang, message, "low_confidence"):
                yield ev
            return

        # Official French/Kinyarwanda wording of the same articles, when the law has it.
        res.chunks = await localize(res.chunks, ans_lang)

        # --- 6. generate
        system = prompts.answer_system(ans_lang, settings.get("persona_note") or None)
        convo = [m for m in hist if m.get("action") not in ("emergency",)][-4:]
        messages: list[dict] = []
        for m in convo:
            role = "user" if m["role"] == "user" else "assistant"
            if messages and messages[-1]["role"] == role:
                continue
            messages.append({"role": role, "content": m["content"][:1500]})
        if messages and messages[0]["role"] != "user":
            messages.pop(0)
        if messages and messages[-1]["role"] == "user":
            messages.pop()
        messages.append({"role": "user", "content": (
            f"{prompts.format_sources(res.chunks)}\n\n"
            f"Question: {message}\n"
            + (f"(Search query used: {route.standalone_question})\n" if route.standalone_question != message else "")
        )})

        stream = None
        cites = CitationNormalizer()
        buf, decided, answer, not_covered = "", False, "", False
        try:
            stream = get_llm().stream_answer(system, messages)
            async for delta in stream:
                if not decided:
                    buf += delta
                    stripped = buf.lstrip()
                    if stripped.startswith(NOT_COVERED[: len(stripped)]) and len(stripped) < len(NOT_COVERED):
                        continue  # could still be the sentinel
                    decided = True
                    if stripped.startswith(NOT_COVERED):
                        not_covered = True
                        continue
                    out = cites.feed(buf)
                elif not not_covered:
                    out = cites.feed(delta)
                else:
                    continue
                if out:
                    answer += out
                    yield "delta", {"text": out}
            tail = cites.flush()
            if tail and not not_covered:
                answer += tail
                yield "delta", {"text": tail}
        except LLMError as e:
            log.error("generation failed: %s", e)
            result.answer = t("error", ans_lang)
            result.action = "none"
            async for ev in self._finish(result, started, route, top_score=res.max_vector_score,
                                         unanswered_reason="error", question=message):
                yield ev
            return

        if not decided and buf.strip().startswith(NOT_COVERED):
            not_covered = True
        answer = answer.replace(NOT_COVERED, "").strip()
        if not_covered or not answer:
            async for ev in self._not_covered(result, started, route, res, ans_lang, message, "not_covered",
                                              usage=stream.usage):
                yield ev
            return

        cited = {int(n) for n in _CITE_RE.findall(answer) if 0 < int(n) <= len(res.chunks)}
        if not cited:
            log.warning("answer without citations (session %s)", sid)
        result.answer = answer
        result.sources = _sources_for(res.chunks, cited) if cited else _sources_for(res.chunks[:2], set())
        cited_chunks = [res.chunks[i - 1] for i in cited] if cited else res.chunks[:2]
        if any(c.doc_type in REGULATORY_TYPES for c in cited_chunks):
            result.disclaimer = t("disclaimer", ans_lang)
        async for ev in self._finish(result, started, route, top_score=res.max_vector_score, usage=stream.usage,
                                     answered=True):
            yield ev

    # ------------------------------------------------------------------ helpers

    async def _about_assistant(self, result: ChatResult, started: float, route: _Route, hist: list[dict],
                               message: str, lang: str):
        """Questions about the assistant / this conversation / feedback on its replies.
        Answered from a fixed fact sheet plus the recent conversation: no documents, forms or citations."""
        msgs: list[dict] = []
        for m in hist[-6:]:
            role = "user" if m["role"] == "user" else "assistant"
            text = m["content"][:800]
            if role == "assistant":
                text = re.sub(r"\[\d{1,2}\]", "", text)
                if m.get("sources"):
                    text += NL + "(Sources cited in this reply: " + "; ".join(
                        f"{s.get('short_title')}, {s.get('section') or ''}".strip(", ") for s in m["sources"]) + ")"
                if m.get("action") == "form":
                    text += NL + "(A form was shown with this reply.)"
            if msgs and msgs[-1]["role"] == role:
                msgs[-1]["content"] += NL + text
            else:
                msgs.append({"role": role, "content": text})
        while msgs and msgs[0]["role"] != "user":
            msgs.pop(0)
        if msgs and msgs[-1]["role"] == "user":
            msgs[-1]["content"] += NL + message
        else:
            msgs.append({"role": "user", "content": message})
        answer = ""
        stream = None
        try:
            stream = get_llm().stream_answer(prompts.assistant_system(lang), msgs)
            async for delta in stream:
                delta = re.sub(r"\[\d{1,2}\]|【[^】]*】", "", delta)
                if delta:
                    answer += delta
                    yield "delta", {"text": delta}
        except LLMError as e:
            log.warning("about-assistant reply failed: %s", e)
        result.answer = answer.strip() or t("about_fallback", lang)
        result.action = "none"
        async for ev in self._finish(result, started, route, usage=getattr(stream, "usage", None)):
            yield ev

    async def _not_covered(self, result: ChatResult, started: float, route: _Route, res: RetrievalResult,
                           lang: str, question: str, reason: str, usage=None):
        result.action = "not_covered"
        result.answer = t("not_covered", lang)
        result.form = forms.form_payload("general_enquiry", {"question": question}, lang)
        async for ev in self._finish(result, started, route, top_score=res.max_vector_score, usage=usage,
                                     unanswered_reason=reason, question=question):
            yield ev

    async def _finish_emergency(self, result: ChatResult, settings: dict, started: float, user_msg_id: int,
                                hist: list[dict] | None = None):
        result.action = "emergency"
        lang = _answer_language(result.language)
        follow_up = any(m["role"] == "assistant" and m.get("action") == "emergency" for m in (hist or [])[-4:])
        result.answer = t("emergency_followup" if follow_up else "emergency", lang)
        result.emergency_contacts = settings.get("emergency_contacts")
        async for ev in self._finish(result, started, None):
            yield ev

    async def _finish(self, result: ChatResult, started: float, route: _Route | None, *, top_score: float | None = None,
                      usage=None, answered: bool = False, unanswered_reason: str | None = None,
                      question: str | None = None):
        latency = int((time.monotonic() - started) * 1000)
        result.message_id = await store.add_message(
            result.session_id, "assistant", result.answer,
            language=result.language, intent=result.intent, category=result.category, action=result.action,
            standalone_query=route.standalone_question if route else None,
            sources=result.sources or None, top_score=top_score, answered=answered,
            model=getattr(usage, "model", None), input_tokens=getattr(usage, "input_tokens", None),
            output_tokens=getattr(usage, "output_tokens", None), latency_ms=latency,
        )
        if unanswered_reason:
            await store.add_unanswered(result.message_id, question or "", result.language, result.category,
                                       unanswered_reason, top_score)
        yield "final", result.to_dict()
