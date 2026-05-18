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

// Protected routes
Route::middleware('auth:api')->group(function () {

    // Dashboard
    Route::get('dashboard', [DashboardController::class, 'index']);

    // Proprietários (leitura)
    Route::apiResource('proprietarios', ProprietarioController::class)->only(['index', 'show']);

    // Veículos (leitura)
    Route::apiResource('veiculos', VeiculoController::class)->only(['index', 'show']);
    Route::get('veiculos/proprietario/{id}', [VeiculoController::class, 'byProprietario']);

    // Motoristas (leitura)
    Route::apiResource('motoristas', MotoristaController::class)->only(['index', 'show']);
    Route::get('motoristas/proprietario/{id}', [MotoristaController::class, 'byProprietario']);

    // Abastecimentos (leitura)
    Route::apiResource('abastecimentos', AbastecimentoController::class)->only(['index', 'show']);
    Route::get('abastecimentos/{id}/comprovante', [AbastecimentoController::class, 'comprovante']);
    Route::get('abastecimentos/{id}/comprovante/debug', [AbastecimentoController::class, 'comprovanteDebug']);
    Route::get('abastecimentos/filter/baixa-pendente', [AbastecimentoController::class, 'pendenteBaixa']);

    // Baixa Abastecimento (leitura)
    Route::apiResource('baixas', BaixaAbastecimentoController::class)->only(['index', 'show']);

    // Entrada de Notas (leitura)
    Route::apiResource('entrada-notas', EntradaNotaController::class)->only(['index', 'show']);

    // Valores Combustível (leitura)
    Route::apiResource('valores-combustivel', ValoresCombustivelController::class)->only(['index', 'show']);
    Route::get('valores-combustivel/atual/{tipo}', [ValoresCombustivelController::class, 'valorAtual']);

    // Usuários (leitura)
    Route::apiResource('usuarios', UsuarioController::class)->only(['index', 'show']);

    // Relatórios
    Route::get('relatorios/proprietario', [RelatorioController::class, 'porProprietario']);
    Route::get('relatorios/proprietario/pdf', [RelatorioController::class, 'porProprietarioPdf']);

    // Uploads
    Route::post('uploads/drive', [DriveUploadController::class, 'store']);

    // Criação: admin e operador
    Route::middleware('admin_or_operador')->group(function () {
        Route::post('proprietarios', [ProprietarioController::class, 'store']);
        Route::post('veiculos', [VeiculoController::class, 'store']);
        Route::post('motoristas', [MotoristaController::class, 'store']);
        Route::post('abastecimentos', [AbastecimentoController::class, 'store']);
        Route::post('entrada-notas', [EntradaNotaController::class, 'store']);
    });

    // Escrita sensível (edição/exclusão): somente admin
    Route::middleware('admin')->group(function () {
        // Proprietários
        Route::post('proprietarios/{id}/bloquear', [ProprietarioController::class, 'bloquear']);
        Route::post('proprietarios/{id}/desbloquear', [ProprietarioController::class, 'desbloquear']);
        Route::apiResource('proprietarios', ProprietarioController::class)->only(['update', 'destroy']);

        // Veículos
        Route::apiResource('veiculos', VeiculoController::class)->only(['update', 'destroy']);

        // Motoristas
        Route::apiResource('motoristas', MotoristaController::class)->only(['update', 'destroy']);

        // Abastecimentos
        Route::apiResource('abastecimentos', AbastecimentoController::class)->only(['update', 'destroy']);
        Route::delete('abastecimentos/{id}/force', [AbastecimentoController::class, 'forceDelete']);

        // Baixas
        Route::apiResource('baixas', BaixaAbastecimentoController::class)->only(['store', 'update', 'destroy']);
        Route::delete('baixas/{id}/force', [BaixaAbastecimentoController::class, 'forceDelete']);
        Route::post('baixas/lote', [BaixaAbastecimentoController::class, 'storeLote']);

        // Entrada de notas
        Route::apiResource('entrada-notas', EntradaNotaController::class)->only(['update', 'destroy']);
        Route::delete('entrada-notas/{id}/force', [EntradaNotaController::class, 'forceDelete']);

        // Valores combustível
        Route::apiResource('valores-combustivel', ValoresCombustivelController::class)->only(['store', 'update', 'destroy']);

        // Usuários
        Route::apiResource('usuarios', UsuarioController::class)->only(['store', 'update', 'destroy']);
    });
});
