import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:image/image.dart' as img;

import 'auth_store.dart';
import 'constants.dart';

class ApiException implements Exception {
  final int statusCode;
  final String message;
  final String body;

  ApiException(this.statusCode, this.message, this.body);

  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => 'ApiException($statusCode): $message';
}

class OfflineException implements Exception {
  final String message;
  OfflineException([this.message = 'Sem conexao com o servidor']);
  @override
  String toString() => message;
}

/// Cliente HTTP JSON com JWT automatico.
///
/// Metodos retornam `dynamic` (pode ser Map ou List) conforme o endpoint.
/// Para endpoints paginados do Laravel (`{data, last_page, ...}`), use
/// `getPaginated` para coletar todas as paginas.
class ApiClient {
  final AuthStore auth;
  final http.Client _http;
  Future<bool>? _refreshInFlight;

  static const _connectTimeout = Duration(seconds: 20);
  static const _imageCompressThresholdBytes = 2 * 1024 * 1024;
  static const _imageCompressTargetBytes = 1200 * 1024;

  /// Numero de tentativas em falhas transitorias (rede/5xx).
  /// 1 = sem retry; 3 = tentativa + 2 retentativas.
  static const _maxAttempts = 3;

  /// Backoff inicial (dobra a cada retry).
  static const _initialBackoff = Duration(milliseconds: 500);

  /// Teto maximo de paginas em `getPaginated` (salvaguarda).
  static const _maxPages = 500;

  ApiClient(this.auth, {http.Client? client}) : _http = client ?? http.Client();

  void _log(String message) {
    debugPrint('[API] $message');
  }

