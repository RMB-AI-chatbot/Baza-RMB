<?php
declare(strict_types=1);

namespace Baza\Cases;

use PDO;

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

    public static function error(int $status, string $message): never
    {
        self::json(['error' => $message], $status);
    }

    public static function requireToken(): void
    {
        $expected = getenv('CASE_SERVICE_TOKEN') ?: '';
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        $given = str_starts_with($header, 'Bearer ') ? substr($header, 7) : '';
        if ($expected === '' || strlen($expected) < 16 || !hash_equals($expected, $given)) {
            self::error(401, 'unauthorized');
        }
    }

    /** @return array<string, mixed> */
    public static function body(): array
    {
        $raw = file_get_contents('php://input') ?: '';
        if (strlen($raw) > 200_000) {
            throw new \InvalidArgumentException('request too large');
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            throw new \InvalidArgumentException('invalid JSON body');
        }
        return $data;
    }

    public static function db(): PDO
    {
        static $pdo = null;
        if ($pdo === null) {
            $pdo = new PDO(
                getenv('DB_DSN') ?: 'pgsql:host=localhost;port=5434;dbname=baza',
                getenv('DB_USER') ?: 'baza',
                getenv('DB_PASSWORD') ?: '',
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]
            );
        }
        return $pdo;
    }
}
