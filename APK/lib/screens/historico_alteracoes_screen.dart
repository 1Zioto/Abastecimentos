import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';

class HistoricoAlteracoesScreen extends StatefulWidget {
  const HistoricoAlteracoesScreen({super.key});

  @override
  State<HistoricoAlteracoesScreen> createState() => _HistoricoAlteracoesScreenState();
}

class _HistoricoAlteracoesScreenState extends State<HistoricoAlteracoesScreen> {
  bool _loading = true;
  String _tabela = '';
  List<dynamic> _items = [];

  final _tabelas = const [
    ['', 'Todas'],
    ['abastecimentos', 'Abastecimentos'],
    ['proprietarios', 'Proprietários'],
    ['veiculos', 'Veículos'],
    ['motoristas', 'Motoristas'],
    ['usuarios', 'Usuários'],
    ['baixa_abastecimento', 'Baixas'],
    ['entrada_notas', 'Entrada de notas'],
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final query = {'per_page': 100, if (_tabela.isNotEmpty) 'tabela': _tabela};
      final resp = await AppState.instance.api.get('/auditoria', query: query);
      if (!mounted) return;
      setState(() {
        _items = resp is Map ? List<dynamic>.from(resp['data'] ?? []) : List<dynamic>.from(resp as List);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erro ao carregar histórico: $e'), backgroundColor: AppTheme.danger));
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          DropdownButtonFormField<String>(
            value: _tabela,
            decoration: const InputDecoration(labelText: 'Tabela'),
            items: _tabelas.map((x) => DropdownMenuItem(value: x[0], child: Text(x[1]))).toList(),
            onChanged: (v) {
              setState(() => _tabela = v ?? '');
              _load();
            },
          ),
          const SizedBox(height: 12),
          if (_loading)
            const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()))
          else if (_items.isEmpty)
            const Padding(padding: EdgeInsets.all(32), child: Center(child: Text('Nenhuma alteração encontrada.')))
          else
            ..._items.map((a) => Card(
                  child: ListTile(
                    leading: const Icon(Icons.history),
                    title: Text('${a['acao'] ?? a['tipo'] ?? 'Alteração'} em ${a['tabela'] ?? 'registro'}'),
                    subtitle: Text([
                      if (a['usuario_nome'] != null || a['usuario'] != null) 'Usuário: ${a['usuario_nome'] ?? a['usuario']}',
                      if (a['registro_id'] != null) 'Registro: ${a['registro_id']}',
                      if (a['created_at'] != null) AppDates.formatDateTimeBr(a['created_at']),
                    ].join('\n')),
                    isThreeLine: true,
                  ),
                )),
        ],
      ),
    );
  }
}
