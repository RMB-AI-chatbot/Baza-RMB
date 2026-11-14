<?php
/**
 * baza-RMB admin portal (staff dashboard).
 *
 *   GET  /login, POST /login                    sign in: password, then authenticator code when 2FA is on
 *   POST /logout
 *   GET  /                                      the dashboard app (requires sign-in)
 *   GET  /portal/me                             current staff member, role, capabilities, CSRF token
 *   POST /portal/password                       change own password
 *   POST /portal/2fa/setup | /enable | /disable own authenticator app
 *   GET|POST /portal/users, PATCH /portal/users/{id}   staff accounts (super admin)
 *   GET  /portal/audit                          security audit trail (super admin)
 *   *    /api/<path>                            forwarded to the AI service admin API (see Proxy)
 *
 * Until a user has replaced a temporary password (and, with PORTAL_REQUIRE_2FA=true, set up an authenticator),
 * only /portal/me, /portal/password and /portal/2fa/* answer.
 *
 * Dev:  php -d extension=pdo_pgsql -d extension=curl -S 127.0.0.1:8082 -t admin-portal/public admin-portal/public/index.php
 */
declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
if (PHP_SAPI === 'cli-server' && $path !== '/' && is_file(__DIR__ . $path)) {
    return false; // static assets with the PHP dev server
}

require __DIR__ . '/../src/bootstrap.php';

use Baza\Portal\{Audit, Auth, Http, Proxy, Roles, Users};

$method = $_SERVER['REQUEST_METHOD'];

try {
    Auth::bootstrapAdmin();

    if ($path === '/login') {
        $error = null;
        if ($method === 'GET' && !empty($_GET['restart'])) {
            $_SESSION = [];
        }
        if ($method === 'GET' && Auth::user()) {
            header('Location: /');
            exit;
        }
        if ($method === 'POST') {
            if (!Auth::checkCsrf($_POST['csrf'] ?? null)) {
                $error = 'Your session expired. Please try again.';
            } elseif (isset($_POST['code'])) {
                $r = Auth::verifySecondStep((string)$_POST['code']);
                if ($r['ok']) {
                    header('Location: /');
                    exit;
                }
                $error = $r['error'];
            } else {
                $r = Auth::login((string)($_POST['email'] ?? ''), (string)($_POST['password'] ?? ''));
                if ($r['ok'] && empty($r['second_step'])) {
                    header('Location: /');
                    exit;
                }
                $error = $r['error'] ?? null;
            }
        }
        $secondStep = Auth::pendingSecondStep();
        $csrf = Auth::csrf();
        require __DIR__ . '/../templates/login.php';
        exit;
    }

    if ($path === '/logout' && $method === 'POST') {
        $u = Auth::user();
        if ($u && Auth::checkCsrf($_POST['csrf'] ?? null)) {
            Audit::log($u['email'], 'logout');
        }
        Auth::logout();
        header('Location: /login');
        exit;
    }

    $user = Auth::user();
    if ($path === '/') {
        if (!$user) {
            header('Location: /login');
            exit;
        }
        header('Cache-Control: no-store');
        readfile(__DIR__ . '/../templates/app.html');
        exit;
    }
    if (!$user) {
        Http::json(['detail' => 'Not logged in.'], 401);
    }
    if ($method !== 'GET' && !Auth::checkCsrf($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
        Http::json(['detail' => 'Invalid or missing CSRF token. Reload the page.'], 403);
    }

    if ($path === '/portal/me') {
        Http::json([
            'id' => (int)$user['id'], 'name' => $user['name'], 'email' => $user['email'], 'role' => $user['role'],
            'role_label' => Roles::LABELS[$user['role']], 'caps' => Roles::caps($user['role']),
            'csrf' => Auth::csrf(), 'must_change_password' => (bool)$user['must_change_password'],
            'totp_enabled' => (bool)$user['totp_enabled'], 'require_2fa' => Auth::require2fa(),
            'restriction' => Auth::restriction($user),
            'roles' => Roles::LABELS, 'session_minutes' => (int)env('PORTAL_SESSION_MINUTES', '30'),
        ]);
    }

    if ($path === '/portal/password' && $method === 'POST') {
        $b = Http::body();
        Users::changePassword($user, (string)($b['current'] ?? ''), (string)($b['new'] ?? ''));
        Http::json(['ok' => true]);
    }

    if ($path === '/portal/2fa/setup' && $method === 'POST') {
        Http::json(Users::totpSetup($user));
    }
    if ($path === '/portal/2fa/enable' && $method === 'POST') {
        Users::totpEnable($user, (string)(Http::body()['code'] ?? ''));
        Http::json(['ok' => true]);
    }
    if ($path === '/portal/2fa/disable' && $method === 'POST') {
        Users::totpDisable($user, (string)(Http::body()['password'] ?? ''));
        Http::json(['ok' => true]);
    }

    // Everything below needs a finished account set-up (own password, and 2FA when required).
    if (($why = Auth::restriction($user)) !== null) {
        Http::json(['detail' => $why === 'change_password'
            ? 'Choose your own password first.' : 'Set up two-factor sign-in first.', 'restriction' => $why], 403);
    }

    if (str_starts_with($path, '/portal/users')) {
        if (!Roles::can($user['role'], 'users_manage')) {
            Http::json(['detail' => 'Only super admins manage staff accounts.'], 403);
        }
        if ($path === '/portal/users' && $method === 'GET') {
            Http::json(['users' => Users::all(), 'roles' => Roles::LABELS, 'require_2fa' => Auth::require2fa()]);
        }
        if ($path === '/portal/users' && $method === 'POST') {
            Http::json(Users::create(Http::body(), $user['email']), 201);
        }
        if (preg_match('#^/portal/users/(\d+)$#', $path, $m) && $method === 'PATCH') {
            Http::json(Users::update((int)$m[1], Http::body(), $user));
        }
    }

    if ($path === '/portal/audit' && $method === 'GET') {
        if (!Roles::can($user['role'], 'audit_read')) {
            Http::json(['detail' => 'Only super admins can read the audit log.'], 403);
        }
        Http::json(Audit::list((int)($_GET['page'] ?? 1), trim((string)($_GET['q'] ?? ''))));
    }

    if (preg_match('#^/api/([A-Za-z0-9/_-]+)$#', $path, $m)) {
        Proxy::handle($method, $m[1], $user);
    }

    Http::json(['detail' => 'not found'], 404);
} catch (\InvalidArgumentException $e) {
    Http::json(['detail' => $e->getMessage()], 422);
} catch (\Throwable $e) {
    error_log('[admin-portal] ' . $e::class . ': ' . $e->getMessage());
    Http::json(['detail' => 'Internal error.'], 500);
}
