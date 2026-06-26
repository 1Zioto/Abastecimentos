<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

$cloudinaryUrlFromProduction = null;
$cloudinaryFolderFromProduction = null;

require __DIR__ . '/../backend/vendor/autoload.php';

foreach ([__DIR__ . '/../backend/.env.production.local'] as $productionEnvPath) {
    if (!is_file($productionEnvPath)) {
        continue;
    }

    foreach (file($productionEnvPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        if (!str_contains($line, '=')) {
            continue;
        }

        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        if (!in_array($key, ['CLOUDINARY_URL', 'CLOUDINARY_FOLDER'], true)) {
            continue;
        }

        $value = trim(trim($value), "\"'");
        putenv("{$key}={$value}");
        $_ENV[$key] = $value;
        $_SERVER[$key] = $value;
        if ($key === 'CLOUDINARY_URL') {
            $cloudinaryUrlFromProduction = $value;
        }
        if ($key === 'CLOUDINARY_FOLDER') {
            $cloudinaryFolderFromProduction = $value;
        }
    }
}

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$imagePath = realpath(__DIR__ . '/../outputs/ajuste_inicio_operacao_matriz_20260601.png');
if ($imagePath === false || !is_file($imagePath)) {
    throw new RuntimeException('Imagem do ajuste nao encontrada.');
}

$idFinanceiro = 'ajuste-inicio-matriz-20260601-0600';
$numeroNota = 'AJUSTE-INICIO-MATRIZ-20260601';
$data = '2026-06-01';
$dataHora = '2026-06-01 06:00:00';
$quantidade = 7723.00;
$tipo = 'OLEO DIESEL S10';
$local = 'Matriz';
$preuploadedFotoNota = 'https://res.cloudinary.com/da5halra4/image/upload/v1780427729/abastecimentos/ajuste_inicio_operacao_matriz_20260601.svg';

$fotoNota = $preuploadedFotoNota;

if ($fotoNota === '') {
    $cloudinaryUrl = $cloudinaryUrlFromProduction ?: (string) getenv('CLOUDINARY_URL');
    if ($cloudinaryUrl === '') {
        throw new RuntimeException('CLOUDINARY_URL nao configurado para upload do anexo.');
    }

    $parsedCloudinary = parse_url($cloudinaryUrl);
    $cloudName = $parsedCloudinary['host'] ?? '';
    $apiKey = isset($parsedCloudinary['user']) ? urldecode($parsedCloudinary['user']) : '';
    $apiSecret = isset($parsedCloudinary['pass']) ? urldecode($parsedCloudinary['pass']) : '';
    if ($cloudName === '' || $apiKey === '' || $apiSecret === '') {
        throw new RuntimeException('CLOUDINARY_URL invalido para upload do anexo.');
    }

    $timestamp = time();
    $publicId = 'ajuste_inicio_operacao_matriz_20260601_' . Str::lower(Str::random(8));
    $folder = $cloudinaryFolderFromProduction ?: ((string) getenv('CLOUDINARY_FOLDER') ?: 'abastecimentos');
    $signatureData = [
        'folder' => $folder,
        'public_id' => $publicId,
        'timestamp' => (string) $timestamp,
    ];
    ksort($signatureData);
    $toSign = collect($signatureData)
        ->map(fn ($value, $key) => $key . '=' . $value)
        ->implode('&');
    $signature = sha1($toSign . $apiSecret);

    $uploadResponse = Http::connectTimeout(10)
        ->timeout(30)
        ->attach('file', file_get_contents($imagePath), basename($imagePath))
        ->post("https://api.cloudinary.com/v1_1/{$cloudName}/auto/upload", [
            'api_key' => $apiKey,
            'timestamp' => $timestamp,
            'signature' => $signature,
            'public_id' => $publicId,
            'folder' => $folder,
        ]);

    if (!$uploadResponse->successful()) {
        throw new RuntimeException('Falha no upload do anexo: ' . $uploadResponse->body());
    }

    $uploadedJson = $uploadResponse->json() ?? [];
    $fotoNota = $uploadedJson['secure_url'] ?? $uploadedJson['url'] ?? null;
    if (!is_string($fotoNota) || trim($fotoNota) === '') {
        throw new RuntimeException('Upload concluido sem URL de anexo: ' . $uploadResponse->body());
    }
}

$stamp = date('Ymd_His');
$backupPath = __DIR__ . "/../backend/database/backup_entrada_nota_ajuste_inicio_matriz_{$stamp}.json";

$existing = DB::table('entrada_notas')
    ->where(function ($query) use ($idFinanceiro, $numeroNota, $data, $local, $tipo) {
        $query->where('id_financeiro', $idFinanceiro)
            ->orWhere(function ($nested) use ($numeroNota, $data, $local, $tipo) {
                $nested->where('numero_nota_fiscal', $numeroNota)
                    ->where('data', $data)
                    ->where('local', $local)
                    ->where('tipo', $tipo);
            });
    })
    ->get();

file_put_contents($backupPath, json_encode([
    'gerado_em' => now()->toDateTimeString(),
    'acao' => 'lancar ajuste de quantidade de inicio da operacao',
    'id_financeiro' => $idFinanceiro,
    'numero_nota_fiscal' => $numeroNota,
    'existing' => $existing,
    'entrada_notas_before' => DB::table('entrada_notas')->orderBy('data')->orderBy('id_financeiro')->get(),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

$payload = [
    'id_financeiro' => $idFinanceiro,
    'data' => $data,
    'data_hora' => $dataHora,
    'numero_nota_fiscal' => $numeroNota,
    'valor' => 0,
    'quantidade' => $quantidade,
    'valor_litro' => 0,
    'responsavel' => 'Ajuste inicial',
    'foto_nota' => $fotoNota,
    'tipo' => $tipo,
    'local' => $local,
    'sync_token_at' => now(),
    'deleted_at' => null,
    'status' => null,
];

$action = 'inserted';

DB::transaction(function () use ($existing, $payload, $idFinanceiro, &$action): void {
    if ($existing->isNotEmpty()) {
        DB::table('entrada_notas')
            ->where('id_financeiro', $idFinanceiro)
            ->orWhere(function ($query) use ($payload) {
                $query->where('numero_nota_fiscal', $payload['numero_nota_fiscal'])
                    ->where('data', $payload['data'])
                    ->where('local', $payload['local'])
                    ->where('tipo', $payload['tipo']);
            })
            ->update($payload);
        $action = 'updated';
        return;
    }

    DB::table('entrada_notas')->insert($payload);
});

$saved = DB::table('entrada_notas')
    ->where('id_financeiro', $idFinanceiro)
    ->first();

$totaisMatriz = [
    'entradas_litros' => DB::table('entrada_notas')
        ->where('local', $local)
        ->whereNull('deleted_at')
        ->sum('quantidade'),
    'abastecido_litros' => DB::table('abastecimentos')
        ->where('local', $local)
        ->whereNull('deleted_at')
        ->sum('quantidade_litros'),
];
$totaisMatriz['saldo_estimado_litros'] = round(
    (float) $totaisMatriz['entradas_litros'] - (float) $totaisMatriz['abastecido_litros'],
    2
);

echo json_encode([
    'action' => $action,
    'backup' => realpath($backupPath),
    'anexo' => $fotoNota,
    'saved' => $saved,
    'totais_matriz' => $totaisMatriz,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
