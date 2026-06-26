<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\AbastecimentoController;
use App\Http\Controllers\BaixaAbastecimentoController;
use App\Http\Controllers\EntradaNotaController;
use App\Http\Controllers\ProprietarioController;
use App\Http\Controllers\VeiculoController;
use App\Http\Controllers\MotoristaController;
use App\Http\Controllers\UsuarioController;
use App\Http\Controllers\ValoresCombustivelController;
use App\Http\Controllers\RelatorioController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DriveUploadController;
use App\Http\Controllers\ComprovanteAnalysisController;
use App\Http\Controllers\AppUpdateController;
use App\Http\Controllers\AppErroController;
use App\Http\Controllers\AppConfigController;
use App\Http\Controllers\AuditoriaController;
use App\Http\Controllers\EncerranteBombaController;
use App\Http\Controllers\DespesaAvulsaController;
use App\Http\Controllers\BalancetePrivadoController;
use App\Http\Controllers\TanqueHistoricoController;
use App\Http\Controllers\AbastecimentoAuditoriaController;
use App\Http\Controllers\GraficosGerenciaisController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

// Auth
Route::prefix('auth')->group(function () {
    Route::post('login', [AuthController::class, 'login']);
    Route::post('logout', [AuthController::class, 'logout']);
    Route::get('me', [AuthController::class, 'me'])->middleware('auth:api');
    Route::post('refresh', [AuthController::class, 'refresh']);
});

// Atualização do APK
Route::get('app-update', [AppUpdateController::class, 'show']);

