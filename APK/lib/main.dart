import 'dart:async';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/app_state.dart';
import 'core/background_tank_monitor.dart';
import 'core/constants.dart';
import 'core/local_notifications.dart';
import 'core/sharing_manager.dart';
import 'screens/abastecimentos/list_screen.dart';
import 'screens/login_screen.dart';
import 'screens/notificacoes_criticas_screen.dart';
import 'screens/shell_screen.dart';

/// Navigator global: permite navegar a partir do toque em notificações,
/// fora da árvore de widgets.
final GlobalKey<NavigatorState> appNavigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  await runZonedGuarded<Future<void>>(() async {
    WidgetsFlutterBinding.ensureInitialized();
    final state = await AppState.init();
    _installErrorHandlers(state);

    LocalNotifications.aoTocarNotificacao = () {
      if (!AppState.instance.auth.isAuthenticated) return;
      appNavigatorKey.currentState?.push(
        MaterialPageRoute(
          builder: (_) => const AbastecimentosListScreen(),
        ),
      );
    };

    LocalNotifications.aoTocarNotificacaoCritica = (_) {
      if (!AppState.instance.auth.isAuthenticated) return;
      if (!Roles.isAdmin(AppState.instance.auth.tipo)) return;
      appNavigatorKey.currentState?.push(
        MaterialPageRoute(
          builder: (_) => const NotificacoesCriticasScreen(standalone: true),
        ),
      );
    };

    runApp(const AbastecimentoVipeApp());

    // Inicializa serviços acessórios após o primeiro frame para nunca
    // bloquear ou travar a abertura da interface.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(state.errorReporter.flushPending());
      SharingManager.instance.init();
      unawaited(LocalNotifications.instance.init());
      unawaited(registrarMonitorTanqueZerado());
    });
  }, (error, stack) async {
    try {
      await AppState.instance.errorReporter.capture(
        tipo: 'soft_crash',
        origem: 'zone_guard',
        tela: 'global',
        mensagem: error.toString(),
        stackTrace: stack.toString(),
      );
    } catch (_) {}
  });
}

void _installErrorHandlers(AppState state) {
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    unawaited(state.errorReporter.captureFlutterError(details));
  };

  PlatformDispatcher.instance.onError = (error, stack) {
    unawaited(state.errorReporter.capture(
      tipo: 'soft_crash',
      origem: 'platform_dispatcher',
      tela: 'global',
      mensagem: error.toString(),
      stackTrace: stack.toString(),
    ));
    return true;
  };
}

class AbastecimentoVipeApp extends StatelessWidget {
  const AbastecimentoVipeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: appNavigatorKey,
      title: AppConstants.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.light(),
      themeMode: ThemeMode.light,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('pt', 'BR'), Locale('en', 'US')],
      home: AppState.instance.auth.isAuthenticated
          ? const ShellScreen()
          : const LoginScreen(),
    );
  }
}
