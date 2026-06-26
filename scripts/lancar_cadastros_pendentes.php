<?php

use App\Models\Motorista;
use App\Models\Proprietario;
use App\Models\Veiculo;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

DB::statement('ALTER TABLE proprietarios ADD COLUMN IF NOT EXISTS local VARCHAR(40) NULL');
DB::statement('ALTER TABLE proprietarios ADD COLUMN IF NOT EXISTS odometro_obrigatorio BOOLEAN NOT NULL DEFAULT FALSE');
DB::statement('ALTER TABLE motoristas ADD COLUMN IF NOT EXISTS local VARCHAR(40) NULL');
DB::statement('ALTER TABLE motoristas ADD COLUMN IF NOT EXISTS apelido VARCHAR(255) NULL');
DB::statement('ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS local VARCHAR(40) NULL');

$local = 'Matriz';
$ownerName = 'mazinho (Guincho)';

$proprietario = Proprietario::query()
    ->whereRaw('LOWER(nome) = LOWER(?)', [$ownerName])
    ->when(
        DB::getSchemaBuilder()->hasColumn('proprietarios', 'local'),
        fn ($q) => $q->where(fn ($qq) => $qq->whereNull('local')->orWhereRaw('LOWER(local) = LOWER(?)', [$local]))
    )
    ->first();

if (!$proprietario) {
    $proprietario = Proprietario::create([
        'id_proprietario' => (string) Str::uuid(),
        'nome' => $ownerName,
        'status' => 'Ativo',
        'responsavel' => null,
        'celular' => '27999731730',
        'observacao' => null,
        'local' => $local,
        'odometro_obrigatorio' => 'false',
        'data_registro' => now(),
    ]);
} else {
    $proprietario->fill([
        'status' => $proprietario->status ?: 'Ativo',
        'celular' => $proprietario->celular ?: '27999731730',
        'local' => $proprietario->local ?: $local,
    ])->save();
}

$motorista = Motorista::query()
    ->where('id_proprietario', $proprietario->id_proprietario)
    ->whereRaw('LOWER(nome) = LOWER(?)', ['Matias'])
    ->first();

if (!$motorista) {
    $motorista = Motorista::create([
        'id_motorista' => (string) Str::uuid(),
        'nome' => 'Matias',
        'apelido' => null,
        'id_proprietario' => $proprietario->id_proprietario,
        'documento' => null,
        'celular' => null,
        'local' => $local,
    ]);
}

$veiculos = [];
foreach (['MRW2H38', 'MRW2H28'] as $placa) {
    $veiculo = Veiculo::query()
        ->whereRaw('LOWER(placa) = LOWER(?)', [$placa])
        ->when(
            DB::getSchemaBuilder()->hasColumn('veiculos', 'local'),
            fn ($q) => $q->where(fn ($qq) => $qq->whereNull('local')->orWhereRaw('LOWER(local) = LOWER(?)', [$local]))
        )
        ->first();

    if (!$veiculo) {
        $veiculo = Veiculo::create([
            'id_veiculo' => (string) Str::uuid(),
            'placa' => $placa,
            'marca' => null,
            'modelo' => null,
            'ano' => null,
            'tipo_combustivel' => 'OLEO DIESEL S10',
            'numero_chassi' => null,
            'id_proprietario' => $proprietario->id_proprietario,
            'odometro' => null,
            'renavam' => null,
            'cor' => null,
            'foto' => null,
            'local' => $local,
        ]);
    } elseif (!$veiculo->id_proprietario) {
        $veiculo->fill([
            'id_proprietario' => $proprietario->id_proprietario,
            'tipo_combustivel' => $veiculo->tipo_combustivel ?: 'OLEO DIESEL S10',
            'local' => $veiculo->local ?: $local,
        ])->save();
    }

    $veiculos[] = [
        'placa' => $veiculo->placa,
        'id_veiculo' => $veiculo->id_veiculo,
    ];
}

echo json_encode([
    'proprietario' => [
        'id_proprietario' => $proprietario->id_proprietario,
        'nome' => $proprietario->nome,
        'celular' => $proprietario->celular,
        'local' => $proprietario->local,
    ],
    'motorista' => [
        'id_motorista' => $motorista->id_motorista,
        'nome' => $motorista->nome,
    ],
    'veiculos' => $veiculos,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
