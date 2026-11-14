#!/usr/bin/env bash
# Copies Let's Encrypt certificates for PUBLIC_HOST and PORTAL_HOST into nginx/certs and reloads nginx.
# Used once after `certbot certonly` and as certbot's --deploy-hook on renewal (see docs/DEPLOYMENT.md).
. "$(dirname "$0")/lib.sh"

LE="${LETSENCRYPT_DIR:-/etc/letsencrypt/live}"
mkdir -p nginx/certs
cp -L "$LE/$PUBLIC_HOST/fullchain.pem" nginx/certs/public.crt
cp -L "$LE/$PUBLIC_HOST/privkey.pem"   nginx/certs/public.key
cp -L "$LE/$PORTAL_HOST/fullchain.pem" nginx/certs/portal.crt
cp -L "$LE/$PORTAL_HOST/privkey.pem"   nginx/certs/portal.key
chmod 644 nginx/certs/*.crt
chmod 640 nginx/certs/*.key
$COMPOSE exec -T nginx nginx -s reload 2>/dev/null || true
ok "certificates installed"
