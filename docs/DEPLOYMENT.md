# baza-RMB: deployment and operations guide

For RMB's IT team. It covers installing baza-RMB on a server, going live, and keeping it running.
The TYPO3 website integration is separate: it is one `<script>` line (section 7).

---

## 1. What runs where

```
 www.rmb.gov.rw (TYPO3)                   RMB server (Docker)
 ┌────────────────────┐  HTTPS   ┌──────────────────────────────────────────────────────────────┐
 │ page + <script     │ ───────► │ nginx :443  PUBLIC_HOST  /widget/*, /api/v1/chat, /cases ... │
 │ baza-widget.js>    │          │        │                                                     │
 └────────────────────┘          │        ├─► ai      (Python, AI + knowledge base)  ─┐         │
                                 │        │                                           ├─► db    │
 RMB staff (office / VPN)  HTTPS │ nginx :443  PORTAL_HOST (staff portal, allow-list)│ (Postgres│
 ───────────────────────────────►│        └─► portal  (PHP, sign-in, users, roles) ──┤ +vector)│
                                 │                     cases (PHP, case register) ────┘         │
                                 └──────────────────────────────────────────────────────────────┘
 Outbound from the server: HTTPS to the LLM provider (api.groq.com or api.anthropic.com), and to
 huggingface.co once (first start downloads the embedding model, ~2.2 GB).
```

| Container | Role | Reachable from |
|---|---|---|
| `nginx` | HTTPS, rate limits, portal allow-list | the internet (80, 443) |
| `ai` | chat API, retrieval, answers, admin API | nginx and portal only |
| `portal` | staff dashboard (sign-in, 2FA, roles, audit log) | nginx (PORTAL_HOST) only |
| `cases` | case register (complaints, reports, requests) | ai and portal only |
| `db` | PostgreSQL 17 + pgvector | internal only |

No database, admin API or case service port is opened on the server.

## 2. Server requirements

| | Minimum | Recommended |
|---|---|---|
| OS | Ubuntu 22.04 / 24.04 LTS (any Linux with Docker) | |
| CPU / RAM | 4 vCPU / 8 GB | 8 vCPU / 16 GB |
| Disk | 40 GB SSD | 80 GB (backups, logs) |
| Software | Docker Engine 24+ with the Compose plugin, git, openssl, curl | |
| DNS | two names pointing to the server, e.g. `baza.rmb.gov.rw` (public) and `baza-admin.rmb.gov.rw` (staff) | |
| Firewall | inbound 80 and 443; outbound 443 | portal name resolvable only inside RMB, or VPN |

The embedding model runs on the CPU (no GPU needed). It takes about 2.5 GB of RAM.

Install Docker (Ubuntu):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # log out and in again
docker compose version             # must print v2.20 or newer
```

## 3. First installation

```bash
sudo mkdir -p /opt/baza-rmb && sudo chown $USER /opt/baza-rmb
git clone <repository-url> /opt/baza-rmb        # or copy the project folder
cd /opt/baza-rmb

# 1. Settings with strong random secrets. Prints the first super admin's temporary password: note it.
scripts/generate-secrets.sh baza.rmb.gov.rw baza-admin.rmb.gov.rw it.admin@rmb.gov.rw

# 2. Add the LLM key and review the rest
nano .env          # GROQ_API_KEY=...   (or LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY=..., see section 9)

# 3. HTTPS certificates (section 4), then:
sudo chown -R 10001:10001 data       # the AI container runs as uid 10001
scripts/deploy.sh
```

`scripts/deploy.sh` checks the settings, builds the images, starts the database, applies database changes,
refuses to start with unsafe settings (`python -m app.cli check-config`), starts everything and waits until all
services are healthy. The first start downloads the embedding model (up to 10 minutes).

If `deb.debian.org` is unreachable from the server (the build stops at `apt-get`), set a mirror in `.env`, e.g.
`DEBIAN_MIRROR=http://ftp.de.debian.org/debian`, and run `scripts/deploy.sh` again.

## 4. HTTPS certificates

nginx reads four files from `nginx/certs/`:
`public.crt` + `public.key` (for PUBLIC_HOST) and `portal.crt` + `portal.key` (for PORTAL_HOST), in PEM format
(the `.crt` contains the certificate followed by the intermediate chain).

**Option A: RMB's own certificate** (e.g. a `*.rmb.gov.rw` wildcard). Copy it to both names:

```bash
mkdir -p nginx/certs
cp wildcard-fullchain.pem nginx/certs/public.crt && cp wildcard.key nginx/certs/public.key
cp wildcard-fullchain.pem nginx/certs/portal.crt && cp wildcard.key nginx/certs/portal.key
chmod 640 nginx/certs/*.key
```

**Option B: Let's Encrypt** (both names must be reachable from the internet on port 80 for the check):

