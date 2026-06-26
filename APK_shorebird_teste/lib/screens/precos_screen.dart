import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../core/models.dart';
import '../widgets/common.dart';

class PrecosScreen extends StatefulWidget {
  const PrecosScreen({super.key});

  @override
  State<PrecosScreen> createState() => _PrecosScreenState();
}

class _PrecosScreenState extends State<PrecosScreen> {
  bool _loading = true;
  List<ValorCombustivel> _items = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _abrirForm() async {
    final tipoInicial = AppConstants.tiposCombustivel.first;
    final tipoNotifier = ValueNotifier<String>(tipoInicial);
    final localNotifier = ValueNotifier<String>(
        AppState.instance.auth.filialAtual ?? AppConstants.locais.first);
    final valorCtrl = TextEditingController();
    String data = AppDates.todayIso();

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Novo valor'),
        content: SingleChildScrollView(
          child: ValueListenableBuilder<String>(
            valueListenable: localNotifier,
            builder: (_, local, __) => ValueListenableBuilder<String>(
              valueListenable: tipoNotifier,
              builder: (_, tipo, __) => Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: local,
                    decoration: const InputDecoration(labelText: 'Filial'),
                    items: AppState.instance.auth.filiaisAcesso
                        .map((l) => DropdownMenuItem(value: l, child: Text(l)))
                        .toList(),
                    onChanged: (v) => localNotifier.value = v ?? local,
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: tipo,
                    decoration: const InputDecoration(labelText: 'Combustivel'),
                    items: AppConstants.tiposCombustivel
                        .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                        .toList(),
                    onChanged: (v) => tipoNotifier.value = v ?? tipo,
                  ),
                  const SizedBox(height: 8),
                  DecimalField(
                      controller: valorCtrl,
                      label: 'Valor por litro',
                      suffix: 'R\$/L'),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: () async {
                      final p = await pickDateIso(context, initialIso: data);
                      if (p != null) data = p;
                    },
                    icon: const Icon(Icons.event),
                    label: Text('Data: ${AppDates.formatDateBr(data)}'),
                  ),
                ],
              ),
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
    final valor = parseDecimal(valorCtrl.text);
    if (valor == null || valor <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Valor invalido.'),
        backgroundColor: AppTheme.warning,
      ));
      return;
    }
    final item = ValorCombustivel(
      tipoCombustivel: tipoNotifier.value,
      valor: valor,
      data: data,
      responsavel: AppState.instance.auth.nome ?? AppState.instance.auth.login,
      local: localNotifier.value,
    );
    await AppState.instance.db.saveValorCombustivelLocal(item, isCreate: true);
    await _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final list = await AppState.instance.db.listValoresCombustivel(
      local: AppState.instance.auth.filialAtual,
    );
    if (!mounted) return;
    setState(() {
      _items = list;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final canCreate = Roles.isAdmin(AppState.instance.auth.tipo);
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
                  icone: Icons.attach_money,
                  titulo: 'Sem valores',
                  mensagem:
                      'Sincronize para baixar os valores de combustivel ou cadastre um novo.',
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
                    leading: const Icon(Icons.local_gas_station_outlined),
                    title: Text(v.tipoCombustivel),
                    subtitle: Text(
                      'Filial: ${v.local ?? 'Matriz'} | Data: ${AppDates.formatDateBr(v.data)}'
                      '${(v.responsavel ?? '').isEmpty ? '' : ' | ${v.responsavel}'}',
                    ),
                    trailing: Text(
                      AppDates.money(v.valor),
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                );
              },
            ),
    );
  }
}
