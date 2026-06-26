import 'dart:async';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/app_state.dart';
import 'core/constants.dart';
import 'screens/login_screen.dart';
import 'screens/shell_screen.dart';

Future<void> main() async {
  await runZonedGuarded<Future<void>>(() async {
    WidgetsFlutterBinding.ensureInitialized();
    final state = await AppState.init();
    _installErrorHandlers(state);
    unawaited(state.errorReporter.flushPending());
    runApp(const AbastecimentoVipeApp());
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
