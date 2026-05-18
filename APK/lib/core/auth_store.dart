import 'package:shared_preferences/shared_preferences.dart';

/// Persistencia simples do JWT + identificacao do usuario logado.
/// (O backend usa JWT com TTL; sem keystore para simplicidade.)
class AuthStore {
  static const _prefsToken = 'jwt_token';
  static const _prefsNome = 'user_nome';
  static const _prefsLogin = 'user_login';
  static const _prefsTipo = 'user_tipo';
  static const _prefsId = 'user_id';
  static const _prefsTokenExpiresAt = 'jwt_token_expires_at';

  String? _token;
  String? _nome;
  String? _login;
  String? _tipo;
  int? _id;
  DateTime? _tokenExpiresAt;

  String? get token => _token;
  String? get nome => _nome;
  String? get login => _login;
  String? get tipo => _tipo;
  int? get idUsuario => _id;
  DateTime? get tokenExpiresAt => _tokenExpiresAt;
  bool get isAuthenticated => _token != null && _token!.isNotEmpty;

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    _token = p.getString(_prefsToken);
    _nome = p.getString(_prefsNome);
    _login = p.getString(_prefsLogin);
    _tipo = p.getString(_prefsTipo);
    _id = p.getInt(_prefsId);
    final expiresAtRaw = p.getString(_prefsTokenExpiresAt);
    _tokenExpiresAt = expiresAtRaw == null ? null : DateTime.tryParse(expiresAtRaw);
  }

  Future<void> save({
    required String token,
    required String nome,
    required String login,
    required String tipo,
    int? id,
    DateTime? tokenExpiresAt,
  }) async {
    _token = token;
    _nome = nome;
    _login = login;
    _tipo = tipo;
    _id = id;
    _tokenExpiresAt = tokenExpiresAt;
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
    final p = await SharedPreferences.getInstance();
    await p.remove(_prefsToken);
    await p.remove(_prefsNome);
    await p.remove(_prefsLogin);
    await p.remove(_prefsTipo);
    await p.remove(_prefsId);
    await p.remove(_prefsTokenExpiresAt);
  }
}
