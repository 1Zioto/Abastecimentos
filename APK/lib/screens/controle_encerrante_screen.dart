import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';

class ControleEncerranteScreen extends StatefulWidget {
  const ControleEncerranteScreen({super.key});

  @override
  State<ControleEncerranteScreen> createState() => _ControleEncerranteScreenState();
}

class _ControleEncerranteScreenState extends State<ControleEncerranteScreen> {
  bool _loading = true;
  Map<String, dynamic> _data = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final resp = await AppState.instance.api.get('/encerrantes-bomba/analise-privada', query: {'local': AppState.instance.auth.filialAtual});
      if (!mounted) return;
      setState(() {
        _data = Map<String, dynamic>.from(resp as Map);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erro ao carregar controle: $e'), backgroundColor: AppTheme.danger));
    }
  }

  @override
  Widget build(BuildContext context) {
    final inconsistencias = List<dynamic>.from(_data['inconsistencias'] ?? _data['data'] ?? []);
    final resumo = Map<String, dynamic>.from(_data['resumo'] ?? _data);
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
                    if (resumo['total_abastecido'] != null) Chip(label: Text('Abastecido: ${AppDates.number(resumo['total_abastecido'])} L')),
                    if (resumo['total_bomba'] != null) Chip(label: Text('Bomba: ${AppDates.number(resumo['total_bomba'])} L')),
                    if (resumo['diferenca'] != null) Chip(label: Text('Diferença: ${AppDates.number(resumo['diferenca'])} L')),
                  ],
                ),
                const SizedBox(height: 8),
                if (inconsistencias.isEmpty)
                  const Padding(padding: EdgeInsets.all(32), child: Center(child: Text('Nenhuma inconsistência de encerrante.')))
                else
                  ...inconsistencias.map((i) => Card(
                        child: ListTile(
                          leading: const Icon(Icons.oil_barrel_outlined, color: AppTheme.warning),
                          title: Text(i['bomba']?.toString() ?? i['titulo']?.toString() ?? 'Encerrante'),
                          subtitle: Text([
                            if (i['data'] != null) AppDates.formatDateBr(i['data']),
                            if (i['diferenca'] != null) 'Diferença: ${AppDates.number(i['diferenca'])} L',
                            if (i['mensagem'] != null) i['mensagem'].toString(),
                          ].join('\n')),
                          isThreeLine: true,
                        ),
                      )),
              ],
            ),
    );
  }
}