  Map<String, String> _headers({bool withBody = false}) {
    final h = <String, String>{
      'Accept': 'application/json',
      'User-Agent': 'AbastecimentoVipe-Flutter/${AppConstants.appVersion}',
    };
    if (withBody) h['Content-Type'] = 'application/json; charset=utf-8';
    final token = auth.token;
    if (token != null && token.isNotEmpty) {
      h['Authorization'] = 'Bearer $token';
    }
    return h;
  }

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final sanitized = path.startsWith('/') ? path.substring(1) : path;
    final uri = Uri.parse('${AppConstants.apiBaseUrl}/$sanitized');
    if (query == null || query.isEmpty) return uri;
    final qp = <String, String>{};
    query.forEach((k, v) {
      if (v == null) return;
      qp[k] = v.toString();
    });
    return uri.replace(queryParameters: {...uri.queryParameters, ...qp});
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    return _send('GET', _uri(path, query));
  }

  Future<Uint8List> getBytes(String path, {Map<String, dynamic>? query}) async {
    final uri = _uri(path, query);
    var triedAuthRefresh = false;

    while (true) {
      final req = http.Request('GET', uri);
      req.headers.addAll(_headers());

      http.StreamedResponse streamed;
      try {
        streamed = await _http.send(req).timeout(_connectTimeout);
      } on TimeoutException {
        throw OfflineException('Tempo esgotado ao contatar o servidor');
      } catch (e) {
        throw OfflineException('Falha de rede: $e');
      }

      final resp = await http.Response.fromStream(streamed);
      if (resp.statusCode >= 200 && resp.statusCode < 300) {
        return resp.bodyBytes;
      }

      final canTryRefresh = resp.statusCode == 401 &&
          !triedAuthRefresh &&
          !_isAuthEndpoint(uri) &&
          (auth.token?.isNotEmpty ?? false);
      if (canTryRefresh) {
        triedAuthRefresh = true;
        final refreshed = await _refreshToken();
        if (refreshed) continue;
      }

      _handle(resp, method: 'GET', uri: uri);
    }
  }

  Future<dynamic> post(String path, Map<String, dynamic> body,
      {Map<String, dynamic>? query}) async {
    return _send('POST', _uri(path, query), body: body);
  }

  Future<dynamic> put(String path, Map<String, dynamic> body,
      {Map<String, dynamic>? query}) async {
    return _send('PUT', _uri(path, query), body: body);
  }

  Future<dynamic> delete(String path, {Map<String, dynamic>? query}) async {
    return _send('DELETE', _uri(path, query));
  }

  Future<dynamic> postMultipartFile(
    String path, {
    required String filePath,
    String fieldName = 'file',
    Map<String, String>? fields,
  }) async {
    final uri = _uri(path);
    final uploadPath = await _prepareMultipartFilePath(filePath);
    final shouldDeleteTemp = uploadPath != filePath;
    var triedAuthRefresh = false;

    try {
      while (true) {
        final req = http.MultipartRequest('POST', uri);
        req.headers.addAll(_headers());
        if (fields != null && fields.isNotEmpty) {
          req.fields.addAll(fields);
        }
        req.files.add(await http.MultipartFile.fromPath(fieldName, uploadPath));

        http.StreamedResponse streamed;
        try {
          streamed = await _http.send(req).timeout(_connectTimeout);
        } on TimeoutException {
          _log('POST(multipart) ${uri.toString()} -> timeout');
          throw OfflineException('Tempo esgotado ao contatar o servidor');
        } catch (e) {
          _log('POST(multipart) ${uri.toString()} -> falha de rede: $e');
          throw OfflineException('Falha de rede: $e');
        }

        final resp = await http.Response.fromStream(streamed);
        if (resp.statusCode == 401 &&
            !triedAuthRefresh &&
            !_isAuthEndpoint(uri)) {
          triedAuthRefresh = true;
          final refreshed = await _refreshToken();
          if (refreshed) {
            _log('POST(multipart) ${uri.toString()} -> retry apos refresh');
            continue;
          }
        }
        return _handle(resp, method: 'POST', uri: uri);
      }
    } finally {
      if (shouldDeleteTemp) {
        try {
          await File(uploadPath).delete();
        } catch (_) {}
      }
    }
  }

  Future<String> _prepareMultipartFilePath(String filePath) async {
    final file = File(filePath);
    if (!await file.exists()) return filePath;
    if (!_isCompressibleImage(filePath)) return filePath;

    final originalSize = await file.length();
    if (originalSize <= _imageCompressThresholdBytes) return filePath;

    try {
      final bytes = await file.readAsBytes();
      final decoded = img.decodeImage(bytes);
      if (decoded == null) return filePath;

      final oriented = img.bakeOrientation(decoded);
      var bestBytes = <int>[];
      var bestSide = 0;
      var bestQuality = 0;

      for (final maxSide in const [1600, 1280, 1024]) {
        final resized = _resizeToMaxSide(oriented, maxSide);
        for (final quality in const [78, 68, 58, 48]) {
          final encoded = img.encodeJpg(resized, quality: quality);
          if (bestBytes.isEmpty || encoded.length < bestBytes.length) {
            bestBytes = encoded;
            bestSide = maxSide;
            bestQuality = quality;
          }
          if (encoded.length <= _imageCompressTargetBytes) {
            break;
          }
        }
        if (bestBytes.isNotEmpty &&
            bestBytes.length <= _imageCompressTargetBytes) {
          break;
        }
      }

      if (bestBytes.isEmpty || bestBytes.length >= originalSize) {
        return filePath;
      }

      final temp = File(
        '${Directory.systemTemp.path}/vipe_upload_${DateTime.now().microsecondsSinceEpoch}.jpg',
      );
      await temp.writeAsBytes(bestBytes, flush: true);
      _log(
        'compressao upload: ${_formatBytes(originalSize)} -> ${_formatBytes(bestBytes.length)} '
        '(maxSide=$bestSide quality=$bestQuality)',
      );
      return temp.path;
    } catch (e) {
      _log('compressao upload ignorada: $e');
      return filePath;
    }
  }

  bool _isCompressibleImage(String filePath) {
    final lower = filePath.toLowerCase().split('?').first;
    return lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.webp');
  }

  img.Image _resizeToMaxSide(img.Image source, int maxSide) {
    final currentMax = max(source.width, source.height);
    if (currentMax <= maxSide) return source;
    final scale = maxSide / currentMax;
    return img.copyResize(
      source,
      width: max(1, (source.width * scale).round()),
      height: max(1, (source.height * scale).round()),
      interpolation: img.Interpolation.average,
    );
  }

  String _formatBytes(int bytes) {
    final mb = bytes / (1024 * 1024);
    return '${mb.toStringAsFixed(2)}MB';
  }

  Future<dynamic> _send(String method, Uri uri,
      {Map<String, dynamic>? body}) async {
    final hasBody = body != null;

    // Retry com backoff exponencial em OfflineException e 5xx.
    // POST/PUT nao fazem retry quando sao "create" (pode duplicar no servidor);
    // Laravel e o backend nao expoem idempotency-key, entao so retentamos GET/DELETE
    // e PUT (que e idempotente por padrao em REST). POST so retenta em timeout antes
    // de qualquer byte ter sido enviado - na pratica, ja tratado pelo OfflineException.
    final idempotent = method == 'GET' || method == 'DELETE' || method == 'PUT';
    var backoff = _initialBackoff;
    Object? lastError;

    var triedAuthRefresh = false;
    for (var attempt = 1; attempt <= _maxAttempts; attempt++) {
      try {
        final req = http.Request(method, uri);
        req.headers.addAll(_headers(withBody: hasBody));
        if (hasBody) req.body = jsonEncode(body);

        http.StreamedResponse streamed;
        try {
          streamed = await _http.send(req).timeout(_connectTimeout);
        } on TimeoutException {
          throw OfflineException('Tempo esgotado ao contatar o servidor');
        } catch (e) {
          throw OfflineException('Falha de rede: $e');
        }

        final resp = await http.Response.fromStream(streamed);

        // 5xx: tratamos como falha transitoria (retry se idempotente)
        if (resp.statusCode >= 500 && resp.statusCode < 600) {
          if (idempotent && attempt < _maxAttempts) {
            _log(
                '$method ${uri.toString()} -> ${resp.statusCode} (retry $attempt/$_maxAttempts em ${backoff.inMilliseconds}ms)');
            await Future.delayed(backoff);
            backoff *= 2;
            continue;
          }
        }

        try {
          return _handle(resp, method: method, uri: uri, requestBody: body);
        } on ApiException catch (e) {
          final canTryRefresh = e.isUnauthorized &&
              !triedAuthRefresh &&
              !_isAuthEndpoint(uri) &&
              (auth.token?.isNotEmpty ?? false);

          if (canTryRefresh) {
            triedAuthRefresh = true;
            final refreshed = await _refreshToken();
            if (refreshed) {
              _log('$method ${uri.toString()} -> retry after token refresh');
              continue;
            }
          }
          rethrow;
        }
      } on OfflineException catch (e) {
        lastError = e;
        if (attempt < _maxAttempts) {
          _log(
              '$method ${uri.toString()} -> offline (retry $attempt/$_maxAttempts em ${backoff.inMilliseconds}ms): ${e.message}');
          await Future.delayed(backoff);
          backoff *= 2;
          continue;
        }
        _log('$method ${uri.toString()} -> offline (desistindo): ${e.message}');
        rethrow;
      } on ApiException {
        // 4xx ou 5xx que nao foi retentado: nao retenta
        rethrow;
      }
    }

    // Nao deveria alcancar aqui, mas por seguranca:
    if (lastError is OfflineException) throw lastError;
    throw OfflineException('Falha apos $_maxAttempts tentativas');
  }

  dynamic _handle(
    http.Response resp, {
    required String method,
    required Uri uri,
    Map<String, dynamic>? requestBody,
  }) {
    final status = resp.statusCode;
    final text = resp.body;

    if (status >= 200 && status < 300) {
      if (text.isEmpty) return {};
      try {
        return jsonDecode(text);
      } catch (_) {
        return {'raw': text};
      }
    }

    String message = 'HTTP $status';
    try {
      final parsed = jsonDecode(text);
      if (parsed is Map && parsed['message'] is String) {
        message = parsed['message'] as String;
        final errors = parsed['errors'];
        if (errors is Map && errors.isNotEmpty) {
          final details = <String>[];
          errors.forEach((field, value) {
            if (value is List && value.isNotEmpty) {
              details.add('$field: ${value.join(', ')}');
            } else if (value != null) {
              details.add('$field: $value');
            }
          });
          if (details.isNotEmpty) {
            message = '$message ${details.join(' | ')}';
          }
        }
      } else if (parsed is Map && parsed['error'] is String) {
        message = parsed['error'] as String;
      }
    } catch (_) {}

    final reqBody = requestBody == null ? '-' : jsonEncode(requestBody);
    final responsePreview =
        text.length > 1200 ? '${text.substring(0, 1200)}...[truncado]' : text;
    _log('$method ${uri.toString()} -> $status | msg="$message"');
    _log('request=$reqBody');
    _log('response=$responsePreview');

    throw ApiException(status, message, text);
  }

  bool _isAuthEndpoint(Uri uri) {
    final p = uri.path.toLowerCase();
    return p.endsWith('/auth/login') ||
        p.endsWith('/auth/logout') ||
        p.endsWith('/auth/refresh');
  }

  Future<bool> _refreshToken() async {
    if (_refreshInFlight != null) {
      return _refreshInFlight!;
    }
    final completer = Completer<bool>();
    _refreshInFlight = completer.future;

    try {
      final currentToken = auth.token;
      if (currentToken == null || currentToken.isEmpty) {
        completer.complete(false);
        return false;
      }

      final uri = _uri('/auth/refresh');
      _log('POST ${uri.toString()} -> refreshing token');
      final req = http.Request('POST', uri);
      req.headers.addAll(_headers(withBody: true));
      req.body = '{}';

      http.StreamedResponse streamed;
      try {
        streamed = await _http.send(req).timeout(_connectTimeout);
      } on TimeoutException {
        _log('POST ${uri.toString()} -> refresh timeout');
        completer.complete(false);
        return false;
      } catch (e) {
        _log('POST ${uri.toString()} -> refresh network error: $e');
        completer.complete(false);
        return false;
      }

      final resp = await http.Response.fromStream(streamed);
      if (resp.statusCode < 200 || resp.statusCode >= 300) {
        _log(
            'POST ${uri.toString()} -> refresh failed status=${resp.statusCode}');
        completer.complete(false);
        return false;
      }

      final parsed = jsonDecode(resp.body);
      if (parsed is! Map) {
        _log('POST ${uri.toString()} -> refresh invalid payload');
        completer.complete(false);
        return false;
      }
      final newToken = parsed['token']?.toString();
      if (newToken == null || newToken.isEmpty) {
        _log('POST ${uri.toString()} -> refresh missing token');
        completer.complete(false);
        return false;
      }
      final expiresIn = parsed['expires_in'] is num
          ? (parsed['expires_in'] as num).toInt()
          : 0;
      final expiresAt = expiresIn > 0
          ? DateTime.now().add(Duration(seconds: expiresIn))
          : null;
      await auth.updateToken(token: newToken, tokenExpiresAt: expiresAt);
      _log('POST ${uri.toString()} -> refresh success');
      completer.complete(true);
      return true;
    } catch (e) {
      _log('refresh error: $e');
      completer.complete(false);
      return false;
    } finally {
      _refreshInFlight = null;
    }
  }

  /// Coleta todas as paginas de um endpoint no formato Laravel
  /// `{data: [...], last_page: N, current_page: X, ...}`.
  ///
  /// Limite de seguranca: 500 paginas. Se atingir, emite warning
  /// (indica bug ou necessidade de filtro mais restritivo).
  /// Para nao-paginados (resposta `List`), retorna direto.
  Future<List<dynamic>> getPaginated(String path,
      {Map<String, dynamic>? query, int perPage = 100}) async {
    final all = <dynamic>[];
    int page = 1;
    int lastPage = 1;

    do {
      final q = <String, dynamic>{
        ...?query,
        'page': page,
        'per_page': perPage,
      };
      final resp = await get(path, query: q);
      List<dynamic> pageData = [];
      if (resp is Map && resp['data'] is List) {
        pageData = List<dynamic>.from(resp['data']);
        lastPage = (resp['last_page'] as num?)?.toInt() ?? page;
      } else if (resp is List) {
        // resposta nao paginada (array plano)
        return List<dynamic>.from(resp);
      }
      all.addAll(pageData);
      page++;

      if (page > _maxPages) {
        _log('getPaginated $path: teto de $_maxPages paginas atingido '
            '(coletadas ${all.length} linhas). Possivel dado truncado.');
        break;
      }
    } while (page <= lastPage);

    return all;
  }

  void dispose() => _http.close();
}
