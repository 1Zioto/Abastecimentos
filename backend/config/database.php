<?php

use Illuminate\Support\Str;

return [
    'default' => env('DB_CONNECTION', 'pgsql'),

    'connections' => [
        'pgsql' => [
            'driver'         => 'pgsql',
            'url'            => env('DATABASE_URL'),
            'host'           => env('DB_HOST', '127.0.0.1'),
            'port'           => env('DB_PORT', '5432'),
            'database'       => env('DB_DATABASE', 'neondb'),
            'username'       => env('DB_USERNAME', 'neondb_owner'),
            'password'       => env('DB_PASSWORD', ''),
            'charset'        => 'utf8',
            'prefix'         => '',
            'prefix_indexes' => true,
            'search_path'    => 'public',
            'sslmode'        => env('DB_SSLMODE', 'require'),
            'options'        => [
                \PDO::ATTR_EMULATE_PREPARES => true,
            ],
        ],

        'pgsql_fallback' => [
            'driver'         => 'pgsql',
            'url'            => env('DATABASE_FALLBACK_URL'),
            'host'           => env('DB_FALLBACK_HOST', '127.0.0.1'),
            'port'           => env('DB_FALLBACK_PORT', '5432'),
            'database'       => env('DB_FALLBACK_DATABASE', 'neondb'),
            'username'       => env('DB_FALLBACK_USERNAME', 'neondb_owner'),
            'password'       => env('DB_FALLBACK_PASSWORD', ''),
            'charset'        => 'utf8',
            'prefix'         => '',
            'prefix_indexes' => true,
            'search_path'    => 'public',
            'sslmode'        => env('DB_FALLBACK_SSLMODE', 'require'),
            'options'        => [
                \PDO::ATTR_EMULATE_PREPARES => true,
            ],
        ],

        // Banco de telemetria Sascar (tabela `posicoes`) — somente leitura.
        // Aponta para o Neon do sistema de posições. Configure via SASCAR_TELEMETRIA_URL.
        'sascar' => [
            'driver'         => 'pgsql',
            'url'            => env('SASCAR_TELEMETRIA_URL'),
            'host'           => env('SASCAR_DB_HOST', '127.0.0.1'),
            'port'           => env('SASCAR_DB_PORT', '5432'),
            'database'       => env('SASCAR_DB_DATABASE', 'neondb'),
            'username'       => env('SASCAR_DB_USERNAME', 'neondb_owner'),
            'password'       => env('SASCAR_DB_PASSWORD', ''),
            'charset'        => 'utf8',
            'prefix'         => '',
            'prefix_indexes' => true,
            'search_path'    => 'public',
            'sslmode'        => env('SASCAR_DB_SSLMODE', 'require'),
            'options'        => [
                \PDO::ATTR_EMULATE_PREPARES => true,
            ],
        ],
    ],

    'migrations' => [
        'table'      => 'migrations',
        'update_date_on_publish' => true,
    ],
];
