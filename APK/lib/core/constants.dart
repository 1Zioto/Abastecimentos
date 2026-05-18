import 'package:flutter/material.dart';

/// Constantes globais do app. Espelham exatamente os valores aceitos pelo backend.
class AppConstants {
  static const String apiBaseUrl =
      'https://backend-seven-gilt-97.vercel.app/api';

  static const String appName = 'Abastecimento Vipe';
  static const String appVersion = '1.0.0';

  // ---- valores fixos de dominio ----
  static const List<String> tiposCombustivel = [
    'OLEO DIESEL S10',
    'Diesel Comum',
    'Gasolina Comum',
    'Gasolina Aditivada',
    'Etanol',
    'GNV',
    'Arla 32',
  ];

  static const List<String> locais = [
    'Garagem',
    'Garagem Viana',
  ];

  static const List<String> statusAbastecimento = [
    'Pendente',
    'Confirmado',
    'Pago',
    'Cancelado',
  ];

  static const List<String> statusProprietario = [
    'ativo',
    'bloqueado',
    'inativo',
  ];

  static const List<String> tiposUsuario = [
    'admin',
    'operador',
    'visualizador',
  ];
}

/// Tokens de design do app. Cores escolhidas para espelhar a sensacao
/// do frontend web (tema escuro/slate) mas adaptadas ao Material 3.
class AppTheme {
  static const Color primary = Color(0xFF0EA5E9); // sky-500
  static const Color primaryDark = Color(0xFF0284C7); // sky-600
  static const Color background = Color(0xFF0D1427); // slate deep
  static const Color surface = Color(0xFF111C36); // slate card
  static const Color surfaceAlt = Color(0xFF1A2541);
  static const Color border = Color(0xFF1F2A44);
  static const Color textMuted = Color(0xFF94A3B8);
  static const Color danger = Color(0xFFEF4444);
  static const Color success = Color(0xFF22C55E);
  static const Color warning = Color(0xFFF59E0B);

  static ThemeData dark() {
    final base = ThemeData.dark(useMaterial3: true);
    final scheme = ColorScheme.fromSeed(
      seedColor: primary,
      brightness: Brightness.dark,
      surface: surface,
    );
    return base.copyWith(
      colorScheme: scheme,
      scaffoldBackgroundColor: background,
      appBarTheme: const AppBarTheme(
        backgroundColor: surface,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        margin: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: border, width: 1),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surfaceAlt,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: primary, width: 2),
        ),
        hintStyle: const TextStyle(color: textMuted),
        labelStyle: const TextStyle(color: textMuted),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: Colors.white,
          padding:
              const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: primary,
          side: const BorderSide(color: border),
          padding:
              const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
      dividerColor: border,
      chipTheme: ChipThemeData(
        backgroundColor: surfaceAlt,
        selectedColor: primary,
        labelStyle: const TextStyle(color: Colors.white),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: surfaceAlt,
        contentTextStyle: const TextStyle(color: Colors.white),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
      ),
    );
  }
}

/// Helpers de papel (autorizacao local).
class Roles {
  static bool isAdmin(String? tipo) => tipo == 'admin';
  static bool canWrite(String? tipo) => tipo == 'admin';
  static bool canCreate(String? tipo) => tipo == 'admin' || tipo == 'operador';
  static bool canRead(String? tipo) =>
      tipo == 'admin' || tipo == 'operador' || tipo == 'visualizador';
}