// Protected routes
Route::middleware('auth:api')->group(function () {

    // Dashboard
    Route::get('dashboard', [DashboardController::class, 'index']);

    // Erros ocultos do APK/app
    Route::post('app-erros', [AppErroController::class, 'store']);

    // Proprietários (leitura)
    Route::apiResource('proprietarios', ProprietarioController::class)->only(['index', 'show']);

    // Veículos (leitura)
    Route::apiResource('veiculos', VeiculoController::class)->only(['index', 'show']);
    Route::get('veiculos/proprietario/{id}', [VeiculoController::class, 'byProprietario']);

    // Motoristas (leitura)
    Route::apiResource('motoristas', MotoristaController::class)->only(['index', 'show']);
    Route::get('motoristas/proprietario/{id}', [MotoristaController::class, 'byProprietario']);

    // Abastecimentos (leitura)
    Route::get('abastecimentos/filter/baixa-pendente', [AbastecimentoController::class, 'pendenteBaixa']);
    Route::apiResource('abastecimentos', AbastecimentoController::class)->only(['index', 'show']);
    Route::get('abastecimentos/{id}/comprovante', [AbastecimentoController::class, 'comprovante']);
    Route::get('abastecimentos/{id}/comprovante/debug', [AbastecimentoController::class, 'comprovanteDebug']);

    // Baixa Abastecimento (leitura)
    Route::apiResource('baixas', BaixaAbastecimentoController::class)->only(['index', 'show']);

    // Entrada de Notas (leitura)
    Route::apiResource('entrada-notas', EntradaNotaController::class)->only(['index', 'show']);

    // Valores Combustível (leitura)
    Route::apiResource('valores-combustivel', ValoresCombustivelController::class)->only(['index', 'show']);
    Route::get('valores-combustivel/atual/{tipo}', [ValoresCombustivelController::class, 'valorAtual']);

    // Encerrante da bomba
    Route::get('encerrantes-bomba/analise-privada', [EncerranteBombaController::class, 'analisePrivada']);
    Route::get('encerrantes-bomba', [EncerranteBombaController::class, 'index']);
    Route::get('encerrantes-bomba/status', [EncerranteBombaController::class, 'status']);
    Route::get('configuracoes/encerrante-bomba', [EncerranteBombaController::class, 'config']);
    Route::get('configuracoes/abastecimento-analise', [AppConfigController::class, 'abastecimentoAnalise']);

    // Usuários (leitura)
    Route::apiResource('usuarios', UsuarioController::class)->only(['index', 'show']);

    // Relatórios
    Route::get('relatorios/proprietario', [RelatorioController::class, 'porProprietario']);
    Route::get('relatorios/proprietario/pdf', [RelatorioController::class, 'porProprietarioPdf']);

    // Uploads
    Route::post('uploads/drive', [DriveUploadController::class, 'store']);
    Route::post('abastecimentos/analisar-comprovante', [ComprovanteAnalysisController::class, 'analyze']);

    // Criação: admin e operador
    Route::middleware('admin_or_operador')->group(function () {
        Route::post('proprietarios', [ProprietarioController::class, 'store']);
        Route::put('proprietarios/{id}', [ProprietarioController::class, 'update']);
        Route::patch('proprietarios/{id}', [ProprietarioController::class, 'update']);
        Route::post('veiculos', [VeiculoController::class, 'store']);
        Route::post('motoristas', [MotoristaController::class, 'store']);
        Route::post('abastecimentos', [AbastecimentoController::class, 'store']);
        Route::post('abastecimentos/{id}/verificar-inconsistencia', [AbastecimentoController::class, 'verificarInconsistencia']);
        Route::post('abastecimentos/{id}/analisar-inconsistencias', [AbastecimentoController::class, 'analisarInconsistencias']);
        Route::post('entrada-notas', [EntradaNotaController::class, 'store']);
        Route::post('entrada-notas/{id}/analisar-ia', [EntradaNotaController::class, 'analisarIa']);
        Route::post('encerrantes-bomba', [EncerranteBombaController::class, 'store']);
    });

    // Escrita sensível (edição/exclusão): somente admin
    Route::middleware('admin')->group(function () {
        // Histórico de alterações
        Route::get('auditoria', [AuditoriaController::class, 'index']);
        Route::delete('auditoria', [AuditoriaController::class, 'destroyAll']);
        Route::get('auditoria/abastecimentos-suspeitos', [AbastecimentoAuditoriaController::class, 'index']);
        Route::post('auditoria/abastecimentos-suspeitos/{id}/auditar', [AbastecimentoAuditoriaController::class, 'marcarAuditado']);

        // Tela privada Douglas
        Route::get('balancete-privado', [BalancetePrivadoController::class, 'index']);
        Route::get('tanques-privado/historico', [TanqueHistoricoController::class, 'index']);
        Route::get('graficos-gerenciais', [GraficosGerenciaisController::class, 'index']);

        // Erros do APK/app
        Route::get('app-erros', [AppErroController::class, 'index']);
        Route::delete('app-erros', [AppErroController::class, 'destroyAll']);

        // Despesas avulsas
        Route::post('despesas-avulsas/{id}/restore', [DespesaAvulsaController::class, 'restore']);
        Route::apiResource('despesas-avulsas', DespesaAvulsaController::class);

        // Proprietários
        Route::post('proprietarios/{id}/bloquear', [ProprietarioController::class, 'bloquear']);
        Route::post('proprietarios/{id}/desbloquear', [ProprietarioController::class, 'desbloquear']);
        Route::post('proprietarios/{id}/restore', [ProprietarioController::class, 'restore']);
        Route::apiResource('proprietarios', ProprietarioController::class)->only(['destroy']);

        // Veículos
        Route::post('veiculos/{id}/restore', [VeiculoController::class, 'restore']);
        Route::post('veiculos/{id}/transferir', [VeiculoController::class, 'transferir']);
        Route::apiResource('veiculos', VeiculoController::class)->only(['update', 'destroy']);

        // Motoristas
        Route::post('motoristas/{id}/restore', [MotoristaController::class, 'restore']);
        Route::apiResource('motoristas', MotoristaController::class)->only(['update', 'destroy']);

        // Abastecimentos
        Route::post('abastecimentos/{id}/restore', [AbastecimentoController::class, 'restore']);
        Route::apiResource('abastecimentos', AbastecimentoController::class)->only(['update', 'destroy']);
        Route::delete('abastecimentos/{id}/force', [AbastecimentoController::class, 'forceDelete']);

        // Baixas
        Route::post('baixas/{id}/restore', [BaixaAbastecimentoController::class, 'restore']);
        Route::apiResource('baixas', BaixaAbastecimentoController::class)->only(['store', 'update', 'destroy']);
        Route::delete('baixas/{id}/force', [BaixaAbastecimentoController::class, 'forceDelete']);
        Route::post('baixas/automaticas', [BaixaAbastecimentoController::class, 'storeAutomatica']);
        Route::post('baixas/lote', [BaixaAbastecimentoController::class, 'storeLote']);

        // Entrada de notas
        Route::post('entrada-notas/{id}/restore', [EntradaNotaController::class, 'restore']);
        Route::apiResource('entrada-notas', EntradaNotaController::class)->only(['update', 'destroy']);
        Route::delete('entrada-notas/{id}/force', [EntradaNotaController::class, 'forceDelete']);

        // Valores combustível
        Route::apiResource('valores-combustivel', ValoresCombustivelController::class)->only(['store', 'update', 'destroy']);

        // Configurações
        Route::put('configuracoes/encerrante-bomba', [EncerranteBombaController::class, 'updateConfig']);
        Route::put('configuracoes/abastecimento-analise', [AppConfigController::class, 'updateAbastecimentoAnalise']);
        Route::put('encerrantes-bomba/{id}', [EncerranteBombaController::class, 'update']);
        Route::delete('encerrantes-bomba/{id}', [EncerranteBombaController::class, 'destroy']);

        // Usuários
        Route::post('usuarios/{id}/restore', [UsuarioController::class, 'restore']);
        Route::apiResource('usuarios', UsuarioController::class)->only(['store', 'update', 'destroy']);
    });
});
