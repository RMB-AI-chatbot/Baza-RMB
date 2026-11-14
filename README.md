# baza-RMB

AI assistant for the **Rwanda Mines, Petroleum and Gas Board (RMB)**, to be embedded on rmb.gov.rw.
It answers questions **only from RMB's approved documents**, cites the exact article/page,
says "I don't have that yet" instead of guessing, and hands people over to RMB staff through
trackable cases (complaints, illegal-mining reports, meeting and data requests).

```
 Widget (JS, rmb.gov.rw) ──HTTPS──► nginx ──► AI service (Python/FastAPI) ──► PostgreSQL + pgvector
                                               │  safety gate → router (small LLM) → hybrid retrieval
                                               │  → grounded answer (LLM, streamed, cited)
                                               └──► Case service (PHP) ──► cases schema
 Admin portal (staff) ──internal──► /api/v1/admin/* (AI service)  +  case service API
```

| Folder | What |
|---|---|
| `ai-service/` | FastAPI app: chat API, RAG, ingestion, admin API, eval |
| `case-service/` | Minimal PHP case API (create, status, list, update, audit trail) |
| `db/init/` | Database schema (kb, chat, cases, app) |
| `data/sources.yaml` | Knowledge-base register (owner, version, dates, status per document) |
| `data/raw/` | Source PDFs / page snapshots (not committed) |
| `data/extracted/` | OCR cache (commit it: avoids paying for OCR twice) |
| `admin-portal/` | Staff portal (PHP): sign-in with 2FA, roles, users, audit log, dashboard screens |
| `nginx/` | Reverse proxy: `nginx.conf` (development), `templates/` + `portal-allow.conf` (production, HTTPS) |
| `web/` | Chat widget (`web/widget/baza-widget.js`) and developer test pages |
| `scripts/` | Server scripts: deploy, migrate, backup, restore, knowledge export/import, status |
| `docs/` | [Deployment guide](docs/DEPLOYMENT.md) (IT) · [Staff guide](docs/STAFF_GUIDE.md) · [Frontend integration](docs/FRONTEND_INTEGRATION.md) |

## Deploying to RMB's server

Production runs entirely in Docker behind HTTPS: see **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. In short:

```bash
scripts/generate-secrets.sh baza.rmb.gov.rw baza-admin.rmb.gov.rw it.admin@rmb.gov.rw   # creates .env
# add GROQ_API_KEY (or ANTHROPIC_API_KEY) to .env, put the HTTPS certificates in nginx/certs/
scripts/deploy.sh
scripts/import-knowledge.sh backups/knowledge-<date>.dump backups/knowledge-files-<date>.tar.gz
```

Compose files: `docker-compose.yml` (base, no open ports) + `docker-compose.override.yml` (development, loaded
automatically) or `docker-compose.prod.yml` (production: nginx on 80/443, `ENVIRONMENT=production`).

## How a message is handled

1. **Emergency patterns** (collapse, trapped, spill… in EN/FR/RW) → emergency contacts immediately, no model call.
2. **Router** (small fast model, structured JSON): language, intent, category, and a standalone
   rewrite of follow-up questions ("and how long does it take?").
3. **Intent dispatch**: complaint / illegal-mining report / meeting / geo-data / status → a **form**
   (`action: "form"`); legal interpretation → relevant provisions + legal-team form, no generated advice;
   greeting / out-of-scope → fixed text.
4. **Hybrid retrieval**: pgvector cosine similarity + Postgres full-text search, fused with
   Reciprocal Rank Fusion; explicit "Article 16" references are boosted. Weak evidence →
   "not covered" + enquiry form, and the question is logged in `chat.unanswered` (content-gap report).
5. **Answer** (answer model, streamed): only from the numbered sources, every statement cited `[n]`;
   the model can still reply `<<NOT_COVERED>>`. A legal disclaimer is added by code for law-based answers.

## LLM providers

The model provider is swappable (`LLM_PROVIDER` in `.env`); each adapter lives in `ai-service/app/llm/`.

| Provider | Answer / router / OCR models | Notes |
|---|---|---|
| `groq` (current dev setup) | `openai/gpt-oss-120b` / `openai/gpt-oss-20b` / `qwen/qwen3.8-27b` | Free tier: 8,000 tokens/min per model, i.e. ~2 answers/min. Fine for development, **not for public launch**: use Groq's paid tier or another provider. |
| `gemini` | `gemini-2.5-flash` / `gemini-2.5-flash-lite` / `gemini-2.5-flash` | Needs billing enabled on the Google project. |
| `anthropic` | `claude-sonnet-5-5` / `claude-haiku-5-5` / `claude-sonnet-5-5` | Needs API credits. |

