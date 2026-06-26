<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$pub = '2PACX-1vTKDP1Eeu9d9k1gExdxLMW2GzecuPVq5hSIHqmsg5n3ZbpKCv7rdcoREtxHFdQ-dMxzOWaZFE2O15m7';
$gid = '1968591785';
$url = "https://docs.google.com/spreadsheets/d/e/{$pub}/pub?gid={$gid}&single=true&output=csv";

$csv = file_get_contents($url);
if ($csv === false) {
    throw new RuntimeException('Nao foi possivel baixar a aba Financeiro.');
}

function parseCsvRows(string $csv): array
{
    $handle = fopen('php://temp', 'r+');
    fwrite($handle, $csv);
    rewind($handle);

    $headers = fgetcsv($handle);
    if ($headers === false) {
        return [];
    }

    $rows = [];
    while (($data = fgetcsv($handle)) !== false) {
        if (count(array_filter($data, fn ($value) => trim((string) $value) !== '')) === 0) {
            continue;
        }

        $row = [];
        foreach ($headers as $index => $header) {
            $row[$header] = $data[$index] ?? null;
        }
        $rows[] = $row;
    }

    fclose($handle);

    return $rows;
}

function decimalBr(?string $value): ?float
{
    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }

    return (float) str_replace(',', '.', str_replace('.', '', $value));
}

function normalizarNumeroNota(?string $value): ?string
{
    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }

    $normalizado = ltrim($value, '0');
    return $normalizado === '' ? '0' : $normalizado;
}

function parseDataPlanilha(string $value): array
{
    $value = trim($value);
    foreach (['d/m/Y H:i:s', 'd/m/Y H:i', 'd/m/Y'] as $format) {
        $date = DateTimeImmutable::createFromFormat($format, $value);
        if ($date instanceof DateTimeImmutable) {
            return [
                'data' => $date->format('Y-m-d'),
                'data_hora' => $format === 'd/m/Y' ? null : $date->format('Y-m-d H:i:s'),
            ];
        }
    }

    throw new RuntimeException("Data invalida na planilha: {$value}");
}

$rows = parseCsvRows($csv);
$targets = array_values(array_filter($rows, function (array $row): bool {
    $data = trim((string) ($row['Data'] ?? ''));
    return str_starts_with($data, '01/06/2026') || str_starts_with($data, '02/06/2026');
}));

$payloads = array_map(function (array $row): array {
    $parsedDate = parseDataPlanilha((string) $row['Data']);

    return [
        'id_financeiro' => trim((string) $row['ID Financeiro']),
        'data' => $parsedDate['data'],
        'data_hora' => $parsedDate['data_hora'],
        'numero_nota_fiscal' => normalizarNumeroNota($row['Número da Nota Fiscal'] ?? null),
        'valor' => decimalBr($row['Valor'] ?? null),
        'quantidade' => decimalBr($row['Quantidade'] ?? null),
        'valor_litro' => decimalBr($row['Valor (Litro)'] ?? null),
        'responsavel' => trim((string) ($row['Responsável'] ?? '')),
        'foto_nota' => trim((string) ($row['Foto Da nota'] ?? '')),
        'tipo' => 'OLEO DIESEL S10',
        'local' => 'Matriz',
        'sync_token_at' => now(),
        'status' => null,
        'deleted_at' => null,
    ];
}, $targets);

$backupDir = __DIR__ . '/../backend/database';
$stamp = date('Ymd_His');
$backupPath = "{$backupDir}/backup_entrada_notas_before_financeiro_matriz_{$stamp}.json";
$reportPath = __DIR__ . "/../outputs/import_financeiro_entrada_notas_matriz_{$stamp}.json";

$existingBefore = DB::table('entrada_notas')->orderBy('data')->orderBy('id_financeiro')->get();
$potentialMatches = DB::table('entrada_notas')
    ->where(function ($query) use ($payloads) {
        foreach ($payloads as $payload) {
            $query->orWhere('id_financeiro', $payload['id_financeiro'])
                ->orWhere(function ($nested) use ($payload) {
                    $nested->where('numero_nota_fiscal', $payload['numero_nota_fiscal'])
                        ->where('data', $payload['data'])
                        ->where('local', $payload['local'])
                        ->where('tipo', $payload['tipo']);
                });
        }
    })
    ->get();

file_put_contents($backupPath, json_encode([
    'gerado_em' => now()->toDateTimeString(),
    'origem' => $url,
    'targets' => $targets,
    'payloads' => $payloads,
    'potential_matches_before' => $potentialMatches,
    'entrada_notas_before' => $existingBefore,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

$inserted = [];
$skipped = [];

DB::transaction(function () use ($payloads, &$inserted, &$skipped): void {
    foreach ($payloads as $payload) {
        $existsById = DB::table('entrada_notas')
            ->where('id_financeiro', $payload['id_financeiro'])
            ->exists();

        $existsByNaturalKey = DB::table('entrada_notas')
            ->where('numero_nota_fiscal', $payload['numero_nota_fiscal'])
            ->where('data', $payload['data'])
            ->where('local', $payload['local'])
            ->where('tipo', $payload['tipo'])
            ->exists();

        if ($existsById || $existsByNaturalKey) {
            $skipped[] = [
                'id_financeiro' => $payload['id_financeiro'],
                'numero_nota_fiscal' => $payload['numero_nota_fiscal'],
                'reason' => $existsById ? 'id_financeiro_existente' : 'nota_data_local_tipo_existente',
            ];
            continue;
        }

        DB::table('entrada_notas')->insert($payload);
        $inserted[] = $payload;
    }
});

$after = DB::table('entrada_notas')
    ->whereIn('id_financeiro', array_column($payloads, 'id_financeiro'))
    ->orWhere(function ($query) use ($payloads) {
        foreach ($payloads as $payload) {
            $query->orWhere(function ($nested) use ($payload) {
                $nested->where('numero_nota_fiscal', $payload['numero_nota_fiscal'])
                    ->where('data', $payload['data'])
                    ->where('local', $payload['local'])
                    ->where('tipo', $payload['tipo']);
            });
        }
    })
    ->orderBy('data')
    ->orderBy('numero_nota_fiscal')
    ->get();

$summary = [
    'origem' => $url,
    'backup' => realpath($backupPath),
    'report' => realpath($reportPath) ?: $reportPath,
    'encontrados_na_planilha' => count($targets),
    'inseridos' => count($inserted),
    'ignorados' => count($skipped),
    'skipped' => $skipped,
    'inserted' => $inserted,
    'after' => $after,
];

file_put_contents($reportPath, json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

echo json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
