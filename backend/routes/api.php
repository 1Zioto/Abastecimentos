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
use App\Http\Controllers\EncerranteDiarioController;
use App\Http\Controllers\DespesaAvulsaController;
use App\Http\Controllers\BalancetePrivadoController;
use App\Http\Controllers\TanqueHistoricoController;
use App\Http\Controllers\AbastecimentoAuditoriaController;
use App\Http\Controllers\GraficosGerenciaisController;
use App\Http\Controllers\ComprovantePagamentoController;
use App\Http\Controllers\AliasProprietarioController;
use App\Http\Controllers\ApiKeyController;
use App\Http\Controllers\PortalProprietarioController;
use App\Http\Controllers\SofitController;
use App\Http\Controllers\ConciliacaoBancariaController;
use App\Http\Controllers\CloudinaryController;
use App\Http\Controllers\CloudinaryMediaController;
use App\Http\Controllers\GoogleDriveOAuthController;
use App\Http\Controllers\ConferenciaVipeController;
use App\Http\Controllers\ConsultaVipeController;
use App\Http\Controllers\TripController;
use App\Http\Controllers\TelemetryCostController;
use App\Http\Controllers\PingoController;
use App\Http\Controllers\VariacaoEntradasSaidasController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

// Nova Baixa: recebimento externo de comprovantes (API key)
    Route::post('external/comprovantes', [ComprovantePagamentoController::class, 'storeExterno']);
    Route::post('external/comprovantes/lote', [ComprovantePagamentoController::class, 'storeExternoLote']);
    Route::post('external/upload-drive-base64', [DriveUploadController::class, 'storeBase64']);

// Upload direto para o Drive (bot): o backend só abre a sessão e finaliza,
// os bytes vão do cliente direto para o Google.
Route::middleware(['api_key', 'throttle:120,1'])->group(function () {
    Route::post('external/uploads/drive/sessao', [DriveUploadController::class, 'criarSessao']);
    Route::post('external/uploads/drive/finalizar', [DriveUploadController::class, 'finalizarSessao']);
});

// Auth
Route::prefix('auth')->group(function () {
    Route::post('login', [AuthController::class, 'login']);
    Route::post('logout', [AuthController::class, 'logout']);
    Route::get('me', [AuthController::class, 'me'])->middleware('auth:api');
    Route::post('refresh', [AuthController::class, 'refresh']);
});

// Compatibilidade com versões antigas; atualizações são gerenciadas pela Google Play.
Route::get('app-update', [AppUpdateController::class, 'show']);

// Relatório semanal por WhatsApp (chamado pelo cron da Vercel; protegido por CRON_SECRET)
Route::get('relatorio-semanal/enviar', [App\Http\Controllers\RelatorioSemanalController::class, 'enviar']);

// Integração Atua: envia abastecimentos da frota VIPE (cron da Vercel; CRON_SECRET)
Route::get('atua/enviar', [App\Http\Controllers\AtuaIntegracaoController::class, 'enviar']);

// Autorização única do Google Drive (OAuth 2.0 Web Server Flow)
Route::get('google-drive/auth', [GoogleDriveOAuthController::class, 'redirect']);
Route::get('google-drive/callback', [GoogleDriveOAuthController::class, 'callback']);

// Portal público do proprietário (acesso por token, sem login)
Route::get('portal/{token}', [PortalProprietarioController::class, 'show']);

// Google Drive Image Proxy (acesso público para o frontend renderizar miniaturas)
Route::get('drive-image', [DriveUploadController::class, 'showImage']);
Route::get('drive-thumb', [DriveUploadController::class, 'showThumb']);

// API externa, somente leitura, limitada à frota própria da VIPE TRANSPORTES.
Route::prefix('consulta/v1')
    ->middleware(['api_key', 'throttle:120,1'])
    ->group(function () {
        Route::get('status', [ConsultaVipeController::class, 'status']);
        Route::get('abastecimentos', [ConsultaVipeController::class, 'abastecimentos']);
        Route::get('abastecimentos/{id}', [ConsultaVipeController::class, 'abastecimento']);
        Route::get('entradas-combustivel', [ConsultaVipeController::class, 'entradasCombustivel']);
        Route::get('entradas-combustivel/{id}', [ConsultaVipeController::class, 'entradaCombustivel']);
        Route::get('baixas-comprovantes', [ConsultaVipeController::class, 'baixasComprovantes']);
        Route::get('pendencias-lancamento', [ConsultaVipeController::class, 'pendenciasLancamento']);
        Route::get('tanques', [ConsultaVipeController::class, 'tanques']);
    });

