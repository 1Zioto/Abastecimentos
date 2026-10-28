import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';

class ConciliacaoBancariaScreen extends StatefulWidget {
  const ConciliacaoBancariaScreen({super.key});

  @override
  State<ConciliacaoBancariaScreen> createState() => _ConciliacaoBancariaScreenState();
}

class _ConciliacaoBancariaScreenState extends State<ConciliacaoBancariaScreen> {
  bool _loading = true;
  List<dynamic> _items = [];
  Map<String, dynamic> _resumo = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final resp = await AppState.instance.api.get('/conciliacao-bancaria/extratos');
      if (!mounted) return;
      setState(() {
        _items = List<dynamic>.from(resp['data'] ?? []);
        _resumo = Map<String, dynamic>.from(resp['resumo'] ?? {});
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erro ao carregar conciliação: $e'), backgroundColor: AppTheme.danger));
    }
  }

  Future<void> _ignorar(String id) async {
    await AppState.instance.api.post('/conciliacao-bancaria/extratos/$id/ignorar', {});
    await _load();
  }

  Future<void> _desconciliar(String id) async {
    await AppState.instance.api.post('/conciliacao-bancaria/extratos/$id/desconciliar', {});
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(12),
              children: [
                Wrap(
                  spacing: 8,
                  children: [
                    Chip(label: Text('Total: ${_resumo['total'] ?? _items.length}')),
                    if (_resumo['pendentes'] != null) Chip(label: Text('Pendentes: ${_resumo['pendentes']}')),
                    if (_resumo['conciliados'] != null) Chip(label: Text('Conciliados: ${_resumo['conciliados']}')),
                  ],
                ),
                const SizedBox(height: 8),
                if (_items.isEmpty)
                  const Padding(padding: EdgeInsets.all(32), child: Center(child: Text('Nenhum extrato importado.')))
                else
                  ..._items.map((e) {
                    final id = (e['id'] ?? '').toString();
                    final status = (e['status'] ?? '').toString();
                    return Card(
                      child: ListTile(
                        leading: Icon(status == 'conciliado' ? Icons.check_circle_outline : Icons.account_balance_outlined),
                        title: Text('${AppDates.money(e['valor'])} · ${e['descricao'] ?? 'Extrato'}'),
                        subtitle: Text([
                          if (e['data'] != null) AppDates.formatDateBr(e['data']),
                          if (status.isNotEmpty) 'Status: $status',
                          if (e['documento'] != null) 'Doc: ${e['documento']}',
                        ].join('\n')),
                        trailing: PopupMenuButton<String>(
                          onSelected: (v) {
                            if (v == 'ignorar') _ignorar(id);
                            if (v == 'desconciliar') _desconciliar(id);
                          },
                          itemBuilder: (_) => [
                            const PopupMenuItem(value: 'ignorar', child: Text('Ignorar')),
                            if (status == 'conciliado') const PopupMenuItem(value: 'desconciliar', child: Text('Desconciliar')),
                          ],
                        ),
                        isThreeLine: true,
                      ),
                    );
                  }),
              ],
            ),
    );
  }
}