Citation markers are normalised to `[n]` whatever style a model uses (`app/chat/citations.py`).
Re-run `python -m eval.run_eval --full` after changing provider or model.

## Staff answers (FAQ) and form triage

* **Official FAQ answers.** Staff answer a knowledge gap or a case question (admin: *Answer* button / *FAQ answers*
  tab). The answer is a draft until a **different** staff member publishes it; it is then indexed as a chunk of the
  document `rmb-official-faq` and the bot cites it as "RMB Official FAQ #n". Editing a published answer takes it
  offline until re-approved; retiring removes it. The bot never learns from users' messages by itself.
* **Form triage.** Each submitted form is labelled *relevant / unclear / spam* with a priority
  (*urgent / high / normal / low*) by the router model (`app/prompts/triage_v1.md`), with rule-based fallback and a
  rule that danger words always mean *urgent*. The staff inbox shows relevant + unclear, urgent first; spam is listed
  separately and never deleted; staff can re-label any case (logged in the audit trail).
* Existing databases: apply `db/init/002_faq_triage.sql` once (`docker compose exec -T db psql -U baza -d baza < db/init/002_faq_triage.sql`).

## Knowledge base

* The three laws are **trilingual Official Gazette PDFs** (Kinyarwanda | English | French columns).
  Each column is extracted separately and split **one chunk per article** (`section_key` `art-16`
  links the three language versions). All articles were found in English: mining law 78/78,
  tax law 15/15, petroleum law 47/47.
* **Three languages (EN / FR / RW).** The bot answers in the language the person writes in. Search runs on the
  English text (the router translates the question); for laws, the matching article is then swapped for the
  **official French or Kinyarwanda text from the Gazette** (same `section_key`), so answers use RMB's own legal
  wording and cite e.g. "Ingingo ya 13". Prospectuses, the web page and FAQ answers exist in English only and are
  translated by the model. Settings: `ANSWER_LANGUAGES`, `INDEX_LANGUAGES` (stored), `EMBED_LANGUAGES` (embedded: en).
  Fixed texts, form labels, welcome text and suggestions have FR/RW drafts that **need review by RMB's translators**.
* The Revised Investment Prospectus (Oct 2025) has a broken text layer → pages are OCR'd with
  a vision model once, cleaned of repetition loops and photo text, and cached in `data/extracted/`.
* Embeddings: `intfloat/multilingual-e5-large`, run **locally** (no API key, data stays on the server).

## Quick start (Windows, development)

Needs: Docker Desktop running, PHP 8.2+, and the Python environment (`ai-service/.venv`, see below).

```powershell
cd baza-rmb
.\dev.ps1
```

Then open:

| URL | What |
|---|---|
| http://127.0.0.1:8000 | mock rmb.gov.rw page with the **chat widget** (Figma design) in the corner |
| http://127.0.0.1:8082 | **admin dashboard** (Figma design). First login: `PORTAL_ADMIN_EMAIL` / `PORTAL_ADMIN_PASSWORD` from `.env`; you must change the password |
| http://127.0.0.1:8000/test.html | developer test page (raw API) · http://127.0.0.1:8000/docs API docs |

`Ctrl+C` stops it.

