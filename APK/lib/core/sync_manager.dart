import 'api_client.dart';
import 'local_db.dart';
import 'models.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:io';

class SyncReport {
  int baixados = 0;
  int enviados = 0;
  int falhas = 0;
  String? erroGlobal;

  bool get success => erroGlobal == null && falhas == 0;

  String get resumo {
    if (erroGlobal != null) return 'Erro: $erroGlobal';
    final parts = <String>[];
    parts.add('$baixados cadastro(s) atualizado(s).');
    if (enviados > 0) parts.add('$enviados enviado(s).');
    if (falhas > 0) parts.add('$falhas com erro.');
    if (enviados == 0 && falhas == 0) parts.add('Nada pendente para enviar.');
    return parts.join(' ');
  }
}

/// Sincronizacao bidirecional:
/// 1) DOWNLOAD: proprietarios, veiculos, motoristas, precos, abastecimentos, usuarios
/// 2) UPLOAD: drena sync_queue (create/update/delete por entidade)
class SyncManager {
  final ApiClient api;
  final LocalDb db;

  SyncManager(this.api, this.db);

  Future<int> _runDownloadStep(
    SyncReport r, {
    required String label,
    required Future<int> Function() action,
  }) async {
    try {
      return await action();
    } catch (e) {
      r.falhas++;
      final detail = _errorDetails(e);
      await db.addSyncLog(
        level: 'error',
        message: 'Falha no download incremental',
        context: 'etapa=$label erro=$detail',
      );
      return 0;
    }
  }

