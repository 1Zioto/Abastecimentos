import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../core/models.dart';
import '../widgets/common.dart';

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

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final list = await AppState.instance.db.listVeiculos();
    final props = await AppState.instance.db.listProprietarios();
    final valores = await AppState.instance.db.listValoresCombustivel();
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
    final anoCtrl = TextEditingController(text: original?.ano?.toString() ?? '');
    final corCtrl = TextEditingController(text: original?.cor ?? '');
    final renavamCtrl = TextEditingController(text: original?.renavam ?? '');
    final chassiCtrl = TextEditingController(text: original?.numeroChassi ?? '');
    final odoCtrl =
        TextEditingController(text: original?.odometro?.toStringAsFixed(0) ?? '');
    int? idProp = original?.idProprietario ?? (_props.isNotEmpty ? _props.first.idProprietario : null);
    var tipoComb = original?.tipoCombustivel ?? _tiposCombustivel.first;
    if (!_tiposCombustivel.contains(tipoComb)) {
      _tiposCombustivel = [..._tiposCombustivel, tipoComb];
    }

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(original == null ? 'Novo veiculo' : 'Editar veiculo'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: placaCtrl, decoration: const InputDecoration(labelText: 'Placa')),
              const SizedBox(height: 8),
              DropdownButtonFormField<int>(
                initialValue: idProp,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Proprietario'),
                items: _props
                    .map((p) => DropdownMenuItem(value: p.idProprietario, child: Text(p.nome)))
                    .toList(),
                onChanged: (v) => idProp = v,
              ),
              const SizedBox(height: 8),
              TextField(controller: marcaCtrl, decoration: const InputDecoration(labelText: 'Marca')),
              const SizedBox(height: 8),
              TextField(controller: modeloCtrl, decoration: const InputDecoration(labelText: 'Modelo')),
              const SizedBox(height: 8),
              TextField(controller: anoCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Ano')),
              const SizedBox(height: 8),
              TextField(controller: corCtrl, decoration: const InputDecoration(labelText: 'Cor')),
              const SizedBox(height: 8),
              TextField(controller: renavamCtrl, decoration: const InputDecoration(labelText: 'RENAVAM')),
              const SizedBox(height: 8),
              TextField(controller: chassiCtrl, decoration: const InputDecoration(labelText: 'Chassi')),
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
              TextField(controller: odoCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Odometro inicial')),
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
      numeroChassi: chassiCtrl.text.trim().isEmpty ? null : chassiCtrl.text.trim(),
      idProprietario: idProp,
      odometro: parseDecimal(odoCtrl.text),
      renavam: renavamCtrl.text.trim().isEmpty ? null : renavamCtrl.text.trim(),
      cor: corCtrl.text.trim().isEmpty ? null : corCtrl.text.trim(),
    );
    await AppState.instance.db.saveVeiculoLocal(veiculo, isCreate: original == null);
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
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Excluir')),
        ],
      ),
    );
    if (ok != true) return;
    await AppState.instance.db.deleteVeiculoLocal(v.idVeiculo!);
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
                    icone: Icons.directions_car_outlined,
                    titulo: 'Sem veiculos',
                    mensagem: 'Sincronize para baixar os cadastros ou crie um novo.',
                  ),
                ],
              )
            : ListView.builder(
                padding: const EdgeInsets.all(8),
                itemCount: _items.length,
                itemBuilder: (_, i) {
            final v = _items[i];
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
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                onTap: canManage ? () => _abrirForm(v) : null,
                onLongPress: canManage ? () => _excluir(v) : null,
              ),
            );
                },
              ),
      ),
    );
  }
}
