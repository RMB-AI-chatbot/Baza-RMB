<?php
declare(strict_types=1);

namespace Baza\Portal;

final class Http
{
    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /** @return array<string, mixed> */
    public static function body(): array
    {
        $d = json_decode(file_get_contents('php://input') ?: '{}', true);
        return is_array($d) ? $d : [];
    }
}
