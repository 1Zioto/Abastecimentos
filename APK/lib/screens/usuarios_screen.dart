import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/models.dart';
import '../widgets/common.dart';

class UsuariosScreen extends StatefulWidget {
  const UsuariosScreen({super.key});

  @override
  State<UsuariosScreen> createState() => _UsuariosScreenState();
}

class _UsuariosScreenState extends State<UsuariosScreen> {
  bool _loading = true;
  List<Usuario> _items = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _abrirForm([Usuario? original]) async {
    final nomeCtrl = TextEditingController(text: original?.nome ?? '');
    final loginCtrl = TextEditingController(text: original?.login ?? '');
    final emailCtrl = TextEditingController(text: original?.email ?? '');
    final senhaCtrl = TextEditingController();
    var tipo = original?.tipo ?? 'operador';

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(original == null ? 'Novo usuario' : 'Editar usuario'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: nomeCtrl, decoration: const InputDecoration(labelText: 'Nome')),
              const SizedBox(height: 8),
              TextField(controller: loginCtrl, decoration: const InputDecoration(labelText: 'Login')),
              const SizedBox(height: 8),
              TextField(controller: emailCtrl, decoration: const InputDecoration(labelText: 'Email')),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: tipo,
                decoration: const InputDecoration(labelText: 'Tipo'),
                items: AppConstants.tiposUsuario
                    .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                    .toList(),
                onChanged: (v) => tipo = v ?? tipo,
              ),
              const SizedBox(height: 8),
              TextField(
                controller: senhaCtrl,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: original == null ? 'Senha' : 'Nova senha (opcional)',
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Salvar')),
        ],
      ),
    );

    if (ok != true) return;
    if (nomeCtrl.text.trim().isEmpty || loginCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Nome e login sao obrigatorios.'),
        backgroundColor: AppTheme.warning,
      ));
      return;
    }

    final usuario = Usuario(
      idUsuario: original?.idUsuario,
      nome: nomeCtrl.text.trim(),
      login: loginCtrl.text.trim(),
      tipo: tipo,
      email: emailCtrl.text.trim().isEmpty ? null : emailCtrl.text.trim(),
    );
    await AppState.instance.db.saveUsuarioLocal(
      usuario,
      isCreate: original == null,
      senha: senhaCtrl.text.trim().isEmpty ? null : senhaCtrl.text.trim(),
    );
    await _load();
  }

  Future<void> _excluir(Usuario u) async {
    if (u.idUsuario == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Excluir usuario'),
        content: Text('Deseja excluir "${u.login}"?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Excluir')),
        ],
      ),
    );
    if (ok != true) return;
    await AppState.instance.db.deleteUsuarioLocal(u.idUsuario!);
    await _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final list = await AppState.instance.db.listUsuarios();
    if (!mounted) return;
    setState(() {
      _items = list;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final tipo = AppState.instance.auth.tipo;
    if (!Roles.isAdmin(tipo)) {
      return const EmptyState(
        icone: Icons.lock_outline,
        titulo: 'Acesso restrito',
        mensagem: 'Somente administradores podem visualizar usuarios.',
      );
    }

    if (_loading) return const Center(child: CircularProgressIndicator());

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _abrirForm(),
        icon: const Icon(Icons.add),
        label: const Text('Novo'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _items.isEmpty
            ? ListView(
                children: const [
                  SizedBox(height: 80),
                  EmptyState(
                    icone: Icons.admin_panel_settings_outlined,
                    titulo: 'Sem usuarios no cache',
                    mensagem: 'Sincronize para carregar os usuarios ou crie um novo.',
                  ),
                ],
              )
            : ListView.builder(
                padding: const EdgeInsets.all(8),
                itemCount: _items.length,
                itemBuilder: (_, i) {
            final u = _items[i];
            return Card(
              child: ListTile(
                leading: const Icon(Icons.person_outline),
                title: Text(u.nome),
                subtitle: Text(u.login),
                trailing: Text(
                  u.tipo.toUpperCase(),
                  style: const TextStyle(
                    color: AppTheme.textMuted,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                onTap: () => _abrirForm(u),
                onLongPress: () => _excluir(u),
              ),
            );
                },
              ),
      ),
    );
  }
}
