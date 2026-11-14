FROM php:8.3-apache

# Optional Debian mirror (when deb.debian.org is slow or blocked), e.g. http://ftp.de.debian.org/debian
ARG DEBIAN_MIRROR=
RUN if [ -n "$DEBIAN_MIRROR" ]; then \
      sed -i "s#http://deb.debian.org/debian-security#http://security.debian.org/debian-security#; s#http://deb.debian.org/debian#${DEBIAN_MIRROR}#" \
        /etc/apt/sources.list.d/debian.sources; fi \
 && apt-get update \
 && apt-get install -y --no-install-recommends libpq-dev \
 && docker-php-ext-install pdo_pgsql \
 && a2enmod rewrite headers \
 && rm -rf /var/lib/apt/lists/*

# Front controller: every request goes to public/index.php; pass the Authorization header through.
RUN printf '%s\n' \
  '<VirtualHost *:80>' \
  '  DocumentRoot /var/www/app/public' \
  '  <Directory /var/www/app/public>' \
  '    AllowOverride None' \
  '    Require all granted' \
  '    RewriteEngine On' \
  '    RewriteCond %{HTTP:Authorization} ^(.*)' \
  '    RewriteRule .* - [e=HTTP_AUTHORIZATION:%1]' \
  '    RewriteCond %{REQUEST_FILENAME} !-f' \
  '    RewriteRule ^ index.php [QSA,L]' \
  '  </Directory>' \
  '</VirtualHost>' > /etc/apache2/sites-available/000-default.conf \
 && echo 'ServerTokens Prod' >> /etc/apache2/apache2.conf && echo 'ServerSignature Off' >> /etc/apache2/apache2.conf

COPY src /var/www/app/src
COPY public /var/www/app/public

# Make env vars visible to PHP under Apache
RUN echo 'PassEnv DB_DSN DB_USER DB_PASSWORD CASE_SERVICE_TOKEN' > /etc/apache2/conf-enabled/env.conf

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD php -r 'exit(@file_get_contents("http://127.0.0.1/health") === false ? 1 : 0);'