  Future<SyncReport> run({
    void Function(String msg)? onProgress,
    bool forceFull = false,
  }) async {
    final r = SyncReport();
    try {
      await db.addSyncLog(
        level: 'info',
        message: 'Sincronizacao iniciada',
        context: 'forceFull=$forceFull',
      );

      // ---- UPLOAD primeiro ----
      // Garante que pendentes sejam enviados mesmo quando algum download falhar.
      onProgress?.call('Enviando registros pendentes...');
      final queue = await db.listQueue();
      for (final item in queue) {
        try {
          final sent = await _sendItem(item);
          await db.markQueueSuccess(item, sent);
          r.enviados++;
          await db.addSyncLog(
            level: 'info',
            message: 'Item sincronizado',
            context:
                'entity=${item.entity} action=${item.action} queueId=${item.id} remoteId=${sent ?? '-'}',
          );
          onProgress?.call('Enviado ${r.enviados}/${queue.length}...');
        } catch (e) {
          r.falhas++;
          final detail = _errorDetails(e);
          await db.markQueueError(item.id, detail);
          await db.addSyncLog(
            level: 'error',
            message: 'Falha ao sincronizar item pendente',
            context:
                'queueId=${item.id} entity=${item.entity} action=${item.action} erro=$detail payload=${item.payloadJson}',
          );
        }
      }

      // ---- DOWNLOAD ----
      onProgress?.call('Baixando proprietarios...');
      r.baixados += await _runDownloadStep(
        r,
        label: '/proprietarios',
        action: () => _syncEntityIncremental<Map<String, dynamic>>(
          tokenKey: 'proprietarios',
          path: '/proprietarios',
          perPage: 200,
          forceFull: forceFull,
          fromMap: (m) => Map<String, dynamic>.from(m),
          getToken: (m) => _extractSyncToken(m),
          onReplace: (rows) async {
            final list = rows.map(Proprietario.fromJson).toList();
            await db.replaceProprietarios(list);
          },
          onUpsert: (rows) async {
            final list = rows.map(Proprietario.fromJson).toList();
            await db.upsertProprietariosRemotos(list);
          },
        ),
      );

      onProgress?.call('Baixando veiculos...');
      r.baixados += await _runDownloadStep(
        r,
        label: '/veiculos',
        action: () => _syncEntityIncremental<Map<String, dynamic>>(
          tokenKey: 'veiculos',
          path: '/veiculos',
          perPage: 200,
          forceFull: forceFull,
          fromMap: (m) => Map<String, dynamic>.from(m),
          getToken: (m) => _extractSyncToken(m),
          onReplace: (rows) async {
            final list = rows.map(Veiculo.fromJson).toList();
            await db.replaceVeiculos(list);
          },
          onUpsert: (rows) async {
            final list = rows.map(Veiculo.fromJson).toList();
            await db.upsertVeiculosRemotos(list);
          },
        ),
      );

      onProgress?.call('Baixando motoristas...');
      r.baixados += await _runDownloadStep(
        r,
        label: '/motoristas',
        action: () => _syncEntityIncremental<Map<String, dynamic>>(
          tokenKey: 'motoristas',
          path: '/motoristas',
          perPage: 200,
          forceFull: forceFull,
          fromMap: (m) => Map<String, dynamic>.from(m),
          getToken: (m) => _extractSyncToken(m),
          onReplace: (rows) async {
            final list = rows.map(Motorista.fromJson).toList();
            await db.replaceMotoristas(list);
          },
          onUpsert: (rows) async {
            final list = rows.map(Motorista.fromJson).toList();
            await db.upsertMotoristasRemotos(list);
          },
        ),
      );

      onProgress?.call('Baixando precos de combustivel...');
      r.baixados += await _runDownloadStep(
        r,
        label: '/valores-combustivel',
        action: () => _syncEntityIncremental<Map<String, dynamic>>(
          tokenKey: 'valores_combustivel',
          path: '/valores-combustivel',
          perPage: 200,
          forceFull: forceFull,
          fromMap: (m) => Map<String, dynamic>.from(m),
          getToken: (m) => _extractSyncToken(m),
          onReplace: (rows) async {
            final list = rows.map(ValorCombustivel.fromJson).toList();
            await db.replaceValoresCombustivel(list);
          },
          onUpsert: (rows) async {
            final list = rows.map(ValorCombustivel.fromJson).toList();
            await db.upsertValoresCombustivelRemotos(list);
          },
        ),
      );

      onProgress?.call('Baixando abastecimentos...');
      r.baixados += await _runDownloadStep(
        r,
        label: '/abastecimentos',
        action: () => _syncEntityIncremental<Map<String, dynamic>>(
          tokenKey: 'abastecimentos',
          path: '/abastecimentos',
          perPage: 500,
          forceFull: forceFull,
          fromMap: (m) => Map<String, dynamic>.from(m),
          getToken: (m) => _extractSyncToken(m),
          onReplace: (rows) async {
            final list = rows.map(Abastecimento.fromJson).toList();
            await db.replaceAbastecimentosRemotos(list);
          },
          onUpsert: (rows) async {
            final list = rows.map(Abastecimento.fromJson).toList();
            await db.upsertAbastecimentosRemotos(list);
          },
        ),
      );

      // Usuarios (somente admin) - tolerante a 403
      try {
        onProgress?.call('Baixando usuarios...');
        r.baixados += await _runDownloadStep(
          r,
          label: '/usuarios',
          action: () => _syncEntityIncremental<Map<String, dynamic>>(
            tokenKey: 'usuarios',
            path: '/usuarios',
            perPage: 200,
            forceFull: forceFull,
            fromMap: (m) => Map<String, dynamic>.from(m),
            getToken: (m) => _extractSyncToken(m),
            onReplace: (rows) async {
              final list = rows.map(Usuario.fromJson).toList();
              await db.replaceUsuarios(list);
            },
            onUpsert: (rows) async {
              final list = rows.map(Usuario.fromJson).toList();
              await db.upsertUsuariosRemotos(list);
            },
          ),
        );
      } catch (e) {
        // nao eh admin - ignora
      }
      await db.addSyncLog(
        level: 'info',
        message: 'Sincronizacao finalizada',
        context:
            'baixados=${r.baixados} enviados=${r.enviados} falhas=${r.falhas}',
      );
      return r;
    } on ApiException catch (e) {
      r.erroGlobal = e.message;
      await db.addSyncLog(
        level: 'error',
        message: 'Erro global de API na sincronizacao',
        context: _errorDetails(e),
      );
      return r;
    } on OfflineException catch (e) {
      r.erroGlobal = e.message;
      await db.addSyncLog(
        level: 'warn',
        message: 'Sem conexao durante sincronizacao',
        context: e.toString(),
      );
      return r;
    } catch (e) {
      r.erroGlobal = e.toString();
      await db.addSyncLog(
        level: 'error',
        message: 'Erro inesperado na sincronizacao',
        context: e.toString(),
      );
      return r;
    }
  }

