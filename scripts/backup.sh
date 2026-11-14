#!/usr/bin/env bash
# Backs up the database (knowledge base, conversations, cases, staff accounts) and uploaded documents.
#   scripts/backup.sh                    -> backups/baza-<date>.dump and backups/files-<date>.tar.gz
# Keeps the last BACKUP_KEEP_DAYS days (default 14). Copy backups/ to another machine regularly
# (e.g. rsync to RMB's backup server): a backup on the same disk does not protect against disk loss.
. "$(dirname "$0")/lib.sh"

DEST="${BACKUP_DIR:-$ROOT/backups}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M)"
mkdir -p "$DEST"
chmod 700 "$DEST"

say "database -> $DEST/baza-$STAMP.dump"
$COMPOSE exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner > "$DEST/baza-$STAMP.dump.part"
mv "$DEST/baza-$STAMP.dump.part" "$DEST/baza-$STAMP.dump"

say "files -> $DEST/files-$STAMP.tar.gz"
tar -czf "$DEST/files-$STAMP.tar.gz" --ignore-failed-read data/sources.yaml data/uploads data/raw data/extracted 2>/dev/null || true

find "$DEST" -maxdepth 1 -type f \( -name 'baza-*.dump' -o -name 'files-*.tar.gz' \) -mtime +"$KEEP" -delete
chmod 600 "$DEST"/* 2>/dev/null || true
ok "backup done: $(du -h "$DEST/baza-$STAMP.dump" | cut -f1) database, $(du -h "$DEST/files-$STAMP.tar.gz" | cut -f1) files"
