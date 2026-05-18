import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/models.dart';
import '../widgets/common.dart';

class ProprietariosScreen extends StatefulWidget {
  const ProprietariosScreen({super.key});

  @override
  State<ProprietariosScreen> createState() => _ProprietariosScreenState();
}

class _ProprietariosScreenState extends State<ProprietariosScreen> {
  bool _loading = true;
  List<Proprietario> _items = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _abrirForm([Proprietario? original]) async {
    final nomeCtrl = TextEditingController(text: original?.nome ?? '');
    final respCtrl = TextEditingController(text: original?.responsavel ?? '');
    final celCtrl = TextEditingController(text: original?.celular ?? '');
    final obsCtrl = TextEditingController(text: original?.observacao ?? '');
    var status = original?.status ?? 'ativo';

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(original == null ? 'Novo proprietario' : 'Editar proprietario'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nomeCtrl,
                decoration: const InputDecoration(labelText: 'Nome'),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: status,
                decoration: const InputDecoration(labelText: 'Status'),
                items: AppConstants.statusProprietario
                    .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                    .toList(),
                onChanged: (v) => status = v ?? status,
              ),
              const SizedBox(height: 8),
              TextField(
                controller: respCtrl,
                decoration: const InputDecoration(labelText: 'Responsavel'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: celCtrl,
                decoration: const InputDecoration(labelText: 'Celular'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: obsCtrl,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Observacao'),
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
    if (nomeCtrl.text.trim().isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Nome e obrigatorio.'),
        backgroundColor: AppTheme.warning,
      ));
      return;
    }

    final p = Proprietario(
      idProprietario: original?.idProprietario,
      nome: nomeCtrl.text.trim(),
      status: status,
      responsavel: respCtrl.text.trim().isEmpty ? null : respCtrl.text.trim(),
      celular: celCtrl.text.trim().isEmpty ? null : celCtrl.text.trim(),
      observacao: obsCtrl.text.trim().isEmpty ? null : obsCtrl.text.trim(),
    );
    await AppState.instance.db
        .saveProprietarioLocal(p, isCreate: original == null);
    await _load();
  }

  Future<void> _excluir(Proprietario p) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Excluir proprietario'),
        content: Text('Deseja excluir "${p.nome}"?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Excluir')),
        ],
      ),
    );
    if (ok != true || p.idProprietario == null) return;
    await AppState.instance.db.deleteProprietarioLocal(p.idProprietario!);
    await _load();
  }

  Future<void> _toggleBloqueio(Proprietario p) async {
    if (p.idProprietario == null) return;
    final bloqueado = p.status.toLowerCase() == 'bloqueado';
    String? observacao = p.observacao;

    if (bloqueado) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Desbloquear proprietario'),
          content: Text('Desbloquear "${p.nome}"?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
            TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Desbloquear')),
          ],
        ),
      );
      if (ok != true) return;
    } else {
      final obsCtrl = TextEditingController(text: p.observacao ?? '');
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Bloquear proprietario'),
          content: TextField(
            controller: obsCtrl,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Motivo / observacao'),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
            TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Bloquear')),
          ],
        ),
      );
      if (ok != true) return;
      observacao = obsCtrl.text.trim().isEmpty ? null : obsCtrl.text.trim();
    }

    final updated = Proprietario(
      idProprietario: p.idProprietario,
      nome: p.nome,
      status: bloqueado ? 'Ativo' : 'Bloqueado',
      responsavel: p.responsavel,
      celular: p.celular,
      observacao: observacao,
      dataRegistro: p.dataRegistro,
    );
    await AppState.instance.db.saveProprietarioLocal(updated, isCreate: false);
    await _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final list = await AppState.instance.db.listProprietarios();
    if (!mounted) return;
    setState(() {
      _items = list;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final canCreate = Roles.canCreate(AppState.instance.auth.tipo);
    final canManage = Roles.isAdmin(AppState.instance.auth.tipo);
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: canCreate
          ? FloatingActionButton.extended(
              onPressed: () => _abrirForm(),
              icon: const Icon(Icons.add),
              label: const Text('Novo'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: _load,
        child: _items.isEmpty
            ? ListView(
                children: const [
                  SizedBox(height: 80),
                  EmptyState(
                    icone: Icons.groups_outlined,
                    titulo: 'Sem proprietarios',
                    mensagem: 'Sincronize para baixar os cadastros ou crie um novo.',
                  ),
                ],
              )
            : ListView.builder(
                padding: const EdgeInsets.all(8),
                itemCount: _items.length,
                itemBuilder: (_, i) {
            final p = _items[i];
            final bloqueado = (p.status).toLowerCase() == 'bloqueado';
            return Card(
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor:
                      (bloqueado ? AppTheme.danger : AppTheme.success).withOpacity(0.2),
                  child: Icon(
                    bloqueado ? Icons.lock_outline : Icons.lock_open,
                    color: bloqueado ? AppTheme.danger : AppTheme.success,
                  ),
                ),
                title: Text(p.nome),
                subtitle: Text(
                  'Status: ${p.status}'
                  '${(p.observacao ?? '').isEmpty ? '' : ' | Obs: ${p.observacao}'}',
                ),
                onTap: canManage
                    ? () => _abrirForm(p)
                    : null,
                trailing: canManage
                    ? Wrap(
                        spacing: 2,
                        children: [
                          IconButton(
                            tooltip: bloqueado ? 'Desbloquear' : 'Bloquear',
                            icon: Icon(
                              bloqueado ? Icons.lock_open : Icons.lock_outline,
                              color: bloqueado ? AppTheme.success : AppTheme.warning,
                            ),
                            onPressed: () => _toggleBloqueio(p),
                          ),
                          IconButton(
                            tooltip: 'Excluir',
                            icon: const Icon(Icons.delete_outline, color: AppTheme.danger),
                            onPressed: () => _excluir(p),
                          ),
                        ],
                      )
                    : null,
              ),
            );
                },
              ),
      ),
    );
  }
}
