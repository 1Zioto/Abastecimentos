import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Notificações locais do app — usadas para avisar administradores quando a
/// sincronização baixa abastecimentos novos feitos por outros usuários e
/// quando ocorrem alertas críticos (exclusões, edições, divergências, tanque).
/// Sem serviços externos: dispara no próprio aparelho durante o sync/monitor.
class LocalNotifications {
  LocalNotifications._();
  static final LocalNotifications instance = LocalNotifications._();

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  bool _inicializado = false;
  int _proximoId = 1000;

  /// Definido pelo main.dart: ação executada quando o usuário toca na
  /// notificação padrão (ex.: abrir a lista de abastecimentos).
  static void Function()? aoTocarNotificacao;

  /// Definido pelo main.dart: ação executada quando o administrador toca em
  /// uma notificação crítica (abre a Central de Notificações Críticas).
  static void Function(String? payload)? aoTocarNotificacaoCritica;

  static const _canal = AndroidNotificationDetails(
    'novos_abastecimentos',
    'Novos abastecimentos',
    channelDescription:
        'Avisa administradores quando um novo abastecimento é registrado.',
    importance: Importance.high,
    priority: Priority.high,
    icon: '@drawable/ic_launcher',
  );

  static const _canalTanque = AndroidNotificationDetails(
    'alerta_tanque_zerado',
    'Alerta de tanque zerado / crítico',
    channelDescription:
        'Avisa administradores quando o tanque de qualquer filial chega a zero ou nível crítico.',
    importance: Importance.max,
    priority: Priority.max,
    icon: '@drawable/ic_launcher',
    category: AndroidNotificationCategory.alarm,
  );

  static const _canalCritico = AndroidNotificationDetails(
    'notificacoes_criticas_admin',
    'Notificações Críticas (Admin)',
    channelDescription:
        'Alertas críticos de exclusões, edições, divergências, baixas e erros para administradores.',
    importance: Importance.max,
    priority: Priority.max,
    icon: '@drawable/ic_launcher',
    category: AndroidNotificationCategory.alarm,
    styleInformation: BigTextStyleInformation(''),
  );

  Future<void> init() async {
    if (_inicializado) return;
    try {
      const android = AndroidInitializationSettings('@drawable/ic_launcher');
      await _plugin.initialize(
        const InitializationSettings(android: android),
        onDidReceiveNotificationResponse: (resp) {
          final payload = resp.payload ?? '';
          if (payload.startsWith('critica:') &&
              aoTocarNotificacaoCritica != null) {
            aoTocarNotificacaoCritica?.call(payload);
            return;
          }
          aoTocarNotificacao?.call();
        },
      );
      // Android 13+ exige permissão de notificação em tempo de execução.
      await _plugin
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();
      _inicializado = true;
    } catch (_) {
      // Notificação é acessória: falha na inicialização não pode
      // derrubar o app nem a sincronização.
    }
  }

  Future<void> mostrar({required String titulo, required String corpo}) async {
    if (!_inicializado) await init();
    if (!_inicializado) return;
    try {
      await _plugin.show(
        _proximoId++,
        titulo,
        corpo,
        const NotificationDetails(android: _canal),
      );
    } catch (_) {
      // Silencioso: nunca interromper o fluxo de sync por causa do aviso.
    }
  }

  Future<void> mostrarCritica({
    required int id,
    required String titulo,
    required String corpo,
  }) async {
    if (!_inicializado) await init();
    if (!_inicializado) return;
    try {
      final details = AndroidNotificationDetails(
        'notificacoes_criticas_admin',
        'Notificações Críticas (Admin)',
        channelDescription:
            'Alertas críticos de exclusões, edições, divergências, baixas e erros para administradores.',
        importance: Importance.max,
        priority: Priority.max,
        icon: '@drawable/ic_launcher',
        category: AndroidNotificationCategory.alarm,
        styleInformation: BigTextStyleInformation(corpo, contentTitle: titulo),
      );
      await _plugin.show(
        3000 + (id.abs() % 50000),
        titulo,
        corpo,
        NotificationDetails(android: details),
        payload: 'critica:$id',
      );
    } catch (_) {
      // Silencioso: não interrompe sincronizações.
    }
  }

  Future<void> mostrarTanqueZerado({
    required String filial,
    required double saldoLitros,
  }) async {
    if (!_inicializado) await init();
    if (!_inicializado) return;
    try {
      await _plugin.show(
        2100 + filial.toLowerCase().hashCode.abs() % 100,
        'Tanque zerado — $filial',
        'O saldo calculado de $filial chegou a ${saldoLitros.toStringAsFixed(2)} L. Abra o app para conferir.',
        const NotificationDetails(android: _canalTanque),
        payload: 'critica:tanque_$filial',
      );
    } catch (_) {
      // O alerta não pode interromper sincronizações ou outras rotinas.
    }
  }

  Future<void> mostrarEstoqueCritico({
    required String filial,
    required double saldoLitros,
  }) async {
    if (!_inicializado) await init();
    if (!_inicializado) return;
    try {
      await _plugin.show(
        2200 + filial.toLowerCase().hashCode.abs() % 100,
        'Estoque crítico (pré-zero) — $filial',
        'O saldo do tanque de $filial caiu para ${saldoLitros.toStringAsFixed(2)} L (abaixo de 2.000 L).',
        const NotificationDetails(android: _canalTanque),
        payload: 'critica:estoque_$filial',
      );
    } catch (_) {
      // Silencioso.
    }
  }
}
