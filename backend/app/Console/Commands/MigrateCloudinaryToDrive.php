<?php

namespace App\Console\Commands;

use App\Models\Abastecimento;
use App\Models\EntradaNota;
use App\Services\GoogleDriveService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use App\Services\CloudinaryManager;

class MigrateCloudinaryToDrive extends Command
{
    protected $signature = 'migrate:cloudinary-to-drive';
    protected $description = 'Migrate files from Cloudinary to Google Drive';
    private array $errors = [];

    public function handle(GoogleDriveService $drive, CloudinaryManager $cloudinary)
    {
        ini_set('memory_limit', '-1');

        $this->info('Starting migration from Cloudinary to Google Drive...');

        // 1. Abastecimentos
        $this->info('Migrating Abastecimentos...');
        $abastecimentos = Abastecimento::where(function($query) {
            $query->whereNotNull('anexo')->where('anexo', 'like', '%cloudinary.com%')
                  ->orWhereNotNull('foto_odometro')->where('foto_odometro', 'like', '%cloudinary.com%')
                  ->orWhereNotNull('bomba')->where('bomba', 'like', '%cloudinary.com%');
        })->get();

        $this->withProgressBar($abastecimentos, function (Abastecimento $abastecimento) use ($drive, $cloudinary) {
            // Migrar anexo
            if (!empty($abastecimento->anexo) && str_contains($abastecimento->anexo, 'cloudinary.com')) {
                $urls = $this->extractUrls($abastecimento->anexo);
                $newUrls = [];
                
                foreach ($urls as $url) {
                    if (str_contains($url, 'cloudinary.com')) {
                        $newUrl = $this->migrateUrl($url, $drive, $cloudinary, 'abastecimento_anexo_' . $abastecimento->id_abastecimento);
                        $newUrls[] = $newUrl ?: $url;
                    } else {
                        $newUrls[] = $url;
                    }
                }
                
                if (!empty($newUrls)) {
                    $abastecimento->anexo = count($newUrls) === 1 ? $newUrls[0] : json_encode($newUrls, JSON_UNESCAPED_SLASHES);
                }
            }

            // Migrar foto_odometro
            if (!empty($abastecimento->foto_odometro) && str_contains($abastecimento->foto_odometro, 'cloudinary.com')) {
                $newUrl = $this->migrateUrl($abastecimento->foto_odometro, $drive, $cloudinary, 'abastecimento_foto_' . $abastecimento->id_abastecimento);
                if ($newUrl) {
                    $abastecimento->foto_odometro = $newUrl;
                }
            }

            // Migrar bomba
            if (!empty($abastecimento->bomba) && str_contains($abastecimento->bomba, 'cloudinary.com')) {
                $newUrl = $this->migrateUrl($abastecimento->bomba, $drive, $cloudinary, 'abastecimento_bomba_' . $abastecimento->id_abastecimento);
                if ($newUrl) {
                    $abastecimento->bomba = $newUrl;
                }
            }

            if ($abastecimento->isDirty()) {
                $abastecimento->save();
            }
        });
        $this->newLine();

        // 2. Entrada Notas
        $this->info('Migrating Entrada Notas...');
        $notas = EntradaNota::whereNotNull('foto_nota')
            ->where('foto_nota', 'like', '%cloudinary.com%')
            ->get();

        $this->withProgressBar($notas, function (EntradaNota $nota) use ($drive, $cloudinary) {
            $urls = $this->extractUrls($nota->foto_nota);
            $newUrls = [];
            
            foreach ($urls as $url) {
                if (str_contains($url, 'cloudinary.com')) {
                    $newUrl = $this->migrateUrl($url, $drive, $cloudinary, 'nota_' . $nota->id_financeiro);
                    if ($newUrl) {
                        $newUrls[] = $newUrl;
                    } else {
                        $newUrls[] = $url; // keep old if failed
                    }
                } else {
                    $newUrls[] = $url;
                }
            }

            if (!empty($newUrls)) {
                $nota->foto_nota = count($newUrls) === 1 ? $newUrls[0] : json_encode($newUrls, JSON_UNESCAPED_SLASHES);
                $nota->save();
            }
        });
        $this->newLine();

        // 3. Comprovantes de Pagamento
        $this->info('Migrating Comprovantes Pagamento...');
        $comprovantes = DB::table('comprovantes_pagamento')
            ->whereNotNull('arquivo_url')
            ->where('arquivo_url', 'like', '%cloudinary.com%')
            ->get();

        $this->withProgressBar($comprovantes, function ($comprovante) use ($drive, $cloudinary) {
            $url = $comprovante->arquivo_url;
            if (str_contains($url, 'cloudinary.com')) {
                $newUrl = $this->migrateUrl($url, $drive, $cloudinary, 'comprovante_' . $comprovante->id);
                if ($newUrl) {
                    DB::table('comprovantes_pagamento')
                        ->where('id', $comprovante->id)
                        ->update(['arquivo_url' => $newUrl]);
                }
            }
        });
        $this->newLine();

        if (!empty($this->errors)) {
            $logPath = storage_path('logs/cloudinary_migration_errors.log');
            $this->warn('There were ' . count($this->errors) . ' errors during migration.');
            $this->info('Saving error log to: ' . $logPath);
            
            $logContent = "Migration Errors - " . date('Y-m-d H:i:s') . PHP_EOL . str_repeat('-', 50) . PHP_EOL;
            foreach ($this->errors as $err) {
                $logContent .= "[{$err['prefix']}] URL: {$err['url']}" . PHP_EOL . "Error: {$err['message']}" . PHP_EOL . PHP_EOL;
            }
            file_put_contents($logPath, $logContent, FILE_APPEND);
        }

        // $this->backupAllCloudinaryResources($drive);

        $this->info('Migration completed successfully!');
    }