  String _errorDetails(Object e) {
    if (e is ApiException) {
      final body = e.body.length > 1200 ? '${e.body.substring(0, 1200)}...[truncado]' : e.body;
      return 'ApiException(status=${e.statusCode}, message=${e.message}, body=$body)';
    }
    return e.toString();
  }

  Future<int> _syncEntityIncremental<T>({
    required String tokenKey,
    required String path,
    required int perPage,
    required bool forceFull,
    required T Function(Map<String, dynamic>) fromMap,
    required String? Function(T item) getToken,
    required Future<void> Function(List<T> rows) onReplace,
    required Future<void> Function(List<T> rows) onUpsert,
  }) async {
    final lastToken = forceFull ? null : await _getSyncToken(tokenKey);
    final query = <String, dynamic>{};
    if (lastToken != null && lastToken.isNotEmpty) {
      query['sync_token_after'] = lastToken;
    }

    final rowsRaw = await api.getPaginated(path, perPage: perPage, query: query);
    final rows = rowsRaw
        .whereType<Map>()
        .map((m) => fromMap(Map<String, dynamic>.from(m)))
        .toList();

    if (lastToken == null || forceFull) {
      await onReplace(rows);
    } else {
      await onUpsert(rows);
    }

    final newestToken = _maxToken(rows, getToken) ?? lastToken;
    if (newestToken != null && newestToken.isNotEmpty) {
      await _setSyncToken(tokenKey, newestToken);
    }

    return rows.length;
  }

  String? _maxToken<T>(List<T> rows, String? Function(T item) getToken) {
    String? maxToken;
    DateTime? maxDate;

    for (final row in rows) {
      final token = getToken(row);
      if (token == null || token.trim().isEmpty) continue;
      final parsed = DateTime.tryParse(token);
      if (parsed == null) continue;
      if (maxDate == null || parsed.isAfter(maxDate)) {
        maxDate = parsed;
        maxToken = token;
      }
    }
    return maxToken;
  }

  String? _extractSyncToken(Map<String, dynamic> map) {
    final token = map['sync_token_at'];
    if (token == null) return null;
    final txt = token.toString().trim();
    if (txt.isEmpty) return null;
    return txt;
  }

