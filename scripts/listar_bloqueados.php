<?php

use App\Models\Proprietario;
use Illuminate\Contracts\Console\Kernel;

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$rows = Proprietario::query()
    ->whereRaw("LOWER(COALESCE(status, '')) = ?", ['bloqueado'])
    ->orderBy('nome')
    ->get([
        'id_proprietario',
        'nome',
        'responsavel',
        'celular',
        'observacao',
        'local',
        'status',
    ]);

echo json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