**Embedding the widget on the RMB website (TYPO3 or any page)** needs one line:
`<script src="https://<ai-host>/widget/baza-widget.js" data-api-base="https://<ai-host>/api/v1" data-lang="en" defer></script>`
(add the site's origin to `CORS_ORIGINS`). Code: `web/widget/baza-widget.js`.

**Admin portal** (`admin-portal/`, PHP): staff sign-in with password + authenticator-app codes (2FA, mandatory with
`PORTAL_REQUIRE_2FA=true`), lockout, session limits, roles (Super Admin, Licensing Officer, Complaints Officer, Analyst,
Support Agent), user management, CSRF protection, Content-Security-Policy and an audit log; it forwards allowed requests
to the AI admin API with the key kept server-side. Recovery from the server: `php bin/create-admin.php <email>`.
The script starts the database (Docker), the PHP case service (port 8081) and the AI service (port 8000).

## Run it

Requirements: Docker. For development without Docker for the Python side: Python 3.11 + [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env        # then set passwords/tokens, LLM_PROVIDER and its API key
docker compose up -d --build
docker compose exec ai python -m app.cli ingest --all     # first run downloads the embedding model (~2.2 GB)
```

Open http://localhost:8080 for the test page.

Development (AI service on the host, database in Docker):

```bash
docker compose up -d db
cd ai-service
uv venv --python 3.11 .venv && uv pip install --python .venv -e ".[dev]"
.venv/Scripts/python -m app.cli ingest --all          # Linux/macOS: .venv/bin/python
.venv/Scripts/python -m app.serve --port 8000         # Windows-safe launcher (uvicorn on Linux)

# case service without Docker (PHP 8.2+ with pdo_pgsql):
php -d extension=pdo_pgsql -S 127.0.0.1:8081 ../case-service/public/index.php   # needs DB_DSN, DB_USER, DB_PASSWORD, CASE_SERVICE_TOKEN in the environment
```

On Windows keep `DATABASE_URL` on `127.0.0.1` (not `localhost`): async psycopg tries IPv6 `::1` first and hangs.

Useful commands (from `ai-service/`):

| Command | Purpose |
|---|---|
| `python -m app.cli ingest --all [--force]` | sync `data/sources.yaml`, (re)index changed documents |
| `python -m app.cli refresh-web` | re-fetch the geohazards page and re-index if it changed (schedule daily with cron) |
| `python -m app.cli stats` | documents, chunk counts per language |
| `python -m app.cli purge` | delete conversations older than `CHAT_RETENTION_DAYS` (daily on the server) |
| `python -m app.cli check-config` | are the settings safe for production? |
| `python -m app.cli search "royalty rate on gold" -v` | debug retrieval |
| `python -m eval.run_eval --retrieval` | retrieval accuracy (no API key needed) |
| `python -m eval.run_eval --full` | end-to-end accuracy through the real pipeline |
| `python -m pytest` | unit tests |

## API (for the widget and the admin portal)

**Frontend developers: start with [docs/FRONTEND_INTEGRATION.md](docs/FRONTEND_INTEGRATION.md)** (widget + admin dashboard guide, real examples, Figma mapping).

Interactive docs: http://localhost:8000/docs when running the AI service directly.

**Public** (proxied by nginx):

| Endpoint | |
|---|---|
| `POST /api/v1/chat` | `{session_id?, message, language?, stream?}` → `ChatResponse`, or SSE events `meta`, `delta`, `final` when `stream: true` |
| `POST /api/v1/cases` | submit a form returned by chat: `{session_id, type, fields, anonymous}` → reference number |
| `GET /api/v1/cases/{reference}` | status lookup (no personal data) |
| `POST /api/v1/feedback` | thumbs up/down on an answer |
| `GET /api/v1/widget-config?lang=en` | name, welcome message, suggestions, contacts |

`ChatResponse`: `answer` (with `[n]` citation markers), `sources[]` (`n`, document, section, page, url),
`action` (`none` | `form` | `emergency` | `handover` | `not_covered`), `form` (field definitions to render),
`disclaimer`, `emergency_contacts`, `intent`, `category`, `session_id`, `message_id`.

**Admin** (`X-Admin-Key` header, internal network only; maps to the Figma dashboard):
`GET /api/v1/admin/analytics/summary` (Dashboard, Analytics) · `GET /conversations`, `/conversations/{id}` ·
`GET|POST|PATCH /documents`, `POST /documents/{id}/reindex`, `GET /documents/{id}/chunks` (AI Knowledge) ·
`GET|PATCH /unanswered` (knowledge gaps) · `GET|PUT /settings`.

**Case service** (PHP, `Authorization: Bearer CASE_SERVICE_TOKEN`, internal): `POST /api/v1/cases`,
`GET /api/v1/cases/{ref}`, `GET /api/v1/cases/{ref}/details`, `GET /api/v1/cases`, `PATCH /api/v1/cases/{ref}`, `GET /api/v1/routing`.

## Placeholders RMB must confirm

Routing targets and response times (`cases.routing`), emergency numbers (`app.settings.emergency_contacts`),
document owners and review dates (`data/sources.yaml`), French/Kinyarwanda fixed texts (`app/chat/texts.py`).

Before go-live, RMB's IT team also decides: the two host names and their certificates, the office/VPN address ranges
allowed to open the staff portal (`nginx/portal-allow.conf`), the LLM plan (Groq free tier limits, see
[DEPLOYMENT.md §9](docs/DEPLOYMENT.md#9-configuration-reference-env)), where backups are copied, and the official RMB
logo (save it as `admin-portal/public/assets/rmb-logo.png`; a placeholder is shown until then).
