<?php

use App\Models\Abastecimento;
use Illuminate\Contracts\Console\Kernel;

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$placas = array_slice($argv, 1) ?: ['MRW2H38', 'MRW2H28'];

$rows = Abastecimento::query()
    ->with('veiculo')
    ->whereHas('veiculo', fn ($q) => $q->whereIn('placa', $placas))
    ->orderByDesc('data')
    ->limit(50)
    ->get([
        'id_abastecimento',
        'id_veiculo',
        'data',
        'data_hora',
        'nome_motorista',
        'nome_proprietario',
        'quantidade_litros',
        'valor_total',
        'status',
        'odometro',
    ])
    ->map(fn ($a) => [
        'id_abastecimento' => $a->id_abastecimento,
        'data' => $a->data,
        'data_hora' => $a->data_hora,
        'placa' => $a->veiculo?->placa,
        'motorista' => $a->nome_motorista,
        'proprietario' => $a->nome_proprietario,
        'quantidade_litros' => $a->quantidade_litros,
        'valor_total' => $a->valor_total,
        'status' => $a->status,
        'odometro' => $a->odometro,
    ])
    ->values();

echo json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
