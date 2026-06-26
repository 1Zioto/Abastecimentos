import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../core/models.dart';
import '../widgets/common.dart';
import '../widgets/empresa_picker.dart';
import '../widgets/linked_details.dart';

class MotoristasScreen extends StatefulWidget {
  const MotoristasScreen({super.key});

  @override
  State<MotoristasScreen> createState() => _MotoristasScreenState();
}

class _MotoristasScreenState extends State<MotoristasScreen> {
  bool _loading = true;
  List<Motorista> _items = [];
  List<Proprietario> _props = [];
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  String _norm(String? value) => (value ?? '').trim().toLowerCase();

  List<Motorista> get _filteredItems {
    final term = _norm(_searchCtrl.text);
    if (term.isEmpty) return _items;
    return _items.where((m) {
      return _norm(m.nome).contains(term) ||
          _norm(m.apelido).contains(term) ||
          _norm(m.documento).contains(term) ||
          _norm(m.celular).contains(term) ||
          _norm(m.proprietarioNome).contains(term);
    }).toList();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final local = AppState.instance.auth.filialAtual;
    final list = await AppState.instance.db.listMotoristas(local: local);
    final props = await AppState.instance.db.listProprietarios(local: local);
    if (!mounted) return;
    setState(() {
      _items = list;
      _props = props;
      _loading = false;
    });
  }

