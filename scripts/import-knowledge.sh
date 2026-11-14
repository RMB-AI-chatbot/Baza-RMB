#!/usr/bin/env bash
# Replaces the knowledge base (schema kb: documents, chunks, FAQ answers) with an export made by
# scripts/export-knowledge.sh. Conversations, cases and staff accounts are NOT touched.
#   scripts/import-knowledge.sh backups/knowledge-<date>.dump backups/knowledge-files-<date>.tar.gz
. "$(dirname "$0")/lib.sh"

DUMP="${1:-}"; FILES="${2:-}"
[ -f "$DUMP" ] || die "usage: $0 <knowledge .dump> [knowledge-files .tar.gz]"

faq="$(psql_db -tA -c "SELECT count(*) FROM kb.faq_entries" 2>/dev/null || echo 0)"
warn "This replaces the knowledge base with $DUMP${faq:+ (the $faq FAQ answer(s) written by staff on this server are removed too)}."
if [ "${BAZA_YES:-}" != "1" ]; then
    read -r -p "Type IMPORT to continue: " answer
    [ "$answer" = "IMPORT" ] || die "cancelled"
fi

if [ -n "$FILES" ]; then
    [ -f "$FILES" ] || die "$FILES not found"
    say "source files"
    tar -xzf "$FILES"
    [ "$(id -u)" = "0" ] && chown -R 10001:10001 data || true
fi

say "replacing the knowledge base"
$COMPOSE exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -c "DROP SCHEMA IF EXISTS kb CASCADE"
$COMPOSE exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --single-transaction < "$DUMP" \
    || die "pg_restore failed (the knowledge base was removed: run the import again)"

say "re-applying database changes that depend on the knowledge base"
psql_db -q -c "DELETE FROM public.schema_migrations WHERE filename LIKE '002%'"
"$ROOT/scripts/migrate.sh"
$COMPOSE restart ai >/dev/null
docs="$(psql_db -tA -c "SELECT count(*) || ' documents, ' || (SELECT count(*) FROM kb.chunks) || ' chunks' FROM kb.documents WHERE status='active'")"
ok "knowledge base imported: $docs. The AI service is restarting (about 30 seconds)."
