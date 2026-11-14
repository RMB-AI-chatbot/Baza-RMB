#!/usr/bin/env bash
# Exports ONLY the knowledge base (documents, indexed chunks with embeddings, translations) and its source files,
# without conversations, cases, staff accounts or test FAQ drafts. Used to move the prepared knowledge base
# from the development machine to RMB's server (then scripts/import-knowledge.sh there).
#   BAZA_COMPOSE="docker compose" scripts/export-knowledge.sh     (on the development machine)
. "$(dirname "$0")/lib.sh"

DEST="${BACKUP_DIR:-$ROOT/backups}"
STAMP="$(date +%Y%m%d-%H%M)"
mkdir -p "$DEST"

say "knowledge base -> $DEST/knowledge-$STAMP.dump"
$COMPOSE exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner -n kb \
    --exclude-table-data=kb.faq_entries > "$DEST/knowledge-$STAMP.dump"

say "source files -> $DEST/knowledge-files-$STAMP.tar.gz"
tar -czf "$DEST/knowledge-files-$STAMP.tar.gz" data/sources.yaml data/raw data/extracted

ok "done. Copy both files to the server and run there:"
echo "  scripts/import-knowledge.sh backups/knowledge-$STAMP.dump backups/knowledge-files-$STAMP.tar.gz"
