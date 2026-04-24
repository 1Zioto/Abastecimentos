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
    Route::post('logout', [AuthController::class, 'logout'])->middleware('auth:api');
    Route::get('me', [AuthController::class, 'me'])->middleware('auth:api');
    Route::post('refresh', [AuthController::class, 'refresh'])->middleware('auth:api');
});

// Protected routes
Route::middleware('auth:api')->group(function () {

    // Dashboard
    Route::get('dashboard', [DashboardController::class, 'index']);

    // Proprietários
    Route::apiResource('proprietarios', ProprietarioController::class);

    // Veículos
    Route::apiResource('veiculos', VeiculoController::class);
    Route::get('veiculos/proprietario/{id}', [VeiculoController::class, 'byProprietario']);

    // Motoristas
    Route::apiResource('motoristas', MotoristaController::class);
    Route::get('motoristas/proprietario/{id}', [MotoristaController::class, 'byProprietario']);

    // Abastecimentos
    Route::apiResource('abastecimentos', AbastecimentoController::class);
    Route::delete('abastecimentos/{id}/force', [AbastecimentoController::class, 'forceDelete']);
    Route::get('abastecimentos/{id}/comprovante', [AbastecimentoController::class, 'comprovante']);
    Route::get('abastecimentos/{id}/comprovante/debug', [AbastecimentoController::class, 'comprovanteDebug']);
    Route::get('abastecimentos/filter/baixa-pendente', [AbastecimentoController::class, 'pendenteBaixa']);

    // Baixa Abastecimento
    Route::apiResource('baixas', BaixaAbastecimentoController::class);
    Route::delete('baixas/{id}/force', [BaixaAbastecimentoController::class, 'forceDelete']);
    Route::post('baixas/lote', [BaixaAbastecimentoController::class, 'storeLote']);

    // Entrada de Notas
    Route::apiResource('entrada-notas', EntradaNotaController::class);
    Route::delete('entrada-notas/{id}/force', [EntradaNotaController::class, 'forceDelete']);

    // Valores Combustível
    Route::apiResource('valores-combustivel', ValoresCombustivelController::class);
    Route::get('valores-combustivel/atual/{tipo}', [ValoresCombustivelController::class, 'valorAtual']);

    // Usuários
    Route::apiResource('usuarios', UsuarioController::class);

    // Relatórios
    Route::get('relatorios/proprietario', [RelatorioController::class, 'porProprietario']);
    Route::get('relatorios/proprietario/pdf', [RelatorioController::class, 'porProprietarioPdf']);

    // Uploads
    Route::post('uploads/drive', [DriveUploadController::class, 'store']);
});
