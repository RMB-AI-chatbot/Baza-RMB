#!/usr/bin/env bash
# Quick health report: containers, public API, knowledge base, last backup, disk.
#   scripts/status.sh
. "$(dirname "$0")/lib.sh"

$COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'
echo
code="$(curl -sk -o /dev/null -w '%{http_code}' --resolve "${PUBLIC_HOST}:443:127.0.0.1" "https://${PUBLIC_HOST}/api/v1/health" || true)"
[ "$code" = "200" ] && ok "public API: OK" || warn "public API: HTTP $code"
psql_db -tA -c "SELECT 'documents active: ' || count(*) FILTER (WHERE status='active') || ', chunks: ' ||
                       (SELECT count(*) FROM kb.chunks) FROM kb.documents" 2>/dev/null || warn "database not reachable"
psql_db -tA -c "SELECT 'conversations last 24 h: ' || count(*) FROM chat.sessions WHERE created_at > now() - interval '1 day'" 2>/dev/null || true
psql_db -tA -c "SELECT 'open cases: ' || count(*) FROM cases.cases WHERE status NOT IN ('resolved','closed')" 2>/dev/null || true
last="$(ls -1t "${BACKUP_DIR:-$ROOT/backups}"/baza-*.dump 2>/dev/null | head -1 || true)"
[ -n "$last" ] && echo "last backup: $(basename "$last")" || warn "no backup yet (scripts/backup.sh)"
df -h "$ROOT" | tail -1 | awk '{print "disk: " $4 " free of " $2}'
for f in nginx/certs/public.crt nginx/certs/portal.crt; do
    [ -f "$f" ] && echo "$(basename "$f") expires: $(openssl x509 -enddate -noout -in "$f" | cut -d= -f2)"
done
