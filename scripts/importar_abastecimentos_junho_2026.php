<?php

use App\Models\Abastecimento;
use App\Models\Motorista;
use App\Models\Proprietario;
use App\Models\Veiculo;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$apply = in_array('--apply', $argv, true);
$csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTKDP1Eeu9d9k1gExdxLMW2GzecuPVq5hSIHqmsg5n3ZbpKCv7rdcoREtxHFdQ-dMxzOWaZFE2O15m7/pub?gid=287998009&single=true&output=csv';
$backupDir = __DIR__ . '/../backend/database';
$backupFile = $backupDir . '/backup_abastecimentos_junho_2026_before_import_' . date('Ymd_His') . '.json';

function parseDecimalPt(?string $value): ?float
{
    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }
    $value = str_replace(['R$', ' '], '', $value);
    if (str_contains($value, ',') && str_contains($value, '.')) {
        $value = str_replace('.', '', $value);
    }
    $value = str_replace(',', '.', $value);
    return is_numeric($value) ? (float) $value : null;
}

function parseDateTimePt(string $value): ?DateTimeImmutable
{
    $value = trim($value);
    foreach (['d/m/Y H:i:s', 'd/m/Y H:i', 'd/m/Y'] as $format) {
        $date = DateTimeImmutable::createFromFormat($format, $value);
        if ($date instanceof DateTimeImmutable) {
            return $date;
        }
    }
    return null;
}

function csvRows(string $csv): array
{
    $handle = fopen('php://temp', 'r+');
    fwrite($handle, $csv);
    rewind($handle);

    $header = fgetcsv($handle);
    $rows = [];
    while (($line = fgetcsv($handle)) !== false) {
        if (count(array_filter($line, fn ($v) => trim((string) $v) !== '')) === 0) {
            continue;
        }
        $rows[] = array_combine($header, array_pad($line, count($header), null));
    }
    fclose($handle);
    return $rows;
}

function findVehicle(string $placaOuId): ?Veiculo
{
    $value = trim($placaOuId);
    return Veiculo::query()
        ->where('id_veiculo', $value)
        ->orWhereRaw('UPPER(placa) = UPPER(?)', [$value])
        ->first();
}

function findOwner(?string $id, ?string $name): ?Proprietario
{
    $id = trim((string) $id);
    $name = trim((string) $name);

    $query = Proprietario::query();
    if ($id !== '') {
        $owner = (clone $query)->where('id_proprietario', $id)->first();
        if ($owner) {
            return $owner;
        }
    }
    if ($name !== '') {
        return Proprietario::query()->whereRaw('LOWER(nome) = LOWER(?)', [$name])->first();
    }
    return null;
}

function findDriver(?string $id, string $name, ?string $ownerId): ?Motorista
{
    $id = trim((string) $id);
    $name = trim($name);

    if ($id !== '') {
        $driver = Motorista::query()->where('id_motorista', $id)->first();
        if ($driver) {
            return $driver;
        }
    }

    if ($name === '') {
        return null;
    }

    return Motorista::query()
        ->whereRaw('LOWER(nome) = LOWER(?)', [$name])
        ->when($ownerId, fn ($q) => $q->where('id_proprietario', $ownerId))
        ->first()
        ?: Motorista::query()->whereRaw('LOWER(nome) = LOWER(?)', [$name])->first();
}

$csv = file_get_contents($csvUrl);
if ($csv === false) {
    throw new RuntimeException('Nao foi possivel baixar a aba Abastecimentos.');
}

$allRows = csvRows($csv);
$sourceRows = [];
foreach ($allRows as $row) {
    $date = parseDateTimePt($row['Data e Hora'] ?? $row['Data'] ?? '');
    if ($date && $date->format('Y') === '2026' && $date->format('m') === '06') {
        $sourceRows[] = [$row, $date];
    }
}

usort($sourceRows, fn ($a, $b) => strcmp($a[1]->format('c'), $b[1]->format('c')));

$ids = array_map(fn ($entry) => trim((string) $entry[0]['ID Abastecimento']), $sourceRows);
$existing = Abastecimento::query()
    ->whereIn('id_abastecimento', $ids)
    ->get()
    ->keyBy('id_abastecimento');

