import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../core/models.dart';
import '../widgets/common.dart';
import '../widgets/linked_details.dart';

class ProprietariosScreen extends StatefulWidget {
  const ProprietariosScreen({super.key});

  @override
  State<ProprietariosScreen> createState() => _ProprietariosScreenState();
}

class _ProprietariosScreenState extends State<ProprietariosScreen> {
  bool _loading = true;
  List<Proprietario> _items = [];
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

  List<Proprietario> get _filteredItems {
    final term = _norm(_searchCtrl.text);
    if (term.isEmpty) return _items;
    return _items.where((p) {
      return _norm(p.nome).contains(term) ||
          _norm(p.responsavel).contains(term) ||
          _norm(p.celular).contains(term) ||
          _norm(p.observacao).contains(term) ||
          _norm(p.status).contains(term);
    }).toList();
  }

  Future<void> _abrirForm([Proprietario? original]) async {
    final nomeCtrl = TextEditingController(text: original?.nome ?? '');
    final respCtrl = TextEditingController(text: original?.responsavel ?? '');
    final celCtrl = TextEditingController(text: original?.celular ?? '');
    final obsCtrl = TextEditingController(text: original?.observacao ?? '');
    var status = original?.status ?? 'ativo';
    var odometroObrigatorio = original?.odometroObrigatorio ?? false;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
            original == null ? 'Novo proprietario' : 'Editar proprietario'),
        content: StatefulBuilder(
          builder: (context, setDialogState) => SingleChildScrollView(
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
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Odometro obrigatorio'),
                  subtitle: const Text('Exigir KM ao registrar abastecimento'),
                  value: odometroObrigatorio,
                  onChanged: (v) =>
                      setDialogState(() => odometroObrigatorio = v),
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
      local: original?.local ?? AppState.instance.auth.filialAtual,
      odometroObrigatorio: odometroObrigatorio,
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
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Excluir')),
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
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancelar')),
            TextButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Desbloquear')),
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
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancelar')),
            TextButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Bloquear')),
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
      local: p.local,
      odometroObrigatorio: p.odometroObrigatorio,
    );
    await AppState.instance.db.saveProprietarioLocal(updated, isCreate: false);
    await _load();
  }