```bash
sudo apt install certbot
# nginx must be running to answer the challenge: start it once with a temporary self-signed certificate
mkdir -p nginx/certs nginx/certbot-webroot
for n in public portal; do openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=temp" \
  -keyout nginx/certs/$n.key -out nginx/certs/$n.crt; done
scripts/deploy.sh
sudo certbot certonly --webroot -w /opt/baza-rmb/nginx/certbot-webroot -d baza.rmb.gov.rw
sudo certbot certonly --webroot -w /opt/baza-rmb/nginx/certbot-webroot -d baza-admin.rmb.gov.rw
sudo scripts/install-certs.sh     # copies them into nginx/certs and reloads nginx
```

Renewal: uncomment the certbot line in `scripts/crontab.example` (section 6).

## 5. Go-live: load the knowledge base

The knowledge base (documents, indexed chunks, embeddings, French and Kinyarwanda text) was prepared during
development. Transfer it instead of re-indexing (re-indexing also re-runs OCR on the prospectus, which costs API calls).

On the development machine:

```bash
BAZA_COMPOSE="docker compose" scripts/export-knowledge.sh
# -> backups/knowledge-<date>.dump and backups/knowledge-files-<date>.tar.gz
```

Copy both files to the server (`scp`), then on the server:

```bash
scripts/import-knowledge.sh backups/knowledge-<date>.dump backups/knowledge-files-<date>.tar.gz
```

Only the knowledge base is transferred: no test conversations, cases or staff accounts.

**Alternative (indexing from scratch on the server):** put the PDFs in `data/raw/` (file names as in
`data/sources.yaml`), keep `data/extracted/` (OCR cache), then:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec ai python -m app.cli ingest --all
```

Then check:

```bash
scripts/status.sh
curl -s https://baza.rmb.gov.rw/api/v1/health                                          # {"status":"ok"}
curl -s https://baza.rmb.gov.rw/api/v1/chat -H 'Content-Type: application/json' \
     -d '{"message":"What types of mining licences exist?"}'                            # answer with sources
```

### First sign-in to the staff portal

1. Open `https://baza-admin.rmb.gov.rw` from RMB's network (section 8: allow-list).
2. Sign in with the email and temporary password printed by `generate-secrets.sh`.
3. Choose a new password (at least 12 characters).
4. Set up an authenticator app (Google Authenticator, Microsoft Authenticator, Authy): `PORTAL_REQUIRE_2FA=true`
   makes this mandatory for every account.
5. **Users & Roles → Add Staff Account** for each officer. Give each person their temporary password in person or
   by phone. They replace it at first sign-in. Staff instructions: [STAFF_GUIDE.md](STAFF_GUIDE.md).
6. Remove `PORTAL_ADMIN_PASSWORD` from `.env` once you have signed in (it is used only while no account exists).

## 6. Scheduled jobs (cron)

```bash
crontab -e      # paste the lines from scripts/crontab.example (adjust BAZA=/opt/baza-rmb)
```

