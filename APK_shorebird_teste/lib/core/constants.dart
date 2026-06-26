import 'package:flutter/material.dart';

/// Constantes globais do app. Espelham exatamente os valores aceitos pelo backend.
class AppConstants {
  static const String apiBaseUrl =
      'https://backend-seven-gilt-97.vercel.app/api';

  static const String appName = 'Abastecimento Vipe';
  static const String appVersion = '2.0.4';

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
    'Matriz',
    'Viana',
  ];

  static const List<String> statusAbastecimento = [
    'Pendente',
    'Confirmado',
    'Inconsistente',
    'Cancelado',
  ];

  static const List<String> statusImagemAbastecimento = [
    'Pendente',
    'Confirmado',
    'Inconsistente',
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

/// Tokens de design do app. Tema claro para facilitar leitura em campo.
class AppTheme {
  static const Color primary = Color(0xFF0284C7);
  static const Color primaryDark = Color(0xFF0369A1);
  static const Color background = Color(0xFFF3F6FA);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceAlt = Color(0xFFF8FAFC);
  static const Color border = Color(0xFFD6DEE8);
  static const Color textMuted = Color(0xFF64748B);
  static const Color danger = Color(0xFFDC2626);
  static const Color success = Color(0xFF16A34A);
  static const Color warning = Color(0xFFD97706);
  static const Color textStrong = Color(0xFF0F172A);

  static ThemeData light() {
    final base = ThemeData.light(useMaterial3: true);
    final scheme = ColorScheme.fromSeed(
      seedColor: primary,
      brightness: Brightness.light,
      surface: surface,
    );
    return base.copyWith(
      colorScheme: scheme,
      scaffoldBackgroundColor: background,
      appBarTheme: const AppBarTheme(
        backgroundColor: surface,
        foregroundColor: textStrong,
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
        fillColor: surface,
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
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
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
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
      dividerColor: border,
      chipTheme: ChipThemeData(
        backgroundColor: surfaceAlt,
        selectedColor: primary,
        labelStyle: const TextStyle(color: textStrong),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: textStrong,
        contentTextStyle: const TextStyle(color: Colors.white),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
      ),
    );
  }

  static ThemeData dark() => light();
}

/// Helpers de papel (autorizacao local).
class Roles {
  static bool isAdmin(String? tipo) => tipo == 'admin';
  static bool canWrite(String? tipo) => tipo == 'admin';
  static bool canCreate(String? tipo) => tipo == 'admin' || tipo == 'operador';
  static bool canRead(String? tipo) =>
      tipo == 'admin' || tipo == 'operador' || tipo == 'visualizador';
}