  Future<void> _abrirDetalhes(Proprietario p) async {
    final id = p.idProprietario;
    final local = AppState.instance.auth.filialAtual;
    final canEdit = Roles.canCreate(AppState.instance.auth.tipo);
    final canManage = Roles.isAdmin(AppState.instance.auth.tipo);
    final veiculos = id == null
        ? <Veiculo>[]
        : await AppState.instance.db
            .listVeiculos(idProprietario: id, local: local);
    final motoristas = id == null
        ? <Motorista>[]
        : await AppState.instance.db
            .listMotoristas(idProprietario: id, local: local);
    final abastecimentos = id == null
        ? <Abastecimento>[]
        : await AppState.instance.db.listAbastecimentos(
            idProprietario: id,
            local: local,
            limit: 100,
          );
    if (!mounted) return;
    final totalLitros = abastecimentos.fold<double>(
        0, (total, a) => total + a.quantidadeLitros);
    final totalValor = abastecimentos.fold<double>(
      0,
      (total, a) =>
          total +
          (a.valorTotal ?? ((a.valorPorLitro ?? 0) * a.quantidadeLitros)),
    );
    final action = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => EntityDetailsSheet(
        title: p.nome,
        subtitle: 'Proprietario ${p.local ?? local ?? ''}',
        icon: Icons.groups_outlined,
        actions: [
          if (canEdit)
            const DetailAction(
              label: 'Editar',
              icon: Icons.edit_outlined,
              action: 'edit',
            ),
          if (canManage) ...[
            DetailAction(
              label: p.status.toLowerCase() == 'bloqueado'
                  ? 'Desbloquear'
                  : 'Bloquear',
              icon: p.status.toLowerCase() == 'bloqueado'
                  ? Icons.lock_open
                  : Icons.lock_outline,
              action: 'toggle',
              color: AppTheme.warning,
            ),
            const DetailAction(
              label: 'Excluir',
              icon: Icons.delete_outline,
              action: 'delete',
              color: AppTheme.danger,
            ),
          ],
        ],
        children: [
          DetailInfoGrid(
            fields: [
              DetailField(
                label: 'Status',
                value: p.status,
              ),
              DetailField(
                label: 'Responsavel',
                value: p.responsavel,
              ),
              DetailField(
                label: 'Celular',
                value: p.celular,
              ),
              DetailField(
                label: 'Filial',
                value: p.local,
              ),
              DetailField(
                label: 'Odometro',
                value: p.odometroObrigatorio ? 'Obrigatorio' : 'Opcional',
              ),
              DetailField(
                label: 'Cadastro',
                value: AppDates.formatDateBr(p.dataRegistro),
              ),
              DetailField(
                label: 'Obs.',
                value: p.observacao,
              ),
            ],
          ),
          DetailSection(
            title: 'Resumo de abastecimentos',
            count: abastecimentos.length,
            child: DetailInfoGrid(
              fields: [
                DetailField(
                  label: 'Litros',
                  value: '${AppDates.number(totalLitros)} L',
                ),
                DetailField(
                  label: 'Valor',
                  value: AppDates.money(totalValor),
                ),
                DetailField(
                  label: 'Pendentes',
                  value:
                      '${abastecimentos.where((a) => !a.baixaAbastecimento).length}',
                ),
                DetailField(
                  label: 'Pagos',
                  value:
                      '${abastecimentos.where((a) => a.baixaAbastecimento).length}',
                ),
              ],
            ),
          ),
          DetailSection(
            title: 'Veiculos vinculados',
            count: veiculos.length,
            child: veiculos.isEmpty
                ? const EmptyLinkedText('Nenhum veiculo vinculado.')
                : Column(
                    children: veiculos
                        .map(
                          (v) => DetailEntityTile(
                            icon: Icons.directions_car_outlined,
                            title: v.placa,
                            subtitle: v.modelo ?? v.marca ?? 'Sem modelo',
                            trailing:
                                '${AppDates.number(v.odometro, digits: 0)} km',
                          ),
                        )
                        .toList(),
                  ),
          ),
          DetailSection(
            title: 'Motoristas vinculados',
            count: motoristas.length,
            child: motoristas.isEmpty
                ? const EmptyLinkedText('Nenhum motorista vinculado.')
                : Column(
                    children: motoristas
                        .map(
                          (m) => DetailEntityTile(
                            icon: Icons.badge_outlined,
                            title: m.nomeExibicao,
                            subtitle: m.documento,
                            trailing: m.celular,
                          ),
                        )
                        .toList(),
                  ),
          ),
          DetailSection(
            title: 'Abastecimentos',
            count: abastecimentos.length,
            child: DetailAbastecimentoList(items: abastecimentos),
          ),
        ],
      ),
    );
    if (!mounted || action == null) return;
    if (action == 'edit') {
      await _abrirForm(p);
    } else if (action == 'toggle' && canManage) {
      await _toggleBloqueio(p);
    } else if (action == 'delete' && canManage) {
      await _excluir(p);
    }
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final list = await AppState.instance.db
        .listProprietarios(local: AppState.instance.auth.filialAtual);
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
                  icone: Icons.groups_outlined,
                  titulo: 'Sem proprietarios',
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
                      labelText: 'Pesquisar proprietarios',
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
                      mensagem: 'Tente outro nome, status ou telefone.',
                    ),
                  )
                else
                  Expanded(
                    child: ListView.builder(
                      padding: const EdgeInsets.all(8),
                      itemCount: filtered.length,
                      itemBuilder: (_, i) {
                        final p = filtered[i];
                        final bloqueado =
                            (p.status).toLowerCase() == 'bloqueado';
                        return Card(
                          child: ListTile(
                            leading: CircleAvatar(
                              backgroundColor: (bloqueado
                                      ? AppTheme.danger
                                      : AppTheme.success)
                                  .withValues(alpha: 0.2),
                              child: Icon(
                                bloqueado
                                    ? Icons.lock_outline
                                    : Icons.lock_open,
                                color: bloqueado
                                    ? AppTheme.danger
                                    : AppTheme.success,
                              ),
                            ),
                            title: Text(p.nome),
                            subtitle: Text(
                              'Status: ${p.status}'
                              ' | Odometro: ${p.odometroObrigatorio ? 'obrigatorio' : 'opcional'}'
                              '${(p.observacao ?? '').isEmpty ? '' : ' | Obs: ${p.observacao}'}',
                            ),
                            onTap: () => _abrirDetalhes(p),
                            trailing: Wrap(
                              spacing: 2,
                              children: [
                                if (canCreate)
                                  IconButton(
                                    tooltip: 'Editar',
                                    icon: const Icon(Icons.edit_outlined),
                                    onPressed: () => _abrirForm(p),
                                  ),
                                if (canManage) ...[
                                  IconButton(
                                    tooltip:
                                        bloqueado ? 'Desbloquear' : 'Bloquear',
                                    icon: Icon(
                                      bloqueado
                                          ? Icons.lock_open
                                          : Icons.lock_outline,
                                      color: bloqueado
                                          ? AppTheme.success
                                          : AppTheme.warning,
                                    ),
                                    onPressed: () => _toggleBloqueio(p),
                                  ),
                                  IconButton(
                                    tooltip: 'Excluir',
                                    icon: const Icon(Icons.delete_outline,
                                        color: AppTheme.danger),
                                    onPressed: () => _excluir(p),
                                  ),
                                ],
                              ],
                            ),
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
