import 'dart:ui';

import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:workmanager/workmanager.dart';

import 'app_state.dart';
import 'local_notifications.dart';

const tankMonitorUniqueName = 'vipe_tank_zero_monitor_v1';
const tankMonitorTaskName = 'check_tank_zero';
const _tankStatePrefix = 'tank_was_zero_v1_';
const _tankCriticoPrefix = 'tank_was_critical_v1_';
const _lastCriticaIdKey = 'last_notificacao_critica_disparada_id_v1';
const _limiteEstoqueCritico = 2000.0;

@pragma('vm:entry-point')
void tankMonitorCallbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    if (task != tankMonitorTaskName) return true;
    try {
      WidgetsFlutterBinding.ensureInitialized();
      DartPluginRegistrant.ensureInitialized();
      final state = await AppState.init();
      if (!state.auth.isAuthenticated) return true;

      // SOMENTE PARA O ADMINISTRADOR
      final tipo = (state.auth.tipo ?? '').toLowerCase().trim();
      if (tipo != 'admin') return true;

      await verificarTanquesTodasFiliaisAdmin(state);
      await verificarNotificacoesCriticasAdmin(state, checkTanques: true);
      return true;
    } catch (_) {
      // O WorkManager tentará novamente em uma execução futura. O monitor não
      // pode encerrar o aplicativo nem alterar dados operacionais.
      return false;
    }
  });
}

/// Verifica Tanque Zerado (<= 0 L) e Estoque Crítico (< 2.000 L) para TODAS as
/// filiais às quais o administrador tem acesso (Matriz e Viana),
/// independentemente de qual filial esteja selecionada na tela do app.
Future<void> verificarTanquesTodasFiliaisAdmin(AppState state) async {
  try {
    if (!state.auth.isAuthenticated) return;
    final tipo = (state.auth.tipo ?? '').toLowerCase().trim();
    if (tipo != 'admin') return;

    final filiais = state.auth.filiaisAcesso;
    if (filiais.isEmpty) return;

    final hoje = DateTime.now();
    final inicio =
        DateTime(hoje.year, hoje.month, 1).toIso8601String().substring(0, 10);
    final fim = hoje.toIso8601String().substring(0, 10);
    final resposta = await state.api.get(
      '/tanques-privado/historico',
      query: {'data_inicio': inicio, 'data_fim': fim},
    );
    if (resposta is! Map || resposta['locais'] is! List) return;

    final prefs = await SharedPreferences.getInstance();

    for (final filialAlvo in filiais) {
      Map<String, dynamic>? tanque;
      for (final item in resposta['locais'] as List) {
        if (item is Map &&
            '${item['local'] ?? ''}'.trim().toLowerCase() ==
                filialAlvo.trim().toLowerCase()) {
          tanque = Map<String, dynamic>.from(item);
          break;
        }
      }
      if (tanque == null) continue;

      final saldo = _numero(tanque['saldo_final_litros']);
      final sufixo = filialAlvo.trim().toLowerCase();

      // 1. Tanque Zerado (<= 0 L)
      final chaveZero = '$_tankStatePrefix$sufixo';
      final estavaZerado = prefs.getBool(chaveZero) ?? false;
      final estaZerado = saldo <= 0;
      if (estaZerado && !estavaZerado) {
        await LocalNotifications.instance.mostrarTanqueZerado(
          filial: filialAlvo,
          saldoLitros: saldo,
        );
      }
      await prefs.setBool(chaveZero, estaZerado);

      // 2. Estoque Crítico Pré-Zero (> 0 L e < 2.000 L)
      final chaveCrit = '$_tankCriticoPrefix$sufixo';
      final estavaCritico = prefs.getBool(chaveCrit) ?? false;
      final estaCritico = saldo > 0 && saldo < _limiteEstoqueCritico;
      if (estaCritico && !estavaCritico) {
        await LocalNotifications.instance.mostrarEstoqueCritico(
          filial: filialAlvo,
          saldoLitros: saldo,
        );
      }
      await prefs.setBool(chaveCrit, estaCritico);
    }
  } catch (_) {}
}

/// Busca no servidor as notificações críticas pendentes de leitura para o
/// administrador logado, dispara no aparelho as que ainda não foram exibidas
/// localmente e devolve o total de notificações não vistas pelo admin.
Future<int> verificarNotificacoesCriticasAdmin(
  AppState state, {
  bool checkTanques = false,
}) async {
  try {
    if (!state.auth.isAuthenticated) return 0;
    final tipo = (state.auth.tipo ?? '').toLowerCase().trim();
    if (tipo != 'admin') return 0;

    final prefs = await SharedPreferences.getInstance();
    final ultimoDisparado = prefs.getInt(_lastCriticaIdKey) ?? 0;

    final resp = await state.api.get(
      '/notificacoes-criticas/resumo',
      query: {
        'after_id': '$ultimoDisparado',
        if (checkTanques) 'check_tanques': '1',
      },
    );
    if (resp is! Map) return 0;

    final naoVistasCount = int.tryParse('${resp['nao_vistas_count'] ?? 0}') ?? 0;
    final ultimoIdServidor = int.tryParse('${resp['ultimo_id'] ?? 0}') ?? 0;
    final novas = resp['novas_para_disparo'];

    // Na primeira execução do aparelho (ultimoDisparado == 0), apenas sincroniza
    // o cursor para o último ID existente, evitando disparar dezenas de alertas
    // antigos de uma só vez; os alertas continuam visíveis na Central com badge.
    if (ultimoDisparado == 0 && ultimoIdServidor > 0) {
      await prefs.setInt(_lastCriticaIdKey, ultimoIdServidor);
      return naoVistasCount;
    }

    int maiorDisparado = ultimoDisparado;
    if (novas is List && novas.isNotEmpty) {
      final meuNome = (state.auth.nome ?? '').toLowerCase().trim();
      for (final item in novas.reversed) {
        if (item is! Map) continue;
        final id = int.tryParse('${item['id'] ?? 0}') ?? 0;
        if (id <= 0) continue;
        if (id > maiorDisparado) maiorDisparado = id;

        final autor = '${item['autor_nome'] ?? ''}'.toLowerCase().trim();
        // Dispara no Android para qualquer evento crítico (inclusive tanque/atua
        // ou ações de outros usuários).
        final titulo = '${item['titulo'] ?? 'Alerta Crítico'}'.trim();
        final mensagem = '${item['mensagem'] ?? ''}'.trim();
        if (titulo.isNotEmpty && (meuNome.isEmpty || autor != meuNome || '${item['categoria'] ?? ''}' == 'tanques_estoque')) {
          await LocalNotifications.instance.mostrarCritica(
            id: id,
            titulo: titulo,
            corpo: mensagem,
          );
        }
      }
      if (maiorDisparado > ultimoDisparado) {
        await prefs.setInt(_lastCriticaIdKey, maiorDisparado);
      }
    }

    return naoVistasCount;
  } catch (_) {
    return 0;
  }
}

Future<void> registrarMonitorTanqueZerado() async {
  try {
    await Workmanager().initialize(tankMonitorCallbackDispatcher);
    await Workmanager().registerPeriodicTask(
      tankMonitorUniqueName,
      tankMonitorTaskName,
      frequency: const Duration(hours: 1),
      constraints: Constraints(networkType: NetworkType.connected),
      existingWorkPolicy: ExistingPeriodicWorkPolicy.keep,
    );
  } catch (e) {
    debugPrint('[TankMonitor] Falha ao registrar WorkManager: $e');
  }
}

double _numero(dynamic valor) {
  if (valor is num) return valor.toDouble();
  return double.tryParse('$valor') ?? 0;
}
