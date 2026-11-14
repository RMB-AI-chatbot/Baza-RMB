# Baza-RMB: frontend integration guide

For **Nancy** (chat widget) and **Blaise** (admin dashboard).
Everything here is tested against the running backend; the JSON examples are real responses.

- Part A: [Run the backend locally](#a-run-the-backend-locally)
- Part B: [Chat widget](#b-chat-widget) (public API)
- Part C: [Admin dashboard](#c-admin-dashboard) (staff API)
- Part D: [Figma: what to change](#d-figma-what-to-change)

Working reference implementations (plain HTML/JS, copy freely):
`web/index.html` (chat) and `web/admin.html` (every admin call).

---

## A. Run the backend locally

Needs Docker Desktop, PHP 8.2+ and the Python environment (see the main README).

```powershell
cd baza-rmb
.\dev.ps1
```

| URL | What |
|---|---|
| http://127.0.0.1:8000 | test chat page (`web/index.html`) |
| http://127.0.0.1:8000/admin.html | admin test page (paste `ADMIN_API_KEY` from `.env`) |
| http://127.0.0.1:8000/docs | interactive API docs (OpenAPI) |
| http://127.0.0.1:8000/openapi.json | machine-readable spec (generate a client from it if you like) |

Your own dev server on another port must be listed in `CORS_ORIGINS` in `.env`
(comma-separated, e.g. `http://localhost:5173`), then restart `dev.ps1`.

The LLM is on Groq's **free tier** in development: about 2 answers per minute. If you click fast you will
see slow replies or a 429; that is the plan's limit, not your code.

---

## B. Chat widget

### B1. How it is embedded

The widget must work on any page (mock RMB page now, TYPO3 later) with **no build step on the host page**
and **no hard-coded URLs**. Suggested embed:

```html
<script src="https://chat.rmb.gov.rw/widget/baza-widget.js"
        data-api-base="https://chat.rmb.gov.rw/api/v1"
        data-lang="en" defer></script>
```

Use Shadow DOM so RMB's site CSS cannot break the widget (and vice versa).

### B2. Endpoints (public)

| Method | Path | Purpose |
|---|---|---|
| GET | `/widget-config?lang=en` | name, welcome text, suggestion chips, contacts |
| POST | `/chat` | send a message (JSON or streaming) |
| POST | `/cases` | submit a form returned by `/chat` |
| GET | `/cases/{reference}` | check the status of a request |
| POST | `/feedback` | thumbs up / down on an answer |
| GET | `/health` | `{"status":"ok"}` |

All paths are under `data-api-base` (e.g. `/api/v1/chat`). Bodies are JSON (`Content-Type: application/json`).

### B3. On open: `GET /widget-config`

```json
{
  "assistant_name": "Baza-RMB",
  "enabled": true,
  "welcome_message": "Hello! I'm Baza-RMB. Ask me about mining licences, the mining, tax and petroleum laws, investment opportunities or geohazards.",
  "suggestions": ["What types of mining licences exist?", "What are the mining royalty tax rates?",
                  "How can I report illegal mining?", "What investment opportunities exist in the Lake Kivu Basin?"],
  "languages": ["en", "fr", "rw"],
  "contacts": {"email": "info@rmb.gov.rw", "phone": "+250 788 386 220", "toll_free": "2930",
               "address": "KN 3 Avenue, Nyarugenge, Kigali - P.O. Box 937, Kigali", "website": "https://www.rmb.gov.rw"}
}
```

- `enabled: false` -> hide the launcher button (RMB can switch the bot off from the dashboard).
- Show `welcome_message` as the first bot bubble and `suggestions` as chips (a click sends the chip text).
- Do not hard-code these texts; RMB edits them in Settings.
- Call it with the UI language (`?lang=fr`, `?lang=rw`) and call it again when the user switches language.

### B4. Sending a message: `POST /chat`

Request:

```json
{ "message": "How long is a petroleum exploration licence valid?",
  "session_id": null,
  "language": "en",
  "stream": true }
```

| Field | Rule |
|---|---|
| `message` | 1-4000 characters (only the first 2000 are used: limit the input box to 2000) |
| `session_id` | `null` on the first message; afterwards **always send back the `session_id` from the last response** |
| `language` | the UI language (`en`, `fr`, `rw`). The bot answers in the language the person **writes in** (detected), so a Kinyarwanda question gets a Kinyarwanda answer even if the UI is in English; `language` is used when detection is impossible (e.g. emergencies, very short messages) |
| `stream` | `true` for the typing effect (recommended); `false` returns one JSON object |

**`session_id` is what makes follow-ups work.** "Can it be renewed?" only makes sense if the server knows the
previous question. Keep the id in memory (or `sessionStorage`) for the open conversation, send it on every
message, and **always replace it with the one in the response**: sessions expire after 2 hours of inactivity
and the server then starts a new one. "New chat" = forget the id. Do not store it across visits (RMB's privacy
choice: no memory between visits).

### B5. Response (`stream: false`), and the `final` event when streaming

```json
{
  "session_id": "f3c53e00-5486-406b-a716-9a7c028bb8f9",
  "message_id": 344,
  "answer": "A petroleum exploration licence is valid for three (3) years, after which it may be renewed. [1]",
  "language": "en",
  "intent": "question",
  "category": "petroleum_gas",
  "action": "none",
  "sources": [{
    "n": 1,
    "document_id": "law-13-2016-petroleum",
    "document": "Law n° 13/2016 of 02/05/2016 governing petroleum exploration and production activities",
    "short_title": "Petroleum Law (n° 13/2016)",
    "section": "Article 9",
    "heading": "Article 9: Validity period for the exploration license",
    "page": "12",
    "url": "https://www.rmb.gov.rw/fileadmin/user_upload/RMB/Publications/Laws/Petroleum_Law_230628_221132.pdf#page=12",
    "language": "en"
  }],
  "disclaimer": "General information from official documents, not legal advice. The official Gazette texts and RMB officers are authoritative.",
  "form": null,
  "emergency_contacts": null,
  "notice": null
}
```

### B6. Streaming (Server-Sent Events)

`EventSource` cannot send a POST body, so read the stream with `fetch`:

```js
async function ask(apiBase, message, sessionId, onDelta) {
  const res = await fetch(`${apiBase}/chat`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({message, session_id: sessionId, language: "en", stream: true}),
  });
  if (!res.ok) {                              // 429, 422, 500: body is {"detail": "..."}
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "The assistant is unavailable. Please try again.");
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", final = null;
  for (;;) {
    const {value, done} = await reader.read();
    if (done) break;
    buf += dec.decode(value, {stream: true});
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {   // one event per blank-line-separated block
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const event = block.match(/^event: (.*)$/m)?.[1];
      const data = JSON.parse(block.match(/^data: (.*)$/m)?.[1] || "{}");
      if (event === "meta")  { /* data.session_id, data.intent: e.g. show a typing indicator */ }
      if (event === "delta") onDelta(data.text);          // append text as it arrives
      if (event === "final") final = data;                 // full response, same shape as B5
      if (event === "error") throw new Error(data.message);
    }
  }
  return final;
}
```

Events, in order:

| Event | Data | Notes |
|---|---|---|
| `meta` | `{session_id, language, intent, category}` | usually first; **may be missing** (clear emergencies go straight to `final`), so never wait for it |
| `delta` | `{text}` | 0..n pieces of the answer. **There may be none** (forms, "not covered", greetings) |
| `final` | the full response (B5) | always last on success |
| `error` | `{message}` | something failed mid-stream; show `message` |

**When `final` arrives, replace the streamed text with `final.answer`** and render everything from `final`.
It is the authoritative text, and it is what you show when no `delta` came at all.

Real stream (shortened):

```
event: meta
data: {"session_id": "823b25b9-…", "language": "en", "intent": "question", "category": "licensing"}

event: delta
data: {"text": "Yes"}

event: delta
data: {"text": ". A mining licence may be renewed"}
…
event: final
data: { …full response… }
```

Time to first text is usually 2-5 s (longer on the free tier when busy): show a typing indicator from send until
the first `delta` or `final`.

### B7. Rendering a response: switch on `action`

| `action` | Show |
|---|---|
| `none` | `answer` + sources + `disclaimer` (when not null) |
| `not_covered` | `answer` ("I don't have that information yet…") + the `form` (general enquiry) |
| `form` | `answer` (short intro) + the `form` (complaint, illegal-mining report, meeting, data request, status lookup) |
| `handover` | `answer` + `sources` (relevant provisions, no interpretation) + `disclaimer` + the `form` (legal question) |
| `emergency` | `answer` + **`emergency_contacts` as large, tappable phone links** (`tel:`); show it prominently (red/alert style) |

Also, for every action:

- `language` in the response: the language of the answer (`en`, `fr`, `rw`). Use it for the bubble's `lang` attribute.
- `notice` (string or null): show as a small line under the answer (e.g. "For now I answer in English only" for Swahili).
- `emergency_contacts` can also be set when `action` is `none` (safety question): show them as a small box.
- Contacts with `"placeholder": true` are examples until RMB confirms them; keep showing them, RMB will update
  the values in Settings.

**Answer text.** It can contain simple Markdown: `**bold**`, `- ` bullet lists, `1. ` numbered lists, line breaks.
Escape HTML first, then render this small subset (or use a Markdown library with HTML disabled).
Never inject `answer` as raw HTML.

**Citations.** The answer contains markers like `[1]` or `[1][3]`. Each matches `sources[k].n`.
Render them as small superscript links; clicking opens `sources[k].url` (it jumps to the PDF page) in a new tab.
Below the answer, list the sources:

> **Sources**
> [1] Petroleum Law (n° 13/2016), Article 9, p. 12

`url` can be null (e.g. "RMB Official FAQ" entries): show the source without a link. `page` can be null too.
For French and Kinyarwanda answers, law sources are the **official version in that language** from the Gazette
(`sources[k].language` = `fr` / `rw`, e.g. section "Ingingo ya 13"); the PDF link opens the trilingual Gazette page.

**Disclaimer.** When `disclaimer` is not null, show it under the sources (small, muted). It is required
by RMB's governance rules for answers based on laws.

**Feedback.** Under each answer with `message_id`, show 👍 / 👎:

```http
POST /feedback
{"session_id": "…", "message_id": 344, "rating": 1, "comment": null}     -> 204   (rating: 1 or -1)
```

### B8. Forms

When `form` is not null, render it from its definition; never hard-code form fields. Real example
(`action: "form"` after "I want to report illegal mining near the river in my village"):

```json
{
  "type": "illegal_mining_report",
  "title": "Report illegal mining (confidential)",
  "anonymous_allowed": true,
  "anonymous_default": true,
  "confidential": true,
  "lookup": false,
  "fields": [
    {"name": "description", "label": "What did you see?", "type": "textarea", "required": true, "max_length": 3000, "contact": false},
    {"name": "location", "label": "Location (district, sector, village)", "type": "text", "required": true, "max_length": 200, "contact": false},
    {"name": "date", "label": "When?", "type": "date", "required": false, "max_length": null, "contact": false},
    {"name": "name", "label": "Your name", "type": "text", "required": false, "max_length": 120, "contact": true},
    {"name": "phone", "label": "Phone number", "type": "tel", "required": false, "max_length": 30, "contact": true},
    {"name": "email", "label": "Email", "type": "email", "required": false, "max_length": 160, "contact": true}
  ],
  "prefill": {"description": "I want to report illegal mining near the river in my village"}
}
```

Rendering rules:

- `type`: `text`, `textarea`, `email`, `tel`, `date` -> matching inputs; enforce `required` and `max_length`.
- `title` and `label` come translated (French/Kinyarwanda) when the conversation is in that language; field `name`s never change.
- `prefill`: initial values (the user's own words).
- `anonymous_allowed`: show a "Stay anonymous" checkbox, checked by default when `anonymous_default` is true.
  **When anonymous is checked, hide the fields with `contact: true`** (the server drops them anyway).
- `confidential: true`: show a short reassurance ("Your report is confidential").
- `lookup: true` (type `case_status`): this is not a new case; it asks for a reference number and calls
  `GET /cases/{reference}` instead of `POST /cases`.

Submit:

```http
POST /cases
{"session_id": "a6c6cad8-…", "type": "illegal_mining_report", "anonymous": true,
 "fields": {"description": "Night digging by the river", "location": "Rulindo"}}
```

`fields` holds only field names from the form; leave out empty optional fields. Responses:

| Status | Body | Show |
|---|---|---|
| 201 | `{"reference_number": "RMB-2026-MS8BN5", "routed_to": "…", "expected_response_time": "…", "message": "Your request has been registered. Your reference number is RMB-2026-MS8BN5. Keep it to check the status."}` | `message`, with the reference number large and copyable |
| 422 | `{"detail": "this request cannot be anonymous"}` (or a missing/too-long field) | `detail` next to the form |
| 429 | `{"detail": "You're sending messages very quickly…"}` | `detail` |
| 502 | `{"detail": "Your request could not be registered right now…"}` | `detail`; keep the form filled so they can retry |

`routed_to` and `expected_response_time` end in "(example)" until RMB confirms its routing table.

Status lookup:

```http
GET /cases/RMB-2026-MS8BN5
-> 200 {"reference_number": "RMB-2026-MS8BN5", "type": "grievance", "status": "new",
        "routed_to": "Complaints / community relations officer (example)",
        "created_at": "2026-11-14T06:38:42+00:00", "updated_at": "2026-11-14T06:38:42+00:00"}
-> 404 not found · 422 invalid format (expected RMB-YYYY-XXXXXX)
```

Status values: `new`, `assigned`, `in_progress`, `waiting_for_user`, `resolved`, `closed`. Show friendly labels.

### B9. Errors and limits

- Every error body is `{"detail": "<message for the user>"}` (422 validation errors from FastAPI can have a list
  in `detail`: show a generic "Please check your message").
- Rate limits per visitor: 20 messages/minute and 300/day (plus nginx limits). On **429** show `detail` and
  disable the send button for ~30 s.
- No network / 5xx: "The assistant is unavailable right now. You can contact RMB at info@rmb.gov.rw or 2930"
  (take the contacts from `/widget-config`).
- One request at a time: disable "send" while an answer is streaming.

### B10. Widget checklist

- [ ] Launcher bubble, open/close, mobile full-screen, keyboard accessible, `aria-live` on the message list
- [ ] `/widget-config` on open (respect `enabled`)
- [ ] `session_id` kept per conversation and replaced from every response; "New chat" clears it
- [ ] Streaming with typing indicator; replace with `final.answer` at the end
- [ ] Markdown subset, HTML escaped; `[n]` -> superscript links; sources list; disclaimer
- [ ] All five `action`s; emergency contacts as `tel:` links
- [ ] Forms rendered from definitions; anonymity hides contact fields; lookup form; reference number shown
- [ ] Feedback buttons; 429 / 5xx handling; input limited to 2000 characters
- [ ] No hard-coded URLs or texts; works inside Shadow DOM on the mock RMB page

---

## C. Admin dashboard

### C1. Architecture: the browser never talks to the admin API

```
Staff browser ──HTTPS──► Admin portal (PHP: login, roles, 2FA, sessions)
                                │ server-side calls, internal network only
                                ├──► AI service   http://ai:8000/api/v1/admin/*   header  X-Admin-Key: <ADMIN_API_KEY>
                                └──► Case service http://cases:80/api/v1/*        header  Authorization: Bearer <CASE_SERVICE_TOKEN>
```

- `ADMIN_API_KEY` gives full admin access: **keep it on the server** (portal config/env), never in JavaScript.
  The public nginx returns 404 for `/api/v1/admin` (and for `admin.html`).
- The portal owns staff accounts, roles, 2FA, session timeout, IP allow-listing (Figma "Users & Roles" and
  "Security & Audit"). The AI API has no user accounts.
- Wherever the API asks for a person (`actor`, `created_by`, `updated_by`, `uploaded_by`), **send the
  logged-in staff member's name or email from the portal session**, not a free-text box. The audit trail and the
  FAQ four-eyes rule depend on it.
- Cases: call the AI service's `/api/v1/admin/cases*` (it forwards to the case service) or the case service
  directly; same data. Using only the AI service keeps one key and one base URL.

All paths below are under `/api/v1/admin`. Dates are ISO 8601 (`2026-11-14T10:11:54+00:00`).
Errors: `{"detail": "..."}` with 401 (bad key), 404, 422 (validation, rule broken), 502 (case service down).

### C2. Figma screen -> endpoint

| Figma screen / element | Endpoint | Field(s) |
|---|---|---|
| **Dashboard** cards: Total conversations | `GET /analytics/summary?days=30` | `totals.conversations` |
| AI response rate | same | `totals.answer_rate` (share of information questions answered from documents) |
| Average latency | same | `totals.median_latency_ms` (also `p90_latency_ms`) |
| Conversation & active user trends | same | `daily[]` (`day`, `conversations`, `questions`) |
| Most requested topics (donut) | same | `by_category[]` (`category`, `n`) |
| Recent conversations table | `GET /conversations?limit=6` | `first_question`, `category`, `created_at`; "History" -> `GET /conversations/{session_id}` |
| **Conversations** list + search + filter | `GET /conversations?days=&category=&q=&limit=&offset=` | |
| Conversation detail | `GET /conversations/{session_id}` | `messages[]` |
| **AI Knowledge** cards | `GET /documents` | `summary.documents`, `summary.indexed_chunks`, `summary.processing`, `summary.needs_review` |
| Registered documents table | same | `documents[]` |
| Upload official document | `POST /documents` (multipart) | PDF only (see D) |
| Publish / unpublish / retire, edit metadata | `PATCH /documents/{id}` | |
| Re-process a document | `POST /documents/{id}/reindex` | |
| (new) "See how it was split" | `GET /documents/{id}/chunks` | |
| **Analytics** service distribution, volume trend | `GET /analytics/summary?days=` | `by_category`, `daily` |
| "Knowledge gaps flagged for editorial board" + "Add knowledge" | `GET /unanswered?status=open`, then the FAQ flow | |
| (new) Most cited documents | `GET /analytics/summary` | `top_documents[]` |
| **Settings** | `GET /settings`, `PUT /settings` | see C9 |
| (new screen) **Cases inbox** | `GET /cases?relevance=inbox` | triage, priority, status |
| (new screen) **FAQ answers** | `/faq*` | four-eyes workflow |
| Users & Roles, 2FA, IP whitelist | portal (not this API) | |

### C3. Analytics: `GET /analytics/summary?days=7` (1-365)

```json
{
  "days": 7,
  "totals": {
    "conversations": 159, "questions": 177, "information_requests": 139, "answered": 116,
    "not_covered": 22, "forms_offered": 9, "emergencies": 5, "handovers": 2,
    "median_latency_ms": 6882.5, "p90_latency_ms": 15445.0,
    "thumbs_up": 0, "thumbs_down": 0, "input_tokens": 233599, "output_tokens": 16767,
    "answer_rate": 0.835, "open_knowledge_gaps": 22
  },
  "by_category": [{"category": "licensing", "n": 64}, {"category": "general", "n": 36}],
  "daily": [{"day": "2026-11-14", "conversations": 159, "questions": 177}],
  "top_documents": [{"document_id": "law-072-2024-mining-quarry", "document": "Mining and Quarry Law (n° 072/2024)", "citations": 89}]
}
```

`answer_rate` can be `null` (no questions in the period). Categories: `licensing`, `investment`,
`mineral_trading`, `taxation`, `environment`, `health_safety`, `geology`, `petroleum_gas`, `asm`, `complaints`, `general`.

### C4. Conversations

`GET /conversations?days=30&category=licensing&q=royalty&limit=50&offset=0` (limit ≤ 200):

```json
[{"session_id": "40a3c6f1-…", "first_question": "What are the mining royalty tax rates?", "created_at": "2026-11-14T10:30:11+00:00",
  "category": "taxation", "had_unanswered": false, "had_emergency": false, "replies": 2,
  "last_at": "2026-11-14T10:30:20+00:00", "avg_latency_ms": 828}]
```

`GET /conversations/{session_id}` -> `{"session_id", "messages": [...]}`. Each message: `role` (`user`|`assistant`),
`content`, `created_at`; assistant messages also have `intent`, `category`, `action`, `standalone_query` (what was
searched), `sources`, `top_score`, `answered`, `model`, `latency_ms`, `feedback`.

### C5. Documents (AI Knowledge)

`GET /documents?status=active` (status optional: `draft`|`active`|`retired`):

```json
{"summary": {"documents": 7, "active": 7, "indexed_chunks": 205, "processing": 0, "needs_review": 0, "review_overdue": 0},
 "documents": [{
   "id": "law-072-2024-mining-quarry", "title": "Law n° 072/2024 of 26/06/2024 on mining and quarry operations",
   "short_title": "Mining and Quarry Law (n° 072/2024)", "doc_type": "law", "category": "licensing",
   "law_reference": "Law n° 072/2024 of 26/06/2024", "source_url": "https://www.rmb.gov.rw/…pdf",
   "layout": "gazette_trilingual", "languages": ["en", "fr", "rw"], "owner": "RMB Legal Unit (to be confirmed)",
   "version": "Official Gazette n° Special of 24/07/2024", "effective_date": "2024-07-24", "review_date": "2027-06-30",
   "status": "active", "processing_status": "indexed", "processing_error": null, "page_count": 90, "ocr_pages": 0,
   "chunk_count": 82, "uploaded_by": null, "created_at": "…", "indexed_at": "…", "review_overdue": false}]}
```

- `status` = whether the bot uses it: `draft` (no), `active` (yes), `retired` (no, kept for audit).
- `processing_status`: `pending` -> `processing` -> `indexed` | `needs_review` | `failed` (reason in `processing_error`).
  Poll `GET /documents` every few seconds while something is pending/processing.
- `review_overdue: true` -> highlight it (RMB's rule: periodic review by the owning department).

Upload (multipart/form-data) `POST /documents` -> `202 {"id", "status": "draft", "processing_status": "pending"}`:

| Field | |
|---|---|
| `file` | PDF, ≤ 50 MB (scanned PDFs are OCR'd automatically) |
| `title`, `owner`, `uploaded_by` | required |
| `short_title`, `doc_type` (`law`, `regulation`, `prospectus`, `guide`, `faq`, `directory`, `other`), `category`, `law_reference`, `version`, `effective_date`, `review_date` (YYYY-MM-DD), `source_url` | optional |

Uploads stay **draft** until a staff member checks them and publishes: `PATCH /documents/{id}` with
`{"status": "active"}`. The same PATCH edits metadata (`title`, `short_title`, `category`, `law_reference`,
`reference_confirmed`, `owner`, `version`, `effective_date`, `review_date`).

`POST /documents/{id}/reindex` -> 202 (re-processes in the background).
`GET /documents/{id}/chunks?language=en&limit=50&offset=0` -> `[{"section_ref": "Article 16", "heading", "chapter", "page_start", "page_end", "text"}]`:
useful for staff to verify that the bot read a document correctly.

### C6. Knowledge gaps

`GET /unanswered?status=open&limit=100` (`open`|`resolved`|`ignored`):

```json
[{"id": 23, "question": "What are RMB's office opening hours?", "language": "en", "category": "general",
  "reason": "not_covered", "top_score": 0.809, "status": "open", "note": null,
  "created_at": "2026-11-14T10:11:49+00:00", "resolved_at": null}]
```

`reason`: `not_covered` / `low_confidence` (nothing in the documents) or `error` (technical failure).
`PATCH /unanswered/{id}` `{"status": "resolved" | "ignored" | "open", "note": "added the fee schedule"}`.
Each gap gets an **"Answer"** button that opens the FAQ editor (C7) pre-filled; publishing that answer resolves the gap.

### C7. FAQ answers (staff-approved knowledge)

The only way staff can teach the bot a new answer. Workflow:

1. `POST /faq` (status `draft`, not used by the bot)
   ```json
   {"question": "What are RMB's office opening hours?", "answer": "…official answer…",
    "owner": "RMB Communications", "created_by": "<logged-in staff>", "category": "general",
    "review_date": "2027-06-30", "source_type": "gap", "source_ref": "23"}
   ```
   `source_type`: `gap` (`source_ref` = gap id), `case` (`source_ref` = reference number) or `manual`.
2. `POST /faq/{id}/publish` `{"actor": "<logged-in staff>"}`: **must be a different person from `created_by`**,
   otherwise **422** "a different staff member must approve this answer (four-eyes rule)". The answer goes live
   immediately; the bot cites it as "RMB Official FAQ #id"; the source gap is marked resolved.
3. `PATCH /faq/{id}` `{"actor", "question"?, "answer"?, "category"?, "owner"?, "review_date"?}`: editing a live answer
   takes it **offline** (back to draft) until someone else publishes it again; the editor becomes the author.
4. `POST /faq/{id}/retire` `{"actor"}`: removed from the bot, kept for audit.

`GET /faq?status=draft|active|retired` returns entries with `id`, `question`, `answer`, `category`, `owner`,
`status`, `created_by`, `approved_by`, `approved_at`, `review_date`, `source_type`, `source_ref`, `created_at`, `updated_at`.
Suggested UI: a "Drafts awaiting approval" list for reviewers, with the Publish button hidden for the author.

### C8. Cases (complaints, reports, requests)

`GET /cases?relevance=inbox&status=&type=&limit=50&offset=0`

- `relevance`: `inbox` (default: relevant + unclear) | `relevant` | `unclear` | `spam` | `all`.
- Sorted **urgent -> high -> normal -> low**, then newest first.

```json
[{"reference_number": "RMB-2026-T2VKQY", "type": "grievance", "status": "new",
  "summary": "The mining site upstream is washing gold with mercury into the river. Children in our village are getting sick.",
  "anonymous": true, "confidential": false,
  "routed_to": "Complaints / community relations officer (example)", "assigned_to": null,
  "triage_relevance": "relevant", "triage_priority": "urgent",
  "triage_reason": "Mercury pollution harming children, immediate danger.", "triage_by": "ai",
  "created_at": "2026-11-14T10:11:54+00:00", "updated_at": "2026-11-14T10:11:54+00:00"}]
```

- `type`: `grievance`, `illegal_mining_report`, `meeting_request`, `geodata_request`, `licence_status`,
  `legal_question`, `general_enquiry`.
- `triage_by`: `ai`, `rules` (model unavailable) or the staff member who re-labelled it.
- Show a **"Likely spam"** tab (`relevance=spam`); spam is never deleted.
- `confidential: true` (illegal-mining reports): restrict to the roles that may see them (C10).

`GET /cases/{reference}`: full case. Note the field names differ from the list: `reference` and `case_type`
(instead of `reference_number` and `type`). Includes `summary`, `status`, triage fields, `details` (form answers),
`contact` (null when anonymous), `language`, `session_id` (null when anonymous), `conversation_excerpt` (the chat
before the form: `role`, `content`, `at`) and `events` (audit trail: `event`, `actor`, `note`, `created_at`).

`PATCH /cases/{reference}`:

```json
{"status": "assigned", "assigned_to": "Inspection officer", "triage_relevance": "relevant",
 "triage_priority": "high", "note": "Site visit planned", "actor": "<logged-in staff>"}
```

All fields optional except `actor`. Every change is logged in `events`.
`GET /cases/routing`: routing table (`case_type`, `routed_to`, `expected_response_time`, `is_placeholder`).

### C9. Settings: `GET /settings`, `PUT /settings`

```json
{"editable": {
   "assistant_name": "Baza-RMB",
   "widget_enabled": true,
   "welcome_message": {"en": "Hello! I'm Baza-RMB. …"},
   "suggestions": {"en": ["What types of mining licences exist?", "…"]},
   "persona_note": "",
   "emergency_contacts": [{"label": "Rwanda emergency line (example - to be confirmed by RMB)", "value": "112", "placeholder": true}],
   "rmb_contacts": {"email": "info@rmb.gov.rw", "phone": "+250 788 386 220", "toll_free": "2930", "address": "…", "website": "…"},
   "min_vector_score": null},
 "read_only": {"answer_model": "openai/gpt-oss-120b", "router_model": "openai/gpt-oss-20b", "embedding_model": "…",
               "default_min_vector_score": 0.8, "answer_languages": ["en"], "index_languages": ["en"], "rate_limit_per_minute": 20}}
```

Save: `PUT /settings` `{"values": {"widget_enabled": false}, "updated_by": "<logged-in staff>"}`; send only the
keys you change. Applied within 30 s.

- `persona_note` (≤ 2000 chars): **tone preferences only**. The grounding/safety rules are fixed in code and
  cannot be overridden from the dashboard.
- `min_vector_score`: `null` = default (0.80); otherwise 0.70-0.92 (422 outside). Higher = refuses more often.
  Expose it only to super admins, with a warning.
- `read_only` comes from server configuration: display it, don't offer editing.

### C10. Suggested roles (to implement in the portal)

| Role (from Figma) | Can |
|---|---|
| Super Admin | everything, including Settings and `min_vector_score` |
| Licensing Officer / Legal | Documents (upload, publish, retire), FAQ (write + approve others'), gaps |
| Complaints Officer | Cases (incl. confidential), conversations |
| Analyst | Dashboard, Analytics, conversations (read only) |
| Support Agent | Cases (non-confidential), FAQ drafts (cannot publish) |

---

## D. Figma: what to change

**Widget**

- Name: **"Rwanda Mines, Petroleum and Gas Board"** (Figma says "Rwanda Mining Board"); use `assistant_name`.
- The paperclip (attachments) and microphone are **not supported** by the backend: remove them, or leave them
  for a later phase.
- The language switcher: `languages` from `/widget-config` (English, Français, Kinyarwanda).
- Add: sources under answers, the disclaimer, 👍/👎, form cards, an emergency card, a "New chat" action.
- Chat history: within the open session only; no history list across visits.

**Admin**

- Settings > "Model Temperature": **remove**. Current models reject custom temperature, and grounding does not
  depend on it.
- Settings > "System Persona & Statutory Guardrail Prompt": replace with **"Tone preferences"** (`persona_note`).
  The sample text cites **Law N° 58/2018**, which the 2024 mining law repealed (it is mentioned in the new law's
  Article 75 as the old law), and **Law N° 006/2021**, and calls RMB "Rwanda Mining Board": do not reuse it.
- Settings > "Classification Confidence Floor 0.85": use `min_vector_score` with the 0.70-0.92 range; 0.85 would
  refuse many valid questions with the current model.
- Settings > "Classification rules / trigger keywords": not used (an AI classifier does this). Drop the section,
  or keep the category names as labels only.
- Settings > Supported languages: read-only (server configuration: `answer_languages` = en, fr, rw).
  Welcome message and suggestions are edited per language (`welcome_message.fr`, `suggestions.rw`, …).
- AI Knowledge > "DOCX spec sheets": **PDF only** for now.
- Analytics > "Global origin & investor geospatial flow", "68 nations": **no data**; visitor IPs are not stored
  (privacy). Remove, or replace with "Most cited documents" and "Knowledge gaps".
- Analytics > "Chunk cosine accuracy 0.89": not meaningful for staff; replace with "Answered from documents" (`answer_rate`).
- Mock numbers (42,850 conversations, 98.4% "zero human intervention"): replace with live values; the real
  answer rate will be lower, and that is expected: unanswered questions become knowledge gaps.
- New screens needed: **Cases inbox** (triage, priority, spam tab, case detail with audit trail and actions) and
  **FAQ answers** (editor, drafts awaiting approval, publish/retire).
