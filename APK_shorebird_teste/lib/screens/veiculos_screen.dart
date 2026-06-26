import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../core/models.dart';
import '../widgets/common.dart';
import '../widgets/empresa_picker.dart';
import '../widgets/linked_details.dart';

class VeiculosScreen extends StatefulWidget {
  const VeiculosScreen({super.key});

  @override
  State<VeiculosScreen> createState() => _VeiculosScreenState();
}

class _VeiculosScreenState extends State<VeiculosScreen> {
  bool _loading = true;
  List<Veiculo> _items = [];
  List<Proprietario> _props = [];
  List<String> _tiposCombustivel = const ['OLEO DIESEL S10'];
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

  List<Veiculo> get _filteredItems {
    final term = _norm(_searchCtrl.text);
    if (term.isEmpty) return _items;
    return _items.where((v) {
      return _norm(v.placa).contains(term) ||
          _norm(v.modelo).contains(term) ||
          _norm(v.marca).contains(term) ||
          _norm(v.proprietarioNome).contains(term) ||
          _norm(v.tipoCombustivel).contains(term) ||
          _norm(v.ano?.toString()).contains(term);
    }).toList();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final local = AppState.instance.auth.filialAtual;
    final list = await AppState.instance.db.listVeiculos(local: local);
    final props = await AppState.instance.db.listProprietarios(local: local);
    final valores = await AppState.instance.db.listValoresCombustivel(
      local: local,
    );
    final tipos = valores
        .map((v) => v.tipoCombustivel.trim())
        .where((t) => t.isNotEmpty)
        .toSet()
        .toList()
      ..sort((a, b) => a.compareTo(b));
    if (!mounted) return;
    setState(() {
      _items = list;
      _props = props;
      _tiposCombustivel = tipos.isEmpty ? const ['OLEO DIESEL S10'] : tipos;
      _loading = false;
    });
  }

