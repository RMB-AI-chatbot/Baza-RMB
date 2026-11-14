<?php
/**
 * baza-RMB case service (minimal).
 *
 * Internal API, called by the AI service (case creation, status lookup) and by the
 * admin portal (listing, assignment, status changes). Every call needs
 *   Authorization: Bearer <CASE_SERVICE_TOKEN>
 * It is not exposed publicly (see docker-compose / nginx).
 *
 *   POST  /api/v1/cases                     create a case            -> reference number
 *   GET   /api/v1/cases/{ref}               status (no personal data)
 *   GET   /api/v1/cases/{ref}/details       full case + audit trail  (staff)
 *   GET   /api/v1/cases?status=&type=       list                     (staff)
 *   PATCH /api/v1/cases/{ref}               status / assignment      (staff)
 *   GET   /api/v1/routing                   routing table
 *   GET   /health
 */

declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

use Baza\Cases\CaseRepository;
use Baza\Cases\Http;

$method = $_SERVER['REQUEST_METHOD'];
$path = rtrim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/', '/') ?: '/';

try {
    if ($path === '/health') {
        Http::json(['status' => 'ok']);
    }

    Http::requireToken();
    $repo = new CaseRepository(Http::db());

    if ($path === '/api/v1/routing' && $method === 'GET') {
        Http::json($repo->routing());
    }

    if ($path === '/api/v1/cases' && $method === 'POST') {
        $case = $repo->create(Http::body());
        Http::json($case, 201);
    }

    if ($path === '/api/v1/cases' && $method === 'GET') {
        Http::json($repo->list(
            $_GET['status'] ?? null,
            $_GET['type'] ?? null,
            min((int)($_GET['limit'] ?? 50), 200),
            max((int)($_GET['offset'] ?? 0), 0),
            $_GET['relevance'] ?? 'inbox'
        ));
    }

    if (preg_match('#^/api/v1/cases/(RMB-\d{4}-[A-Z0-9]{6})(/details)?$#', $path, $m)) {
        $ref = $m[1];
        if ($method === 'GET' && empty($m[2])) {
            $status = $repo->status($ref);
            $status ? Http::json($status) : Http::error(404, 'case not found');
        }
        if ($method === 'GET' && !empty($m[2])) {
            $case = $repo->details($ref);
            $case ? Http::json($case) : Http::error(404, 'case not found');
        }
        if ($method === 'PATCH' && empty($m[2])) {
            $case = $repo->update($ref, Http::body());
            $case ? Http::json($case) : Http::error(404, 'case not found');
        }
    }

    Http::error(404, 'not found');
} catch (\InvalidArgumentException $e) {
    Http::error(422, $e->getMessage());
} catch (\Throwable $e) {
    error_log('[case-service] ' . $e::class . ': ' . $e->getMessage());
    Http::error(500, 'internal error');
}
