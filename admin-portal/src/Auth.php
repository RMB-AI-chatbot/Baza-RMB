<?php
declare(strict_types=1);

namespace Baza\Portal;

/**
 * Staff sign-in:
 *  - password (bcrypt/argon via password_hash), then a 6-digit authenticator code when 2FA is on;
 *  - lockout after 5 failures in 15 minutes per account or per IP;
 *  - idle timeout (PORTAL_SESSION_MINUTES) and an 8-hour absolute limit;
 *  - every session ends when the account's password is changed or reset, 2FA is reset or the account is deactivated;
 *  - CSRF token per session.
 */
final class Auth
{
    private const MAX_FAILURES = 5;
    private const WINDOW_MINUTES = 15;
    private const MAX_SESSION_HOURS = 8;
    private const SECOND_STEP_SECONDS = 300;

    public static function bootstrapAdmin(): void
    {
        $db = Db::get();
        $count = (int)$db->query('SELECT count(*) FROM portal.users')->fetchColumn();
        $email = env('PORTAL_ADMIN_EMAIL');
        $password = env('PORTAL_ADMIN_PASSWORD');
        if ($count === 0 && $email && $password && strlen($password) >= 12) {
            $db->prepare('INSERT INTO portal.users (name, email, role, password_hash, must_change_password, created_by)
                          VALUES (?, ?, \'super_admin\', ?, true, \'bootstrap\')')
               ->execute([env('PORTAL_ADMIN_NAME', 'RMB Administrator'), strtolower($email), password_hash($password, PASSWORD_DEFAULT)]);
            Audit::log(strtolower($email), 'user_created', 'first super admin created from PORTAL_ADMIN_EMAIL');
        }
    }

    public static function require2fa(): bool
    {
        return in_array(strtolower((string)env('PORTAL_REQUIRE_2FA', 'false')), ['1', 'true', 'yes'], true);
    }

    private static function lockedOut(string $email): bool
    {
        $stmt = Db::get()->prepare("SELECT count(*) FROM portal.login_attempts
                              WHERE NOT success AND created_at > now() - make_interval(mins => ?) AND (email = ? OR ip_hash = ?)");
        $stmt->execute([self::WINDOW_MINUTES, $email, Audit::ipHash()]);
        return (int)$stmt->fetchColumn() >= self::MAX_FAILURES;
    }

    private static function attempt(string $email, bool $ok): void
    {
        Db::get()->prepare('INSERT INTO portal.login_attempts (email, ip_hash, success) VALUES (?, ?, ?)')
                 ->execute([$email, Audit::ipHash(), $ok ? 'true' : 'false']);
    }

    /** Step 1: password. @return array{ok: bool, second_step?: bool, error?: string} */
    public static function login(string $email, string $password): array
    {
        $db = Db::get();
        $email = strtolower(trim($email));
        if (self::lockedOut($email)) {
            return ['ok' => false, 'error' => 'Too many failed attempts. Try again in 15 minutes.'];
        }
        $stmt = $db->prepare('SELECT * FROM portal.users WHERE email = ? AND active');
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        $ok = $user && password_verify($password, $user['password_hash']);
        self::attempt($email, $ok);
        if (!$ok) {
            Audit::log($email, 'login_failed', 'wrong email or password');
            usleep(400000);
            return ['ok' => false, 'error' => 'Wrong email or password.'];
        }
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            $db->prepare('UPDATE portal.users SET password_hash = ? WHERE id = ?')
               ->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
        }
        if (!empty($user['totp_secret'])) {
            session_regenerate_id(true);
            $_SESSION = ['pending_uid' => (int)$user['id'], 'pending_at' => time(), 'csrf' => bin2hex(random_bytes(32))];
            return ['ok' => true, 'second_step' => true];
        }
        self::start($user);
        return ['ok' => true];
    }

    public static function pendingSecondStep(): bool
    {
        return !empty($_SESSION['pending_uid']) && time() - (int)($_SESSION['pending_at'] ?? 0) < self::SECOND_STEP_SECONDS;
    }

    /** Step 2: authenticator code. @return array{ok: bool, error?: string} */
    public static function verifySecondStep(string $code): array
    {
        if (!self::pendingSecondStep()) {
            $_SESSION = [];
            return ['ok' => false, 'error' => 'Your sign-in expired. Please enter your password again.', 'restart' => true];
        }
        $db = Db::get();
        $stmt = $db->prepare('SELECT * FROM portal.users WHERE id = ? AND active');
        $stmt->execute([$_SESSION['pending_uid']]);
        $user = $stmt->fetch();
        if (!$user || empty($user['totp_secret'])) {
            $_SESSION = [];
            return ['ok' => false, 'error' => 'Please sign in again.', 'restart' => true];
        }
        if (self::lockedOut($user['email'])) {
            $_SESSION = [];
            return ['ok' => false, 'error' => 'Too many failed attempts. Try again in 15 minutes.', 'restart' => true];
        }
        $step = Totp::verify($user['totp_secret'], $code, $user['totp_last_step'] !== null ? (int)$user['totp_last_step'] : null);
        self::attempt($user['email'], $step !== null);
        if ($step === null) {
            Audit::log($user['email'], 'login_failed', 'wrong authenticator code');
            usleep(400000);
            return ['ok' => false, 'error' => 'That code is not valid. Check the time on your phone and try the newest code.'];
        }
        $db->prepare('UPDATE portal.users SET totp_last_step = ? WHERE id = ?')->execute([$step, $user['id']]);
        self::start($user);
        return ['ok' => true];
    }

    /** @param array<string, mixed> $user */
    private static function start(array $user): void
    {
        session_regenerate_id(true);
        $_SESSION = [
            'uid' => (int)$user['id'],
            'ver' => (int)$user['session_version'],
            'csrf' => bin2hex(random_bytes(32)),
            'last' => time(),
            'started' => time(),
        ];
        Db::get()->prepare('UPDATE portal.users SET last_login_at = now() WHERE id = ?')->execute([$user['id']]);
        Audit::log($user['email'], 'login', empty($user['totp_secret']) ? 'password' : 'password + authenticator code');
    }

    public static function logout(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'],
                                           'httponly' => true, 'samesite' => 'Strict']);
        }
        session_destroy();
    }

    /** Current staff member, or null (enforces timeouts and session invalidation). @return array<string, mixed>|null */
    public static function user(): ?array
    {
        if (empty($_SESSION['uid'])) {
            return null;
        }
        $idle = 60 * (int)env('PORTAL_SESSION_MINUTES', '30');
        if (time() - (int)($_SESSION['last'] ?? 0) > $idle || time() - (int)($_SESSION['started'] ?? 0) > self::MAX_SESSION_HOURS * 3600) {
            self::logout();
            return null;
        }
        $stmt = Db::get()->prepare('SELECT id, name, email, role, must_change_password, session_version,
                                           (totp_secret IS NOT NULL) AS totp_enabled
                                    FROM portal.users WHERE id = ? AND active');
        $stmt->execute([$_SESSION['uid']]);
        $u = $stmt->fetch();
        if (!$u || (int)$u['session_version'] !== (int)($_SESSION['ver'] ?? 0)) {
            self::logout();
            return null;
        }
        $_SESSION['last'] = time();
        return $u;
    }

    /** Why this user may only reach their own account settings for now, or null. @param array<string, mixed> $u */
    public static function restriction(array $u): ?string
    {
        if ($u['must_change_password']) {
            return 'change_password';
        }
        if (self::require2fa() && !$u['totp_enabled']) {
            return 'enable_2fa';
        }
        return null;
    }

    public static function csrf(): string
    {
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf'];
    }

    public static function checkCsrf(?string $token): bool
    {
        return is_string($token) && !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], $token);
    }
}
