<?php

$configuredOrigins = array_filter(array_map('trim', explode(',', env('CORS_ALLOWED_ORIGINS', '*'))));
$defaultOrigins = [
    'https://abastecimento.vipesistemas.com.br',
    'https://abastecimentovipetrasportes.vercel.app',
    'https://frontend-eight-smoky-75.vercel.app',
    'https://vipeabastecimentos.vercel.app',
    'http://localhost:8088',
    'http://127.0.0.1:8088',
];

$origins = in_array('*', $configuredOrigins, true)
    ? ['*']
    : array_values(array_unique(array_merge($configuredOrigins, $defaultOrigins)));

return [
    'paths' => ['*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => $origins,

    'allowed_origins_patterns' => [
        '#^http://localhost:\d+$#',
        '#^http://127\.0\.0\.1:\d+$#',
    ],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 86400,

    'supports_credentials' => false,
];