  Future<void> _abrirForm([Motorista? original]) async {
    final nomeCtrl = TextEditingController(text: original?.nome ?? '');
    final apelidoCtrl = TextEditingController(text: original?.apelido ?? '');
    final docCtrl = TextEditingController(text: original?.documento ?? '');
    final celCtrl = TextEditingController(text: original?.celular ?? '');
    String? idProp = original?.idProprietario;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlgState) => AlertDialog(
          title: Text(original == null ? 'Novo motorista' : 'Editar motorista'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                    controller: nomeCtrl,
                    decoration: const InputDecoration(labelText: 'Nome')),
                const SizedBox(height: 8),
                TextField(
                    controller: apelidoCtrl,
                    decoration: const InputDecoration(labelText: 'Apelido')),
                const SizedBox(height: 8),
                EmpresaPickerField(
                  proprietarios: _props,
                  value: idProp,
                  label: 'Empresa responsavel',
                  hint: 'Selecione uma empresa responsavel',
                  onChanged: (v) => setDlgState(() => idProp = v),
                ),
                const SizedBox(height: 8),
                TextField(
                    controller: docCtrl,
                    decoration: const InputDecoration(labelText: 'Documento')),
                const SizedBox(height: 8),
                TextField(
                    controller: celCtrl,
                    decoration: const InputDecoration(labelText: 'Celular')),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancelar')),
            TextButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Salvar')),
          ],
        ),
      ),
    );

    if (ok != true) return;
    if (nomeCtrl.text.trim().isEmpty || idProp == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Nome e empresa responsavel sao obrigatorios.'),
        backgroundColor: AppTheme.warning,
      ));
      return;
    }

    final motorista = Motorista(
      idMotorista: original?.idMotorista,
      nome: nomeCtrl.text.trim(),
      apelido: apelidoCtrl.text.trim().isEmpty ? null : apelidoCtrl.text.trim(),
      idProprietario: idProp,
      documento: docCtrl.text.trim().isEmpty ? null : docCtrl.text.trim(),
      celular: celCtrl.text.trim().isEmpty ? null : celCtrl.text.trim(),
      local: original?.local ?? AppState.instance.auth.filialAtual,
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
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Excluir')),
        ],
      ),
    );
    if (ok != true) return;
    await AppState.instance.db.deleteMotoristaLocal(m.idMotorista!);
    await _load();
  }

  Future<void> _abrirDetalhes(Motorista m) async {
    final local = AppState.instance.auth.filialAtual;
    final canManage = Roles.isAdmin(AppState.instance.auth.tipo);
    final proprietario = (m.idProprietario ?? '').trim().isEmpty
        ? null
        : await AppState.instance.db.findProprietario(m.idProprietario!);
    final abastecimentos = (m.idMotorista ?? '').trim().isEmpty
        ? <Abastecimento>[]
        : await AppState.instance.db.listAbastecimentos(
            idMotorista: m.idMotorista,
            local: local,
            limit: 100,
          );
    if (!mounted) return;
    final totalLitros = abastecimentos.fold<double>(
        0, (total, a) => total + a.quantidadeLitros);
    final totalValor = abastecimentos.fold<double>(
      0,
      (total, a) =>
          total + (a.valorTotal ?? ((a.valorPorLitro ?? 0) * a.quantidadeLitros)),
    );
    final action = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => EntityDetailsSheet(
        title: m.nomeExibicao,
        subtitle: proprietario?.nome ?? m.proprietarioNome,
        icon: Icons.badge_outlined,
        actions: canManage
            ? const [
                DetailAction(
                  label: 'Editar',
                  icon: Icons.edit_outlined,
                  action: 'edit',
                ),
                DetailAction(
                  label: 'Excluir',
                  icon: Icons.delete_outline,
                  action: 'delete',
                  color: AppTheme.danger,
                ),
              ]
            : const [],
        children: [
          DetailInfoGrid(
            fields: [
              DetailField(
                label: 'Nome',
                value: m.nome,
              ),
              DetailField(
                label: 'Apelido',
                value: m.apelido,
              ),
              DetailField(
                label: 'Documento',
                value: m.documento,
              ),
              DetailField(
                label: 'Celular',
                value: m.celular,
              ),
              DetailField(
                label: 'Filial',
                value: m.local,
              ),
              DetailField(
                label: 'Litros',
                value: '${AppDates.number(totalLitros)} L',
              ),
              DetailField(
                label: 'Valor',
                value: AppDates.money(totalValor),
              ),
            ],
          ),
          DetailSection(
            title: 'Proprietario vinculado',
            count: proprietario == null ? 0 : 1,
            child: proprietario == null
                ? const EmptyLinkedText('Nenhum proprietario vinculado.')
                : DetailEntityTile(
                    icon: Icons.groups_outlined,
                    title: proprietario.nome,
                    subtitle: proprietario.responsavel,
                    trailing: proprietario.status,
                  ),
          ),
          DetailSection(
            title: 'Abastecimentos do motorista',
            count: abastecimentos.length,
            child: DetailAbastecimentoList(items: abastecimentos),
          ),
        ],
      ),
    );
    if (!mounted || action == null) return;
    if (action == 'edit') {
      await _abrirForm(m);
    } else if (action == 'delete') {
      await _excluir(m);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final canCreate = Roles.canCreate(AppState.instance.auth.tipo);
    final canManage = Roles.isAdmin(AppState.instance.auth.tipo);
    final filtered = _filteredItems;
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: canCreate
          ? FloatingActionButton.extended(
              onPressed: () => _abrirForm(),
              icon: const Icon(Icons.add),
              label: const Text('Novo'),
            )
          : null,
      body: _items.isEmpty
          ? ListView(
              children: const [
                SizedBox(height: 80),
                EmptyState(
                  icone: Icons.badge_outlined,
                  titulo: 'Sem motoristas',
                  mensagem:
                      'Sincronize para baixar os cadastros ou crie um novo.',
                ),
              ],
            )
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
                  child: TextField(
                    controller: _searchCtrl,
                    decoration: InputDecoration(
                      labelText: 'Pesquisar motoristas',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: _searchCtrl.text.isEmpty
                          ? null
                          : IconButton(
                              icon: const Icon(Icons.close),
                              onPressed: () {
                                _searchCtrl.clear();
                                setState(() {});
                              },
                            ),
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                if (filtered.isEmpty)
                  const Expanded(
                    child: EmptyState(
                      icone: Icons.search_off,
                      titulo: 'Nenhum resultado',
                      mensagem:
                          'Tente outro nome, apelido, documento ou empresa responsavel.',
                    ),
                  )
                else
                  Expanded(
                    child: ListView.builder(
                      padding: const EdgeInsets.all(8),
                      itemCount: filtered.length,
                      itemBuilder: (_, i) {
                        final m = filtered[i];
                        return Card(
                          child: ListTile(
                            leading: const Icon(Icons.badge_outlined),
                            title: Text(m.nomeExibicao),
                            subtitle: Text(
                              '${m.proprietarioNome ?? 'Sem empresa responsavel'}'
                              '${(m.documento ?? '').isEmpty ? '' : ' | ${m.documento}'}',
                            ),
                            onTap: () => _abrirDetalhes(m),
                            onLongPress: canManage ? () => _excluir(m) : null,
                          ),
                        );
                      },
                    ),
                  ),
              ],
            ),
    );
  }
}