  Future<String?> _getSyncToken(String key) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_syncTokenPrefKey(key));
  }

  Future<void> _setSyncToken(String key, String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_syncTokenPrefKey(key), token);
  }

  String _syncTokenPrefKey(String key) => 'sync_token_v1_$key';

  /// Envia um item da fila e retorna o id remoto (se houver).
  Future<Object?> _sendItem(SyncItem item) async {
    switch (item.entity) {
      case 'abastecimento':
        final payload = await _prepareAbastecimentoPayload(item.payload);
        if (item.action == 'create') {
          final resp = await api.post('/abastecimentos', payload);
          if (resp is Map && resp['id_abastecimento'] != null) {
            return resp['id_abastecimento'].toString();
          }
        } else if (item.action == 'update') {
          final id = (payload['id_abastecimento'] ?? '').toString();
          if (id.isNotEmpty) {
            await api.put('/abastecimentos/$id', payload);
            return id;
          }
        } else if (item.action == 'delete') {
          final id = (payload['id_abastecimento'] ?? '').toString();
          if (id.isNotEmpty) {
            try {
              await api.delete('/abastecimentos/$id');
            } on ApiException catch (e) {
              if (e.statusCode != 404) rethrow;
            }
            return id;
          }
        }
        break;
      case 'baixa_lote':
        await api.post('/baixas/lote', {
          ...item.payload,
          '_client_request_id': item.uuid ?? 'queue-${item.id}',
        });
        return null;
      case 'entrada_notas':
        if (item.action == 'create') {
          final resp = await api.post('/entrada-notas', {
            ...item.payload,
            '_client_request_id': item.uuid ?? 'queue-${item.id}',
          });
          if (resp is Map && resp['id_financeiro'] != null) {
            return resp['id_financeiro'];
          }
          return null;
        }
        if (item.action == 'update' && item.remoteId != null) {
          await api.put('/entrada-notas/${item.remoteId}', item.payload);
          return item.remoteId;
        }
        if (item.action == 'delete' && item.remoteId != null) {
          try {
            await api.delete('/entrada-notas/${item.remoteId}');
          } on ApiException catch (e) {
            if (e.statusCode != 404) rethrow;
          }
          return item.remoteId;
        }
        return null;
      case 'proprietario':
        return _crud('/proprietarios', item);
      case 'veiculo':
        return _crud('/veiculos', item);
      case 'motorista':
        return _crud('/motoristas', item);
      case 'valor_combustivel':
        return _crud('/valores-combustivel', item);
      case 'usuario':
        return _crud('/usuarios', item);
    }
    return null;
  }

  Future<Map<String, dynamic>> _prepareAbastecimentoPayload(
      Map<String, dynamic> original) async {
    final payload = Map<String, dynamic>.from(original);
    for (final key in ['foto_odometro', 'bomba', 'anexo']) {
      final value = payload[key];
      if (value is! String) continue;
      final raw = value.trim();
      if (raw.isEmpty || _isRemoteUrl(raw)) continue;

      final file = File(raw);
      if (!await file.exists()) {
        throw Exception('Arquivo de imagem não encontrado para "$key": $raw');
      }

      final resp = await api.postMultipartFile(
        '/uploads/drive',
        filePath: raw,
        fieldName: 'file',
      );
      if (resp is! Map) {
        throw Exception('Upload de "$key" retornou resposta inválida.');
      }
      final fileMap = (resp['file'] is Map)
          ? Map<String, dynamic>.from(resp['file'] as Map)
          : <String, dynamic>{};
      final url = (fileMap['webViewLink'] ??
              fileMap['webContentLink'] ??
              fileMap['downloadUrl'])
          ?.toString();
      if (url == null || url.trim().isEmpty) {
        throw Exception('Upload de "$key" concluído sem URL.');
      }
      payload[key] = url.trim();
    }
    return payload;
  }

  bool _isRemoteUrl(String value) {
    final v = value.toLowerCase();
    return v.startsWith('http://') || v.startsWith('https://');
  }

  Future<Object?> _crud(String path, SyncItem item) async {
    if (item.action == 'create') {
      final resp = await api.post(path, {
        ...item.payload,
        '_client_request_id': item.uuid ?? 'queue-${item.id}',
      });
      if (resp is Map) {
        for (final k in [
          'id',
          'id_proprietario',
          'id_veiculo',
          'id_motorista',
          'id_valor',
          'id_usuario'
        ]) {
          if (resp[k] != null) return resp[k];
        }
      }
      return null;
    }
    if (item.action == 'update' && item.remoteId != null) {
      await api.put('$path/${item.remoteId}', item.payload);
      return item.remoteId;
    }
    if (item.action == 'delete' && item.remoteId != null) {
      try {
        await api.delete('$path/${item.remoteId}');
      } on ApiException catch (e) {
        if (e.statusCode != 404) rethrow;
      }
      return item.remoteId;
    }
    return null;
  }
}
