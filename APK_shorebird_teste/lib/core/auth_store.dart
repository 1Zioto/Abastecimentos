import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'constants.dart';

/// Persistencia simples do JWT + identificacao do usuario logado.
/// (O backend usa JWT com TTL; sem keystore para simplicidade.)
class AuthStore {
  static const _prefsToken = 'jwt_token';
  static const _prefsNome = 'user_nome';
  static const _prefsLogin = 'user_login';
  static const _prefsTipo = 'user_tipo';
  static const _prefsId = 'user_id';
  static const _prefsTokenExpiresAt = 'jwt_token_expires_at';
  static const _prefsFiliaisAcesso = 'user_filiais_acesso';
  static const _prefsFilialAtual = 'user_filial_atual';

  String? _token;
  String? _nome;
  String? _login;
  String? _tipo;
  int? _id;
  DateTime? _tokenExpiresAt;
  List<String> _filiaisAcesso = [...AppConstants.locais];
  String? _filialAtual;
  final ValueNotifier<String?> filialAtualNotifier =
      ValueNotifier<String?>(null);

  String? get token => _token;
  String? get nome => _nome;
  String? get login => _login;
  String? get tipo => _tipo;
  int? get idUsuario => _id;
  DateTime? get tokenExpiresAt => _tokenExpiresAt;
  List<String> get filiaisAcesso => List.unmodifiable(_filiaisAcesso);
  String? get filialAtual {
    final atual = _filialAtual;
    if (atual != null && canAccessFilial(atual)) return atual;
    return _filiaisAcesso.isNotEmpty
        ? _filiaisAcesso.first
        : AppConstants.locais.first;
  }

  bool get isAuthenticated => _token != null && _token!.isNotEmpty;

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    _token = p.getString(_prefsToken);
    _nome = p.getString(_prefsNome);
    _login = p.getString(_prefsLogin);
    _tipo = p.getString(_prefsTipo);
    _id = p.getInt(_prefsId);
    final expiresAtRaw = p.getString(_prefsTokenExpiresAt);
    _tokenExpiresAt =
        expiresAtRaw == null ? null : DateTime.tryParse(expiresAtRaw);
    _filiaisAcesso = _normalizarFiliais(p.getStringList(_prefsFiliaisAcesso));
    final filialSalva = p.getString(_prefsFilialAtual);
    _filialAtual = canAccessFilial(filialSalva)
        ? _normalizarFilial(filialSalva!)
        : _filiaisAcesso.first;
    filialAtualNotifier.value = filialAtual;
  }

  Future<void> save({
    required String token,
    required String nome,
    required String login,
    required String tipo,
    int? id,
    DateTime? tokenExpiresAt,
    List<String>? filiaisAcesso,
  }) async {
    _token = token;
    _nome = nome;
    _login = login;
    _tipo = tipo;
    _id = id;
    _tokenExpiresAt = tokenExpiresAt;
    _filiaisAcesso = _normalizarFiliais(filiaisAcesso);
    _filialAtual = _filiaisAcesso.length == 1 ? _filiaisAcesso.first : null;
    filialAtualNotifier.value = filialAtual;
    final p = await SharedPreferences.getInstance();
    await p.setString(_prefsToken, token);
    await p.setString(_prefsNome, nome);
    await p.setString(_prefsLogin, login);
    await p.setString(_prefsTipo, tipo);
    if (id != null) await p.setInt(_prefsId, id);
    if (tokenExpiresAt != null) {
      await p.setString(_prefsTokenExpiresAt, tokenExpiresAt.toIso8601String());
    } else {
      await p.remove(_prefsTokenExpiresAt);
    }
    await p.setStringList(_prefsFiliaisAcesso, _filiaisAcesso);
    if (_filialAtual != null) {
      await p.setString(_prefsFilialAtual, _filialAtual!);
    } else {
      await p.remove(_prefsFilialAtual);
    }
  }

  bool canAccessFilial(String? filial) {
    if (filial == null || filial.trim().isEmpty) return false;
    return _filiaisAcesso.contains(_normalizarFilial(filial));
  }

  Future<void> setFilialAtual(String filial) async {
    final normalizada = _normalizarFilial(filial);
    if (!canAccessFilial(normalizada)) return;
    _filialAtual = normalizada;
    filialAtualNotifier.value = filialAtual;
    final p = await SharedPreferences.getInstance();
    await p.setString(_prefsFilialAtual, normalizada);
  }

  Future<void> updateToken({
    required String token,
    DateTime? tokenExpiresAt,
  }) async {
    _token = token;
    _tokenExpiresAt = tokenExpiresAt;
    final p = await SharedPreferences.getInstance();
    await p.setString(_prefsToken, token);
    if (tokenExpiresAt != null) {
      await p.setString(_prefsTokenExpiresAt, tokenExpiresAt.toIso8601String());
    } else {
      await p.remove(_prefsTokenExpiresAt);
    }
  }

  Future<void> clear() async {
    _token = null;
    _nome = null;
    _login = null;
    _tipo = null;
    _id = null;
    _tokenExpiresAt = null;
    _filiaisAcesso = [...AppConstants.locais];
    _filialAtual = null;
    filialAtualNotifier.value = null;
    final p = await SharedPreferences.getInstance();
    await p.remove(_prefsToken);
    await p.remove(_prefsNome);
    await p.remove(_prefsLogin);
    await p.remove(_prefsTipo);
    await p.remove(_prefsId);
    await p.remove(_prefsTokenExpiresAt);
    await p.remove(_prefsFiliaisAcesso);
    await p.remove(_prefsFilialAtual);
  }

  List<String> _normalizarFiliais(List<String>? filiais) {
    final source =
        (filiais == null || filiais.isEmpty) ? AppConstants.locais : filiais;
    final result = <String>[];
    for (final filial in source) {
      final normalizada = _normalizarFilial(filial);
      if (AppConstants.locais.contains(normalizada) &&
          !result.contains(normalizada)) {
        result.add(normalizada);
      }
    }
    return result.isEmpty ? [...AppConstants.locais] : result;
  }

  String _normalizarFilial(String filial) {
    final text = filial.trim();
    final lower = text.toLowerCase();
    if (lower == 'garagem' ||
        lower == 'garagem cariacica' ||
        lower == 'cariacica') {
      return 'Matriz';
    }
    if (lower == 'garagem viana' || lower == 'filial viana') {
      return 'Viana';
    }
    return text;
  }
}
