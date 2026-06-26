<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\EntradaNota;
use App\Models\Abastecimento;
use Illuminate\Support\Facades\DB;
use App\Services\GoogleDriveService;

class OrganizeDriveFiles extends Command
{
    protected $signature = 'drive:organize';
    protected $description = 'Organiza os arquivos no Google Drive em pastas por Proprietario/Categoria retroativamente.';

    public function handle(GoogleDriveService $drive)
    {
        $this->info('Iniciando organização retroativa dos arquivos do Google Drive...');
        
        $totalMoved = 0;
        $totalErrors = 0;

        // 1. Organizar Entrada Notas (por Fornecedor -> Notas)
        $this->info('Organizando Entrada de Notas...');
        $notas = EntradaNota::whereNotNull('foto_nota')->get();
        foreach ($notas as $nota) {
            $fileId = $drive->extractFileId($nota->foto_nota);
            if (!$fileId) continue;

            $fornecedor = trim((string)$nota->fornecedor) ?: 'Desconhecido';
            try {
                $targetFolder = $drive->resolveProprietarioFolder($fornecedor, 'Notas');
                $drive->moveFile($fileId, $targetFolder);
                $totalMoved++;
                $this->line(" [OK] Nota {$nota->id_financeiro} movida.");
            } catch (\Throwable $e) {
                // Se der erro 404, o arquivo não existe mais ou já foi movido para fora do acesso
                $totalErrors++;
                $this->warn(" [ERRO] Falha ao mover nota {$nota->id_financeiro}: " . $e->getMessage());
            }
        }

        // 2. Organizar Abastecimentos (por Proprietario -> Abastecimentos)
        $this->info('Organizando Abastecimentos...');
        $abastecimentos = Abastecimento::whereNotNull('foto_odometro')->orWhereNotNull('anexo')->orWhereNotNull('bomba')->get();
        foreach ($abastecimentos as $abastecimento) {
            $proprietarioNome = trim((string)$abastecimento->nome_proprietario) ?: 'Desconhecido';
            try {
                $targetFolder = $drive->resolveProprietarioFolder($proprietarioNome, 'Abastecimentos');

                if (!empty($abastecimento->foto_odometro)) {
                    $fileId = $drive->extractFileId($abastecimento->foto_odometro);
                    if ($fileId) {
                        $drive->moveFile($fileId, $targetFolder);
                        $totalMoved++;
                        $this->line(" [OK] Abastecimento {$abastecimento->id_abastecimento} (foto) movido.");
                    }
                }
                
                if (!empty($abastecimento->anexo)) {
                    $fileId = $drive->extractFileId($abastecimento->anexo);
                    if ($fileId) {
                        $drive->moveFile($fileId, $targetFolder);
                        $totalMoved++;
                        $this->line(" [OK] Abastecimento {$abastecimento->id_abastecimento} (anexo) movido.");
                    }
                }
                
                if (!empty($abastecimento->bomba)) {
                    $fileId = $drive->extractFileId($abastecimento->bomba);
                    if ($fileId) {
                        $drive->moveFile($fileId, $targetFolder);
                        $totalMoved++;
                        $this->line(" [OK] Abastecimento {$abastecimento->id_abastecimento} (bomba) movido.");
                    }
                }
            } catch (\Throwable $e) {
                $totalErrors++;
                $this->warn(" [ERRO] Falha ao mover abastecimento {$abastecimento->id_abastecimento}: " . $e->getMessage());
            }
        }

        // 3. Organizar Comprovantes de Pagamento (Baixas) (por Proprietario -> Baixas)
        $this->info('Organizando Comprovantes de Baixa...');
        $comprovantes = DB::table('comprovantes_pagamento')
            ->whereNotNull('proprietario_id')
            ->whereNotNull('arquivo_url')
            ->leftJoin('proprietarios', 'comprovantes_pagamento.proprietario_id', '=', 'proprietarios.id_proprietario')
            ->select('comprovantes_pagamento.*', 'proprietarios.nome as proprietario_nome')
            ->get();
            
        foreach ($comprovantes as $comprovante) {
            $fileId = $drive->extractFileId($comprovante->arquivo_url);
            if (!$fileId) continue;

            $proprietarioNome = trim((string)$comprovante->proprietario_nome) ?: 'Desconhecido';
            try {
                $targetFolder = $drive->resolveProprietarioFolder($proprietarioNome, 'Baixas');
                $drive->moveFile($fileId, $targetFolder);
                $totalMoved++;
                $this->line(" [OK] Comprovante {$comprovante->id} movido.");
            } catch (\Throwable $e) {
                $totalErrors++;
                $this->warn(" [ERRO] Falha ao mover comprovante {$comprovante->id}: " . $e->getMessage());
            }
        }

        $this->info('Organização concluída!');
        $this->info("Total movido com sucesso: {$totalMoved}");
        $this->info("Total de falhas: {$totalErrors}");
    }
}
