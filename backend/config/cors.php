<?php

$configuredOrigins = array_filter(array_map('trim', explode(',', env('CORS_ALLOWED_ORIGINS', '*'))));
$defaultOrigins = [
    'https://abastecimentovipetrasportes.vercel.app',
    'https://frontend-eight-smoky-75.vercel.app',
    'https://vipeabastecimentos.vercel.app',
];

$origins = in_array('*', $configuredOrigins, true)
    ? ['*']
    : array_values(array_unique(array_merge($configuredOrigins, $defaultOrigins)));

return [
    'paths' => ['*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => $origins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 86400,

    'supports_credentials' => false,
];