$backup = [
    'generated_at' => date('c'),
    'source' => $csvUrl,
    'existing_ids' => $existing->values()->toArray(),
];
file_put_contents($backupFile, json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

$report = [
    'modo' => $apply ? 'apply' : 'dry-run',
    'backup' => $backupFile,
    'total_planilha_junho_2026' => count($sourceRows),
    'ja_existiam' => 0,
    'inseridos' => 0,
    'bloqueados' => [],
    'preparados' => [],
];

$prepared = [];
foreach ($sourceRows as [$row, $date]) {
    $id = trim((string) $row['ID Abastecimento']);
    if ($id === '') {
        $report['bloqueados'][] = ['id' => null, 'motivo' => 'ID Abastecimento vazio'];
        continue;
    }

    if ($existing->has($id)) {
        $report['ja_existiam']++;
        continue;
    }

    $vehicle = findVehicle((string) $row['ID Veículo']);
    $owner = findOwner($row['Proprietario'] ?? null, $row['NomeProprietário'] ?? null);
    $driver = findDriver($row['ID Motorista'] ?? null, (string) ($row['NomeMotorista'] ?? ''), $owner?->id_proprietario);

    $missing = [];
    if (!$vehicle) {
        $missing[] = 'veiculo/placa ' . ($row['ID Veículo'] ?? '');
    }
    if (!$owner) {
        $missing[] = 'proprietario ' . (($row['Proprietario'] ?? '') ?: ($row['NomeProprietário'] ?? ''));
    }
    if (!$driver) {
        $missing[] = 'motorista ' . (($row['ID Motorista'] ?? '') ?: ($row['NomeMotorista'] ?? ''));
    }

    if ($missing) {
        $report['bloqueados'][] = [
            'id' => $id,
            'data_hora' => $row['Data e Hora'] ?? null,
            'placa' => $row['ID Veículo'] ?? null,
            'motivo' => implode('; ', $missing),
        ];
        continue;
    }

    $litros = parseDecimalPt($row['Quantidade (L)'] ?? null);
    $valorPorLitro = parseDecimalPt($row['Valor por Litro'] ?? null);
    $valorTotal = parseDecimalPt($row['Valor Total'] ?? null);
    if ($valorTotal === null && $litros !== null && $valorPorLitro !== null) {
        $valorTotal = floor(($litros * $valorPorLitro) + 0.000001);
    }

    $payload = [
        'id_abastecimento' => $id,
        'data' => $date->format('Y-m-d'),
        'data_hora' => $date->format('Y-m-d H:i:s'),
        'frentista' => trim((string) ($row['Frentista'] ?? '')),
        'id_veiculo' => $vehicle->id_veiculo,
        'id_motorista' => $driver->id_motorista,
        'id_proprietario' => $owner->id_proprietario,
        'nome_motorista' => trim((string) ($row['NomeMotorista'] ?? $driver->nome)),
        'nome_proprietario' => trim((string) ($row['NomeProprietário'] ?? $owner->nome)),
        'local' => 'Matriz',
        'tipo_combustivel' => trim((string) ($row['Tipo de combustível'] ?? 'OLEO DIESEL S10')),
        'quantidade_litros' => $litros,
        'valor_por_litro' => $valorPorLitro,
        'valor_total' => $valorTotal,
        'odometro' => parseDecimalPt($row['Odômetro'] ?? null),
        'foto_odometro' => trim((string) ($row['Foto_Odometro'] ?? '')),
        'bomba' => trim((string) ($row['Bomba'] ?? '')),
        'status' => trim((string) ($row['Status'] ?? 'Pendente')) ?: 'Pendente',
        'motorista_nome_corrigido' => trim((string) ($row['MotoristaNomeCorrigido'] ?? '')),
        'controle' => trim((string) ($row['Contorle'] ?? '')),
        'data_baixa' => null,
        'tipo_despesa' => trim((string) ($row['TipoDespesa'] ?? '')),
        'descricao' => trim((string) ($row['Descricao'] ?? '')),
        'valor' => parseDecimalPt($row['Valor'] ?? null),
        'placa1' => trim((string) ($row['Placa1'] ?? '')),
        'recebedor' => trim((string) ($row['Recebedor'] ?? '')),
        'observacao' => trim((string) ($row['Observacao'] ?? '')),
        'anexo' => trim((string) ($row['Anexo'] ?? '')),
        'sync_token_at' => now(),
    ];

    $prepared[] = $payload;
    $report['preparados'][] = [
        'id' => $payload['id_abastecimento'],
        'data_hora' => $row['Data e Hora'] ?? null,
        'placa' => $vehicle->placa,
        'motorista' => $payload['nome_motorista'],
        'litros' => $payload['quantidade_litros'],
        'total' => $payload['valor_total'],
        'odometro' => $payload['odometro'],
    ];
}

if ($apply && $prepared) {
    DB::transaction(function () use ($prepared, &$report) {
        foreach ($prepared as $payload) {
            $payload['created_at'] = now();
            DB::table('abastecimentos')->insert($payload);
            if (!empty($payload['odometro'])) {
                Veiculo::query()
                    ->where('id_veiculo', $payload['id_veiculo'])
                    ->where(fn ($q) => $q->whereNull('odometro')->orWhere('odometro', '<', $payload['odometro']))
                    ->update(['odometro' => $payload['odometro'], 'sync_token_at' => now()]);
            }
            $report['inseridos']++;
        }
    });
}

echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