// Protected routes
Route::middleware('auth:api')->group(function () {
    Route::get('encerrantes-diarios', [EncerranteDiarioController::class, 'index'])->middleware('admin_or_operador');
    Route::get('encerrantes-diarios/saldo', [EncerranteDiarioController::class, 'saldo'])->middleware('admin_or_operador');
    Route::post('encerrantes-diarios', [EncerranteDiarioController::class, 'store'])->middleware('admin_or_operador');

    // Integração Atua — liberada para admin e visualizador
    // (a checagem de perfil é feita no controller).
    Route::get('atua/status', [App\Http\Controllers\AtuaIntegracaoController::class, 'status']);
    Route::get('atua/lancamentos', [App\Http\Controllers\AtuaIntegracaoController::class, 'lancamentos']);
    Route::get('atua/opcoes', [App\Http\Controllers\AtuaIntegracaoController::class, 'opcoes']);
    Route::post('atua/reenviar/{id}', [App\Http\Controllers\AtuaIntegracaoController::class, 'reenviar']);

    // ── Sistema de Rentabilidade / Viagens (Fase 1) ──────────────────
    Route::prefix('v1')->group(function () {
        Route::post('trips/{trip}/recalcular', [TripController::class, 'recalcular']);
        Route::get('trips/{trip}/resultado', [TripController::class, 'resultado']);
        Route::post('trips/{trip}/vincular-abastecimentos', [TripController::class, 'vincularAbastecimentos']);
        Route::post('trips-vincular-abastecimentos', [TripController::class, 'vincularAbastecimentosLote']);
        Route::get('trips/{trip}/marcha-lenta', [TelemetryCostController::class, 'marchaLentaViagem']);
        Route::apiResource('trips', TripController::class);

        // Telemetria em R$ / painel de perdas
        Route::get('telemetria/marcha-lenta', [TelemetryCostController::class, 'marchaLenta']);
        Route::get('dinheiro-perdido', [TelemetryCostController::class, 'dinheiroPerdido']);
    });

    // Dashboard
    Route::get('dashboard', [DashboardController::class, 'index']);
    Route::get('variacao-entradas-saidas', [VariacaoEntradasSaidasController::class, 'index']);
    Route::get('pingo/opcoes', [PingoController::class, 'opcoes'])->middleware('admin');
    Route::post('pingo/perguntar', [PingoController::class, 'perguntar'])->middleware(['admin', 'throttle:20,1']);

    // Erros ocultos do APK/app
    Route::post('app-erros', [AppErroController::class, 'store']);

    // Proprietários (leitura)
    Route::apiResource('proprietarios', ProprietarioController::class)->only(['index', 'show']);
    Route::get('proprietarios/{id}/credito', [\App\Http\Controllers\CreditoProprietarioController::class, 'saldoEndpoint']);

    // Veículos (leitura)
    Route::get('veiculos/odometro-sascar', [\App\Http\Controllers\SascarController::class, 'odometro']);
    Route::apiResource('veiculos', VeiculoController::class)->only(['index', 'show']);
    Route::get('veiculos/proprietario/{id}', [VeiculoController::class, 'byProprietario']);

    // Motoristas (leitura)
    Route::apiResource('motoristas', MotoristaController::class)->only(['index', 'show']);
    Route::get('motoristas/proprietario/{id}', [MotoristaController::class, 'byProprietario']);

    // Abastecimentos (leitura)
    Route::get('abastecimentos/filter/baixa-pendente', [AbastecimentoController::class, 'pendenteBaixa']);
    Route::get('abastecimentos/preco-custo-automatico/{tipo}', [AbastecimentoController::class, 'precoCustoAutomatico']);
    Route::get('abastecimentos/sofit-grupos', [SofitController::class, 'gruposPendentes']);
    Route::apiResource('abastecimentos', AbastecimentoController::class)->only(['index', 'show']);
    Route::get('abastecimentos/{id}/comprovante', [AbastecimentoController::class, 'comprovante']);
    Route::get('abastecimentos/{id}/comprovante/debug', [AbastecimentoController::class, 'comprovanteDebug']);

    // Baixa Abastecimento (leitura)
    Route::apiResource('baixas', BaixaAbastecimentoController::class)->only(['index', 'show']);

    // Entrada de Notas (leitura)
    Route::get('entrada-notas/fornecedores', [EntradaNotaController::class, 'fornecedores']);
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
    Route::get('relatorios/faturamento-mensal', [RelatorioController::class, 'faturamentoMensal']);
    Route::get('relatorios/faturamento-mensal/detalhado', [RelatorioController::class, 'faturamentoMensalDetalhado']);

    // Uploads
    Route::post('uploads/drive', [DriveUploadController::class, 'store']);
    Route::post('uploads/drive/sessao', [DriveUploadController::class, 'criarSessao']);
    Route::post('uploads/drive/finalizar', [DriveUploadController::class, 'finalizarSessao']);
    Route::post('abastecimentos/analisar-comprovante', [ComprovanteAnalysisController::class, 'analyze']);

    // Lançar no Sofit (liberado para todos os perfis logados, inclusive visualizador)
    Route::post('abastecimentos/{id}/lancar-sofit', [SofitController::class, 'lancar']);

    // Criação: admin e operador
    Route::middleware('admin_or_operador')->group(function () {
        Route::post('proprietarios', [ProprietarioController::class, 'store']);
        Route::put('proprietarios/{id}', [ProprietarioController::class, 'update']);
        Route::patch('proprietarios/{id}', [ProprietarioController::class, 'update']);
        Route::post('veiculos', [VeiculoController::class, 'store']);
        Route::post('veiculos/{id}/transferir', [VeiculoController::class, 'transferir']);
        Route::post('motoristas', [MotoristaController::class, 'store']);
        Route::post('abastecimentos', [AbastecimentoController::class, 'store']);
        Route::post('abastecimentos/{id}/verificar-inconsistencia', [AbastecimentoController::class, 'verificarInconsistencia']);
        Route::post('abastecimentos/{id}/analisar-inconsistencias', [AbastecimentoController::class, 'analisarInconsistencias']);
        Route::post('entrada-notas', [EntradaNotaController::class, 'store']);
        Route::post('entrada-notas/{id}/analisar-ia', [EntradaNotaController::class, 'analisarIa']);
        Route::post('entrada-notas/{id}/confirmar-fornecedor', [EntradaNotaController::class, 'confirmarFornecedor']);
        Route::post('entrada-notas/{id}/baixar', [EntradaNotaController::class, 'baixar']);
        Route::post('encerrantes-bomba', [EncerranteBombaController::class, 'store']);
    });

    // Conferência Vipe: administradores e visualizadores
    Route::middleware('admin_or_visualizador')->group(function () {
        Route::get('conferencia-vipe/importacoes', [ConferenciaVipeController::class, 'index']);
        Route::get('conferencia-vipe/importacoes/{id}', [ConferenciaVipeController::class, 'show']);
        Route::post('conferencia-vipe/comparar', [ConferenciaVipeController::class, 'comparar']);
        Route::post('conferencia-vipe/importacoes/{id}/reprocessar', [ConferenciaVipeController::class, 'reprocessar']);
        Route::patch('conferencia-vipe/itens/{id}/checagem', [ConferenciaVipeController::class, 'checarItem']);
    });

    // Escrita sensível (edição/exclusão): somente admin
    Route::middleware('admin')->group(function () {
        // Histórico de alterações
        Route::get('auditoria', [AuditoriaController::class, 'index']);
        Route::delete('auditoria', [AuditoriaController::class, 'destroyAll']);
        Route::get('auditoria/abastecimentos-suspeitos', [AbastecimentoAuditoriaController::class, 'index']);
        Route::post('auditoria/abastecimentos-suspeitos/{id}/auditar', [AbastecimentoAuditoriaController::class, 'marcarAuditado']);

        // Telas administrativas
        Route::get('balancete-privado', [BalancetePrivadoController::class, 'index']);
        Route::get('graficos-gerenciais', [GraficosGerenciaisController::class, 'index']);
        Route::get('tanques-privado/historico', [TanqueHistoricoController::class, 'index']);
        // Erros do APK/app
        Route::get('app-erros', [AppErroController::class, 'index']);
        Route::delete('app-erros', [AppErroController::class, 'destroyAll']);

        // Despesas avulsas
        Route::post('despesas-avulsas/{id}/restore', [DespesaAvulsaController::class, 'restore']);
        Route::apiResource('despesas-avulsas', DespesaAvulsaController::class);

        // Conciliação bancária
        Route::prefix('conciliacao-bancaria')->group(function () {
            Route::get('extratos', [ConciliacaoBancariaController::class, 'index']);
            Route::post('extratos/importar', [ConciliacaoBancariaController::class, 'importar']);
            Route::post('extratos/{id}/ignorar', [ConciliacaoBancariaController::class, 'ignorar']);
            Route::get('extratos/{id}/sugestoes', [ConciliacaoBancariaController::class, 'sugestoes']);
            Route::get('extratos/{id}/detalhes', [ConciliacaoBancariaController::class, 'detalhes']);
            Route::post('extratos/{id}/conciliar', [ConciliacaoBancariaController::class, 'conciliar']);
            Route::post('extratos/{id}/desconciliar', [ConciliacaoBancariaController::class, 'desconciliar']);
            Route::delete('extratos/{id}', [ConciliacaoBancariaController::class, 'destroy']);
            Route::get('baixas-disponiveis', [ConciliacaoBancariaController::class, 'baixasDisponiveis']);
        });

        // Proprietários
        Route::post('proprietarios/{id}/portal-token', [PortalProprietarioController::class, 'gerarToken']);
        Route::post('proprietarios/{id}/bloquear', [ProprietarioController::class, 'bloquear']);
        Route::post('proprietarios/{id}/desbloquear', [ProprietarioController::class, 'desbloquear']);
        Route::post('proprietarios/{id}/restore', [ProprietarioController::class, 'restore']);
        Route::apiResource('proprietarios', ProprietarioController::class)->only(['destroy']);

        // Veículos
        Route::post('veiculos/{id}/restore', [VeiculoController::class, 'restore']);
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
        Route::post('baixas/{id}/remover-comprovante', [BaixaAbastecimentoController::class, 'removerComprovante']);
        Route::delete('baixas/{id}/force', [BaixaAbastecimentoController::class, 'forceDelete']);
        Route::post('baixas/automaticas', [BaixaAbastecimentoController::class, 'storeAutomatica']);
        Route::post('baixas/lote', [BaixaAbastecimentoController::class, 'storeLote']);

        // Nova Baixa por Comprovante
        Route::post('comprovantes-pagamento', [ComprovantePagamentoController::class, 'store']);
        Route::post('comprovantes-pagamento/lote', [ComprovantePagamentoController::class, 'storeLote']);
        Route::get('comprovantes-pagamento', [ComprovantePagamentoController::class, 'index']);
        Route::get('comprovantes-pagamento/{id}', [ComprovantePagamentoController::class, 'show']);
        Route::patch('comprovantes-pagamento/{id}', [ComprovantePagamentoController::class, 'update']);
        Route::post('comprovantes-pagamento/{id}/verificar', [ComprovantePagamentoController::class, 'verificarNovamente']);
        Route::post('comprovantes-pagamento/{id}/desvincular', [ComprovantePagamentoController::class, 'desvincular']);
        Route::post('comprovantes-pagamento/{id}/isolar', [ComprovantePagamentoController::class, 'isolar']);
        Route::patch('comprovantes-pagamento/{id}/forma-pagamento', [ComprovantePagamentoController::class, 'atualizarFormaPagamento']);
        Route::post('comprovantes-pagamento/confirmar-grupo', [ComprovantePagamentoController::class, 'confirmarGrupo']);
        Route::delete('comprovantes-pagamento/{id}', [ComprovantePagamentoController::class, 'destroy']);

        // Alias proprietários
        Route::get('alias-proprietarios', [AliasProprietarioController::class, 'index']);
        Route::get('alias-proprietarios/buscar', [AliasProprietarioController::class, 'buscar']);
        Route::post('alias-proprietarios', [AliasProprietarioController::class, 'store']);
        Route::delete('alias-proprietarios/{id}', [AliasProprietarioController::class, 'destroy']);

        // API Keys
        Route::get('api-keys', [ApiKeyController::class, 'index']);
        Route::post('api-keys', [ApiKeyController::class, 'store']);
        Route::delete('api-keys/{id}', [ApiKeyController::class, 'destroy']);



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
