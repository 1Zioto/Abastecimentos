import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../widgets/common.dart';

class DespesasAvulsasScreen extends StatefulWidget {
  const DespesasAvulsasScreen({super.key});

  @override
  State<DespesasAvulsasScreen> createState() => _DespesasAvulsasScreenState();
}

class _DespesasAvulsasScreenState extends State<DespesasAvulsasScreen> {
  bool _loading = true;
  List<dynamic> _items = [];
  String _data = AppDates.todayIso();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final resp = await AppState.instance.api.getPaginated(
        '/despesas-avulsas',
        query: {
          'local': AppState.instance.auth.filialAtual,
        },
        perPage: 200,
      );
      if (!mounted) return;
      setState(() {
        _items = resp;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Erro ao carregar despesas: $e'),
          backgroundColor: AppTheme.danger));
    }
  }

  Future<void> _novaDespesa() async {
    final descricao = TextEditingController();
    final valor = TextEditingController();
    final categoria = TextEditingController();
    final forma = TextEditingController();
    final observacao = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Nova despesa'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                OutlinedButton.icon(
                  onPressed: () async {
                    final p = await pickDateIso(context, initialIso: _data);
                    if (p != null) {
                      _data = p;
                      setDialogState(() {});
                    }
                  },
                  icon: const Icon(Icons.event_outlined),
                  label: Text(AppDates.formatDateBr(_data)),
                ),
                const SizedBox(height: 8),
                TextField(
                    controller: descricao,
                    decoration: const InputDecoration(labelText: 'Descrição')),
                const SizedBox(height: 8),
                TextField(
                    controller: categoria,
                    decoration: const InputDecoration(labelText: 'Categoria')),
                const SizedBox(height: 8),
                TextField(
                    controller: forma,
                    decoration:
                        const InputDecoration(labelText: 'Forma de pagamento')),
                const SizedBox(height: 8),
                TextField(
                    controller: valor,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Valor')),
                const SizedBox(height: 8),
                TextField(
                    controller: observacao,
                    maxLines: 2,
                    decoration: const InputDecoration(labelText: 'Observação')),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancelar')),
            FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Salvar')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    await AppState.instance.api.post('/despesas-avulsas', {
      'descricao': descricao.text.trim(),
      'categoria': categoria.text.trim(),
      'valor': double.tryParse(valor.text.replaceAll(',', '.')) ?? 0,
      'forma_pagamento': forma.text.trim(),
      'observacao': observacao.text.trim(),
      'data': _data,
      'data_hora': _data,
      'local': AppState.instance.auth.filialAtual,
    });
    await _load();
  }

  Future<void> _excluir(String id) async {
    await AppState.instance.api.delete('/despesas-avulsas/$id');
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _novaDespesa,
        icon: const Icon(Icons.add),
        label: const Text('Nova'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(12),
                children: [
                  Text('${_items.length} despesa(s)',
                      style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  if (_items.isEmpty)
                    const Padding(
                        padding: EdgeInsets.all(32),
                        child: Center(child: Text('Nenhuma despesa avulsa.')))
                  else
                    ..._items.map((d) {
                      final id = (d['id'] ?? d['id_despesa'] ?? '').toString();
                      return Card(
                        child: ListTile(
                          leading: const Icon(Icons.payments_outlined),
                          title: Text(
                              (d['descricao'] ?? d['categoria'] ?? 'Despesa')
                                  .toString()),
                          subtitle: Text([
                            if (d['categoria'] != null)
                              'Categoria: ${d['categoria']}',
                            if (d['forma_pagamento'] != null)
                              'Pagamento: ${d['forma_pagamento']}',
                            if (d['data'] != null)
                              AppDates.formatDateBr(d['data']),
                            if (d['local'] != null) 'Filial: ${d['local']}',
                            if (d['responsavel'] != null)
                              'Responsável: ${d['responsavel']}',
                            if (d['observacao'] != null)
                              'Obs.: ${d['observacao']}',
                          ].join('\n')),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              // O backend serializa NUMERIC como String no
                              // JSON; converter evita o soft_crash
                              // "type 'String' is not a subtype of 'num?'".
                              Text(AppDates.money(
                                  double.tryParse('${d['valor'] ?? ''}') ?? 0)),
                              if (id.isNotEmpty)
                                IconButton(
                                    icon: const Icon(Icons.delete_outline),
                                    onPressed: () => _excluir(id)),
                            ],
                          ),
                          isThreeLine: true,
                        ),
                      );
                    }),
                ],
              ),
      ),
    );
  }
}