| When | Job |
|---|---|
| daily 02:00 | `scripts/backup.sh`: database + documents into `backups/`, 14 days kept |
| daily 03:00 | `app.cli purge`: deletes conversations older than `CHAT_RETENTION_DAYS` (default 365) |
| weekly | `app.cli refresh-web`: re-reads the RMB web pages used as sources |
| monthly | certificate renewal (Let's Encrypt only) |

**Copy `backups/` to another machine** (RMB backup server, e.g. a nightly `rsync`). A backup on the same disk does
not survive a disk failure.

## 7. Website integration (TYPO3)

One line in the site template, before `</body>`:

```html
<script src="https://baza.rmb.gov.rw/widget/baza-widget.js"
        data-api-base="https://baza.rmb.gov.rw/api/v1" data-lang="en" defer></script>
```

`data-lang`: `en`, `fr` or `rw` (the page's language). Every site origin that embeds the widget must be listed in
`CORS_ORIGINS` in `.env` (default: `https://www.rmb.gov.rw,https://rmb.gov.rw`), then
`docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d ai`.
If the site sends a Content-Security-Policy, allow `script-src` and `connect-src` `https://baza.rmb.gov.rw` and
`font-src https://fonts.gstatic.com`. Details: [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md).

## 8. Security

**What is built in**

| Area | Measure |
|---|---|
| Transport | HTTPS only (HTTP redirects), HSTS, TLS 1.2+ |
| Staff portal | separate host name with an IP allow-list (`nginx/portal-allow.conf`); passwords hashed with bcrypt, minimum 12 characters, common passwords refused; lockout after 5 failures in 15 minutes per account and per IP; authenticator-app 2FA (mandatory with `PORTAL_REQUIRE_2FA=true`), codes cannot be reused; sessions end after 30 idle minutes, after 8 hours, and immediately on password reset, 2FA reset or deactivation; CSRF tokens; strict Content-Security-Policy; audit log of sign-ins, account changes and every change made |
| Roles | Super Admin, Licensing Officer, Complaints Officer, Analyst, Support Agent: checked on the server for every request; confidential cases hidden from roles without access |
| Admin API | key kept on the server (never sent to browsers), not reachable from the internet |
| Public API | rate limits in nginx and in the AI service; message size limit; prompt-injection guard; answers only from approved documents |
| Privacy | visitor IP addresses are never stored (salted hash only, for rate limiting); conversations deleted after `CHAT_RETENTION_DAYS` |
| Start-up | in production the AI service refuses to start with example secrets or missing keys |

**Portal allow-list.** Edit `nginx/portal-allow.conf` (office and VPN address ranges), then
`docker compose -f docker-compose.yml -f docker-compose.prod.yml restart nginx`. Test from outside the network:
the portal must answer `403 Forbidden`.

**Lost access.** If a super admin forgets their password or loses their phone, another super admin resets it in
**Users & Roles**. If no super admin can sign in, on the server:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec portal php bin/create-admin.php it.admin@rmb.gov.rw "IT Administrator"
```

It creates (or recovers) a super admin and prints a temporary password. The action is written to the audit log.

**Secrets.** `.env` holds every secret (database password, API keys, tokens): keep it `chmod 600`, never commit
it, and include it in the server's encrypted backups. To rotate a key, change it in `.env` and run `scripts/deploy.sh`.

## 9. Configuration reference (`.env`)

| Setting | Meaning |
|---|---|
| `ENVIRONMENT` | `production` on the server (secret checks on, API docs off) |
| `PUBLIC_HOST`, `PORTAL_HOST`, `MAIN_SITE` | host names; `MAIN_SITE` is where `https://PUBLIC_HOST/` redirects |
| `LLM_PROVIDER` | `groq` (free tier, limited: about 1,000 answers per day) or `anthropic` (paid, higher quality and limits) |
| `GROQ_API_KEY` / `ANTHROPIC_API_KEY` | key of the chosen provider |
| `ANSWER_MODEL`, `ROUTER_MODEL`, `ANSWER_FALLBACK_MODEL`, `OCR_MODEL` | models (defaults in `.env.example`) |
| `CORS_ORIGINS` | websites allowed to embed the widget |
| `RATE_LIMIT_PER_MINUTE` / `_PER_DAY` | messages per visitor (default 20 / 300) |
| `PORTAL_REQUIRE_2FA` | `true`: every staff member must use an authenticator app |
| `PORTAL_SESSION_MINUTES` | idle sign-out (default 30) |
| `CHAT_RETENTION_DAYS` | conversation retention (default 365, 0 = keep) |
| `BACKUP_KEEP_DAYS` | backups kept on the server (default 14) |
| `PORTAL_ADMIN_*` | first super admin, used only while there is no staff account |

**LLM provider for production.** Groq's free tier has daily limits (each model about 1,000 requests and, for the
main model, 200,000 tokens per day); when the main model's quota runs out, a fallback model answers. For a public
government service, a paid plan is recommended: either Groq's paid tier (same models, no code change) or Anthropic
(`LLM_PROVIDER=anthropic`, `ANSWER_MODEL=claude-sonnet-5-5`, `ROUTER_MODEL=claude-haiku-5-5`). Change `.env`, then
`scripts/deploy.sh`, then run the evaluation (section 10) to confirm answer quality.

## 10. Operations

```bash
scripts/status.sh                         # health, documents, conversations, open cases, last backup, certificates
scripts/deploy.sh                         # after every code update (git pull first)
scripts/backup.sh                         # backup now
scripts/restore.sh backups/baza-<date>.dump backups/files-<date>.tar.gz   # restore EVERYTHING from a backup

alias dc='docker compose -f docker-compose.yml -f docker-compose.prod.yml'
dc logs -f --tail 100 ai                  # AI service log (also: portal, cases, nginx, db)
dc restart ai
dc exec ai python -m app.cli stats        # documents and chunk counts
dc exec ai python -m eval.run_eval --full # answer-quality test (uses the LLM: about 80 questions)
```

**Updating the code:** `git pull && scripts/deploy.sh`. Database changes are applied automatically (new files in
`db/init/`, recorded in `public.schema_migrations`). Take a backup first.

**Adding or replacing a document:** staff do it in the portal (**AI Knowledge → Upload document**), which indexes
it automatically. Large legal texts can also be added to `data/sources.yaml` and indexed with `app.cli ingest`.

**Restore test.** Once a quarter, restore the latest backup on a test machine (`scripts/restore.sh`) to make sure
backups work.

## 11. Troubleshooting

| Symptom | Check |
|---|---|
| Widget says "Sorry, I couldn't process that right now" | `dc logs ai`: LLM key wrong or quota used up (429). Wait (Groq quotas reset daily), or switch to a paid plan |
| `ai` stays "starting" | first start downloads the model: `dc logs ai`; needs outbound access to huggingface.co |
| Portal answers 403 | your IP is not in `nginx/portal-allow.conf` |
| Widget does not appear on the website | browser console: CORS (add the site to `CORS_ORIGINS`) or the site's Content-Security-Policy |
| "Too many failed attempts" at sign-in | wait 15 minutes, or a super admin resets the password |
| Build stops at `apt-get update` | set `DEBIAN_MIRROR` in `.env` |
| Disk full | `docker system prune` (old images), check `backups/` |
