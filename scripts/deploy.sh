#!/usr/bin/env bash
# Installs or updates baza-RMB on the server (first time and after every code update).
#   scripts/deploy.sh
# Steps: check settings -> build images -> start the database -> apply database changes -> start everything
#        -> wait until healthy -> print the addresses.
. "$(dirname "$0")/lib.sh"

say "1/6 checking the configuration"
for v in PUBLIC_HOST PORTAL_HOST POSTGRES_PASSWORD ADMIN_API_KEY CASE_SERVICE_TOKEN CLIENT_HASH_SALT; do
    [ -n "${!v:-}" ] || die "$v is empty in .env"
done
[ "${ENVIRONMENT:-}" = "production" ] || warn "ENVIRONMENT is not 'production' in .env (API docs stay on, secrets are not checked)"
for f in public.crt public.key portal.crt portal.key; do
    [ -f "nginx/certs/$f" ] || die "nginx/certs/$f is missing (see docs/DEPLOYMENT.md, 'HTTPS certificates')"
done
mkdir -p data/uploads data/eval_results nginx/certbot-webroot backups
# The AI service runs as uid 10001 inside its container and writes uploads there.
if [ "$(id -u)" = "0" ]; then chown -R 10001:10001 data; else
    [ -w data ] && [ "$(stat -c %u data 2>/dev/null || echo 10001)" = "10001" ] || warn "data/ should belong to uid 10001: sudo chown -R 10001:10001 data"
fi

say "2/6 building the images"
$COMPOSE build --pull

say "3/6 starting the database"
$COMPOSE up -d db
wait_healthy db 180 || die "the database did not start: $COMPOSE logs db"

say "4/6 applying database changes"
"$ROOT/scripts/migrate.sh"

say "5/6 starting all services"
$COMPOSE run --rm --no-deps ai python -m app.cli check-config || die "unsafe production settings (see above); fix .env and run again"
$COMPOSE up -d --remove-orphans

say "6/6 waiting for the services (the first start downloads the embedding model, ~2.2 GB: up to 10 minutes)"
for s in cases portal; do wait_healthy "$s" 120 || die "$s is not healthy: $COMPOSE logs $s"; done
wait_healthy ai 900 || die "the AI service is not healthy: $COMPOSE logs ai"

docs="$($COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM kb.documents WHERE status = 'active'" 2>/dev/null || echo 0)"
ok "baza-RMB is running."
echo "  Public API + widget : https://$PUBLIC_HOST/widget/baza-widget.js"
echo "  Staff portal        : https://$PORTAL_HOST"
echo "  Active documents    : $docs"
[ "$docs" = "0" ] && warn "The knowledge base is empty: restore the prepared one (scripts/restore.sh) or index the documents (docs/DEPLOYMENT.md)."
exit 0
