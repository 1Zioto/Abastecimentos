<?php

use App\Models\Abastecimento;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$imagesDir = __DIR__ . '/../frontend/src/assets/abastecimentos/junho-2026';
$publicBase = 'https://abastecimentovipetrasportes.vercel.app/assets/abastecimentos/junho-2026';
$backupFile = __DIR__ . '/../backend/database/backup_abastecimentos_junho_2026_urls_before_link_' . date('Ymd_His') . '.json';

$filesById = [];
foreach (glob($imagesDir . '/*.{jpg,jpeg,png}', GLOB_BRACE) ?: [] as $file) {
    if (!preg_match('/^([a-f0-9]{8})\.(Bomba|Foto_Odometro)\./i', basename($file), $match)) {
        continue;
    }
    $id = strtolower($match[1]);
    $field = strtolower($match[2]) === 'bomba' ? 'bomba' : 'foto_odometro';
    $filesById[$id][$field] = basename($file);
}

$ids = array_keys($filesById);
$records = Abastecimento::query()
    ->whereIn('id_abastecimento', $ids)
    ->get(['id_abastecimento', 'data_hora', 'id_veiculo', 'foto_odometro', 'bomba'])
    ->keyBy(fn ($item) => strtolower($item->id_abastecimento));

file_put_contents($backupFile, json_encode([
    'generated_at' => date('c'),
    'public_base' => $publicBase,
    'records' => $records->values()->toArray(),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

$report = [
    'backup' => $backupFile,
    'atualizados' => [],
    'ignorados_sem_abastecimento' => [],
    'sem_par_completo' => [],
];

DB::transaction(function () use ($filesById, $records, $publicBase, &$report) {
    foreach ($filesById as $id => $files) {
        if (!$records->has($id)) {
            $report['ignorados_sem_abastecimento'][] = $id;
            continue;
        }

        if (empty($files['bomba']) || empty($files['foto_odometro'])) {
            $report['sem_par_completo'][] = $id;
        }

        $payload = ['sync_token_at' => now()];
        if (!empty($files['bomba'])) {
            $payload['bomba'] = $publicBase . '/' . rawurlencode($files['bomba']);
        }
        if (!empty($files['foto_odometro'])) {
            $payload['foto_odometro'] = $publicBase . '/' . rawurlencode($files['foto_odometro']);
        }

        DB::table('abastecimentos')
            ->where('id_abastecimento', $id)
            ->update($payload);

        $report['atualizados'][] = [
            'id' => $id,
            'bomba' => $payload['bomba'] ?? null,
            'foto_odometro' => $payload['foto_odometro'] ?? null,
        ];
    }
});

$report['total_atualizados'] = count($report['atualizados']);
echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
