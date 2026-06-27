<?php

return [
    'client_id' => env('GOOGLE_CLIENT_ID', env('GOOGLE_DRIVE_CLIENT_ID')),
    'client_secret' => env('GOOGLE_CLIENT_SECRET', env('GOOGLE_DRIVE_CLIENT_SECRET')),
    'redirect_uri' => env('GOOGLE_REDIRECT_URI', env('GOOGLE_DRIVE_REDIRECT_URI', rtrim((string) env('APP_URL', ''), '/') . '/google-drive/callback')),
    'folder_id' => env('GOOGLE_DRIVE_FOLDER_ID'),
    'folder_name' => env('GOOGLE_DRIVE_FOLDER_NAME', 'Notas de Entrada - Abastecimento Vipe'),
    'refresh_token' => env('GOOGLE_REFRESH_TOKEN', env('GOOGLE_DRIVE_REFRESH_TOKEN')),
    'oauth_credentials_path' => env('GOOGLE_OAUTH_CREDENTIALS_PATH'),
    'token_file' => storage_path('app/private/google_drive_refresh_token.enc'),
    'share_public' => filter_var(env('GOOGLE_DRIVE_SHARE_PUBLIC', true), FILTER_VALIDATE_BOOL),
];
