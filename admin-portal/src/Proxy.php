<?php
declare(strict_types=1);

namespace Baza\Portal;

/**
 * Forwards /api/<path> to the AI service admin API with the admin key added server-side.
 *
 * - Permission per route (Roles::capFor); anything not listed is refused.
 * - "Who did it" fields (actor, created_by, updated_by, uploaded_by) are always set from the logged-in
 *   staff member, never from the browser: the FAQ four-eyes rule and the audit trail rely on it.
 * - Confidential cases are hidden from roles without the cases_confidential capability.
 * - Every change (non-GET) is written to portal.audit_log.
 */
final class Proxy
{
    /** @param array<string, mixed> $user */
    public static function handle(string $method, string $path, array $user): void
    {
        $cap = Roles::capFor($method, $path);
        if ($cap === null) {
            Http::json(['detail' => 'not found'], 404);
        }
        if (!Roles::can($user['role'], $cap)) {
            Http::json(['detail' => 'Your role does not allow this action.'], 403);
        }
        $staff = sprintf('%s <%s>', $user['name'], $user['email']);
        $base = rtrim((string)env('AI_ADMIN_URL', 'http://127.0.0.1:8000/api/v1/admin'), '/');
        $url = $base . '/' . $path . (empty($_SERVER['QUERY_STRING']) ? '' : '?' . $_SERVER['QUERY_STRING']);
        $headers = ['X-Admin-Key: ' . env('ADMIN_API_KEY', ''), 'Accept: application/json'];

        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_TIMEOUT => 120,
                                CURLOPT_CONNECTTIMEOUT => 5]);

        if ($method === 'POST' && $path === 'documents') {
            // Multipart upload: forward the file and form fields; uploader = logged-in staff.
            $f = $_FILES['file'] ?? null;
            if (!$f || $f['error'] !== UPLOAD_ERR_OK) {
                Http::json(['detail' => 'No file received (maximum 50 MB).'], 422);
            }
            $fields = array_intersect_key($_POST, array_flip(['title', 'short_title', 'doc_type', 'category', 'law_reference',
                'owner', 'version', 'effective_date', 'review_date', 'source_url']));
            $fields = array_filter($fields, fn($v) => $v !== '');
            $fields['uploaded_by'] = $staff;
            $fields['file'] = new \CURLFile($f['tmp_name'], 'application/pdf', basename((string)$f['name']));
            curl_setopt($ch, CURLOPT_POSTFIELDS, $fields);
        } elseif ($method !== 'GET') {
            $body = json_decode(file_get_contents('php://input') ?: '{}', true);
            if (!is_array($body)) {
                Http::json(['detail' => 'invalid JSON'], 422);
            }
            if (preg_match('#^cases/|^faq/\d+#', $path)) {
                $body['actor'] = $staff;
            }
            if ($method === 'POST' && $path === 'faq') {
                $body['created_by'] = $staff;
            }
            if ($path === 'settings') {
                $body['updated_by'] = $staff;
            }
            $headers[] = 'Content-Type: application/json';
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
        }
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        $resp = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        if ($resp === false) {
            Http::json(['detail' => 'The AI service is not reachable.'], 502);
        }

        if ($method !== 'GET') {
            Audit::log((string)$user['email'], 'api_change', '', $method, $path, $status);
        }

        // Confidential cases: only roles with cases_confidential see them.
        if ($method === 'GET' && str_starts_with($path, 'cases') && $status === 200
            && !Roles::can($user['role'], 'cases_confidential')) {
            $data = json_decode($resp, true);
            if (is_array($data) && array_is_list($data) && $path === 'cases') {
                $resp = json_encode(array_values(array_filter($data, fn($c) => empty($c['confidential']))), JSON_UNESCAPED_UNICODE);
            } elseif (is_array($data) && !empty($data['confidential'])) {
                Http::json(['detail' => 'This case is confidential.'], 403);
            }
        }

        http_response_code($status ?: 502);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo $resp === '' ? 'null' : $resp;
        exit;
    }
}
