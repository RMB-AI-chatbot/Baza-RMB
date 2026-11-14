#!/usr/bin/env bash
# Restores a database backup made by scripts/backup.sh, REPLACING the current data.
#   scripts/restore.sh backups/baza-20261114-0200.dump [backups/files-20261114-0200.tar.gz]
# Also used once at go-live to load the knowledge base prepared during development.
. "$(dirname "$0")/lib.sh"

DUMP="${1:-}"; FILES="${2:-}"
[ -f "$DUMP" ] || die "usage: $0 <backup .dump> [files .tar.gz]"

warn "This replaces ALL data in database '$POSTGRES_DB' (knowledge base, conversations, cases, staff accounts) with $DUMP."
if [ "${BAZA_YES:-}" != "1" ]; then
    read -r -p "Type RESTORE to continue: " answer
    [ "$answer" = "RESTORE" ] || die "cancelled"
fi

say "stopping the services that use the database"
$COMPOSE stop ai cases portal >/dev/null 2>&1 || true
$COMPOSE up -d db >/dev/null
wait_healthy db 120

say "replacing the database contents"
psql_db -q -c "DROP SCHEMA IF EXISTS kb, chat, cases, app, portal CASCADE; DROP TABLE IF EXISTS public.schema_migrations;"
$COMPOSE exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --if-exists --clean --single-transaction < "$DUMP" \
    || die "pg_restore failed: nothing was changed by the restore (single transaction)"

if [ -n "$FILES" ]; then
    [ -f "$FILES" ] || die "$FILES not found"
    say "restoring files"
    tar -xzf "$FILES"
fi

say "applying any newer database changes"
"$ROOT/scripts/migrate.sh"
say "starting the services"
$COMPOSE up -d >/dev/null
ok "restore done. Check: scripts/status.sh"
