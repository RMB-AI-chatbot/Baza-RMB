<?php
/**
 * baza-RMB admin portal bootstrap: autoloader, configuration, secure session.
 *
 * Configuration (environment variables):
 *   DB_DSN, DB_USER, DB_PASSWORD     PostgreSQL (schema "portal" for staff accounts)
 *   AI_ADMIN_URL                     e.g. http://ai:8000/api/v1/admin  (internal network)
 *   ADMIN_API_KEY                    sent server-side only, never to the browser
 *   PORTAL_ADMIN_EMAIL / _PASSWORD / _NAME   first super admin, created when no account exists
 *   PORTAL_SESSION_MINUTES           idle timeout (default 30; sessions also end after 8 hours)
 *   PORTAL_REQUIRE_2FA               true = every staff member must use an authenticator app
 */
declare(strict_types=1);

spl_autoload_register(function (string $class): void {
    $prefix = 'Baza\\Portal\\';
    if (str_starts_with($class, $prefix)) {
        $file = __DIR__ . '/' . substr($class, strlen($prefix)) . '.php';
        if (is_file($file)) {
            require $file;
        }
    }
});

function env(string $key, ?string $default = null): ?string
{
    $v = getenv($key);
    return ($v === false || $v === '') ? $default : $v;
}

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_name('baza_portal');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $https,
    'httponly' => true,
    'samesite' => 'Strict',
]);
ini_set('session.use_strict_mode', '1');
session_start();

header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
     . "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; "
     . "base-uri 'self'; form-action 'self'; object-src 'none'");
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
header('Cross-Origin-Opener-Policy: same-origin');
if ($https) {
    header('Strict-Transport-Security: max-age=31536000');
}
