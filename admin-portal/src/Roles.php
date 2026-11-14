<?php
declare(strict_types=1);

namespace Baza\Portal;

/**
 * Roles and what each may do. The UI hides what a role cannot do; the proxy enforces it.
 * (Figma "Users & Roles": Super Admin, Licensing Officer, Complaints Officer, Analyst, Support Agent.)
 */
final class Roles
{
    public const LABELS = [
        'super_admin' => 'Super Admin',
        'licensing_officer' => 'Licensing Officer',
        'complaints_officer' => 'Complaints Officer',
        'analyst' => 'Analyst',
        'support_agent' => 'Support Agent',
    ];

    private const CAPS = [
        'super_admin' => ['*'],
        'licensing_officer' => ['dashboard', 'conversations', 'documents_read', 'documents_write', 'gaps_read', 'gaps_write',
                                'faq_read', 'faq_write', 'faq_publish', 'cases_read', 'settings_read'],
        'complaints_officer' => ['dashboard', 'conversations', 'gaps_read', 'gaps_write', 'faq_read', 'faq_write',
                                 'cases_read', 'cases_write', 'cases_confidential', 'settings_read'],
        'analyst' => ['dashboard', 'conversations', 'documents_read', 'gaps_read', 'faq_read', 'cases_read', 'settings_read'],
        'support_agent' => ['dashboard', 'gaps_read', 'faq_read', 'faq_write', 'cases_read', 'cases_write'],
    ];

    public const ALL = ['dashboard', 'conversations', 'documents_read', 'documents_write', 'gaps_read', 'gaps_write',
                        'faq_read', 'faq_write', 'faq_publish', 'cases_read', 'cases_write', 'cases_confidential',
                        'settings_read', 'settings_write', 'users_manage', 'audit_read'];

    /** @return list<string> */
    public static function caps(string $role): array
    {
        $c = self::CAPS[$role] ?? [];
        return $c === ['*'] ? self::ALL : $c;
    }

    public static function can(string $role, string $cap): bool
    {
        return in_array($cap, self::caps($role), true);
    }

    /** Capability needed to call METHOD /api/<path> through the proxy, or null if the route is not allowed at all. */
    public static function capFor(string $method, string $path): ?string
    {
        $rules = [
            ['GET', '#^analytics/summary$#', 'dashboard'],
            ['GET', '#^conversations(/[0-9a-f-]{36})?$#', 'conversations'],
            ['GET', '#^documents(/[a-z0-9-]+/chunks)?$#', 'documents_read'],
            ['POST', '#^documents$#', 'documents_write'],
            ['PATCH', '#^documents/[a-z0-9-]+$#', 'documents_write'],
            ['POST', '#^documents/[a-z0-9-]+/reindex$#', 'documents_write'],
            ['GET', '#^unanswered$#', 'gaps_read'],
            ['PATCH', '#^unanswered/\d+$#', 'gaps_write'],
            ['GET', '#^faq$#', 'faq_read'],
            ['POST', '#^faq$#', 'faq_write'],
            ['PATCH', '#^faq/\d+$#', 'faq_write'],
            ['POST', '#^faq/\d+/(publish|retire)$#', 'faq_publish'],
            ['GET', '#^cases(/routing|/RMB-\d{4}-[A-Z0-9]{6})?$#', 'cases_read'],
            ['PATCH', '#^cases/RMB-\d{4}-[A-Z0-9]{6}$#', 'cases_write'],
            ['GET', '#^settings$#', 'settings_read'],
            ['PUT', '#^settings$#', 'settings_write'],
        ];
        foreach ($rules as [$m, $re, $cap]) {
            if ($m === $method && preg_match($re, $path)) {
                return $cap;
            }
        }
        return null;
    }
}