    private function extractUrls($field): array
    {
        if (is_array($field)) {
            return $field;
        }
        
        $decoded = json_decode((string) $field, true);
        if (is_array($decoded)) {
            return $decoded;
        }
        
        return [(string) $field];
    }

    private function migrateUrl(string $url, GoogleDriveService $drive, CloudinaryManager $cloudinary, string $prefix): ?string
    {
        try {
            // First try direct download
            $request = Http::timeout(30);
            if (PHP_OS_FAMILY === 'Windows') {
                $request = $request->withoutVerifying();
            }
            $response = $request->get($url);
            
            if ($response->successful()) {
                $content = $response->body();
                $contentType = $response->header('Content-Type') ?: 'application/octet-stream';
                $filename = basename(parse_url($url, PHP_URL_PATH) ?? 'file');
            } else {
                // If it fails (maybe private), try CloudinaryManager
                try {
                    $result = $cloudinary->download($url);
                    $content = $result['body'];
                    $contentType = $result['contentType'];
                    $filename = $result['filename'];
                } catch (\Throwable $e) {
                    $msg = "Failed to download $url via CloudinaryManager: " . $e->getMessage();
                    $this->error($msg);
                    $this->errors[] = ['url' => $url, 'prefix' => $prefix, 'message' => $msg];
                    return null;
                }
            }

            // Create temporary file
            $tmpPath = sys_get_temp_dir() . '/' . uniqid($prefix . '_') . '_' . $filename;
            file_put_contents($tmpPath, $content);

            // Upload to Google Drive
            $driveResult = $drive->uploadComprovante($tmpPath, $filename, $contentType);
            
            // Clean up
            @unlink($tmpPath);

            return $driveResult['downloadUrl'] ?? $driveResult['webViewLink'] ?? null;
        } catch (\Throwable $e) {
            $msg = "Failed to migrate $url: " . $e->getMessage();
            $this->error($msg);
            $this->errors[] = ['url' => $url, 'prefix' => $prefix, 'message' => $msg];
            return null;
        }
    }

