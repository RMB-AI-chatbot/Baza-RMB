<?php
declare(strict_types=1);

namespace Baza\Portal;

/** Security audit trail: sign-ins, account changes and every change made through the portal. */
final class Audit
{
    public static function ipHash(): string
    {
        return substr(hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . env('ADMIN_API_KEY', '')), 0, 32);
    }

    public static function log(string $email, string $action, string $detail = '', string $method = '-', string $path = '-',
                               ?int $status = null): void
    {
        try {
            Db::get()->prepare('INSERT INTO portal.audit_log (user_email, action, detail, method, path, status, ip_hash)
                                VALUES (?, ?, ?, ?, ?, ?, ?)')
                     ->execute([$email, $action, preg_match('/^.{0,500}/us', $detail, $m) ? $m[0] : '', $method, $path, $status, self::ipHash()]);
        } catch (\Throwable $e) {
            error_log('[admin-portal] audit write failed: ' . $e->getMessage());
        }
    }

    /** @return array{items: list<array<string, mixed>>, total: int} */
    public static function list(int $page, string $q = ''): array
    {
        $size = 50;
        $where = '';
        $args = [];
        if ($q !== '') {
            $where = 'WHERE user_email ILIKE ? OR action ILIKE ? OR path ILIKE ? OR detail ILIKE ?';
            $like = '%' . $q . '%';
            $args = [$like, $like, $like, $like];
        }
        $db = Db::get();
        $c = $db->prepare("SELECT count(*) FROM portal.audit_log $where");
        $c->execute($args);
        $s = $db->prepare("SELECT id, user_email, coalesce(action, 'api_change') AS action, detail, method, path, status, created_at
                           FROM portal.audit_log $where ORDER BY created_at DESC LIMIT $size OFFSET " . (max(1, $page) - 1) * $size);
        $s->execute($args);
        return ['items' => $s->fetchAll(), 'total' => (int)$c->fetchColumn(), 'page_size' => $size];
    }
}
