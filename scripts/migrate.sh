#!/usr/bin/env bash
# Applies database changes: every db/init/*.sql file not yet recorded in public.schema_migrations, in order.
# The files are written to be safe to re-run, so an interrupted run can simply be repeated.
#   scripts/migrate.sh            (scripts/deploy.sh runs it for you)
. "$(dirname "$0")/lib.sh"

psql_db -q -c "CREATE TABLE IF NOT EXISTS public.schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
applied="$(psql_db -tA -c "SELECT filename FROM public.schema_migrations")"

n=0
for f in db/init/*.sql; do
    name="$(basename "$f")"
    if grep -qxF "$name" <<<"$applied"; then continue; fi
    say "applying $name"
    psql_db -q < "$f"
    psql_db -q -c "INSERT INTO public.schema_migrations (filename) VALUES ('$name') ON CONFLICT DO NOTHING"
    n=$((n + 1))
done
ok "database up to date ($n change file(s) applied)"
