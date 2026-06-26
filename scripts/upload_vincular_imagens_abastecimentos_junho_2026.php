<?php

use App\Models\Abastecimento;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$imagesDir = 'C:/Users/Douglas/Downloads/Compressed/drive-download-20260602T155343Z-3-001';
$envFile = __DIR__ . '/../backend/backend/.env.vercel.tmp';
$backupFile = __DIR__ . '/../backend/database/backup_abastecimentos_junho_2026_images_before_link_' . date('Ymd_His') . '.json';
$folder = 'abastecimentos';

function readEnvValue(string $file, string $key): ?string
{
    if (!is_file($file)) {
        return null;
    }

    foreach (file($file, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_starts_with($line, $key . '=')) {
            continue;
        }
        $value = substr($line, strlen($key) + 1);
        $value = trim($value);
        if ((str_starts_with($value, '"') && str_ends_with($value, '"')) || (str_starts_with($value, "'") && str_ends_with($value, "'"))) {
            $value = substr($value, 1, -1);
        }
        return stripcslashes($value);
    }

    return null;
}

function cloudinaryConfig(string $cloudinaryUrl): array
{
    $parsed = parse_url($cloudinaryUrl);
    $cloudName = $parsed['host'] ?? '';
    $apiKey = isset($parsed['user']) ? urldecode($parsed['user']) : '';
    $apiSecret = isset($parsed['pass']) ? urldecode($parsed['pass']) : '';

    if ($cloudName === '' || $apiKey === '' || $apiSecret === '') {
        throw new RuntimeException('CLOUDINARY_URL invalido.');
    }

    return [$cloudName, $apiKey, $apiSecret];
}

function uploadCloudinary(string $file, string $publicId, string $folder, array $config): string
{
    [$cloudName, $apiKey, $apiSecret] = $config;
    $timestamp = time();
    $signatureData = [
        'folder' => $folder,
        'public_id' => $publicId,
        'timestamp' => (string) $timestamp,
    ];
    ksort($signatureData);
    $toSign = implode('&', array_map(fn ($key, $value) => $key . '=' . $value, array_keys($signatureData), $signatureData));
    $signature = sha1($toSign . $apiSecret);

    $response = Http::connectTimeout(10)
        ->timeout(45)
        ->attach('file', file_get_contents($file), basename($file))
        ->post("https://api.cloudinary.com/v1_1/{$cloudName}/auto/upload", [
            'api_key' => $apiKey,
            'timestamp' => $timestamp,
            'signature' => $signature,
            'public_id' => $publicId,
            'folder' => $folder,
        ]);

    if (!$response->successful()) {
        throw new RuntimeException('Falha no upload de ' . basename($file) . ': ' . $response->body());
    }

    $json = $response->json() ?: [];
    $url = $json['secure_url'] ?? ($json['url'] ?? null);
    if (!$url) {
        throw new RuntimeException('Cloudinary nao retornou URL para ' . basename($file));
    }

    return $url;
}

if (!is_dir($imagesDir)) {
    throw new RuntimeException('Pasta de imagens nao encontrada: ' . $imagesDir);
}

$cloudinaryUrl = readEnvValue($envFile, 'CLOUDINARY_URL');
if (!$cloudinaryUrl) {
    throw new RuntimeException('CLOUDINARY_URL nao encontrada em ' . $envFile);
}
$cloudinary = cloudinaryConfig($cloudinaryUrl);

$filesById = [];
foreach (glob($imagesDir . '/*.{jpg,jpeg,png}', GLOB_BRACE) ?: [] as $file) {
    if (!preg_match('/^([a-f0-9]{8})\.(Bomba|Foto_Odometro)\./i', basename($file), $match)) {
        continue;
    }
    $id = strtolower($match[1]);
    $kind = strtolower($match[2]) === 'bomba' ? 'bomba' : 'foto_odometro';
    $filesById[$id][$kind] = $file;
}

$ids = array_keys($filesById);
$records = Abastecimento::query()
    ->whereIn('id_abastecimento', $ids)
    ->get(['id_abastecimento', 'data_hora', 'id_veiculo', 'foto_odometro', 'bomba'])
    ->keyBy(fn ($item) => strtolower($item->id_abastecimento));

$backup = [
    'generated_at' => date('c'),
    'images_dir' => $imagesDir,
    'records' => $records->values()->toArray(),
];
file_put_contents($backupFile, json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

$report = [
    'backup' => $backupFile,
    'encontrados_na_pasta' => count($filesById),
    'vinculados' => [],
    'ignorados_sem_abastecimento' => [],
    'falhas' => [],
];

$updates = [];
foreach ($filesById as $id => $files) {
    if (!$records->has($id)) {
        $report['ignorados_sem_abastecimento'][] = $id;
        continue;
    }

    try {
        $payload = [];
        foreach (['bomba', 'foto_odometro'] as $kind) {
            if (empty($files[$kind])) {
                continue;
            }
            $publicId = pathinfo($files[$kind], PATHINFO_FILENAME);
            $payload[$kind] = uploadCloudinary($files[$kind], $publicId, $folder, $cloudinary);
        }
        if ($payload) {
            $updates[$id] = $payload;
            $report['vinculados'][] = [
                'id' => $id,
                'bomba' => isset($payload['bomba']),
                'foto_odometro' => isset($payload['foto_odometro']),
            ];
        }
    } catch (Throwable $e) {
        $report['falhas'][] = [
            'id' => $id,
            'erro' => $e->getMessage(),
        ];
    }
}

if ($updates && empty($report['falhas'])) {
    DB::transaction(function () use ($updates) {
        foreach ($updates as $id => $payload) {
            $payload['sync_token_at'] = now();
            DB::table('abastecimentos')
                ->where('id_abastecimento', $id)
                ->update($payload);
        }
    });
}

$report['atualizados_no_banco'] = empty($report['falhas']) ? count($updates) : 0;
echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
