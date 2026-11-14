FROM php:8.3-apache

# Optional Debian mirror (when deb.debian.org is slow or blocked), e.g. http://ftp.de.debian.org/debian
ARG DEBIAN_MIRROR=
RUN if [ -n "$DEBIAN_MIRROR" ]; then \
      sed -i "s#http://deb.debian.org/debian-security#http://security.debian.org/debian-security#; s#http://deb.debian.org/debian#${DEBIAN_MIRROR}#" \
        /etc/apt/sources.list.d/debian.sources; fi \
 && apt-get update \
 && apt-get install -y --no-install-recommends libpq-dev \
 && docker-php-ext-install pdo_pgsql \
 && a2enmod rewrite headers remoteip \
 && rm -rf /var/lib/apt/lists/*

# Behind nginx: take the visitor's address from X-Real-IP (login lockout is per IP), trusting only private networks.
RUN printf '%s\n' \
  '<VirtualHost *:80>' \
  '  DocumentRoot /var/www/app/public' \
  '  RemoteIPHeader X-Real-IP' \
  '  RemoteIPInternalProxy 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 127.0.0.1' \
  '  <Directory /var/www/app/public>' \
  '    AllowOverride None' \
  '    Require all granted' \
  '    RewriteEngine On' \
  '    RewriteCond %{REQUEST_FILENAME} !-f' \
  '    RewriteRule ^ index.php [QSA,L]' \
  '  </Directory>' \
  '  <LocationMatch "^/assets/">' \
  '    Header set Cache-Control "public, max-age=86400"' \
  '  </LocationMatch>' \
  '</VirtualHost>' > /etc/apache2/sites-available/000-default.conf \
 && echo 'ServerTokens Prod' >> /etc/apache2/apache2.conf && echo 'ServerSignature Off' >> /etc/apache2/apache2.conf \
 && printf 'upload_max_filesize=50M\npost_max_size=52M\nexpose_php=Off\nsession.cookie_httponly=1\nsession.gc_maxlifetime=28800\n' > /usr/local/etc/php/conf.d/portal.ini \
 && echo 'PassEnv DB_DSN DB_USER DB_PASSWORD AI_ADMIN_URL ADMIN_API_KEY PORTAL_ADMIN_EMAIL PORTAL_ADMIN_PASSWORD PORTAL_ADMIN_NAME PORTAL_SESSION_MINUTES PORTAL_REQUIRE_2FA' \
    > /etc/apache2/conf-enabled/env.conf

COPY src /var/www/app/src
COPY templates /var/www/app/templates
COPY public /var/www/app/public
COPY bin /var/www/app/bin
WORKDIR /var/www/app

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD php -r 'exit(@file_get_contents("http://127.0.0.1/login") === false ? 1 : 0);'
