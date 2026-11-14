#!/usr/bin/env bash
# Creates .env for a new server from .env.example, with strong random secrets.
#   scripts/generate-secrets.sh baza.rmb.gov.rw baza-admin.rmb.gov.rw admin@rmb.gov.rw
# Then edit .env to add the LLM API key (GROQ_API_KEY or ANTHROPIC_API_KEY) and review the rest.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

PUBLIC_HOST="${1:-}"; PORTAL_HOST="${2:-}"; ADMIN_EMAIL="${3:-}"
[ -n "$PUBLIC_HOST" ] && [ -n "$PORTAL_HOST" ] && [ -n "$ADMIN_EMAIL" ] || {
    echo "usage: $0 <public host> <portal host> <first super admin email>"
    echo "   e.g. $0 baza.rmb.gov.rw baza-admin.rmb.gov.rw it.admin@rmb.gov.rw"
    exit 2
}
[ -f .env ] && { echo ".env already exists: not overwriting it. Move it away first if you really want new secrets."; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required"; exit 1; }

rand() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-"$1"; }
DB_PW="$(rand 40)"
ADMIN_PW="$(rand 20)"

sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$DB_PW|" \
    -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://baza:$DB_PW@db:5432/baza|" \
    -e "s|^CASE_SERVICE_TOKEN=.*|CASE_SERVICE_TOKEN=$(rand 48)|" \
    -e "s|^ADMIN_API_KEY=.*|ADMIN_API_KEY=$(rand 48)|" \
    -e "s|^CLIENT_HASH_SALT=.*|CLIENT_HASH_SALT=$(rand 48)|" \
    -e "s|^CORS_ORIGINS=.*|CORS_ORIGINS=https://www.rmb.gov.rw,https://rmb.gov.rw|" \
    -e "s|^PORTAL_ADMIN_EMAIL=.*|PORTAL_ADMIN_EMAIL=$ADMIN_EMAIL|" \
    -e "s|^PORTAL_ADMIN_PASSWORD=.*|PORTAL_ADMIN_PASSWORD=$ADMIN_PW|" \
    -e "s|^PUBLIC_HOST=.*|PUBLIC_HOST=$PUBLIC_HOST|" \
    -e "s|^PORTAL_HOST=.*|PORTAL_HOST=$PORTAL_HOST|" \
    -e "s|^ENVIRONMENT=.*|ENVIRONMENT=production|" \
    -e "s|^PORTAL_REQUIRE_2FA=.*|PORTAL_REQUIRE_2FA=true|" \
    -e "s|^MODEL_CACHE_DIR=.*|MODEL_CACHE_DIR=/models|" \
    .env.example > .env
chmod 600 .env

echo "Created .env (readable by you only)."
echo
echo "First sign-in to https://$PORTAL_HOST :"
echo "  email:    $ADMIN_EMAIL"
echo "  password: $ADMIN_PW   (temporary: you must replace it at first sign-in, then set up an authenticator app)"
echo
echo "Next: put the LLM API key in .env (GROQ_API_KEY=...), then run scripts/deploy.sh"
