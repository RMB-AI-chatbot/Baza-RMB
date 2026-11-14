<?php
declare(strict_types=1);

namespace Baza\Portal;

/** Staff accounts (Figma "Users & Roles"). Only super admins manage other accounts; everyone manages their own password and 2FA. */
final class Users
{
    private const COMMON = ['password', 'passw0rd', '123456', 'qwerty', 'rwanda', 'kigali', 'rmb', 'admin', 'welcome', 'letmein',
                            'baza', 'mining', 'changeme', 'change-me'];

    /** @return list<array<string, mixed>> */
    public static function all(): array
    {
        return Db::get()->query(
            "SELECT id, name, email, role, active, last_login_at, created_at, created_by, must_change_password,
                    (totp_secret IS NOT NULL) AS totp_enabled,
                    (last_login_at > date_trunc('day', now())) AS logged_in_today
             FROM portal.users ORDER BY active DESC, name"
        )->fetchAll();
    }

    public static function checkPassword(string $pw, string $email): void
    {
        if (strlen($pw) < 12) {
            throw new \InvalidArgumentException('The new password must have at least 12 characters.');
        }
        if (strlen($pw) > 200) {
            throw new \InvalidArgumentException('The new password is too long.');
        }
        $lower = strtolower($pw);
        $local = strtolower(strstr($email, '@', true) ?: $email);
        if (strlen($local) >= 4 && str_contains($lower, $local)) {
            throw new \InvalidArgumentException('The password must not contain your email name.');
        }
        if (count(array_unique(str_split($pw))) < 6) {
            throw new \InvalidArgumentException('The password is too simple: use more different characters.');
        }
        foreach (self::COMMON as $w) {
            if (preg_replace('/[^a-z]/', '', $lower) === preg_replace('/[^a-z]/', '', $w) || $lower === $w) {
                throw new \InvalidArgumentException('This password is too common.');
            }
        }
    }

    private static function find(int $id): array
    {
        $s = Db::get()->prepare('SELECT * FROM portal.users WHERE id = ?');
        $s->execute([$id]);
        $u = $s->fetch();
        if (!$u) {
            throw new \InvalidArgumentException('Account not found.');
        }
        return $u;
    }

    private static function activeSuperAdmins(): int
    {
        return (int)Db::get()->query("SELECT count(*) FROM portal.users WHERE role = 'super_admin' AND active")->fetchColumn();
    }

    /** @param array<string, mixed> $in */
    public static function create(array $in, string $by): array
    {
        $name = trim((string)($in['name'] ?? ''));
        $email = strtolower(trim((string)($in['email'] ?? '')));
        $role = (string)($in['role'] ?? '');
        if ($name === '' || strlen($name) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL) || !isset(Roles::LABELS[$role])) {
            throw new \InvalidArgumentException('Name, a valid email and a role are required.');
        }
        $temp = self::tempPassword();
        try {
            Db::get()->prepare('INSERT INTO portal.users (name, email, role, password_hash, must_change_password, created_by)
                                VALUES (?, ?, ?, ?, true, ?)')
                     ->execute([$name, $email, $role, password_hash($temp, PASSWORD_DEFAULT), $by]);
        } catch (\PDOException $e) {
            throw new \InvalidArgumentException('An account with this email already exists.');
        }
        Audit::log($by, 'user_created', "$email as " . Roles::LABELS[$role]);
        return ['email' => $email, 'temporary_password' => $temp];
    }

