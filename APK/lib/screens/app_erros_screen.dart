import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';

class AppErrosScreen extends StatefulWidget {
  const AppErrosScreen({super.key});

  @override
  State<AppErrosScreen> createState() => _AppErrosScreenState();
}

class _AppErrosScreenState extends State<AppErrosScreen> {
  bool _loading = true;
  List<dynamic> _items = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final resp = await AppState.instance.api.get('/app-erros', query: {'per_page': 100});
      if (!mounted) return;
      setState(() {
        _items = resp is Map ? List<dynamic>.from(resp['data'] ?? []) : List<dynamic>.from(resp as List);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erro ao carregar erros: $e'), backgroundColor: AppTheme.danger));
    }
  }

  Future<void> _limpar() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Limpar erros do app?'),
        content: const Text('Todos os registros de erro enviados pelo app serão apagados.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Limpar')),
        ],
      ),
    );
    if (ok != true) return;
    await AppState.instance.api.delete('/app-erros');
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(12),
                children: [
                  Row(
                    children: [
                      Expanded(child: Text('${_items.length} erro(s)', style: Theme.of(context).textTheme.titleMedium)),
                      TextButton.icon(onPressed: _load, icon: const Icon(Icons.refresh), label: const Text('Atualizar')),
                      TextButton.icon(onPressed: _items.isEmpty ? null : _limpar, icon: const Icon(Icons.delete_outline), label: const Text('Limpar')),
                    ],
                  ),
                  if (_items.isEmpty)
                    const Padding(padding: EdgeInsets.all(32), child: Center(child: Text('Nenhum erro registrado.')))
                  else
                    ..._items.map((e) => Card(
                          child: ListTile(
                            leading: const Icon(Icons.warning_amber_outlined, color: AppTheme.warning),
                            title: Text((e['mensagem'] ?? e['message'] ?? e['tipo'] ?? 'Erro').toString()),
                            subtitle: Text([
                              if (e['tela'] != null) 'Tela: ${e['tela']}',
                              if (e['origem'] != null) 'Origem: ${e['origem']}',
                              if (e['created_at'] != null) AppDates.formatDateTimeBr(e['created_at']),
                              if (e['detalhe'] != null) e['detalhe'].toString(),
                            ].join('\n')),
                            isThreeLine: true,
                          ),
                        )),
                ],
              ),
      ),
    );
  }
}
