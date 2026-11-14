<?php
declare(strict_types=1);

namespace Baza\Portal;

use PDO;

final class Db
{
    private static ?PDO $pdo = null;

    public static function get(): PDO
    {
        if (self::$pdo === null) {
            self::$pdo = new PDO(
                env('DB_DSN', 'pgsql:host=127.0.0.1;port=5434;dbname=baza'),
                env('DB_USER', 'baza'),
                env('DB_PASSWORD', ''),
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                 PDO::ATTR_EMULATE_PREPARES => false]
            );
        }
        return self::$pdo;
    }
}
