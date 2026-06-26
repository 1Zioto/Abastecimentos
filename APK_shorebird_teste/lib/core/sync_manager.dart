import 'api_client.dart';
import 'app_error_reporter.dart';
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
/// 1) UPLOAD: drena sync_queue respeitando dependencias locais
/// 2) DOWNLOAD completo: recarrega a base online no aparelho
class SyncManager {
  final ApiClient api;
  final LocalDb db;
  final AppErrorReporter? errorReporter;

  SyncManager(this.api, this.db, {this.errorReporter});

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
      if (e is ApiException && e.isUnauthorized) {
        r.erroGlobal = e.message;
      }
      await db.addSyncLog(
        level: 'error',
        message: 'Falha no download incremental',
        context: 'etapa=$label erro=$detail',
      );
      await errorReporter?.captureSyncError(
        level: 'error',
        mensagem: 'Falha no download incremental',
        detalhe: 'etapa=$label erro=$detail',
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
      await errorReporter?.flushPending();

      // ---- UPLOAD primeiro ----
      // Garante que pendentes sejam enviados mesmo quando algum download falhar.
      onProgress?.call('Enviando registros pendentes...');
      await _repairMissingLocalDependencies(await db.listQueue());
      final queue = _orderUploadQueue(await db.listQueue());
      var forceValoresCombustivelFullDownload = false;
      for (final queuedItem in queue) {
        final item = await db.getQueueItem(queuedItem.id);
        if (item == null) continue;
        try {
          final cachedRemoteId =
              await db.findCachedRemoteIdForPendingCreate(item);
          if (cachedRemoteId != null) {
            await db.markQueueSuccess(item, cachedRemoteId);
            r.enviados++;
            await db.addSyncLog(
              level: 'info',
              message: 'Item reconciliado com cadastro online existente',
              context:
                  'entity=${item.entity} action=${item.action} queueId=${item.id} remoteId=$cachedRemoteId',
            );
            onProgress?.call('Resolvido ${r.enviados}/${queue.length}...');
            continue;
          }
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
          if (_isImmutableValorCombustivelReject(item, e)) {
            await db.discardQueueItem(item);
            forceValoresCombustivelFullDownload = true;
            await db.addSyncLog(
              level: 'warn',
              message: 'Alteracao antiga de preco descartada',
              context:
                  'queueId=${item.id} action=${item.action} motivo=${_errorDetails(e)}',
            );
            continue;
          }
          r.falhas++;
          final detail = _errorDetails(e);
          await db.markQueueError(item.id, detail);
          await db.addSyncLog(
            level: 'error',
            message: 'Falha ao sincronizar item pendente',
            context:
                'queueId=${item.id} entity=${item.entity} action=${item.action} erro=$detail payload=${item.payloadJson}',
          );
          await errorReporter?.captureSyncError(
            level: 'error',
            mensagem: 'Falha ao sincronizar item pendente',
            detalhe:
                'queueId=${item.id} entity=${item.entity} action=${item.action} erro=$detail payload=${item.payloadJson}',
          );
        }
      }

      // ---- DOWNLOAD completo ----
      // Depois de enviar tudo o que estava pendente no aparelho, a base local
      // e recarregada do online para garantir que os cadastros e lancamentos
      // fiquem no mesmo estado do servidor.
      final downloadFullDatabase = !forceFull;
      onProgress?.call('Baixando proprietarios...');
      r.baixados += await _runDownloadStep(
        r,
        label: '/proprietarios',
        action: () => _syncEntityIncremental<Map<String, dynamic>>(
          tokenKey: 'proprietarios',
          path: '/proprietarios',
          perPage: 200,
          forceFull: forceFull || downloadFullDatabase,
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
          forceFull: forceFull || downloadFullDatabase,
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
          forceFull: forceFull || downloadFullDatabase,
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
          forceFull: forceFull ||
              downloadFullDatabase ||
              forceValoresCombustivelFullDownload,
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
          forceFull: forceFull || downloadFullDatabase,
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
            forceFull: forceFull || downloadFullDatabase,
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
      await errorReporter?.flushPending();
      return r;
    } on ApiException catch (e) {
      r.erroGlobal = e.message;
      final detail = _errorDetails(e);
      await db.addSyncLog(
        level: 'error',
        message: 'Erro global de API na sincronizacao',
        context: detail,
      );
      await errorReporter?.captureSyncError(
        level: 'error',
        mensagem: 'Erro global de API na sincronizacao',
        detalhe: detail,
      );
      return r;
    } on OfflineException catch (e) {
      r.erroGlobal = e.message;
      await db.addSyncLog(
        level: 'warn',
        message: 'Sem conexao durante sincronizacao',
        context: e.toString(),
      );
      await errorReporter?.captureSyncError(
        level: 'warn',
        mensagem: 'Sem conexao durante sincronizacao',
        detalhe: e.toString(),
      );
      return r;
    } catch (e) {
      r.erroGlobal = e.toString();
      await db.addSyncLog(
        level: 'error',
        message: 'Erro inesperado na sincronizacao',
        context: e.toString(),
      );
      await errorReporter?.captureSyncError(
        level: 'error',
        mensagem: 'Erro inesperado na sincronizacao',
        detalhe: e.toString(),
      );
      return r;
    }
  }

  String _errorDetails(Object e) {
    if (e is ApiException) {
      final body = e.body.length > 1200
          ? '${e.body.substring(0, 1200)}...[truncado]'
          : e.body;
      return 'ApiException(status=${e.statusCode}, message=${e.message}, body=$body)';
    }
    return e.toString();
  }

  bool _isImmutableValorCombustivelReject(SyncItem item, Object e) {
    return item.entity == 'valor_combustivel' &&
        (item.action == 'update' || item.action == 'delete') &&
        e is ApiException &&
        e.statusCode == 405;
  }

  Future<void> _repairMissingLocalDependencies(List<SyncItem> queue) async {
    for (final item in queue) {
      if (item.action != 'create' && item.action != 'update') continue;
      final payload = item.payload;

      Future<void> ensure({
        required String key,
        required String entity,
        required String label,
      }) async {
        final localId = payload[key]?.toString().trim();
        if (localId == null ||
            localId.isEmpty ||
            !localId.startsWith('local_')) {
          return;
        }
        final remoteId = await db.resolveRemoteIdForLocalReference(
          entity: entity,
          localId: localId,
        );
        if (remoteId != null && remoteId.trim().isNotEmpty) return;

        final queued = await db.ensureCreateQueuedForLocalReference(
          entity: entity,
          localId: localId,
        );
        if (queued) {
          await db.addSyncLog(
            level: 'warn',
            message: 'Cadastro local recolocado na fila de sincronizacao',
            context:
                'dependencia=$label localId=$localId origem=${item.entity}/${item.action} queueId=${item.id}',
          );
        }
      }

      if (item.entity == 'abastecimento') {
        await ensure(
          key: 'id_proprietario',
          entity: 'proprietario',
          label: 'proprietario',
        );
        await ensure(
          key: 'id_motorista',
          entity: 'motorista',
          label: 'motorista',
        );
        await ensure(
          key: 'id_veiculo',
          entity: 'veiculo',
          label: 'veiculo',
        );
      } else if (item.entity == 'motorista' || item.entity == 'veiculo') {
        await ensure(
          key: 'id_proprietario',
          entity: 'proprietario',
          label: 'proprietario',
        );
      }
    }
  }

  List<SyncItem> _orderUploadQueue(List<SyncItem> queue) {
    final indexed = queue.asMap().entries.toList();

    // Ordem de criacao respeita dependencias:
    //   0 - proprietario create
    //   1 - motorista create  (depende de proprietario)
    //   2 - veiculo create    (depende de proprietario)
    //   3 - abastecimento create
    //   4 - entrada_notas create
    //   5 - outros creates
    // Updates/deletes vem depois, na mesma ordem de entidade,
    // para nao interromper a cadeia de criacao:
    //   6 - proprietario update/delete
    //   7 - motorista update/delete
    //   8 - veiculo update/delete
    //   9 - tudo mais (baixa_lote, valor_combustivel, usuario, etc.)
    int priority(SyncItem item) {
      if (item.action == 'create') {
        switch (item.entity) {
          case 'proprietario':
            return 0;
          case 'motorista':
            return 1;
          case 'veiculo':
            return 2;
          case 'abastecimento':
            return 3;
          case 'entrada_notas':
            return 4;
          default:
            return 5;
        }
      }
      switch (item.entity) {
        case 'proprietario':
          return 6;
        case 'motorista':
          return 7;
        case 'veiculo':
          return 8;
        default:
          return 9;
      }
    }

    indexed.sort((a, b) {
      final p = priority(a.value).compareTo(priority(b.value));
      if (p != 0) return p;
      return a.key.compareTo(b.key); // empate: ordem de insercao (id crescente)
    });
    return indexed.map((e) => e.value).toList();
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

    final rowsRaw =
        await api.getPaginated(path, perPage: perPage, query: query);
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
        final payload = await _prepareAbastecimentoPayload(
          item,
          action: item.action,
        );
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
        final payload = await _prepareEntradaNotaPayload(item.payload);
        if (item.action == 'create') {
          final resp = await api.post('/entrada-notas', {
            ...payload,
            '_client_request_id': item.uuid ?? 'queue-${item.id}',
          });
          if (resp is Map && resp['id_financeiro'] != null) {
            final remoteId = resp['id_financeiro'].toString();
            await _analyzeEntradaNotaIfNeeded(remoteId, payload, item.id);
            return remoteId;
          }
          return null;
        }
        if (item.action == 'update' && item.remoteId != null) {
          await api.put('/entrada-notas/${item.remoteId}', payload);
          await _analyzeEntradaNotaIfNeeded(item.remoteId!, payload, item.id);
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
        return _crud('/proprietarios', item,
            payloadOverride: await _prepareProprietarioPayload(item));
      case 'veiculo':
        return _crud('/veiculos', item,
            payloadOverride: await _prepareVeiculoPayload(item));
      case 'motorista':
        return _crud('/motoristas', item,
            payloadOverride: await _prepareMotoristaPayload(item));
      case 'valor_combustivel':
        return _crud('/valores-combustivel', item,
            payloadOverride: _prepareValorCombustivelPayload(item.payload));
      case 'usuario':
        return _crud('/usuarios', item,
            payloadOverride: _prepareUsuarioPayload(item.payload));
    }
    return null;
  }

  Future<Map<String, dynamic>> _prepareEntradaNotaPayload(
    Map<String, dynamic> original,
  ) async {
    final payload = Map<String, dynamic>.from(original);
    await _uploadLocalFiles(payload, const ['foto_nota']);
    payload['local'] = _normalizeLocal(payload['local']);
    return payload;
  }

  Future<void> _analyzeEntradaNotaIfNeeded(
    String remoteId,
    Map<String, dynamic> payload,
    int queueId,
  ) async {
    final imageUrl = payload['foto_nota']?.toString().trim();
    if (remoteId.trim().isEmpty ||
        imageUrl == null ||
        imageUrl.isEmpty ||
        !_isRemoteUrl(imageUrl)) {
      return;
    }

    try {
      final resp = await api.post('/entrada-notas/$remoteId/analisar-ia', {
        'image_url': imageUrl,
      });
      if (resp is Map) {
        final status = resp['status']?.toString().trim();
        await db.addSyncLog(
          level: status == 'suspeita' ? 'warn' : 'info',
          message: 'Analise de nota fiscal concluida',
          context: 'queueId=$queueId nota=$remoteId status=$status',
        );
      }
    } catch (e) {
      await db.addSyncLog(
        level: 'warn',
        message: 'Falha ao analisar nota fiscal com IA',
        context: 'queueId=$queueId nota=$remoteId erro=$e',
      );
    }
  }

  Map<String, dynamic> _prepareValorCombustivelPayload(
      Map<String, dynamic> original) {
    final payload = Map<String, dynamic>.from(original);
    payload['local'] = _normalizeLocal(payload['local']);
    return payload;
  }

  Map<String, dynamic> _prepareUsuarioPayload(Map<String, dynamic> original) {
    final payload = Map<String, dynamic>.from(original);
    final senha = payload.remove('senha');
    final password = payload['password']?.toString().trim();
    if ((password == null || password.isEmpty) &&
        senha != null &&
        senha.toString().trim().isNotEmpty) {
      payload['password'] = senha.toString().trim();
    }
    return payload;
  }

  Future<Map<String, dynamic>> _prepareVeiculoPayload(SyncItem item) async {
    final payload = Map<String, dynamic>.from(item.payload);
    if ((payload['id_proprietario']?.toString().trim() ?? '').isEmpty &&
        item.uuid != null) {
      final local = await db.findVeiculo(item.uuid!);
      final ownerId = local?.idProprietario?.trim();
      if (ownerId != null && ownerId.isNotEmpty) {
        payload['id_proprietario'] = ownerId;
      }
      payload['local'] = _normalizeLocal(local?.local ?? payload['local']);
    } else {
      payload['local'] = _normalizeLocal(payload['local']);
    }

    await _resolveOwnerReferenceForPayload(
      payload,
      parentEntity: 'veiculo',
      parentLabel: 'veiculo',
    );

    if ((payload['id_proprietario']?.toString().trim() ?? '').isEmpty) {
      throw Exception(
          'Veiculo sem empresa responsavel. Abra o cadastro do veiculo, selecione a empresa e salve novamente.');
    }
    await _fillLocalFromOwner(payload);
    return payload;
  }

  Future<Map<String, dynamic>> _prepareMotoristaPayload(SyncItem item) async {
    final payload = Map<String, dynamic>.from(item.payload);
    if ((payload['id_proprietario']?.toString().trim() ?? '').isEmpty &&
        item.uuid != null) {
      final local = await db.findMotorista(item.uuid!);
      final ownerId = local?.idProprietario?.trim();
      if (ownerId != null && ownerId.isNotEmpty) {
        payload['id_proprietario'] = ownerId;
      }
      payload['local'] = _normalizeLocal(local?.local ?? payload['local']);
    } else {
      payload['local'] = _normalizeLocal(payload['local']);
    }

    await _resolveOwnerReferenceForPayload(
      payload,
      parentEntity: 'motorista',
      parentLabel: 'motorista',
    );

    if ((payload['id_proprietario']?.toString().trim() ?? '').isEmpty) {
      throw Exception(
          'Motorista sem empresa responsavel. Abra o cadastro do motorista, selecione a empresa e salve novamente.');
    }
    await _fillLocalFromOwner(payload);
    return payload;
  }

  Future<Map<String, dynamic>> _prepareProprietarioPayload(SyncItem item) async {
    final payload = Map<String, dynamic>.from(item.payload);
    final localAtual = payload['local']?.toString().trim();
    if (localAtual == null || localAtual.isEmpty) {
      final localId = item.uuid?.trim();
      final inferido = localId == null || localId.isEmpty
          ? null
          : await db.inferLocalForProprietario(localId);
      if (inferido != null && inferido.trim().isNotEmpty) {
        payload['local'] = inferido.trim();
        await db.updateQueuePayload(item.id, payload);
      }
    }
    return payload;
  }

  Future<void> _fillLocalFromOwner(Map<String, dynamic> payload) async {
    final localAtual = payload['local']?.toString().trim();
    if (localAtual != null && localAtual.isNotEmpty) return;
    final ownerId = payload['id_proprietario']?.toString().trim();
    if (ownerId == null || ownerId.isEmpty || ownerId.startsWith('local_')) {
      return;
    }
    final owner = await db.findProprietario(ownerId);
    final ownerLocal = owner?.local?.trim();
    if (ownerLocal != null && ownerLocal.isNotEmpty) {
      payload['local'] = ownerLocal;
    }
  }

  Future<void> _resolveOwnerReferenceForPayload(
    Map<String, dynamic> payload, {
    required String parentEntity,
    required String parentLabel,
  }) async {
    final ownerId = payload['id_proprietario']?.toString().trim();
    if (ownerId == null || ownerId.isEmpty || !ownerId.startsWith('local_')) {
      return;
    }

    final remoteId = await db.resolveRemoteIdForLocalReference(
      entity: 'proprietario',
      localId: ownerId,
    );
    if (remoteId != null && remoteId.trim().isNotEmpty) {
      payload['id_proprietario'] = remoteId;
      await db.replaceLocalReference(
        localId: ownerId,
        remoteId: remoteId,
        column: 'id_proprietario',
        tables: ['veiculos', 'motoristas', 'abastecimentos'],
      );
      return;
    }

    final queued = await db.ensureCreateQueuedForLocalReference(
      entity: 'proprietario',
      localId: ownerId,
    );
    if (queued) {
      throw Exception(
          'Aguardando sincronizar proprietario antes do $parentLabel ($ownerId). Sincronize novamente.');
    }
    throw Exception(
        'Proprietario local nao encontrado para sincronizar $parentLabel ($ownerId). Abra o cadastro, selecione a empresa e salve novamente.');
  }

  Future<Map<String, dynamic>> _prepareAbastecimentoPayload(
    SyncItem item, {
    required String action,
  }) async {
    final original = item.payload;
    final payload = Map<String, dynamic>.from(original);
    final originalLocal = payload['local'];
    payload['local'] = _normalizeLocal(payload['local']);

    if (action == 'update') {
      await _reconcileLegacyAbastecimentoUpdate(payload, originalLocal);
    }

    await _resolveAbastecimentoLocalReferences(payload, item);

    final uploaded = await _uploadLocalFiles(
        payload, const ['foto_odometro', 'bomba', 'anexo']);
    if (uploaded.isNotEmpty) {
      await db.updateQueuePayload(item.id, payload);
      await db.updateAbastecimentoLocalFields(
        localUuid: item.uuid,
        remoteId: (payload['id_abastecimento'] ?? item.remoteId)?.toString(),
        fields: uploaded,
      );
    }
    await _analyzeAbastecimentoImagesIfNeeded(payload, item);
    return payload;
  }

  Future<void> _resolveAbastecimentoLocalReferences(
    Map<String, dynamic> payload,
    SyncItem item,
  ) async {
    var changed = false;

    Future<void> resolve({
      required String key,
      required String entity,
      required String label,
      required List<String> tables,
    }) async {
      final localId = payload[key]?.toString().trim();
      if (localId == null || localId.isEmpty || !localId.startsWith('local_')) {
        return;
      }

      final remoteId = await db.resolveRemoteIdForLocalReference(
        entity: entity,
        localId: localId,
      );
      if (remoteId == null || remoteId.trim().isEmpty) {
        final queued = await db.ensureCreateQueuedForLocalReference(
          entity: entity,
          localId: localId,
        );
        if (queued) {
          await db.addSyncLog(
            level: 'warn',
            message: 'Dependencia local do abastecimento recolocada na fila',
            context: 'queueId=${item.id} dependencia=$label localId=$localId',
          );
          throw Exception(
              'Cadastro de $label ainda estava local ($localId) e foi recolocado na fila. Sincronize novamente para enviar o cadastro e depois o abastecimento.');
        }
        throw Exception(
            'Aguardando sincronizar $label antes do abastecimento ($localId). Sincronize novamente; se persistir, abra o cadastro e salve novamente.');
      }

      payload[key] = remoteId;
      await db.replaceLocalReference(
        localId: localId,
        remoteId: remoteId,
        column: key,
        tables: tables,
      );
      changed = true;
    }

    await resolve(
      key: 'id_proprietario',
      entity: 'proprietario',
      label: 'proprietario',
      tables: ['veiculos', 'motoristas', 'abastecimentos'],
    );
    await resolve(
      key: 'id_motorista',
      entity: 'motorista',
      label: 'motorista',
      tables: ['abastecimentos'],
    );
    await resolve(
      key: 'id_veiculo',
      entity: 'veiculo',
      label: 'veiculo',
      tables: ['abastecimentos'],
    );

    if (!changed) return;

    await db.updateQueuePayload(item.id, payload);
    await db.updateAbastecimentoLocalFields(
      localUuid: item.uuid,
      remoteId: (payload['id_abastecimento'] ?? item.remoteId)?.toString(),
      fields: {
        'id_proprietario': payload['id_proprietario'],
        'id_motorista': payload['id_motorista'],
        'id_veiculo': payload['id_veiculo'],
      },
    );
  }

  Future<void> _analyzeAbastecimentoImagesIfNeeded(
    Map<String, dynamic> payload,
    SyncItem item,
  ) async {
    final currentStatus = payload['status']?.toString().trim().toUpperCase();
    if (currentStatus == 'CONFIRMADO' || currentStatus == 'INCONSISTENTE') {
      return;
    }

    final bombaUrl = payload['bomba']?.toString().trim();
    if (bombaUrl == null || bombaUrl.isEmpty || !_isRemoteUrl(bombaUrl)) {
      return;
    }

    final expected = await _analysisExpectedPayload(payload);
    var analyzed = false;
    var inconsistent = false;

    final bombaResult = await _analyzeRemoteImage(
      imageUrl: bombaUrl,
      kind: 'bomba',
      expected: expected,
    );
    if (bombaResult != null) {
      analyzed = true;
      inconsistent = inconsistent || bombaResult;
    }

    final odometroUrl = payload['foto_odometro']?.toString().trim();
    if (odometroUrl != null &&
        odometroUrl.isNotEmpty &&
        _isRemoteUrl(odometroUrl) &&
        expected['odometro'] != null) {
      final odometroResult = await _analyzeRemoteImage(
        imageUrl: odometroUrl,
        kind: 'odometro',
        expected: expected,
      );
      if (odometroResult != null) {
        analyzed = true;
        inconsistent = inconsistent || odometroResult;
      }
    }

    if (!analyzed) return;

    final status = inconsistent ? 'Inconsistente' : 'Confirmado';
    payload['status'] = status;
    await db.updateQueuePayload(item.id, payload);
    await db.updateAbastecimentoLocalFields(
      localUuid: item.uuid,
      remoteId: (payload['id_abastecimento'] ?? item.remoteId)?.toString(),
      fields: {'status': status},
    );
    await db.addSyncLog(
      level: 'info',
      message: 'Analise de imagem do abastecimento concluida',
      context: 'queueId=${item.id} status=$status',
    );
  }

  Future<Map<String, dynamic>> _analysisExpectedPayload(
    Map<String, dynamic> payload,
  ) async {
    String? placa = payload['placa']?.toString().trim();
    if (placa == null || placa.isEmpty) {
      final veiculoId = payload['id_veiculo']?.toString().trim();
      if (veiculoId != null && veiculoId.isNotEmpty) {
        placa = (await db.findVeiculo(veiculoId))?.placa;
      }
    }

    return {
      'odometro': _asDouble(payload['odometro']),
      'quantidadeLitros': _asDouble(payload['quantidade_litros']),
      'valorPorLitro': _asDouble(payload['valor_por_litro']),
      'valorTotal': _asDouble(payload['valor_total']),
      'placa': placa,
    };
  }

  Future<bool?> _analyzeRemoteImage({
    required String imageUrl,
    required String kind,
    required Map<String, dynamic> expected,
  }) async {
    final resp = await api.post('/abastecimentos/analisar-comprovante', {
      'image_url': imageUrl,
      'kind': kind,
      'expected': expected,
    });
    if (resp is! Map) {
      throw Exception('Analise de "$kind" retornou resposta invalida.');
    }

    final engine = resp['engine']?.toString().trim().toLowerCase();
    if (engine != 'ai') {
      return null;
    }

    if (resp['inconsistent'] is bool) {
      return resp['inconsistent'] as bool;
    }

    final checks = resp['checks'];
    if (checks is List) {
      return checks.any((check) =>
          check is Map &&
          check['severity']?.toString().trim().toLowerCase() == 'warning');
    }
    return false;
  }

  double? _asDouble(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    final text = value.toString().trim().replaceAll(',', '.');
    if (text.isEmpty) return null;
    return double.tryParse(text);
  }

  Future<Map<String, String>> _uploadLocalFiles(
    Map<String, dynamic> payload,
    List<String> keys,
  ) async {
    final uploaded = <String, String>{};
    for (final key in keys) {
      final value = payload[key];
      if (value is! String) continue;
      final raw = value.trim();
      if (raw.isEmpty || _isRemoteUrl(raw)) continue;

      final file = _localFileFromValue(raw);
      if (!await file.exists()) {
        throw Exception('Arquivo de imagem não encontrado para "$key": $raw');
      }

      final resp = await api.postMultipartFile(
        '/uploads/drive',
        filePath: file.path,
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
      final cleanUrl = url.trim();
      payload[key] = cleanUrl;
      uploaded[key] = cleanUrl;
    }
    return uploaded;
  }

  Future<void> _reconcileLegacyAbastecimentoUpdate(
      Map<String, dynamic> payload, dynamic originalLocal) async {
    final id = (payload['id_abastecimento'] ?? '').toString().trim();
    if (id.isEmpty) return;

    final hasLegacyLocal = _isLegacyLocal(originalLocal);
    final hasLegacyVehicleId = _isLegacyNumericId(payload['id_veiculo']);
    final hasLegacyOwnerId = _isLegacyNumericId(payload['id_proprietario']);
    final hasLegacyDriverId = _isLegacyNumericId(payload['id_motorista']);
    if (!hasLegacyLocal &&
        !hasLegacyVehicleId &&
        !hasLegacyOwnerId &&
        !hasLegacyDriverId) {
      return;
    }

    try {
      final current = await api.get('/abastecimentos/$id');
      if (current is! Map) return;
      final remote = Map<String, dynamic>.from(current);

      for (final key in [
        'id_veiculo',
        'id_proprietario',
        'id_motorista',
        'nome_proprietario',
        'nome_motorista',
      ]) {
        final value = remote[key];
        if (value != null && value.toString().trim().isNotEmpty) {
          payload[key] = value;
        }
      }
      payload['local'] = _normalizeLocal(remote['local'] ?? payload['local']);
    } on ApiException catch (e) {
      if (e.statusCode == 401) rethrow;
      _stripLegacyForeignKeys(payload);
    }
  }

  void _stripLegacyForeignKeys(Map<String, dynamic> payload) {
    for (final key in ['id_veiculo', 'id_proprietario', 'id_motorista']) {
      if (_isLegacyNumericId(payload[key])) {
        payload.remove(key);
      }
    }
  }

  String _normalizeLocal(dynamic value) {
    final local = value?.toString().trim();
    if (local == null || local.isEmpty) return 'Matriz';
    if (local.toLowerCase() == 'garagem' ||
        local.toLowerCase() == 'cariacica') {
      return 'Matriz';
    }
    if (local.toLowerCase() == 'garagem viana') return 'Viana';
    return local;
  }

  bool _isLegacyLocal(dynamic value) {
    final local = value?.toString().trim().toLowerCase();
    return local == 'garagem' ||
        local == 'garagem viana' ||
        local == 'cariacica';
  }

  bool _isLegacyNumericId(dynamic value) {
    final text = value?.toString().trim();
    if (text == null || text.isEmpty) return false;
    return RegExp(r'^\d+$').hasMatch(text);
  }

  bool _isRemoteUrl(String value) {
    final v = value.trim().toLowerCase();
    return v.startsWith('http://') || v.startsWith('https://');
  }

  File _localFileFromValue(String value) {
    final raw = value.trim();
    final uri = Uri.tryParse(raw);
    if (uri != null && uri.scheme == 'file') {
      return File.fromUri(uri);
    }
    return File(raw);
  }

  Future<Object?> _crud(
    String path,
    SyncItem item, {
    Map<String, dynamic>? payloadOverride,
  }) async {
    final payload = payloadOverride ?? item.payload;
    if (item.action == 'create') {
      final resp = await api.post(path, {
        ...payload,
        '_client_request_id': item.uuid ?? 'queue-${item.id}',
      });
      if (resp is Map) {
        for (final k in [
          'id',
          'id_proprietario',
          'id_veiculo',
          'id_motorista',
          'id_valor',
          'id_usuario',
          'id_user'
        ]) {
          if (resp[k] != null) return resp[k];
        }
      }
      return null;
    }
    if (item.action == 'update' && item.remoteId != null) {
      await api.put('$path/${item.remoteId}', payload);
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