    /** @param array<string, mixed> $in */
    public static function update(int $id, array $in, array $actor): array
    {
        $db = Db::get();
        $u = self::find($id);
        $self = $id === (int)$actor['id'];
        $by = (string)$actor['email'];
        $isLastSuper = $u['role'] === 'super_admin' && $u['active'] && self::activeSuperAdmins() <= 1;

        if (isset($in['name'])) {
            $name = trim((string)$in['name']);
            if ($name === '' || strlen($name) > 120) {
                throw new \InvalidArgumentException('Enter a name.');
            }
            $db->prepare('UPDATE portal.users SET name = ?, updated_at = now() WHERE id = ?')->execute([$name, $id]);
            Audit::log($by, 'user_updated', "{$u['email']}: name changed");
        }
        if (isset($in['role']) && $in['role'] !== $u['role']) {
            if (!isset(Roles::LABELS[$in['role']])) {
                throw new \InvalidArgumentException('Unknown role.');
            }
            if ($self) {
                throw new \InvalidArgumentException('You cannot change your own role.');
            }
            if ($isLastSuper) {
                throw new \InvalidArgumentException('This is the last active super admin. Make someone else super admin first.');
            }
            $db->prepare('UPDATE portal.users SET role = ?, updated_at = now() WHERE id = ?')->execute([$in['role'], $id]);
            Audit::log($by, 'role_changed', "{$u['email']}: " . (Roles::LABELS[$u['role']] ?? $u['role']) . ' → ' . Roles::LABELS[$in['role']]);
        }
        if (isset($in['active']) && (bool)$in['active'] !== (bool)$u['active']) {
            if ($self) {
                throw new \InvalidArgumentException('You cannot deactivate your own account.');
            }
            if (!$in['active'] && $isLastSuper) {
                throw new \InvalidArgumentException('This is the last active super admin and cannot be deactivated.');
            }
            $db->prepare('UPDATE portal.users SET active = ?, session_version = session_version + 1, updated_at = now() WHERE id = ?')
               ->execute([$in['active'] ? 'true' : 'false', $id]);
            Audit::log($by, $in['active'] ? 'user_activated' : 'user_deactivated', $u['email']);
        }
        $out = ['ok' => true];
        if (!empty($in['reset_password'])) {
            if ($self) {
                throw new \InvalidArgumentException('Use "My account" to change your own password.');
            }
            $temp = self::tempPassword();
            $db->prepare('UPDATE portal.users SET password_hash = ?, must_change_password = true, session_version = session_version + 1,
                                                  updated_at = now() WHERE id = ?')
               ->execute([password_hash($temp, PASSWORD_DEFAULT), $id]);
            $out['temporary_password'] = $temp;
            Audit::log($by, 'password_reset', "{$u['email']}: temporary password issued, sessions ended");
        }
        if (!empty($in['reset_2fa'])) {
            if ($self) {
                throw new \InvalidArgumentException('Use "My account" to change your own two-factor settings.');
            }
            $db->prepare('UPDATE portal.users SET totp_secret = NULL, totp_pending = NULL, totp_last_step = NULL,
                                                  session_version = session_version + 1, updated_at = now() WHERE id = ?')->execute([$id]);
            Audit::log($by, '2fa_reset', "{$u['email']}: authenticator removed, sessions ended");
        }
        return $out;
    }

    /** Changes the user's password; their other sessions end, this one continues. */
    public static function changePassword(array $user, string $current, string $new): void
    {
        $u = self::find((int)$user['id']);
        if (!password_verify($current, (string)$u['password_hash'])) {
            Audit::log($u['email'], 'password_change_failed', 'wrong current password');
            throw new \InvalidArgumentException('Current password is wrong.');
        }
        if (hash_equals($current, $new)) {
            throw new \InvalidArgumentException('Choose a password different from the current one.');
        }
        self::checkPassword($new, $u['email']);
        Db::get()->prepare('UPDATE portal.users SET password_hash = ?, must_change_password = false, password_changed_at = now(),
                                                    session_version = session_version + 1, updated_at = now() WHERE id = ?')
                 ->execute([password_hash($new, PASSWORD_DEFAULT), $u['id']]);
        $_SESSION['ver'] = (int)$u['session_version'] + 1;
        Audit::log($u['email'], 'password_changed');
    }

    /** Starts authenticator enrolment: a new secret, confirmed with a first code. */
    public static function totpSetup(array $user): array
    {
        $secret = Totp::newSecret();
        Db::get()->prepare('UPDATE portal.users SET totp_pending = ? WHERE id = ?')->execute([$secret, $user['id']]);
        return ['secret' => trim(chunk_split($secret, 4, ' ')), 'uri' => Totp::uri($secret, $user['email'])];
    }

    public static function totpEnable(array $user, string $code): void
    {
        $u = self::find((int)$user['id']);
        if (empty($u['totp_pending'])) {
            throw new \InvalidArgumentException('Start the set-up again.');
        }
        $step = Totp::verify($u['totp_pending'], $code);
        if ($step === null) {
            throw new \InvalidArgumentException('That code is not valid. Check the key and the time on your phone, then try the newest code.');
        }
        Db::get()->prepare('UPDATE portal.users SET totp_secret = totp_pending, totp_pending = NULL, totp_last_step = ?,
                                                    session_version = session_version + 1, updated_at = now() WHERE id = ?')
                 ->execute([$step, $u['id']]);
        $_SESSION['ver'] = (int)$u['session_version'] + 1;
        Audit::log($u['email'], '2fa_enabled');
    }

    public static function totpDisable(array $user, string $password): void
    {
        if (Auth::require2fa()) {
            throw new \InvalidArgumentException('Two-factor sign-in is required for all staff accounts.');
        }
        $u = self::find((int)$user['id']);
        if (!password_verify($password, (string)$u['password_hash'])) {
            throw new \InvalidArgumentException('Password is wrong.');
        }
        Db::get()->prepare('UPDATE portal.users SET totp_secret = NULL, totp_pending = NULL, totp_last_step = NULL, updated_at = now()
                            WHERE id = ?')->execute([$u['id']]);
        Audit::log($u['email'], '2fa_disabled');
    }

    public static function tempPassword(): string
    {
        // 16 characters without look-alikes (0/O, 1/l/I), easy to read out over the phone.
        $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        $out = '';
        for ($i = 0; $i < 16; $i++) {
            $out .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        return $out;
    }
}
