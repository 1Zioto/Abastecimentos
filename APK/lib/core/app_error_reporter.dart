import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'constants.dart';

class AppErrorReporter {
  static const _pendingKey = 'app_error_reports_v1';
  static const _maxPending = 100;

  final ApiClient api;
  bool _flushing = false;
  String? _cachedVersion;

  AppErrorReporter(this.api);

  Future<void> capture({
    required String tipo,
    required String mensagem,
    String level = 'error',
    String origem = 'app',
    String? tela,
    String? detalhe,
    String? stackTrace,
    Map<String, dynamic>? contexto,
    bool flushNow = true,
  }) async {
    final payload = await _payload(
      tipo: tipo,
      mensagem: mensagem,
      level: level,
      origem: origem,
      tela: tela,
      detalhe: detalhe,
      stackTrace: stackTrace,
      contexto: contexto,
    );
    await _enqueue(payload);
    if (flushNow) {
      unawaited(flushPending());
    }
  }

  Future<void> captureFlutterError(
    FlutterErrorDetails details, {
    String origem = 'flutter_error',
  }) {
    return capture(
      tipo: 'soft_crash',
      origem: origem,
      tela: details.context?.toString(),
      mensagem: details.exceptionAsString(),
      stackTrace: details.stack?.toString(),
      contexto: {
        'library': details.library,
        'silent': details.silent,
      },
    );
  }

  Future<void> captureSyncError({
    required String level,
    required String mensagem,
    required String detalhe,
    String origem = 'sync_manager',
  }) {
    return capture(
      tipo: 'sync',
      level: level,
      origem: origem,
      tela: 'sincronizacao',
      mensagem: mensagem,
      detalhe: detalhe,
      flushNow: false,
    );
  }

  Future<void> flushPending() async {
    if (_flushing || (api.auth.token?.isEmpty ?? true)) return;
    _flushing = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final pending = _readPending(prefs);
      if (pending.isEmpty) return;

      final remaining = <Map<String, dynamic>>[];
      for (final item in pending) {
        try {
          await api.post('/app-erros', item);
        } on ApiException catch (e) {
          if (e.statusCode >= 400 && e.statusCode < 500) {
            if (e.isUnauthorized) {
              remaining.add(item);
              continue;
            }
            // Payload invalido nao deve travar a fila para sempre.
            continue;
          }
          remaining.add(item);
        } on OfflineException {
          remaining.add(item);
        } catch (_) {
          remaining.add(item);
        }
      }

      if (remaining.length > _maxPending) {
        remaining.removeRange(0, remaining.length - _maxPending);
      }
      await prefs.setString(_pendingKey, jsonEncode(remaining));
    } finally {
      _flushing = false;
    }
  }

  Future<Map<String, dynamic>> _payload({
    required String tipo,
    required String mensagem,
    required String level,
    required String origem,
    String? tela,
    String? detalhe,
    String? stackTrace,
    Map<String, dynamic>? contexto,
  }) async {
    final safeContext = <String, dynamic>{
      'client_ts': DateTime.now().toIso8601String(),
      if (contexto != null) ...contexto,
    };
    return {
      'level': _limit(level, 20),
      'tipo': _limit(tipo, 80),
      'origem': _limit(origem, 80),
      'tela': _limit(tela, 120),
      'mensagem': _sanitize(_limit(mensagem, 4000)),
      'detalhe': _sanitize(_limit(detalhe, 8000)),
      'stack_trace': _sanitize(_limit(stackTrace, 12000)),
      'contexto': _sanitizeMap(safeContext),
      'app_version': await _appVersion(),
      'platform': Platform.operatingSystem,
      'os_version': _limit(Platform.operatingSystemVersion, 500),
    };
  }

  Future<String> _appVersion() async {
    final cached = _cachedVersion;
    if (cached != null) return cached;
    try {
      final info = await PackageInfo.fromPlatform();
      final version = '${info.version}+${info.buildNumber}';
      _cachedVersion = version;
      return version;
    } catch (_) {
      return AppConstants.appVersion;
    }
  }

  Future<void> _enqueue(Map<String, dynamic> payload) async {
    final prefs = await SharedPreferences.getInstance();
    final list = _readPending(prefs);
    list.add(payload);
    if (list.length > _maxPending) {
      list.removeRange(0, list.length - _maxPending);
    }
    await prefs.setString(_pendingKey, jsonEncode(list));
  }

  List<Map<String, dynamic>> _readPending(SharedPreferences prefs) {
    final raw = prefs.getString(_pendingKey);
    if (raw == null || raw.isEmpty) return [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return [];
      return decoded
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Map<String, dynamic> _sanitizeMap(Map<String, dynamic> source) {
    final result = <String, dynamic>{};
    for (final entry in source.entries) {
      result[entry.key] = _sanitizeValue(entry.key, entry.value);
    }
    return result;
  }

  dynamic _sanitizeValue(String key, dynamic value) {
    final k = key.toLowerCase();
    if (k.contains('senha') ||
        k.contains('password') ||
        k.contains('token') ||
        k.contains('authorization')) {
      return '[removido]';
    }
    if (value is Map) {
      return _sanitizeMap(Map<String, dynamic>.from(value));
    }
    if (value is List) {
      return value.map((item) => _sanitizeValue(key, item)).toList();
    }
    if (value is String) {
      return _sanitize(_limit(value, 8000));
    }
    return value;
  }

  String? _limit(String? value, int max) {
    if (value == null) return null;
    if (value.length <= max) return value;
    return '${value.substring(0, max)}...[truncado]';
  }

  String? _sanitize(String? value) {
    if (value == null) return null;
    var text = value;
    text = text.replaceAllMapped(
      RegExp(
        r'("(?:senha|password|token|authorization)"\s*:\s*")[^"]*(")',
        caseSensitive: false,
      ),
      (m) => '${m.group(1)}[removido]${m.group(2)}',
    );
    text = text.replaceAllMapped(
      RegExp(r'(Bearer\s+)[A-Za-z0-9._-]+', caseSensitive: false),
      (m) => '${m.group(1)}[removido]',
    );
    return text;
  }
}
