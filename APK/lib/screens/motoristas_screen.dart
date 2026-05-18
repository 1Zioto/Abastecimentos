import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/models.dart';
import '../widgets/common.dart';
import '../widgets/empresa_picker.dart';

class MotoristasScreen extends StatefulWidget {
  const MotoristasScreen({super.key});

  @override
  State<MotoristasScreen> createState() => _MotoristasScreenState();
}

class _MotoristasScreenState extends State<MotoristasScreen> {
  bool _loading = true;
  List<Motorista> _items = [];
  List<Proprietario> _props = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final list = await AppState.instance.db.listMotoristas();
    final props = await AppState.instance.db.listProprietarios();
    if (!mounted) return;
    setState(() {
      _items = list;
      _props = props;
      _loading = false;
    });
  }

  Future<void> _abrirForm([Motorista? original]) async {
    final nomeCtrl = TextEditingController(text: original?.nome ?? '');
    final docCtrl = TextEditingController(text: original?.documento ?? '');
    final celCtrl = TextEditingController(text: original?.celular ?? '');
    int? idProp =
        original?.idProprietario ?? (_props.isNotEmpty ? _props.first.idProprietario : null);

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlgState) => AlertDialog(
          title: Text(original == null ? 'Novo motorista' : 'Editar motorista'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: nomeCtrl, decoration: const InputDecoration(labelText: 'Nome')),
                const SizedBox(height: 8),
                EmpresaPickerField(
                  proprietarios: _props,
                  value: idProp,
                  label: 'Proprietario',
                  hint: 'Selecione um proprietario',
                  onChanged: (v) => setDlgState(() => idProp = v),
                ),
                const SizedBox(height: 8),
                TextField(controller: docCtrl, decoration: const InputDecoration(labelText: 'Documento')),
                const SizedBox(height: 8),
                TextField(controller: celCtrl, decoration: const InputDecoration(labelText: 'Celular')),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
            TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Salvar')),
          ],
        ),
      ),
    );

    if (ok != true) return;
    if (nomeCtrl.text.trim().isEmpty || idProp == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Nome e proprietario sao obrigatorios.'),
        backgroundColor: AppTheme.warning,
      ));
      return;
    }

    final motorista = Motorista(
      idMotorista: original?.idMotorista,
      nome: nomeCtrl.text.trim(),
      idProprietario: idProp,
      documento: docCtrl.text.trim().isEmpty ? null : docCtrl.text.trim(),
      celular: celCtrl.text.trim().isEmpty ? null : celCtrl.text.trim(),
    );
    await AppState.instance.db
        .saveMotoristaLocal(motorista, isCreate: original == null);
    await _load();
  }

  Future<void> _excluir(Motorista m) async {
    if (m.idMotorista == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Excluir motorista'),
        content: Text('Deseja excluir "${m.nome}"?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Excluir')),
        ],
      ),
    );
    if (ok != true) return;
    await AppState.instance.db.deleteMotoristaLocal(m.idMotorista!);
    await _load();
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
                    icone: Icons.badge_outlined,
                    titulo: 'Sem motoristas',
                    mensagem: 'Sincronize para baixar os cadastros ou crie um novo.',
                  ),
                ],
              )
            : ListView.builder(
                padding: const EdgeInsets.all(8),
                itemCount: _items.length,
                itemBuilder: (_, i) {
            final m = _items[i];
            return Card(
              child: ListTile(
                leading: const Icon(Icons.badge_outlined),
                title: Text(m.nome),
                subtitle: Text(
                  '${m.proprietarioNome ?? 'Sem proprietario'}'
                  '${(m.documento ?? '').isEmpty ? '' : ' | ${m.documento}'}',
                ),
                onTap: canManage ? () => _abrirForm(m) : null,
                onLongPress: canManage ? () => _excluir(m) : null,
              ),
            );
                },
              ),
      ),
    );
  }
}
