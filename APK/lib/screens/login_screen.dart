import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_state.dart';
import '../core/constants.dart';
import 'shell_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _loginCtrl = TextEditingController();
  final _senhaCtrl = TextEditingController();
  bool _loading = false;
  bool _showPassword = false;
  String? _erro;

  @override
  void dispose() {
    _loginCtrl.dispose();
    _senhaCtrl.dispose();
    super.dispose();
  }

  Future<void> _entrar() async {
    final login = _loginCtrl.text.trim();
    final senha = _senhaCtrl.text;
    if (login.isEmpty || senha.isEmpty) {
      setState(() => _erro = 'Informe login e senha.');
      return;
    }
    setState(() {
      _loading = true;
      _erro = null;
    });

    try {
      final state = AppState.instance;
      final resp =
          await state.api.post('/auth/login', {'login': login, 'password': senha});
      if (resp is! Map) {
        throw Exception('Resposta invalida do servidor');
      }
      final token = resp['token'] as String?;
      if (token == null || token.isEmpty) {
        throw Exception('Resposta sem token.');
      }
      final expiresIn = resp['expires_in'] is num
          ? (resp['expires_in'] as num).toInt()
          : 0;
      final tokenExpiresAt = expiresIn > 0
          ? DateTime.now().add(Duration(seconds: expiresIn))
          : null;
      final user = (resp['user'] is Map)
          ? Map<String, dynamic>.from(resp['user'] as Map)
          : <String, dynamic>{};
      await state.auth.save(
        token: token,
        nome: (user['nome'] ?? login).toString(),
        login: (user['login'] ?? login).toString(),
        tipo: (user['tipo'] ?? 'operador').toString(),
        id: user['id_usuario'] is num
            ? (user['id_usuario'] as num).toInt()
            : (user['id'] is num ? (user['id'] as num).toInt() : null),
        tokenExpiresAt: tokenExpiresAt,
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const ShellScreen()),
      );
    } on ApiException catch (e) {
      setState(() => _erro = e.message);
    } catch (e) {
      setState(() => _erro = 'Falha na conexao: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: MediaQuery.of(context).size.height - 48,
            ),
            child: IntrinsicHeight(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 20),
                  Container(
                    width: 88,
                    height: 88,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppTheme.primary.withOpacity(0.18),
                      borderRadius: BorderRadius.circular(22),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Image.asset(
                      'assets/logo.jpg',
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const Icon(
                        Icons.local_gas_station_rounded,
                        color: AppTheme.primary,
                        size: 48,
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    AppConstants.appName,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Entre com seu usuario do sistema para sincronizar os registros.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppTheme.textMuted),
                  ),
                  const SizedBox(height: 32),
                  TextField(
                    controller: _loginCtrl,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: 'Login',
                      prefixIcon: Icon(Icons.person_outline),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _senhaCtrl,
                    obscureText: !_showPassword,
                    onSubmitted: (_) => _entrar(),
                    decoration: InputDecoration(
                      labelText: 'Senha',
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        icon: Icon(_showPassword
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined),
                        onPressed: () =>
                            setState(() => _showPassword = !_showPassword),
                      ),
                    ),
                  ),
                  if (_erro != null) ...[
                    const SizedBox(height: 14),
                    Text(
                      _erro!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppTheme.danger),
                    ),
                  ],
                  const SizedBox(height: 22),
                  ElevatedButton(
                    onPressed: _loading ? null : _entrar,
                    child: _loading
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                                color: Colors.white, strokeWidth: 2.5),
                          )
                        : const Text('Entrar'),
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'Dica: login padrao admin / admin123',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: AppTheme.textMuted),
                  ),
                  const Spacer(),
                  const SizedBox(height: 8),
                  const Text(
                    'v${AppConstants.appVersion}',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 11, color: AppTheme.textMuted),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
