<?php
/**
 * Create a super admin, or recover an existing account (new temporary password, two-factor removed,
 * reactivated, made super admin). For the server's IT team, e.g. when the only super admin lost their phone.
 *
 *   docker compose exec portal php bin/create-admin.php name@rmb.gov.rw "Full Name"
 *
 * Prints a temporary password, which must be replaced at first sign-in.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}

spl_autoload_register(function (string $class): void {
    $prefix = 'Baza\\Portal\\';
    if (str_starts_with($class, $prefix)) {
        require __DIR__ . '/../src/' . substr($class, strlen($prefix)) . '.php';
    }
});
function env(string $key, ?string $default = null): ?string
{
    $v = getenv($key);
    return ($v === false || $v === '') ? $default : $v;
}

use Baza\Portal\{Audit, Db, Users};

$email = strtolower(trim($argv[1] ?? ''));
$name = trim($argv[2] ?? '');
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "usage: php bin/create-admin.php <email> [\"Full Name\"]\n");
    exit(2);
}

$db = Db::get();
$temp = Users::tempPassword();
$hash = password_hash($temp, PASSWORD_DEFAULT);
$s = $db->prepare('SELECT id FROM portal.users WHERE email = ?');
$s->execute([$email]);
if ($id = $s->fetchColumn()) {
    $db->prepare("UPDATE portal.users SET role = 'super_admin', active = true, password_hash = ?, must_change_password = true,
                         totp_secret = NULL, totp_pending = NULL, totp_last_step = NULL, session_version = session_version + 1,
                         name = COALESCE(NULLIF(?, ''), name), updated_at = now() WHERE id = ?")
       ->execute([$hash, $name, $id]);
    Audit::log('server-cli', 'password_reset', "$email recovered from the server command line (super admin, 2FA removed)");
    echo "Account $email recovered as Super Admin.\n";
} else {
    $db->prepare("INSERT INTO portal.users (name, email, role, password_hash, must_change_password, created_by)
                  VALUES (?, ?, 'super_admin', ?, true, 'server-cli')")
       ->execute([$name !== '' ? $name : $email, $email, $hash]);
    Audit::log('server-cli', 'user_created', "$email as Super Admin (server command line)");
    echo "Super Admin $email created.\n";
}
echo "Temporary password: $temp\n(It must be replaced at first sign-in.)\n";