  Future<void> _abrirForm([Veiculo? original]) async {
    final placaCtrl = TextEditingController(text: original?.placa ?? '');
    final marcaCtrl = TextEditingController(text: original?.marca ?? '');
    final modeloCtrl = TextEditingController(text: original?.modelo ?? '');
    final anoCtrl =
        TextEditingController(text: original?.ano?.toString() ?? '');
    final corCtrl = TextEditingController(text: original?.cor ?? '');
    final renavamCtrl = TextEditingController(text: original?.renavam ?? '');
    final chassiCtrl =
        TextEditingController(text: original?.numeroChassi ?? '');
    final odoCtrl = TextEditingController(
        text: original?.odometro?.toStringAsFixed(0) ?? '');
    String? idProp = original?.idProprietario;
    var tipoComb = original?.tipoCombustivel ?? _tiposCombustivel.first;
    if (!_tiposCombustivel.contains(tipoComb)) {
      _tiposCombustivel = [..._tiposCombustivel, tipoComb];
    }

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlgState) => AlertDialog(
          title: Text(original == null ? 'Novo veiculo' : 'Editar veiculo'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                    controller: placaCtrl,
                    decoration: const InputDecoration(labelText: 'Placa')),
                const SizedBox(height: 8),
                EmpresaPickerField(
                  proprietarios: _props,
                  value: idProp,
                  label: 'Proprietario',
                  hint: 'Digite para procurar o proprietario',
                  onChanged: (v) => setDlgState(() => idProp = v),
                ),
                const SizedBox(height: 8),
                TextField(
                    controller: marcaCtrl,
                    decoration: const InputDecoration(labelText: 'Marca')),
                const SizedBox(height: 8),
                TextField(
                    controller: modeloCtrl,
                    decoration: const InputDecoration(labelText: 'Modelo')),
                const SizedBox(height: 8),
                TextField(
                    controller: anoCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Ano')),
                const SizedBox(height: 8),
                TextField(
                    controller: corCtrl,
                    decoration: const InputDecoration(labelText: 'Cor')),
                const SizedBox(height: 8),
                TextField(
                    controller: renavamCtrl,
                    decoration: const InputDecoration(labelText: 'RENAVAM')),
                const SizedBox(height: 8),
                TextField(
                    controller: chassiCtrl,
                    decoration: const InputDecoration(labelText: 'Chassi')),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: tipoComb,
                  decoration: const InputDecoration(labelText: 'Combustivel'),
                  items: _tiposCombustivel
                      .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                      .toList(),
                  onChanged: (v) => tipoComb = v ?? tipoComb,
                ),
                const SizedBox(height: 8),
                TextField(
                    controller: odoCtrl,
                    keyboardType: TextInputType.number,
                    decoration:
                        const InputDecoration(labelText: 'Odometro inicial')),
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
    if (placaCtrl.text.trim().isEmpty || idProp == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Placa e proprietario sao obrigatorios.'),
        backgroundColor: AppTheme.warning,
      ));
      return;
    }

    final veiculo = Veiculo(
      idVeiculo: original?.idVeiculo,
      placa: placaCtrl.text.trim().toUpperCase(),
      marca: marcaCtrl.text.trim().isEmpty ? null : marcaCtrl.text.trim(),
      modelo: modeloCtrl.text.trim().isEmpty ? null : modeloCtrl.text.trim(),
      ano: int.tryParse(anoCtrl.text.trim()),
      tipoCombustivel: tipoComb,
      numeroChassi:
          chassiCtrl.text.trim().isEmpty ? null : chassiCtrl.text.trim(),
      idProprietario: idProp,
      odometro: parseDecimal(odoCtrl.text),
      renavam: renavamCtrl.text.trim().isEmpty ? null : renavamCtrl.text.trim(),
      cor: corCtrl.text.trim().isEmpty ? null : corCtrl.text.trim(),
      local: original?.local ?? AppState.instance.auth.filialAtual,
    );
    await AppState.instance.db
        .saveVeiculoLocal(veiculo, isCreate: original == null);
    await _load();
  }

  Future<void> _excluir(Veiculo v) async {
    if (v.idVeiculo == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Excluir veiculo'),
        content: Text('Deseja excluir "${v.placa}"?'),
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
    await AppState.instance.db.deleteVeiculoLocal(v.idVeiculo!);
    await _load();
  }

  Future<void> _abrirDetalhes(Veiculo v) async {
    final local = AppState.instance.auth.filialAtual;
    final canManage = Roles.isAdmin(AppState.instance.auth.tipo);
    final proprietario = (v.idProprietario ?? '').trim().isEmpty
        ? null
        : await AppState.instance.db.findProprietario(v.idProprietario!);
    final abastecimentos = (v.idVeiculo ?? '').trim().isEmpty
        ? <Abastecimento>[]
        : await AppState.instance.db.listAbastecimentos(
            idVeiculo: v.idVeiculo,
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
        title: v.placa,
        subtitle: v.modelo ?? v.marca ?? v.tipoCombustivel,
        icon: Icons.directions_car_outlined,
        actions: canManage
            ? const [
                DetailAction(
                  label: 'Editar',
                  icon: Icons.edit_outlined,
                  action: 'edit',
                ),
                DetailAction(
                  label: 'Transferir',
                  icon: Icons.swap_horiz_outlined,
                  action: 'transfer',
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
                label: 'Placa',
                value: v.placa,
              ),
              DetailField(
                label: 'Marca',
                value: v.marca,
              ),
              DetailField(
                label: 'Modelo',
                value: v.modelo,
              ),
              DetailField(
                label: 'Ano',
                value: v.ano?.toString(),
              ),
              DetailField(
                label: 'Cor',
                value: v.cor,
              ),
              DetailField(
                label: 'Combustivel',
                value: v.tipoCombustivel,
              ),
              DetailField(
                label: 'Odometro',
                value: '${AppDates.number(v.odometro, digits: 0)} km',
              ),
              DetailField(
                label: 'RENAVAM',
                value: v.renavam,
              ),
              DetailField(
                label: 'Chassi',
                value: v.numeroChassi,
              ),
              DetailField(
                label: 'Filial',
                value: v.local,
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
            title: 'Abastecimentos do veiculo',
            count: abastecimentos.length,
            child: DetailAbastecimentoList(items: abastecimentos),
          ),
        ],
      ),
    );
    if (!mounted || action == null) return;
    if (action == 'edit') {
      await _abrirForm(v);
    } else if (action == 'transfer') {
      await _transferirVeiculo(v);
    } else if (action == 'delete') {
      await _excluir(v);
    }
  }

  Future<void> _transferirVeiculo(Veiculo original) async {
    String? novoProprietario = original.idProprietario;
    final dataCtrl = TextEditingController(
      text: DateTime.now().toIso8601String().substring(0, 10),
    );
    final obsCtrl = TextEditingController();

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlgState) => AlertDialog(
          title: Text('Transferir ${original.placa}'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Proprietario atual: ${original.proprietarioNome ?? 'Nao informado'}',
                  style: Theme.of(ctx).textTheme.bodySmall,
                ),
                const SizedBox(height: 12),
                EmpresaPickerField(
                  proprietarios: _props,
                  value: novoProprietario,
                  label: 'Novo proprietario',
                  hint: 'Digite para procurar o novo proprietario',
                  onChanged: (v) => setDlgState(() => novoProprietario = v),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: dataCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Data da transferencia',
                    hintText: 'AAAA-MM-DD',
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: obsCtrl,
                  minLines: 2,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    labelText: 'Observacao',
                    hintText: 'Venda, troca de titularidade...',
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Os abastecimentos antigos permanecem vinculados ao proprietario gravado no momento do abastecimento.',
                  style: TextStyle(fontSize: 12, color: AppTheme.textMuted),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Transferir'),
            ),
          ],
        ),
      ),
    );

    if (ok != true) return;
    final ownerId = novoProprietario?.trim();
    if (ownerId == null || ownerId.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Selecione o novo proprietario.'),
        backgroundColor: AppTheme.warning,
      ));
      return;
    }
    if (ownerId == original.idProprietario) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('O veiculo ja esta neste proprietario.'),
        backgroundColor: AppTheme.warning,
      ));
      return;
    }

    final novoOwner = _props.where((p) => p.idProprietario == ownerId).toList();
    final atualizado = Veiculo(
      idVeiculo: original.idVeiculo,
      placa: original.placa,
      marca: original.marca,
      modelo: original.modelo,
      ano: original.ano,
      tipoCombustivel: original.tipoCombustivel,
      numeroChassi: original.numeroChassi,
      idProprietario: ownerId,
      odometro: original.odometro,
      renavam: original.renavam,
      cor: original.cor,
      foto: original.foto,
      local: novoOwner.isNotEmpty
          ? (novoOwner.first.local ?? original.local)
          : original.local,
    );

    await AppState.instance.db.saveVeiculoLocal(
      atualizado,
      isCreate: false,
    );
    await _load();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      content: Text('Transferencia salva. Sera sincronizada automaticamente.'),
      backgroundColor: AppTheme.success,
    ));
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
                  icone: Icons.directions_car_outlined,
                  titulo: 'Sem veiculos',
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
                      labelText: 'Pesquisar veiculos',
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
                      mensagem: 'Tente outra placa, modelo ou proprietario.',
                    ),
                  )
                else
                  Expanded(
                    child: ListView.builder(
                      padding: const EdgeInsets.all(8),
                      itemCount: filtered.length,
                      itemBuilder: (_, i) {
                        final v = filtered[i];
                        return Card(
                          child: ListTile(
                            leading: const Icon(Icons.directions_car_outlined),
                            title: Text(v.placa),
                            subtitle: Text(
                              '${v.modelo ?? v.marca ?? 'Sem modelo'}'
                              '${v.proprietarioNome == null ? '' : ' | ${v.proprietarioNome}'}',
                            ),
                            trailing: Text(
                              '${AppDates.number(v.odometro, digits: 0)} km',
                              style:
                                  const TextStyle(fontWeight: FontWeight.w700),
                            ),
                            onTap: () => _abrirDetalhes(v),
                            onLongPress: canManage ? () => _excluir(v) : null,
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
