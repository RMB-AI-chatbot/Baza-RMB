<?php
declare(strict_types=1);

namespace Baza\Cases;

use PDO;
use PDOException;

final class CaseRepository
{
    private const STATUSES = ['new', 'assigned', 'in_progress', 'waiting_for_user', 'resolved', 'closed'];
    private const RELEVANCE = ['relevant', 'unclear', 'spam'];
    private const PRIORITIES = ['urgent', 'high', 'normal', 'low'];
    // No 0/O/1/I to avoid misreading reference numbers over the phone.
    private const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public function __construct(private PDO $db)
    {
    }

    /** @return list<array<string, mixed>> */
    public function routing(): array
    {
        return $this->db->query('SELECT * FROM cases.routing WHERE active ORDER BY case_type')->fetchAll();
    }

    /**
     * @param array<string, mixed> $in
     * @return array<string, mixed>
     */
    public function create(array $in): array
    {
        $type = (string)($in['type'] ?? '');
        $route = $this->db->prepare('SELECT * FROM cases.routing WHERE case_type = ? AND active');
        $route->execute([$type]);
        $routing = $route->fetch();
        if (!$routing) {
            throw new \InvalidArgumentException('unknown case type');
        }
        $summary = trim((string)($in['summary'] ?? ''));
        if ($summary === '' || preg_match_all('/./us', $summary) > 500) {
            throw new \InvalidArgumentException('summary is required (max 500 characters)');
        }
        $anonymous = (bool)($in['anonymous'] ?? false);
        $details = is_array($in['details'] ?? null) ? $in['details'] : [];
        $contact = $anonymous ? null : (is_array($in['contact'] ?? null) ? $in['contact'] : null);
        $excerpt = is_array($in['conversation_excerpt'] ?? null) ? $in['conversation_excerpt'] : [];
        $sessionId = $anonymous ? null : ($in['session_id'] ?? null);
        $relevance = in_array($in['triage_relevance'] ?? null, self::RELEVANCE, true) ? $in['triage_relevance'] : 'unclear';
        $priority = in_array($in['triage_priority'] ?? null, self::PRIORITIES, true) ? $in['triage_priority'] : 'normal';
        $reason = isset($in['triage_reason']) ? substr((string)$in['triage_reason'], 0, 300) : null;
        $triageBy = substr((string)($in['triage_by'] ?? 'ai'), 0, 60);
        if ($sessionId !== null && !preg_match('/^[0-9a-f-]{36}$/i', (string)$sessionId)) {
            $sessionId = null;
        }

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $ref = $this->newReference();
            try {
                $this->db->beginTransaction();
                $stmt = $this->db->prepare(
                    'INSERT INTO cases.cases (reference, case_type, summary, details, contact, anonymous, confidential,
                         routed_to, expected_response_time, language, session_id, conversation_excerpt,
                         triage_relevance, triage_priority, triage_reason, triage_by)
                     VALUES (?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?) RETURNING id, created_at'
                );
                $stmt->execute([
                    $ref, $type, $summary, json_encode($details, JSON_UNESCAPED_UNICODE),
                    $contact === null ? null : json_encode($contact, JSON_UNESCAPED_UNICODE),
                    $anonymous ? 'true' : 'false', ((bool)($in['confidential'] ?? false)) ? 'true' : 'false',
                    $routing['routed_to'], $routing['expected_response_time'], $in['language'] ?? null,
                    $sessionId, json_encode($excerpt, JSON_UNESCAPED_UNICODE),
                    $relevance, $priority, $reason, $triageBy,
                ]);
                $row = $stmt->fetch();
                $this->event((int)$row['id'], 'created', 'chatbot', "triage: $relevance / $priority");
                $this->db->commit();
                return [
                    'reference_number' => $ref,
                    'type' => $type,
                    'status' => 'new',
                    'routed_to' => $routing['routed_to'],
                    'expected_response_time' => $routing['expected_response_time'],
                    'routing_is_placeholder' => (bool)$routing['is_placeholder'],
                    'created_at' => self::iso($row)['created_at'],
                ];
            } catch (PDOException $e) {
                $this->db->rollBack();
                if ($e->getCode() !== '23505') { // unique violation -> retry with another reference
                    throw $e;
                }
            }
        }
        throw new \RuntimeException('could not allocate a reference number');
    }

    /** Public status: no personal data. @return array<string, mixed>|null */
    public function status(string $ref): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT reference AS reference_number, case_type AS type, status, routed_to, created_at, updated_at
             FROM cases.cases WHERE reference = ?'
        );
        $stmt->execute([$ref]);
        $row = $stmt->fetch();
        return $row ? self::iso($row) : null;
    }

    /** @return array<string, mixed>|null */
    public function details(string $ref): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM cases.cases WHERE reference = ?');
        $stmt->execute([$ref]);
        $case = $stmt->fetch();
        if (!$case) {
            return null;
        }
        foreach (['details', 'contact', 'conversation_excerpt'] as $k) {
            $case[$k] = $case[$k] === null ? null : json_decode((string)$case[$k], true);
        }
        $ev = $this->db->prepare('SELECT event, actor, note, created_at FROM cases.case_events WHERE case_id = ? ORDER BY id');
        $ev->execute([$case['id']]);
        $case['events'] = array_map([self::class, 'iso'], $ev->fetchAll());
        unset($case['id']);
        return self::iso($case);
    }

    /** @return list<array<string, mixed>> */
    /**
     * @param string|null $relevance  'inbox' (relevant + unclear, the default view), 'relevant', 'unclear', 'spam' or null (all)
     */
    public function list(?string $status, ?string $type, int $limit, int $offset, ?string $relevance = 'inbox'): array
    {
        $rel = match ($relevance) {
            'inbox' => ['relevant', 'unclear'],
            'relevant', 'unclear', 'spam' => [$relevance],
            default => self::RELEVANCE,
        };
        $in = implode(',', array_fill(0, count($rel), '?'));
        $stmt = $this->db->prepare(
            "SELECT reference AS reference_number, case_type AS type, status, summary, anonymous, confidential,
                    routed_to, assigned_to, triage_relevance, triage_priority, triage_reason, triage_by, created_at, updated_at
             FROM cases.cases
             WHERE (CAST(? AS text) IS NULL OR status = ?) AND (CAST(? AS text) IS NULL OR case_type = ?)
               AND triage_relevance IN ($in)
             ORDER BY CASE triage_priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                      created_at DESC
             LIMIT ? OFFSET ?"
        );
        $stmt->execute([$status, $status, $type, $type, ...$rel, $limit, $offset]);
        return array_map([self::class, 'iso'], $stmt->fetchAll());
    }

    /**
     * @param array<string, mixed> $in  {status?, assigned_to?, note?, actor}
     * @return array<string, mixed>|null
     */
    public function update(string $ref, array $in): ?array
    {
        $actor = trim((string)($in['actor'] ?? ''));
        if ($actor === '') {
            throw new \InvalidArgumentException('actor is required (staff member making the change)');
        }
        $status = $in['status'] ?? null;
        if ($status !== null && !in_array($status, self::STATUSES, true)) {
            throw new \InvalidArgumentException('invalid status');
        }
        $assigned = $in['assigned_to'] ?? null;
        $relevance = $in['triage_relevance'] ?? null;
        if ($relevance !== null && !in_array($relevance, self::RELEVANCE, true)) {
            throw new \InvalidArgumentException('invalid relevance');
        }
        $priority = $in['triage_priority'] ?? null;
        if ($priority !== null && !in_array($priority, self::PRIORITIES, true)) {
            throw new \InvalidArgumentException('invalid priority');
        }
        $staffTriage = ($relevance !== null || $priority !== null) ? $actor : null;

        $this->db->beginTransaction();
        $stmt = $this->db->prepare(
            'UPDATE cases.cases SET status = COALESCE(?, status), assigned_to = COALESCE(?, assigned_to),
                    triage_relevance = COALESCE(?, triage_relevance), triage_priority = COALESCE(?, triage_priority),
                    triage_by = COALESCE(?, triage_by), updated_at = now()
             WHERE reference = ? RETURNING id, status'
        );
        $stmt->execute([$status, $assigned, $relevance, $priority, $staffTriage, $ref]);
        $row = $stmt->fetch();
        if (!$row) {
            $this->db->rollBack();
            return null;
        }
        $what = array_filter(['status' => $status, 'assigned_to' => $assigned,
                              'relevance' => $relevance, 'priority' => $priority]);
        $this->event((int)$row['id'], $what ? 'updated ' . json_encode($what) : 'note', $actor, $in['note'] ?? null);
        $this->db->commit();
        return $this->status($ref);
    }

    private function event(int $caseId, string $event, string $actor, ?string $note): void
    {
        $this->db->prepare('INSERT INTO cases.case_events (case_id, event, actor, note) VALUES (?, ?, ?, ?)')
            ->execute([$caseId, $event, $actor, $note]);
    }

    /** Postgres timestamps -> ISO 8601 (e.g. 2026-11-14T10:11:54+00:00), same format as the AI service. */
    private static function iso(array $row): array
    {
        foreach (['created_at', 'updated_at'] as $k) {
            if (!empty($row[$k])) {
                $row[$k] = (new \DateTimeImmutable((string)$row[$k]))->format(DATE_ATOM);
            }
        }
        return $row;
    }

    private function newReference(): string
    {
        $s = '';
        for ($i = 0; $i < 6; $i++) {
            $s .= self::REF_ALPHABET[random_int(0, strlen(self::REF_ALPHABET) - 1)];
        }
        return 'RMB-' . date('Y') . '-' . $s;
    }
}
