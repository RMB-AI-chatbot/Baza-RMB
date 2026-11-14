#!/usr/bin/env bash
# Shared helpers for the baza-RMB server scripts. Source it: . "$(dirname "$0")/lib.sh"
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Production compose files unless BAZA_COMPOSE overrides them (e.g. BAZA_COMPOSE="docker compose" for development).
COMPOSE="${BAZA_COMPOSE:-docker compose -f docker-compose.yml -f docker-compose.prod.yml}"

[ -f .env ] || { echo "ERROR: .env not found in $ROOT. Run scripts/generate-secrets.sh first." >&2; exit 1; }
# Read .env the way Docker Compose does (KEY=value, value may contain spaces, optional quotes); never executed as code.
while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[1]}"; val="${BASH_REMATCH[2]}"
    if [[ "$val" =~ ^\"(.*)\"$ || "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"; fi
    [ -n "${!key+x}" ] || export "$key=$val"   # variables already set in the environment win
done < .env
unset line key val
POSTGRES_USER="${POSTGRES_USER:-baza}"
POSTGRES_DB="${POSTGRES_DB:-baza}"

say()  { printf '\033[1;36m%s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

psql_db() { $COMPOSE exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"; }

wait_healthy() {  # wait_healthy <service> <seconds>
    local svc="$1" limit="${2:-120}" t=0 state
    while :; do
        state="$($COMPOSE ps --format '{{.Health}}' "$svc" 2>/dev/null | head -1)"
        [ "$state" = "healthy" ] && return 0
        [ "$t" -ge "$limit" ] && { warn "$svc is not healthy after ${limit}s (state: ${state:-unknown})"; return 1; }
        sleep 5; t=$((t + 5))
    done
}