    private function backupAllCloudinaryResources(GoogleDriveService $drive): void
    {
        $this->info("\n--- INICIANDO BACKUP COMPLETO DO CLOUDINARY (STAGE 2) ---");
        
        $urls = [
            env('CLOUDINARY_URL'),
            env('CLOUDINARY_URL_2'),
            env('CLOUDINARY_URL_3'),
        ];

        foreach ($urls as $index => $cloudinaryUrl) {
            $cloudinaryUrl = (string) $cloudinaryUrl;
            if (empty(trim($cloudinaryUrl))) {
                continue;
            }

            $this->info("Conectando na conta Cloudinary #" . ($index + 1) . "...");
            
            $parsed = parse_url($cloudinaryUrl);
            $cloudName = $parsed['host'] ?? '';
            $user = isset($parsed['user']) ? urldecode($parsed['user']) : '';
            $pass = isset($parsed['pass']) ? urldecode($parsed['pass']) : '';

            if (!$cloudName || !$user || !$pass) {
                $this->warn("URL da conta #" . ($index + 1) . " inválida. Pulando.");
                continue;
            }

            $totalBackedUp = 0;
            $resourceTypes = ['image', 'raw', 'video'];

            foreach ($resourceTypes as $resourceType) {
                $this->info("  -> Buscando recursos do tipo: $resourceType");
                $nextCursor = null;

                do {
                    $url = "https://api.cloudinary.com/v1_1/{$cloudName}/resources/{$resourceType}";
                    if ($nextCursor) {
                        $url .= "?next_cursor=" . urlencode($nextCursor);
                    }

                    $req = Http::withBasicAuth($user, $pass)->timeout(30);
                    if (PHP_OS_FAMILY === 'Windows') {
                        $req = $req->withoutVerifying();
                    }
                    $response = $req->get($url);

                    if (!$response->successful()) {
                        $this->warn("   [!] Falha ao listar tipo $resourceType: " . $response->body());
                        break;
                    }

                    $data = $response->json();
                    $resources = $data['resources'] ?? [];
                    
                    if (empty($resources) && !$nextCursor) {
                        $this->info("   Nenhum recurso $resourceType encontrado.");
                        break;
                    }

                    foreach ($resources as $res) {
                        $downloadUrl = $res['secure_url'] ?? $res['url'] ?? null;
                        if (!$downloadUrl) continue;

                        $prefix = "backup_conta_" . ($index + 1) . "_" . ($res['public_id'] ?? 'file');
                        
                        try {
                            $req = Http::timeout(30);
                            if (PHP_OS_FAMILY === 'Windows') {
                                $req = $req->withoutVerifying();
                            }
                            $fileResp = $req->get($downloadUrl);
                            
                            if ($fileResp->successful()) {
                                $content = $fileResp->body();
                                $contentType = $fileResp->header('Content-Type') ?: 'application/octet-stream';
                                $filename = basename(parse_url($downloadUrl, PHP_URL_PATH) ?? 'file');
                                
                                $tempFile = sys_get_temp_dir() . '/' . uniqid('backup_') . '_' . $filename;
                                file_put_contents($tempFile, $content);
                                
                                $drive->uploadComprovante($tempFile, $filename, $contentType);
                                
                                unlink($tempFile);
                                $totalBackedUp++;
                                $this->line("   [OK] Backup de $downloadUrl");
                            }
                        } catch (\Throwable $e) {
                            $this->warn("   [ERRO] Backup de $downloadUrl falhou: " . $e->getMessage());
                        }
                    }

                    $nextCursor = $data['next_cursor'] ?? null;

                } while ($nextCursor);
            }

            $this->info("Conta #" . ($index + 1) . " finalizada. Total de arquivos novos bacapeados: $totalBackedUp.");
        }
    }
}
