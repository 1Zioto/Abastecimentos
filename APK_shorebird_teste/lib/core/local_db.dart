import 'dart:convert';
import 'dart:math';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite/sqflite.dart';

import 'models.dart';

/// Banco local SQLite - cache dos cadastros e fila de sincronizacao.
///
/// Tabelas:
///  - proprietarios, veiculos, motoristas, valores_combustivel, abastecimentos
///  - usuarios (cache leitura para admin)
///  - sync_queue (operacoes pendentes: create/update/delete)
class LocalDb {
  static const _dbName = 'abastecimento_vipe.db';
  static const _dbVersion = 11;

  Database? _db;

  Future<Database> get db async {
    if (_db != null) return _db!;
    final dir = await getApplicationDocumentsDirectory();
    final path = p.join(dir.path, _dbName);
    _db = await openDatabase(
      path,
      version: _dbVersion,
      onCreate: _onCreate,
      onUpgrade: _onUpgrade,
    );
    return _db!;
  }

  Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    if (oldVersion < 2) {
      for (final t in [
        'proprietarios',
        'veiculos',
        'motoristas',
        'valores_combustivel',
        'usuarios',
      ]) {
        try {
          await db.execute(
              'ALTER TABLE $t ADD COLUMN pending_sync INTEGER NOT NULL DEFAULT 0');
        } catch (_) {
          // coluna ja pode existir
        }
      }
    }
    if (oldVersion < 3) {
      for (final sql in [
        'ALTER TABLE abastecimentos ADD COLUMN foto_odometro TEXT',
        'ALTER TABLE abastecimentos ADD COLUMN bomba TEXT',
        'ALTER TABLE abastecimentos ADD COLUMN anexo TEXT',
        'ALTER TABLE abastecimentos ADD COLUMN baixa_abastecimento INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE abastecimentos ADD COLUMN data_baixa TEXT',
      ]) {
        try {
          await db.execute(sql);
        } catch (_) {
          // coluna ja pode existir
        }
      }
    }
    if (oldVersion < 4) {
      await _migrateEntityIdsToText(db);
    }
    if (oldVersion < 5) {
      for (final sql in [
        'ALTER TABLE proprietarios ADD COLUMN local TEXT',
        'ALTER TABLE veiculos ADD COLUMN local TEXT',
        'ALTER TABLE motoristas ADD COLUMN local TEXT',
      ]) {
        try {
          await db.execute(sql);
        } catch (_) {
          // coluna ja pode existir
        }
      }
    }
    if (oldVersion < 6) {
      try {
        await db.execute('ALTER TABLE motoristas ADD COLUMN apelido TEXT');
      } catch (_) {
        // coluna ja pode existir
      }
    }
    if (oldVersion < 7) {
      for (final table in ['veiculos', 'motoristas', 'usuarios']) {
        try {
          await db.execute(
              "ALTER TABLE $table ADD COLUMN status TEXT DEFAULT 'Ativo'");
        } catch (_) {}
      }
      for (final table in [
        'proprietarios',
        'veiculos',
        'motoristas',
        'usuarios',
        'abastecimentos',
      ]) {
        for (final sql in [
          'ALTER TABLE $table ADD COLUMN deleted_at TEXT',
          'ALTER TABLE $table ADD COLUMN deleted_by TEXT',
        ]) {
          try {
            await db.execute(sql);
          } catch (_) {}
        }
      }
    }
    if (oldVersion < 8) {
      try {
        await db.execute(
            'ALTER TABLE proprietarios ADD COLUMN odometro_obrigatorio INTEGER NOT NULL DEFAULT 0');
      } catch (_) {}
    }
    if (oldVersion < 9) {
      await _migrateUsuariosToTextIds(db);
    }
    if (oldVersion < 10) {
      await _migrateValoresCombustivelToTextIds(db);
    }
    if (oldVersion < 11) {
      for (final sql in [
        'ALTER TABLE abastecimentos ADD COLUMN imagem_verificada_por_id TEXT',
        'ALTER TABLE abastecimentos ADD COLUMN imagem_verificada_por TEXT',
        'ALTER TABLE abastecimentos ADD COLUMN imagem_verificada_em TEXT',
      ]) {
        try {
          await db.execute(sql);
        } catch (_) {}
      }
    }
  }

  Future<void> _migrateValoresCombustivelToTextIds(Database db) async {
    List<Map<String, Object?>> backup = const [];
    try {
      backup = await db.query('valores_combustivel');
    } catch (_) {}
    await db.execute('DROP TABLE IF EXISTS valores_combustivel');
    await _createValoresCombustivelTable(db);
    try {
      await db.execute(
          'CREATE INDEX idx_valores_tipo ON valores_combustivel(tipo_combustivel, data);');
    } catch (_) {}
    for (final row in backup) {
      await db.insert(
        'valores_combustivel',
        {
          ...row,
          'id_valor': row['id_valor']?.toString(),
          'local': row['local']?.toString() ?? 'Matriz',
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
  }

  Future<void> _migrateUsuariosToTextIds(Database db) async {
    List<Map<String, Object?>> backup = const [];
    try {
      backup = await db.query('usuarios');
    } catch (_) {}
    await db.execute('DROP TABLE IF EXISTS usuarios');
    await _createUsuariosTable(db);
    for (final row in backup) {
      final id = row['id_usuario']?.toString();
      await db.insert(
        'usuarios',
        {
          ...row,
          'id_usuario': id,
          'filiais_acesso':
              row['filiais_acesso']?.toString() ?? '["Matriz","Viana"]',
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
  }

  Future<void> _migrateEntityIdsToText(Database db) async {
    final tables = [
      'proprietarios',
      'veiculos',
      'motoristas',
      'valores_combustivel',
      'abastecimentos',
      'usuarios',
      'sync_queue',
    ];
    final backups = <String, List<Map<String, Object?>>>{};
    for (final table in tables) {
      try {
        backups[table] = await db.query(table);
      } catch (_) {
        backups[table] = const [];
      }
    }

    await db.transaction((txn) async {
      for (final table in tables) {
        await txn.execute('DROP TABLE IF EXISTS $table');
      }
    });
    await _onCreate(db, 4);
    await db.transaction((txn) async {
      for (final table in tables) {
        for (final row in backups[table] ?? const <Map<String, Object?>>[]) {
          await txn.insert(table, row,
              conflictAlgorithm: ConflictAlgorithm.replace);
        }
      }
    });
  }

  Future<void> _onCreate(Database db, int v) async {
    await db.execute('''
      CREATE TABLE proprietarios (
        id_proprietario TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativo',
        responsavel TEXT,
        celular TEXT,
        observacao TEXT,
        data_registro TEXT,
        local TEXT,
        odometro_obrigatorio INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        deleted_by TEXT,
        pending_sync INTEGER NOT NULL DEFAULT 0
      );
    ''');

    await db.execute('''
      CREATE TABLE veiculos (
        id_veiculo TEXT PRIMARY KEY,
        placa TEXT NOT NULL,
        marca TEXT,
        modelo TEXT,
        ano INTEGER,
        tipo_combustivel TEXT,
        numero_chassi TEXT,
        id_proprietario TEXT,
        odometro REAL,
        renavam TEXT,
        cor TEXT,
        foto TEXT,
        local TEXT,
        status TEXT DEFAULT 'Ativo',
        deleted_at TEXT,
        deleted_by TEXT,
        proprietario_nome TEXT,
        pending_sync INTEGER NOT NULL DEFAULT 0
      );
    ''');
    await db.execute(
        'CREATE INDEX idx_veiculos_prop ON veiculos(id_proprietario);');

    await db.execute('''
      CREATE TABLE motoristas (
        id_motorista TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        apelido TEXT,
        id_proprietario TEXT,
        documento TEXT,
        celular TEXT,
        local TEXT,
        status TEXT DEFAULT 'Ativo',
        deleted_at TEXT,
        deleted_by TEXT,
        proprietario_nome TEXT,
        pending_sync INTEGER NOT NULL DEFAULT 0
      );
    ''');
    await db
        .execute('CREATE INDEX idx_mot_prop ON motoristas(id_proprietario);');

    await _createValoresCombustivelTable(db);
    await db.execute(
        'CREATE INDEX idx_valores_tipo ON valores_combustivel(tipo_combustivel, data);');

    await db.execute('''
      CREATE TABLE abastecimentos (
        local_uuid TEXT PRIMARY KEY,
        id_abastecimento TEXT,
        data TEXT,
        data_hora TEXT,
        id_veiculo TEXT,
        id_proprietario TEXT,
        id_motorista TEXT,
        tipo_combustivel TEXT,
        quantidade_litros REAL,
        valor_por_litro REAL,
        valor_total REAL,
        odometro REAL,
        local TEXT,
        status TEXT,
        responsavel TEXT,
        observacao TEXT,
        deleted_at TEXT,
        deleted_by TEXT,
        nota_fiscal TEXT,
        data_pagamento TEXT,
        nfe_emissao TEXT,
        foto_odometro TEXT,
        bomba TEXT,
        anexo TEXT,
        imagem_verificada_por_id TEXT,
        imagem_verificada_por TEXT,
        imagem_verificada_em TEXT,
        baixa_abastecimento INTEGER NOT NULL DEFAULT 0,
        data_baixa TEXT,
        veiculo_placa TEXT,
        proprietario_nome TEXT,
        motorista_nome TEXT,
        pending_sync INTEGER NOT NULL DEFAULT 0
      );
    ''');
    await db.execute(
        'CREATE INDEX idx_abast_remote ON abastecimentos(id_abastecimento);');
    await db.execute('CREATE INDEX idx_abast_data ON abastecimentos(data);');
    await db.execute(
        'CREATE INDEX idx_abast_prop ON abastecimentos(id_proprietario);');

    await _createUsuariosTable(db);

    await db.execute('''
      CREATE TABLE sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL,       -- abastecimento, proprietario, veiculo, motorista, valor
        action TEXT NOT NULL,       -- create, update, delete, baixa_lote
        entity_uuid TEXT,
        entity_remote_id TEXT,
        payload TEXT NOT NULL,      -- JSON
        last_error TEXT,
        created_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0
      );
    ''');
  }

  Future<void> _createUsuariosTable(Database db) async {
    await db.execute('''
      CREATE TABLE usuarios (
        id_usuario TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        login TEXT NOT NULL,
        tipo TEXT NOT NULL,
        email TEXT,
        filiais_acesso TEXT,
        status TEXT DEFAULT 'Ativo',
        deleted_at TEXT,
        deleted_by TEXT,
        pending_sync INTEGER NOT NULL DEFAULT 0
      );
    ''');
  }

  Future<void> _createValoresCombustivelTable(Database db) async {
    await db.execute('''
      CREATE TABLE valores_combustivel (
        id_valor TEXT PRIMARY KEY,
        tipo_combustivel TEXT NOT NULL,
        valor REAL NOT NULL,
        data TEXT NOT NULL,
        responsavel TEXT,
        local TEXT DEFAULT 'Matriz',
        pending_sync INTEGER NOT NULL DEFAULT 0
      );
    ''');
  }

  // ===== helpers =====
  String newUuid() {
    final r = Random();
    String hex(int length) =>
        List.generate(length, (_) => r.nextInt(16).toRadixString(16)).join();
    return '${hex(8)}-${hex(4)}-4${hex(3)}-'
        '${(8 + r.nextInt(4)).toRadixString(16)}${hex(3)}-${hex(12)}';
  }

  Map<String, dynamic> _clean(Map<String, dynamic> m) {
    final out = <String, dynamic>{};
    m.forEach((k, v) {
      if (v == null) return;
      if (v is bool) {
        out[k] = v ? 1 : 0;
      } else if (v is Map || v is List) {
        // ignore (campos de join)
      } else {
        out[k] = v;
      }
    });
    return out;
  }

  Map<String, dynamic> _usuarioRow(Usuario u, {required Object id}) {
    final json = u.toJson();
    json.remove('id_user');
    return _clean({
      ...json,
      'id_usuario': id.toString(),
      'filiais_acesso': jsonEncode(u.filiaisAcesso),
    });
  }

  /// Contador monotonico decrescente persistido em SharedPreferences.
  /// Garante ids locais unicos mesmo que duas chamadas ocorram no mesmo
  /// microssegundo (saveXxxLocal em paralelo). Inicia em -1 e decrementa.
  static const _tempIdCounterKey = 'local_temp_id_counter_v1';
  static const _syncLogKey = 'sync_logs_v1';
  static const _syncLogMax = 300;
  static const _syncTokenPrefix = 'sync_token_v1_';

  Future<int> _newTempIdAsync() async {
    final prefs = await SharedPreferences.getInstance();
    final current = prefs.getInt(_tempIdCounterKey) ?? 0;
    final next = current - 1; // sempre negativo, monotonicamente decrescente
    await prefs.setInt(_tempIdCounterKey, next);
    return next;
  }

  Future<String> _newTempStringIdAsync() async {
    return 'local_${await _newTempIdAsync()}';
  }

  // ===== proprietarios =====
  Future<void> replaceProprietarios(List<Proprietario> items) async {
    final d = await db;
    await d.transaction((txn) async {
      await txn.delete('proprietarios', where: 'pending_sync = 0');
      for (final p in items) {
        final row = _clean(p.toJson())..['pending_sync'] = 0;
        await txn.insert('proprietarios', row,
            conflictAlgorithm: ConflictAlgorithm.replace);
      }
    });
  }

  Future<void> upsertProprietariosRemotos(List<Proprietario> items) async {
    if (items.isEmpty) return;
    final d = await db;
    await d.transaction((txn) async {
      for (final p in items) {
        final id = p.idProprietario;
        if (id == null) continue;
        final existing = await txn.query(
          'proprietarios',
          columns: ['pending_sync'],
          where: 'id_proprietario = ?',
          whereArgs: [id],
          limit: 1,
        );
        if (existing.isNotEmpty &&
            (existing.first['pending_sync'] as int? ?? 0) == 1) {
          continue;
        }
        final row = _clean(p.toJson())..['pending_sync'] = 0;
        await txn.insert('proprietarios', row,
            conflictAlgorithm: ConflictAlgorithm.replace);
      }
    });
  }

  Future<List<Proprietario>> listProprietarios(
      {String? search, String? local}) async {
    final d = await db;
    final where = <String>[];
    final args = <Object?>[];
    where.add("(status IS NULL OR UPPER(status) <> 'INATIVO')");
    where.add('deleted_at IS NULL');
    if (search != null && search.isNotEmpty) {
      where.add('nome LIKE ?');
      args.add('%$search%');
    }
    if (local != null && local.isNotEmpty) {
      where.add('local = ?');
      args.add(local);
    }
    final rows = await d.query(
      'proprietarios',
      where: where.isEmpty ? null : where.join(' AND '),
      whereArgs: args.isEmpty ? null : args,
      orderBy: 'nome COLLATE NOCASE',
    );
    return rows
        .map((e) => Proprietario.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<Proprietario?> findProprietario(String id) async {
    final d = await db;
    final rows = await d.query('proprietarios',
        where: 'id_proprietario = ?', whereArgs: [id], limit: 1);
    if (rows.isEmpty) return null;
    return Proprietario.fromJson(Map<String, dynamic>.from(rows.first));
  }

  Future<String?> inferLocalForProprietario(String idProprietario) async {
    final id = idProprietario.trim();
    if (id.isEmpty) return null;
    final d = await db;

    for (final table in const ['veiculos', 'motoristas', 'abastecimentos']) {
      final rows = await d.query(
        table,
        columns: ['local'],
        where:
            "id_proprietario = ? AND local IS NOT NULL AND TRIM(local) <> ''",
        whereArgs: [id],
        limit: 1,
      );
      if (rows.isNotEmpty) {
        final local = rows.first['local']?.toString().trim();
        if (local != null && local.isNotEmpty) return local;
      }
    }
    return null;
  }

  // ===== veiculos =====
  Future<void> replaceVeiculos(List<Veiculo> items) async {
    final d = await db;
    await d.transaction((txn) async {
      await txn.delete('veiculos', where: 'pending_sync = 0');
      for (final v in items) {
        final m = _clean(v.toJson());
        if (v.proprietarioNome != null) {
          m['proprietario_nome'] = v.proprietarioNome;
        }
        m['pending_sync'] = 0;
        await txn.insert('veiculos', m,
            conflictAlgorithm: ConflictAlgorithm.replace);
      }
    });
  }

  Future<void> upsertVeiculosRemotos(List<Veiculo> items) async {
    if (items.isEmpty) return;
    final d = await db;
    await d.transaction((txn) async {
      for (final v in items) {
        final id = v.idVeiculo;
        if (id == null) continue;
        final existing = await txn.query(
          'veiculos',
          columns: ['pending_sync'],
          where: 'id_veiculo = ?',
          whereArgs: [id],
          limit: 1,
        );
        if (existing.isNotEmpty &&
            (existing.first['pending_sync'] as int? ?? 0) == 1) {
          continue;
        }

        final row = _clean(v.toJson());
        if (v.proprietarioNome != null) {
          row['proprietario_nome'] = v.proprietarioNome;
        }
        row['pending_sync'] = 0;

        await txn.insert('veiculos', row,
            conflictAlgorithm: ConflictAlgorithm.replace);
      }
    });
  }

  Future<List<Veiculo>> listVeiculos(
      {String? idProprietario, String? search, String? local}) async {
    final d = await db;
    final where = <String>[];
    final args = <Object?>[];
    where.add("(status IS NULL OR UPPER(status) <> 'INATIVO')");
    where.add('deleted_at IS NULL');
    if (idProprietario != null) {
      where.add('id_proprietario = ?');
      args.add(idProprietario);
    }
    if (search != null && search.isNotEmpty) {
      where.add('(placa LIKE ? OR modelo LIKE ? OR marca LIKE ?)');
      args.addAll(['%$search%', '%$search%', '%$search%']);
    }
    if (local != null && local.isNotEmpty) {
      where.add('local = ?');
      args.add(local);
    }
    final rows = await d.query(
      'veiculos',
      where: where.isEmpty ? null : where.join(' AND '),
      whereArgs: args.isEmpty ? null : args,
      orderBy: 'placa COLLATE NOCASE',
    );
    return rows
        .map((e) => Veiculo.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<Veiculo?> findVeiculo(String id) async {
    final d = await db;
    final rows = await d.query('veiculos',
        where: 'id_veiculo = ?', whereArgs: [id], limit: 1);
    if (rows.isEmpty) return null;
    return Veiculo.fromJson(Map<String, dynamic>.from(rows.first));
  }

  Future<Motorista?> findMotorista(String id) async {
    final d = await db;
    final rows = await d.query('motoristas',
        where: 'id_motorista = ?', whereArgs: [id], limit: 1);
    if (rows.isEmpty) return null;
    return Motorista.fromJson(Map<String, dynamic>.from(rows.first));
  }

  Future<double?> maxOdometro(String idVeiculo,
      {String? ignoreAbastecimentoId}) async {
    final d = await db;
    final rows = await d.rawQuery(
        ignoreAbastecimentoId == null
            ? 'SELECT MAX(odometro) AS m FROM abastecimentos WHERE id_veiculo = ? AND odometro IS NOT NULL'
            : 'SELECT MAX(odometro) AS m FROM abastecimentos WHERE id_veiculo = ? AND odometro IS NOT NULL AND id_abastecimento != ?',
        ignoreAbastecimentoId == null
            ? [idVeiculo]
            : [idVeiculo, ignoreAbastecimentoId]);
    if (rows.isEmpty || rows.first['m'] == null) {
      if (ignoreAbastecimentoId != null) return null;
      final v = await findVeiculo(idVeiculo);
      return v?.odometro;
    }
    final v = rows.first['m'];
    return v is num ? v.toDouble() : null;
  }

  // ===== motoristas =====
  Future<void> replaceMotoristas(List<Motorista> items) async {
    final d = await db;
    await d.transaction((txn) async {
      await txn.delete('motoristas', where: 'pending_sync = 0');
      for (final m in items) {
        final row = _clean(m.toJson());
        if (m.proprietarioNome != null) {
          row['proprietario_nome'] = m.proprietarioNome;
        }
        row['pending_sync'] = 0;
        await txn.insert('motoristas', row,
            conflictAlgorithm: ConflictAlgorithm.replace);
      }
    });
  }

  Future<void> upsertMotoristasRemotos(List<Motorista> items) async {
    if (items.isEmpty) return;
    final d = await db;
    await d.transaction((txn) async {
      for (final m in items) {
        final id = m.idMotorista;
        if (id == null) continue;
        final existing = await txn.query(
          'motoristas',
          columns: ['pending_sync'],
          where: 'id_motorista = ?',
          whereArgs: [id],
          limit: 1,
        );
        if (existing.isNotEmpty &&
            (existing.first['pending_sync'] as int? ?? 0) == 1) {
          continue;
        }

        final row = _clean(m.toJson());
        if (m.proprietarioNome != null) {
          row['proprietario_nome'] = m.proprietarioNome;
        }
        row['pending_sync'] = 0;

        await txn.insert('motoristas', row,
            conflictAlgorithm: ConflictAlgorithm.replace);
      }
    });
  }

  Future<List<Motorista>> listMotoristas(
      {String? idProprietario, String? search, String? local}) async {
    final d = await db;
    final where = <String>[];
    final args = <Object?>[];
    where.add("(status IS NULL OR UPPER(status) <> 'INATIVO')");
    where.add('deleted_at IS NULL');
    if (idProprietario != null) {
      where.add('id_proprietario = ?');
      args.add(idProprietario);
    }
    if (search != null && search.isNotEmpty) {
      where.add('(nome LIKE ? OR apelido LIKE ? OR documento LIKE ?)');
      args.addAll(['%$search%', '%$search%', '%$search%']);
    }
    if (local != null && local.isNotEmpty) {
      where.add('local = ?');
      args.add(local);
    }
    final rows = await d.query(
      'motoristas',
      where: where.isEmpty ? null : where.join(' AND '),
      whereArgs: args.isEmpty ? null : args,
      orderBy: 'nome COLLATE NOCASE',
    );
    return rows
        .map((e) => Motorista.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  // ===== valores combustivel =====
  Future<void> replaceValoresCombustivel(List<ValorCombustivel> items) async {
    final d = await db;
    await d.transaction((txn) async {
      await txn.delete('valores_combustivel', where: 'pending_sync = 0');
      for (final v in items) {
        final row = _clean(v.toJson())..['pending_sync'] = 0;
        await txn.insert('valores_combustivel', row,
            conflictAlgorithm: ConflictAlgorithm.replace);
      }
    });
  }

  Future<void> upsertValoresCombustivelRemotos(
      List<ValorCombustivel> items) async {
    if (items.isEmpty) return;
    final d = await db;
    await d.transaction((txn) async {
      for (final v in items) {
        final id = v.idValor;
        if (id == null) continue;
        final existing = await txn.query(
          'valores_combustivel',
          columns: ['pending_sync'],
          where: 'id_valor = ?',
          whereArgs: [id],
          limit: 1,
        );
        if (existing.isNotEmpty &&
            (existing.first['pending_sync'] as int? ?? 0) == 1) {
          continue;
        }
        final row = _clean(v.toJson())..['pending_sync'] = 0;
        await txn.insert('valores_combustivel', row,
            conflictAlgorithm: ConflictAlgorithm.replace);
      }
    });
  }

  Future<List<ValorCombustivel>> listValoresCombustivel({String? local}) async {
    final d = await db;
    final where = <String>[];
    final args = <Object?>[];
    if (local != null && local.isNotEmpty) {
      where.add('local = ?');
      args.add(local);
    }
    final rows = await d.query(
      'valores_combustivel',
      where: where.isEmpty ? null : where.join(' AND '),
      whereArgs: args.isEmpty ? null : args,
      orderBy: 'data DESC, id_valor DESC',
    );
    return rows
        .map((e) => ValorCombustivel.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  /// Valor vigente (mais recente) por tipo de combustivel.
  Future<double?> precoAtual(String tipo, {String? local}) async {
    final d = await db;
    final where = <String>['tipo_combustivel = ?'];
    final args = <Object?>[tipo];
    if (local != null && local.isNotEmpty) {
      where.add('local = ?');
      args.add(local);
    }
    final rows = await d.query(
      'valores_combustivel',
      where: where.join(' AND '),
      whereArgs: args,
      orderBy: 'data DESC, id_valor DESC',
      limit: 1,
    );
    if (rows.isEmpty) return null;
    final v = rows.first['valor'];
    return v is num ? v.toDouble() : null;
  }

  // ===== abastecimentos =====
  Map<String, dynamic> _abastecimentoRow(Abastecimento a, String uuid) {
    final row = <String, dynamic>{
      'local_uuid': uuid,
      'id_abastecimento': a.idAbastecimento,
      'data': a.data,
      'data_hora': a.dataHora,
      'id_veiculo': a.idVeiculo,
      'id_proprietario': a.idProprietario,
      'id_motorista': a.idMotorista,
      'tipo_combustivel': a.tipoCombustivel,
      'quantidade_litros': a.quantidadeLitros,
      'valor_por_litro': a.valorPorLitro,
      'valor_total': a.valorTotal,
      'odometro': a.odometro,
      'local': a.local,
      'status': a.status,
      'responsavel': a.responsavel,
      'observacao': a.observacao,
      'nota_fiscal': a.notaFiscal,
      'data_pagamento': a.dataPagamento,
      'nfe_emissao': a.nfeEmissao,
      'foto_odometro': a.fotoOdometro,
      'bomba': a.bomba,
      'anexo': a.anexo,
      'imagem_verificada_por_id': a.imagemVerificadaPorId,
      'imagem_verificada_por': a.imagemVerificadaPor,
      'imagem_verificada_em': a.imagemVerificadaEm,
      'baixa_abastecimento': a.baixaAbastecimento ? 1 : 0,
      'data_baixa': a.dataBaixa,
      'veiculo_placa': a.veiculoPlaca,
      'proprietario_nome': a.proprietarioNome,
      'motorista_nome': a.motoristaNome,
      'pending_sync': 0,
    };
    row.removeWhere((k, v) => v == null);
    return row;
  }

  Future<int> countAbastecimentos() async {
    final d = await db;
    final rows = await d.rawQuery('SELECT COUNT(*) as c FROM abastecimentos');
    return (rows.first['c'] as num?)?.toInt() ?? 0;
  }

  Future<void> replaceAbastecimentosRemotos(List<Abastecimento> items) async {
    final d = await db;
    await d.transaction((txn) async {
      // remove apenas os ja sincronizados (preserva pendentes offline)
      await txn.delete('abastecimentos', where: 'pending_sync = 0');
      for (final a in items) {
        final uuid = 'rem_${a.idAbastecimento ?? newUuid()}';
        final row = _abastecimentoRow(a, uuid);
        await txn.insert('abastecimentos', row,
            conflictAlgorithm: ConflictAlgorithm.replace);
      }
    });
  }

  Future<void> upsertAbastecimentosRemotos(List<Abastecimento> items) async {
    if (items.isEmpty) return;
    final d = await db;
    await d.transaction((txn) async {
      for (final a in items) {
        final id = (a.idAbastecimento ?? '').trim();
        if (id.isEmpty) continue;
        final existing = await txn.query(
          'abastecimentos',
          columns: ['local_uuid', 'pending_sync'],
          where: 'id_abastecimento = ?',
          whereArgs: [id],
          limit: 1,
        );

        if (existing.isNotEmpty) {
          final existingRow = existing.first;
          final pending = (existingRow['pending_sync'] as int? ?? 0) == 1;
          if (pending) continue;

          final uuid = (existingRow['local_uuid'] as String?) ?? 'rem_$id';
          final row = _abastecimentoRow(a, uuid);
          await txn.update(
            'abastecimentos',
            row,
            where: 'local_uuid = ?',
            whereArgs: [uuid],
          );
          continue;
        }

        final row = _abastecimentoRow(a, 'rem_$id');
        await txn.insert('abastecimentos', row,
            conflictAlgorithm: ConflictAlgorithm.replace);
      }
    });
  }

  /// Insere abastecimento criado offline. Marca pending_sync=1
  /// e enfileira em sync_queue.
  Future<String> insertAbastecimentoLocal(Abastecimento a) async {
    final d = await db;
    final uuid = a.localUuid ?? newUuid();
    final remoteId = a.idAbastecimento ?? uuid;
    final row = <String, dynamic>{
      'local_uuid': uuid,
      'id_abastecimento': remoteId,
      'data': a.data,
      'data_hora': a.dataHora,
      'id_veiculo': a.idVeiculo,
      'id_proprietario': a.idProprietario,
      'id_motorista': a.idMotorista,
      'tipo_combustivel': a.tipoCombustivel,
      'quantidade_litros': a.quantidadeLitros,
      'valor_por_litro': a.valorPorLitro,
      'valor_total': a.valorTotal,
      'odometro': a.odometro,
      'local': a.local,
      'status': a.status,
      'responsavel': a.responsavel,
      'observacao': a.observacao,
      'nota_fiscal': a.notaFiscal,
      'data_pagamento': a.dataPagamento,
      'nfe_emissao': a.nfeEmissao,
      'foto_odometro': a.fotoOdometro,
      'bomba': a.bomba,
      'anexo': a.anexo,
      'imagem_verificada_por_id': a.imagemVerificadaPorId,
      'imagem_verificada_por': a.imagemVerificadaPor,
      'imagem_verificada_em': a.imagemVerificadaEm,
      'baixa_abastecimento': a.baixaAbastecimento ? 1 : 0,
      'data_baixa': a.dataBaixa,
      'veiculo_placa': a.veiculoPlaca,
      'proprietario_nome': a.proprietarioNome,
      'motorista_nome': a.motoristaNome,
      'pending_sync': 1,
    };
    row.removeWhere((k, v) => v == null);
    await d.insert('abastecimentos', row,
        conflictAlgorithm: ConflictAlgorithm.replace);

    // enfileira
    final payload = {
      ...a.toJson(),
      'id_abastecimento': remoteId,
      '_client_request_id': uuid,
    };
    await enqueue(
      entity: 'abastecimento',
      action: 'create',
      uuid: uuid,
      payload: payload,
    );
    return uuid;
  }

  /// Atualiza abastecimento local.
  /// - Se ainda nao sincronizado (acao create existente), apenas atualiza o payload da fila.
  /// - Se ja sincronizado, marca pending_sync=1 e enfileira update.
  Future<void> updateAbastecimentoLocal(Abastecimento a) async {
    final d = await db;
    final uuid = a.localUuid ?? 'rem_${a.idAbastecimento ?? newUuid()}';

    final row = <String, dynamic>{
      'local_uuid': uuid,
      'id_abastecimento': a.idAbastecimento,
      'data': a.data,
      'data_hora': a.dataHora,
      'id_veiculo': a.idVeiculo,
      'id_proprietario': a.idProprietario,
      'id_motorista': a.idMotorista,
      'tipo_combustivel': a.tipoCombustivel,
      'quantidade_litros': a.quantidadeLitros,
      'valor_por_litro': a.valorPorLitro,
      'valor_total': a.valorTotal,
      'odometro': a.odometro,
      'local': a.local,
      'status': a.status,
      'responsavel': a.responsavel,
      'observacao': a.observacao,
      'nota_fiscal': a.notaFiscal,
      'data_pagamento': a.dataPagamento,
      'nfe_emissao': a.nfeEmissao,
      'foto_odometro': a.fotoOdometro,
      'bomba': a.bomba,
      'anexo': a.anexo,
      'imagem_verificada_por_id': a.imagemVerificadaPorId,
      'imagem_verificada_por': a.imagemVerificadaPor,
      'imagem_verificada_em': a.imagemVerificadaEm,
      'baixa_abastecimento': a.baixaAbastecimento ? 1 : 0,
      'data_baixa': a.dataBaixa,
      'veiculo_placa': a.veiculoPlaca,
      'proprietario_nome': a.proprietarioNome,
      'motorista_nome': a.motoristaNome,
      'pending_sync': 1,
    };
    row.removeWhere((k, v) => v == null);

    await d.insert('abastecimentos', row,
        conflictAlgorithm: ConflictAlgorithm.replace);

    final payload = a.toJson();
    final existingCreate = await d.query(
      'sync_queue',
      where: 'entity = ? AND action = ? AND entity_uuid = ?',
      whereArgs: ['abastecimento', 'create', uuid],
      limit: 1,
    );

    if (existingCreate.isNotEmpty) {
      final queueId = existingCreate.first['id'] as int;
      await d.update(
        'sync_queue',
        {
          'payload': jsonEncode(payload),
          'last_error': null,
        },
        where: 'id = ?',
        whereArgs: [queueId],
      );
      return;
    }

    if (a.idAbastecimento != null && a.idAbastecimento!.trim().isNotEmpty) {
      await enqueue(
        entity: 'abastecimento',
        action: 'update',
        uuid: uuid,
        remoteId: null,
        payload: payload,
      );
    }
  }

  Future<void> deleteAbastecimentoLocal(String id,
      {bool enqueueSync = true}) async {
    final d = await db;
    await d.transaction((txn) async {
      await txn.delete('abastecimentos',
          where: 'id_abastecimento = ? OR local_uuid = ?', whereArgs: [id, id]);
      await txn.delete(
        'sync_queue',
        where: 'entity = ? AND entity_uuid = ? AND action = ?',
        whereArgs: ['abastecimento', id, 'create'],
      );
    });

    if (enqueueSync) {
      await enqueue(
        entity: 'abastecimento',
        action: 'delete',
        remoteId: id,
        payload: {'id_abastecimento': id},
      );
    }
  }

  Future<void> applyEntradaNotasLocal({
    required List<String> uuids,
    required String notaFiscal,
    required String nfeEmissao,
  }) async {
    if (uuids.isEmpty) return;
    final d = await db;
    final placeholders = List.filled(uuids.length, '?').join(',');
    await d.rawUpdate(
      'UPDATE abastecimentos SET nota_fiscal = ?, nfe_emissao = ? WHERE local_uuid IN ($placeholders)',
      [notaFiscal, nfeEmissao, ...uuids],
    );
  }

  Future<void> applyBaixaLocal({
    required List<String> uuids,
    required String dataPagamento,
    String? notaFiscal,
  }) async {
    if (uuids.isEmpty) return;
    final d = await db;
    final placeholders = List.filled(uuids.length, '?').join(',');
    if (notaFiscal != null && notaFiscal.trim().isNotEmpty) {
      await d.rawUpdate(
        'UPDATE abastecimentos SET baixa_abastecimento = 1, data_pagamento = ?, nota_fiscal = ? WHERE local_uuid IN ($placeholders)',
        [dataPagamento, notaFiscal.trim(), ...uuids],
      );
      return;
    }
    await d.rawUpdate(
      'UPDATE abastecimentos SET baixa_abastecimento = 1, data_pagamento = ? WHERE local_uuid IN ($placeholders)',
      [dataPagamento, ...uuids],
    );
  }

  Future<void> marcarAbastecimentoConsistenteLocal(
    String idAbastecimento, {
    String? verificadoPorId,
    String? verificadoPor,
    String? verificadoEm,
  }) async {
    final id = idAbastecimento.trim();
    if (id.isEmpty) return;
    final d = await db;
    final fields = <String, dynamic>{
      'status': 'Confirmado',
      'pending_sync': 0,
    };
    if ((verificadoPorId ?? '').trim().isNotEmpty) {
      fields['imagem_verificada_por_id'] = verificadoPorId!.trim();
    }
    if ((verificadoPor ?? '').trim().isNotEmpty) {
      fields['imagem_verificada_por'] = verificadoPor!.trim();
    }
    if ((verificadoEm ?? '').trim().isNotEmpty) {
      fields['imagem_verificada_em'] = verificadoEm!.trim();
    }
    await d.update(
      'abastecimentos',
      fields,
      where: 'id_abastecimento = ?',
      whereArgs: [id],
    );
  }

  Future<List<Abastecimento>> listAbastecimentos({
    String? idProprietario,
    String? idVeiculo,
    String? idMotorista,
    String? notaFiscal,
    String? placa,
    String? dataInicio,
    String? dataFim,
    String? status,
    String? tipoCombustivel,
    String? local,
    int limit = 200,
  }) async {
    final d = await db;
    final where = <String>[];
    final args = <Object?>[];
    where.add("(status IS NULL OR UPPER(status) <> 'INATIVO')");
    where.add('deleted_at IS NULL');
    if (idProprietario != null) {
      where.add('id_proprietario = ?');
      args.add(idProprietario);
    }
    if (idVeiculo != null) {
      where.add('id_veiculo = ?');
      args.add(idVeiculo);
    }
    if (idMotorista != null) {
      where.add('id_motorista = ?');
      args.add(idMotorista);
    }
    if (notaFiscal != null && notaFiscal.trim().isNotEmpty) {
      where.add('nota_fiscal = ?');
      args.add(notaFiscal.trim());
    }
    if (placa != null && placa.isNotEmpty) {
      where.add('veiculo_placa LIKE ?');
      args.add('%$placa%');
    }
    if (dataInicio != null && dataInicio.isNotEmpty) {
      where.add('data >= ?');
      args.add(dataInicio);
    }
    if (dataFim != null && dataFim.isNotEmpty) {
      where.add('data <= ?');
      args.add(dataFim);
    }
    if (status != null && status.isNotEmpty) {
      where.add('status = ?');
      args.add(status);
    }
    if (tipoCombustivel != null && tipoCombustivel.isNotEmpty) {
      where.add('tipo_combustivel = ?');
      args.add(tipoCombustivel);
    }
    if (local != null && local.isNotEmpty) {
      where.add('local = ?');
      args.add(local);
    }
    final rows = await d.query(
      'abastecimentos',
      where: where.isEmpty ? null : where.join(' AND '),
      whereArgs: args.isEmpty ? null : args,
      orderBy: 'data DESC, data_hora DESC',
      limit: limit,
    );
    return rows.map((e) {
      final m = Map<String, dynamic>.from(e);
      final a = Abastecimento.fromJson(m);
      return Abastecimento(
        idAbastecimento: a.idAbastecimento,
        data: a.data,
        dataHora: a.dataHora,
        idVeiculo: a.idVeiculo,
        idProprietario: a.idProprietario,
        idMotorista: a.idMotorista,
        tipoCombustivel: a.tipoCombustivel,
        quantidadeLitros: a.quantidadeLitros,
        valorPorLitro: a.valorPorLitro,
        valorTotal: a.valorTotal,
        odometro: a.odometro,
        local: a.local,
        status: a.status,
        responsavel: a.responsavel,
        observacao: a.observacao,
        notaFiscal: a.notaFiscal,
        dataPagamento: a.dataPagamento,
        nfeEmissao: a.nfeEmissao,
        fotoOdometro: m['foto_odometro'] as String?,
        bomba: m['bomba'] as String?,
        anexo: m['anexo'] as String?,
        imagemVerificadaPorId: m['imagem_verificada_por_id'] as String?,
        imagemVerificadaPor: m['imagem_verificada_por'] as String?,
        imagemVerificadaEm: m['imagem_verificada_em'] as String?,
        baixaAbastecimento: (m['baixa_abastecimento'] as int? ?? 0) == 1,
        dataBaixa: m['data_baixa'] as String?,
        veiculoPlaca: m['veiculo_placa'] as String?,
        proprietarioNome: m['proprietario_nome'] as String?,
        motoristaNome: m['motorista_nome'] as String?,
        localUuid: m['local_uuid'] as String?,
        pendingSync: (m['pending_sync'] as int? ?? 0) == 1,
      );
    }).toList();
  }

  // ===== usuarios =====
  Future<void> replaceUsuarios(List<Usuario> items) async {
    final d = await db;
    await d.transaction((txn) async {
      await txn.delete('usuarios', where: 'pending_sync = 0');
      for (final u in items) {
        final id = u.idUsuario;
        if (id == null) continue;
        final row = _usuarioRow(u, id: id)..['pending_sync'] = 0;
        await txn.insert('usuarios', row,
            conflictAlgorithm: ConflictAlgorithm.replace);
      }
    });
  }

  Future<void> upsertUsuariosRemotos(List<Usuario> items) async {
    if (items.isEmpty) return;
    final d = await db;
    await d.transaction((txn) async {
      for (final u in items) {
        final id = u.idUsuario;
        if (id == null) continue;
        final existing = await txn.query(
          'usuarios',
          columns: ['pending_sync'],
          where: 'id_usuario = ?',
          whereArgs: [id],
          limit: 1,
        );
        if (existing.isNotEmpty &&
            (existing.first['pending_sync'] as int? ?? 0) == 1) {
          continue;
        }
        final row = _usuarioRow(u, id: id)..['pending_sync'] = 0;
        await txn.insert('usuarios', row,
            conflictAlgorithm: ConflictAlgorithm.replace);
      }
    });
  }

  Future<List<Usuario>> listUsuarios() async {
    final d = await db;
    final rows = await d.query(
      'usuarios',
      where:
          "(status IS NULL OR UPPER(status) <> 'INATIVO') AND deleted_at IS NULL",
      orderBy: 'nome COLLATE NOCASE',
    );
    return rows
        .map((e) => Usuario.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  // ===== CRUD local + fila (offline-first) =====
  Future<String> saveProprietarioLocal(Proprietario p,
      {required bool isCreate, bool enqueueSync = true}) async {
    final d = await db;
    final id = p.idProprietario ?? await _newTempStringIdAsync();
    final row = _clean({
      ...p.toJson(),
      'id_proprietario': id,
      'pending_sync': 1,
    });
    await d.insert('proprietarios', row,
        conflictAlgorithm: ConflictAlgorithm.replace);

    if (enqueueSync) {
      final payload = p.toJson()..remove('id_proprietario');
      await enqueue(
        entity: 'proprietario',
        action: isCreate ? 'create' : 'update',
        uuid: id.toString(),
        remoteId: id.startsWith('local_') ? null : id,
        payload: payload,
      );
    }
    return id;
  }

  Future<void> _markInactiveLocal(
    String table,
    String idColumn,
    Object id,
  ) async {
    final d = await db;
    await d.update(
      table,
      {
        'status': 'Inativo',
        'deleted_at': DateTime.now().toIso8601String(),
        'deleted_by': 'Operador',
        'pending_sync': 1,
      },
      where: '$idColumn = ?',
      whereArgs: [id],
    );
  }

  Future<void> deleteProprietarioLocal(String id,
      {bool enqueueSync = true}) async {
    final d = await db;
    if (id.startsWith('local_')) {
      await d.delete('proprietarios',
          where: 'id_proprietario = ?', whereArgs: [id]);
      await d.delete(
        'sync_queue',
        where: 'entity = ? AND entity_uuid = ?',
        whereArgs: ['proprietario', id.toString()],
      );
      return;
    }
    await _markInactiveLocal('proprietarios', 'id_proprietario', id);
    if (enqueueSync && !id.startsWith('local_')) {
      await enqueue(
        entity: 'proprietario',
        action: 'delete',
        remoteId: id,
        payload: {},
      );
    }
  }

  Future<String> saveVeiculoLocal(Veiculo v,
      {required bool isCreate, bool enqueueSync = true}) async {
    final ownerId = v.idProprietario?.trim();
    if (ownerId == null || ownerId.isEmpty) {
      throw Exception('Selecione a empresa responsavel do veiculo.');
    }
    final d = await db;
    final id = v.idVeiculo ?? await _newTempStringIdAsync();
    final row = _clean({
      ...v.toJson(),
      'id_veiculo': id,
      'pending_sync': 1,
    });
    await d.insert('veiculos', row,
        conflictAlgorithm: ConflictAlgorithm.replace);

    if (enqueueSync) {
      final payload = v.toJson()..remove('id_veiculo');
      await enqueue(
        entity: 'veiculo',
        action: isCreate ? 'create' : 'update',
        uuid: id.toString(),
        remoteId: id.startsWith('local_') ? null : id,
        payload: payload,
      );
    }
    return id;
  }

  Future<void> deleteVeiculoLocal(String id, {bool enqueueSync = true}) async {
    final d = await db;
    if (id.startsWith('local_')) {
      await d.delete('veiculos', where: 'id_veiculo = ?', whereArgs: [id]);
      await d.delete(
        'sync_queue',
        where: 'entity = ? AND entity_uuid = ?',
        whereArgs: ['veiculo', id.toString()],
      );
      return;
    }
    await _markInactiveLocal('veiculos', 'id_veiculo', id);
    if (enqueueSync && !id.startsWith('local_')) {
      await enqueue(
        entity: 'veiculo',
        action: 'delete',
        remoteId: id,
        payload: {},
      );
    }
  }

  Future<String> saveMotoristaLocal(Motorista m,
      {required bool isCreate, bool enqueueSync = true}) async {
    final ownerId = m.idProprietario?.trim();
    if (ownerId == null || ownerId.isEmpty) {
      throw Exception('Selecione a empresa responsavel do motorista.');
    }
    final d = await db;
    final id = m.idMotorista ?? await _newTempStringIdAsync();
    final row = _clean({
      ...m.toJson(),
      'id_motorista': id,
      'pending_sync': 1,
    });
    await d.insert('motoristas', row,
        conflictAlgorithm: ConflictAlgorithm.replace);

    if (enqueueSync) {
      final payload = m.toJson()..remove('id_motorista');
      await enqueue(
        entity: 'motorista',
        action: isCreate ? 'create' : 'update',
        uuid: id.toString(),
        remoteId: id.startsWith('local_') ? null : id,
        payload: payload,
      );
    }
    return id;
  }

  Future<void> deleteMotoristaLocal(String id,
      {bool enqueueSync = true}) async {
    final d = await db;
    if (id.startsWith('local_')) {
      await d.delete('motoristas', where: 'id_motorista = ?', whereArgs: [id]);
      await d.delete(
        'sync_queue',
        where: 'entity = ? AND entity_uuid = ?',
        whereArgs: ['motorista', id.toString()],
      );
      return;
    }
    await _markInactiveLocal('motoristas', 'id_motorista', id);
    if (enqueueSync && !id.startsWith('local_')) {
      await enqueue(
        entity: 'motorista',
        action: 'delete',
        remoteId: id,
        payload: {},
      );
    }
  }

  Future<String> saveValorCombustivelLocal(ValorCombustivel v,
      {required bool isCreate, bool enqueueSync = true}) async {
    final d = await db;
    final id = v.idValor ?? await _newTempStringIdAsync();
    final row = _clean({
      ...v.toJson(),
      'id_valor': id,
      'pending_sync': 1,
    });
    await d.insert('valores_combustivel', row,
        conflictAlgorithm: ConflictAlgorithm.replace);

    if (enqueueSync) {
      final payload = v.toJson()..remove('id_valor');
      await enqueue(
        entity: 'valor_combustivel',
        action: isCreate ? 'create' : 'update',
        uuid: id,
        remoteId: id.startsWith('local_') ? null : id,
        payload: payload,
      );
    }
    return id;
  }

  Future<void> deleteValorCombustivelLocal(String id,
      {bool enqueueSync = true}) async {
    final d = await db;
    await d
        .delete('valores_combustivel', where: 'id_valor = ?', whereArgs: [id]);
    if (id.startsWith('local_')) {
      await d.delete(
        'sync_queue',
        where: 'entity = ? AND entity_uuid = ?',
        whereArgs: ['valor_combustivel', id],
      );
      return;
    }
    if (enqueueSync) {
      await enqueue(
        entity: 'valor_combustivel',
        action: 'delete',
        remoteId: id,
        payload: {},
      );
    }
  }

  Future<String> saveUsuarioLocal(Usuario u,
      {required bool isCreate, String? senha, bool enqueueSync = true}) async {
    final d = await db;
    final id = u.idUsuario ?? await _newTempStringIdAsync();
    final row = _usuarioRow(u, id: id)..['pending_sync'] = 1;
    await d.insert('usuarios', row,
        conflictAlgorithm: ConflictAlgorithm.replace);

    if (enqueueSync) {
      final payload = u.toJson(senha: senha)..remove('id_user');
      await enqueue(
        entity: 'usuario',
        action: isCreate ? 'create' : 'update',
        uuid: id,
        remoteId: id.startsWith('local_') ? null : id,
        payload: payload,
      );
    }
    return id;
  }

  Future<void> deleteUsuarioLocal(String id, {bool enqueueSync = true}) async {
    final d = await db;
    if (id.startsWith('local_')) {
      await d.delete('usuarios', where: 'id_usuario = ?', whereArgs: [id]);
      await d.delete(
        'sync_queue',
        where: 'entity = ? AND entity_uuid = ?',
        whereArgs: ['usuario', id],
      );
      return;
    }
    await _markInactiveLocal('usuarios', 'id_usuario', id);
    if (enqueueSync) {
      await enqueue(
        entity: 'usuario',
        action: 'delete',
        remoteId: id,
        payload: {},
      );
    }
  }

  // ===== sync queue =====
  Future<int> pendingCount() async {
    final d = await db;
    final rows = await d.rawQuery('SELECT COUNT(*) as c FROM sync_queue');
    return (rows.first['c'] as num?)?.toInt() ?? 0;
  }

  Future<List<SyncItem>> listQueue() async {
    final d = await db;
    final rows = await d.query('sync_queue', orderBy: 'id ASC');
    return rows.map((r) => SyncItem.fromRow(r)).toList();
  }

  Future<SyncItem?> getQueueItem(int id) async {
    final d = await db;
    final rows = await d.query(
      'sync_queue',
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return SyncItem.fromRow(rows.first);
  }

  Future<String?> findCachedRemoteIdForPendingCreate(SyncItem item) async {
    final localId = item.uuid;
    if (item.action != 'create' ||
        localId == null ||
        !localId.startsWith('local_')) {
      return null;
    }

    final d = await db;
    final payload = item.payload;

    String? text(String key) {
      final value = payload[key]?.toString().trim();
      if (value == null || value.isEmpty) return null;
      return value;
    }

    Future<String?> firstRemoteId(
      String table,
      String idColumn,
      List<String> where,
      List<Object?> args,
    ) async {
      final rows = await d.query(
        table,
        columns: [idColumn],
        where: [
          ...where,
          "$idColumn NOT LIKE 'local_%'",
        ].join(' AND '),
        whereArgs: args,
        orderBy: '$idColumn DESC',
        limit: 1,
      );
      if (rows.isEmpty) return null;
      return rows.first[idColumn]?.toString();
    }

    switch (item.entity) {
      case 'proprietario':
        final nome = text('nome');
        if (nome == null) return null;
        final where = <String>['LOWER(nome) = LOWER(?)'];
        final args = <Object?>[nome];
        final celular = text('celular');
        if (celular != null) {
          where.add('celular = ?');
          args.add(celular);
        }
        final local = text('local');
        if (local != null) {
          where.add('local = ?');
          args.add(local);
        }
        return firstRemoteId('proprietarios', 'id_proprietario', where, args);
      case 'veiculo':
        final placa = text('placa');
        if (placa == null) return null;
        final where = <String>['UPPER(placa) = UPPER(?)'];
        final args = <Object?>[placa];
        final local = text('local');
        if (local != null) {
          where.add('local = ?');
          args.add(local);
        }
        final idProprietario = text('id_proprietario');
        if (idProprietario != null && !idProprietario.startsWith('local_')) {
          where.add('id_proprietario = ?');
          args.add(idProprietario);
        }
        return firstRemoteId('veiculos', 'id_veiculo', where, args);
      case 'motorista':
        final nome = text('nome');
        if (nome == null) return null;
        final where = <String>['LOWER(nome) = LOWER(?)'];
        final args = <Object?>[nome];
        final local = text('local');
        if (local != null) {
          where.add('local = ?');
          args.add(local);
        }
        final idProprietario = text('id_proprietario');
        if (idProprietario != null && !idProprietario.startsWith('local_')) {
          where.add('id_proprietario = ?');
          args.add(idProprietario);
        }
        return firstRemoteId('motoristas', 'id_motorista', where, args);
      case 'valor_combustivel':
        final tipo = text('tipo_combustivel');
        final data = text('data');
        final valor = payload['valor'];
        if (tipo == null || data == null || valor == null) return null;
        final where = <String>[
          'UPPER(tipo_combustivel) = UPPER(?)',
          'data = ?',
          'valor = ?',
        ];
        final args = <Object?>[tipo, data, valor];
        final local = text('local');
        if (local != null) {
          where.add('local = ?');
          args.add(local);
        }
        return firstRemoteId('valores_combustivel', 'id_valor', where, args);
      case 'usuario':
        final login = text('login');
        if (login == null) return null;
        return firstRemoteId(
          'usuarios',
          'id_usuario',
          ['LOWER(login) = LOWER(?)'],
          [login],
        );
    }

    return null;
  }

  Future<bool> ensureCreateQueuedForLocalReference({
    required String entity,
    required String localId,
  }) async {
    if (!localId.startsWith('local_')) return false;

    final d = await db;

    Future<Map<String, dynamic>?> findRow(
      String table,
      String idColumn,
    ) async {
      final rows = await d.query(
        table,
        where: '$idColumn = ?',
        whereArgs: [localId],
        limit: 1,
      );
      if (rows.isEmpty) return null;
      return Map<String, dynamic>.from(rows.first);
    }

    Future<bool> enqueueCreate({
      required String table,
      required String idColumn,
      required Map<String, dynamic> payload,
    }) async {
      payload.remove(idColumn);
      payload.remove('pending_sync');
      payload.remove('deleted_at');
      payload.remove('deleted_by');
      payload.removeWhere((_, value) => value == null);

      await d.update(
        table,
        {'pending_sync': 1},
        where: '$idColumn = ?',
        whereArgs: [localId],
      );
      await enqueue(
        entity: entity,
        action: 'create',
        uuid: localId,
        remoteId: null,
        payload: payload,
      );
      return true;
    }

    switch (entity) {
      case 'proprietario':
        final row = await findRow('proprietarios', 'id_proprietario');
        if (row == null) return false;
        return enqueueCreate(
          table: 'proprietarios',
          idColumn: 'id_proprietario',
          payload: Proprietario.fromJson(row).toJson(),
        );
      case 'veiculo':
        final row = await findRow('veiculos', 'id_veiculo');
        if (row == null) return false;
        return enqueueCreate(
          table: 'veiculos',
          idColumn: 'id_veiculo',
          payload: Veiculo.fromJson(row).toJson(),
        );
      case 'motorista':
        final row = await findRow('motoristas', 'id_motorista');
        if (row == null) return false;
        return enqueueCreate(
          table: 'motoristas',
          idColumn: 'id_motorista',
          payload: Motorista.fromJson(row).toJson(),
        );
    }

    return false;
  }

  Future<String?> resolveRemoteIdForLocalReference({
    required String entity,
    required String localId,
  }) async {
    if (!localId.startsWith('local_')) return localId;

    final d = await db;

    String? cleanText(Map<String, Object?> row, String key) {
      final value = row[key]?.toString().trim();
      if (value == null || value.isEmpty) return null;
      return value;
    }

    Future<String?> firstRemoteId(
      String table,
      String idColumn,
      List<String> where,
      List<Object?> args,
    ) async {
      final rows = await d.query(
        table,
        columns: [idColumn],
        where: [
          ...where,
          "$idColumn NOT LIKE 'local_%'",
        ].join(' AND '),
        whereArgs: args,
        orderBy: '$idColumn DESC',
        limit: 1,
      );
      if (rows.isEmpty) return null;
      return rows.first[idColumn]?.toString();
    }

    Future<Map<String, Object?>?> firstLocalRow(
      String table,
      String idColumn,
    ) async {
      final rows = await d.query(
        table,
        where: '$idColumn = ?',
        whereArgs: [localId],
        limit: 1,
      );
      if (rows.isEmpty) return null;
      return rows.first;
    }

    switch (entity) {
      case 'proprietario':
        final row = await firstLocalRow('proprietarios', 'id_proprietario');
        if (row == null) return null;
        final nome = cleanText(row, 'nome');
        if (nome == null) return null;
        final where = <String>['LOWER(nome) = LOWER(?)'];
        final args = <Object?>[nome];
        final celular = cleanText(row, 'celular');
        if (celular != null) {
          where.add('celular = ?');
          args.add(celular);
        }
        final local = cleanText(row, 'local');
        if (local != null) {
          where.add('local = ?');
          args.add(local);
        }
        return firstRemoteId('proprietarios', 'id_proprietario', where, args);
      case 'veiculo':
        final row = await firstLocalRow('veiculos', 'id_veiculo');
        if (row == null) return null;
        final placa = cleanText(row, 'placa');
        if (placa == null) return null;
        final where = <String>['UPPER(placa) = UPPER(?)'];
        final args = <Object?>[placa];
        final local = cleanText(row, 'local');
        if (local != null) {
          where.add('local = ?');
          args.add(local);
        }
        final idProprietario = cleanText(row, 'id_proprietario');
        if (idProprietario != null && !idProprietario.startsWith('local_')) {
          where.add('id_proprietario = ?');
          args.add(idProprietario);
        }
        return firstRemoteId('veiculos', 'id_veiculo', where, args);
      case 'motorista':
        final row = await firstLocalRow('motoristas', 'id_motorista');
        if (row == null) return null;
        final nome = cleanText(row, 'nome');
        if (nome == null) return null;
        final where = <String>['LOWER(nome) = LOWER(?)'];
        final args = <Object?>[nome];
        final local = cleanText(row, 'local');
        if (local != null) {
          where.add('local = ?');
          args.add(local);
        }
        final idProprietario = cleanText(row, 'id_proprietario');
        if (idProprietario != null && !idProprietario.startsWith('local_')) {
          where.add('id_proprietario = ?');
          args.add(idProprietario);
        }
        return firstRemoteId('motoristas', 'id_motorista', where, args);
    }

    return null;
  }

  Future<void> markQueueSuccess(SyncItem item, Object? remoteId) async {
    final d = await db;

    if (item.entity == 'abastecimento' && item.uuid != null) {
      await d.update(
        'abastecimentos',
        {
          'pending_sync': 0,
          if (remoteId != null) 'id_abastecimento': remoteId.toString(),
        },
        where: 'local_uuid = ?',
        whereArgs: [item.uuid],
      );
      await d.delete('sync_queue', where: 'id = ?', whereArgs: [item.id]);
      return;
    }

    Future<void> markSimple(String table, String idColumn, String localId,
        String? newRemoteId) async {
      if (newRemoteId != null && localId.startsWith('local_')) {
        final remoteAlreadyCached = await d.query(
          table,
          columns: [idColumn],
          where: '$idColumn = ?',
          whereArgs: [newRemoteId],
          limit: 1,
        );
        if (remoteAlreadyCached.isNotEmpty) {
          await d.update(
            table,
            {'pending_sync': 0},
            where: '$idColumn = ?',
            whereArgs: [newRemoteId],
          );
          await d.delete(
            table,
            where: '$idColumn = ?',
            whereArgs: [localId],
          );
          return;
        }
        try {
          await d.update(
            table,
            {idColumn: newRemoteId, 'pending_sync': 0},
            where: '$idColumn = ?',
            whereArgs: [localId],
          );
        } on DatabaseException catch (e) {
          if (!e.toString().contains('UNIQUE constraint')) rethrow;
          await d.update(
            table,
            {'pending_sync': 0},
            where: '$idColumn = ?',
            whereArgs: [newRemoteId],
          );
          await d.delete(
            table,
            where: '$idColumn = ?',
            whereArgs: [localId],
          );
        }
      } else {
        final targetId = newRemoteId ?? localId;
        await d.update(
          table,
          {'pending_sync': 0},
          where: '$idColumn = ?',
          whereArgs: [targetId],
        );
      }
    }

    final localId = item.uuid;
    switch (item.entity) {
      case 'proprietario':
        if (localId != null) {
          await markSimple('proprietarios', 'id_proprietario', localId,
              remoteId?.toString());
          if (remoteId != null && localId.startsWith('local_')) {
            await _replaceLocalReferences(
              d,
              localId: localId,
              remoteId: remoteId.toString(),
              column: 'id_proprietario',
              tables: ['veiculos', 'motoristas', 'abastecimentos'],
            );
          }
        }
        break;
      case 'veiculo':
        if (localId != null) {
          await markSimple(
              'veiculos', 'id_veiculo', localId, remoteId?.toString());
          if (remoteId != null && localId.startsWith('local_')) {
            await _replaceLocalReferences(
              d,
              localId: localId,
              remoteId: remoteId.toString(),
              column: 'id_veiculo',
              tables: ['abastecimentos'],
            );
          }
        }
        break;
      case 'motorista':
        if (localId != null) {
          await markSimple(
              'motoristas', 'id_motorista', localId, remoteId?.toString());
          if (remoteId != null && localId.startsWith('local_')) {
            await _replaceLocalReferences(
              d,
              localId: localId,
              remoteId: remoteId.toString(),
              column: 'id_motorista',
              tables: ['abastecimentos'],
            );
          }
        }
        break;
      case 'valor_combustivel':
        if (localId != null) {
          await markSimple(
              'valores_combustivel', 'id_valor', localId, remoteId?.toString());
        }
        break;
      case 'usuario':
        if (localId != null) {
          await markSimple(
              'usuarios', 'id_usuario', localId, remoteId?.toString());
        }
        break;
    }

    await d.delete('sync_queue', where: 'id = ?', whereArgs: [item.id]);
  }

  Future<void> updateQueuePayload(int id, Map<String, dynamic> payload) async {
    final d = await db;
    await d.update(
      'sync_queue',
      {
        'payload': jsonEncode(payload),
        'last_error': null,
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> updateAbastecimentoLocalFields({
    String? localUuid,
    String? remoteId,
    required Map<String, dynamic> fields,
  }) async {
    final clean = Map<String, dynamic>.from(fields)
      ..removeWhere((_, value) => value == null);
    if (clean.isEmpty) return;

    final whereParts = <String>[];
    final whereArgs = <Object?>[];
    if (localUuid != null && localUuid.trim().isNotEmpty) {
      whereParts.add('local_uuid = ?');
      whereArgs.add(localUuid.trim());
    }
    if (remoteId != null && remoteId.trim().isNotEmpty) {
      whereParts.add('id_abastecimento = ?');
      whereArgs.add(remoteId.trim());
    }
    if (whereParts.isEmpty) return;

    final d = await db;
    await d.update(
      'abastecimentos',
      clean,
      where: whereParts.join(' OR '),
      whereArgs: whereArgs,
    );
  }

  Future<void> replaceLocalReference({
    required String localId,
    required String remoteId,
    required String column,
    required List<String> tables,
  }) async {
    final d = await db;
    await _replaceLocalReferences(
      d,
      localId: localId,
      remoteId: remoteId,
      column: column,
      tables: tables,
    );
  }

  Future<void> _replaceLocalReferences(
    Database d, {
    required String localId,
    required String remoteId,
    required String column,
    required List<String> tables,
  }) async {
    for (final table in tables) {
      await d.update(
        table,
        {column: remoteId},
        where: '$column = ?',
        whereArgs: [localId],
      );
    }

    final rows = await d.query(
      'sync_queue',
      columns: ['id', 'payload'],
    );
    for (final row in rows) {
      final raw = row['payload']?.toString();
      if (raw == null || raw.trim().isEmpty) continue;
      try {
        final decoded = jsonDecode(raw);
        if (decoded is! Map) continue;
        final payload = Map<String, dynamic>.from(decoded);
        if (payload[column] != localId) continue;
        payload[column] = remoteId;
        await d.update(
          'sync_queue',
          {
            'payload': jsonEncode(payload),
            'last_error': null,
          },
          where: 'id = ?',
          whereArgs: [row['id']],
        );
      } catch (_) {
        // Mantem a fila intacta se algum payload antigo nao for JSON valido.
      }
    }
  }

  Future<void> markQueueError(int queueId, String message) async {
    final d = await db;
    await d.rawUpdate(
      'UPDATE sync_queue SET last_error = ?, attempts = attempts + 1 WHERE id = ?',
      [message, queueId],
    );
  }

  Future<void> discardQueueItem(SyncItem item,
      {bool clearPending = true}) async {
    final d = await db;
    await d.delete('sync_queue', where: 'id = ?', whereArgs: [item.id]);
    if (!clearPending) return;

    if (item.entity == 'valor_combustivel') {
      final id = item.remoteId ?? item.uuid;
      if (id != null && id.isNotEmpty) {
        await d.update(
          'valores_combustivel',
          {'pending_sync': 0},
          where: 'id_valor = ?',
          whereArgs: [id],
        );
      }
    }
  }

  Future<int> enqueue({
    required String entity,
    required String action,
    String? uuid,
    String? remoteId,
    required Map<String, dynamic> payload,
  }) async {
    final d = await db;
    final payloadJson = jsonEncode(payload);
    final createdAt = DateTime.now().toIso8601String();

    Future<int?> findExisting(List<String> where, List<Object?> args) async {
      final rows = await d.query(
        'sync_queue',
        columns: ['id'],
        where: where.join(' AND '),
        whereArgs: args,
        orderBy: 'id ASC',
        limit: 1,
      );
      if (rows.isEmpty) return null;
      return rows.first['id'] as int;
    }

    Future<int> replaceQueue(int id) async {
      await d.update(
        'sync_queue',
        {
          'action': action,
          'entity_remote_id': remoteId,
          'payload': payloadJson,
          'last_error': null,
          'attempts': 0,
        },
        where: 'id = ?',
        whereArgs: [id],
      );
      return id;
    }

    if (uuid != null && uuid.trim().isNotEmpty) {
      final existingCreate = await findExisting(
        ['entity = ?', 'action = ?', 'entity_uuid = ?'],
        [entity, 'create', uuid],
      );
      if (existingCreate != null) {
        if (action == 'delete') {
          await d.delete('sync_queue',
              where: 'id = ?', whereArgs: [existingCreate]);
          return existingCreate;
        }
        return replaceQueue(existingCreate);
      }

      final existingSameUuid = await findExisting(
        ['entity = ?', 'entity_uuid = ?'],
        [entity, uuid],
      );
      if (existingSameUuid != null && action != 'create') {
        return replaceQueue(existingSameUuid);
      }
    }

    if (remoteId != null) {
      final existingSameRemote = await findExisting(
        ['entity = ?', 'entity_remote_id = ?'],
        [entity, remoteId],
      );
      if (existingSameRemote != null) {
        return replaceQueue(existingSameRemote);
      }
    }

    return d.insert('sync_queue', {
      'entity': entity,
      'action': action,
      'entity_uuid': uuid,
      'entity_remote_id': remoteId,
      'payload': payloadJson,
      'created_at': createdAt,
      'attempts': 0,
    });
  }

  Future<void> resetAll() async {
    final d = await db;
    await d.transaction((txn) async {
      for (final t in [
        'proprietarios',
        'veiculos',
        'motoristas',
        'valores_combustivel',
        'abastecimentos',
        'usuarios',
        'sync_queue',
      ]) {
        await txn.delete(t);
      }
    });
    final prefs = await SharedPreferences.getInstance();
    for (final key
        in prefs.getKeys().where((k) => k.startsWith(_syncTokenPrefix))) {
      await prefs.remove(key);
    }
  }

  Future<void> addSyncLog({
    required String level,
    required String message,
    String? context,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_syncLogKey);
    final list = <Map<String, dynamic>>[];
    if (raw != null && raw.isNotEmpty) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is List) {
          for (final item in decoded) {
            if (item is Map) {
              list.add(Map<String, dynamic>.from(item));
            }
          }
        }
      } catch (_) {}
    }
    list.add({
      'ts': DateTime.now().toIso8601String(),
      'level': level,
      'message': message,
      if (context != null && context.trim().isNotEmpty) 'context': context,
    });
    if (list.length > _syncLogMax) {
      list.removeRange(0, list.length - _syncLogMax);
    }
    await prefs.setString(_syncLogKey, jsonEncode(list));
  }

  Future<List<Map<String, dynamic>>> listSyncLogs({int limit = 200}) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_syncLogKey);
    if (raw == null || raw.isEmpty) return [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return [];
      final list = decoded
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      if (list.length <= limit) return list.reversed.toList();
      return list.sublist(list.length - limit).reversed.toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> clearSyncLogs() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_syncLogKey);
  }
}

class SyncItem {
  final int id;
  final String entity;
  final String action;
  final String? uuid;
  final String? remoteId;
  final String payloadJson;
  final int attempts;
  final String? lastError;

  SyncItem({
    required this.id,
    required this.entity,
    required this.action,
    required this.uuid,
    required this.remoteId,
    required this.payloadJson,
    required this.attempts,
    required this.lastError,
  });

  factory SyncItem.fromRow(Map<String, Object?> r) => SyncItem(
        id: r['id'] as int,
        entity: r['entity'] as String,
        action: r['action'] as String,
        uuid: r['entity_uuid'] as String?,
        remoteId: r['entity_remote_id']?.toString(),
        payloadJson: r['payload'] as String,
        attempts: (r['attempts'] as int? ?? 0),
        lastError: r['last_error'] as String?,
      );

  Map<String, dynamic> get payload =>
      Map<String, dynamic>.from(jsonDecode(payloadJson) as Map);
}
