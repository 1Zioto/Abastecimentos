import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../widgets/common.dart';

class AuditoriaAbastecimentosScreen extends StatefulWidget {
  const AuditoriaAbastecimentosScreen({super.key});

  @override
  State<AuditoriaAbastecimentosScreen> createState() =>
      _AuditoriaAbastecimentosScreenState();
}

class _AuditoriaAbastecimentosScreenState
    extends State<AuditoriaAbastecimentosScreen> {
  bool _loading = true;
  List<Map<String, dynamic>> _items = [];
  Map<String, dynamic> _resumo = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final resp = await AppState.instance.api.get(
        '/auditoria/abastecimentos-suspeitos',
        query: {
          'limit': 1000,
          'local': AppState.instance.auth.filialAtual,
        },
      );
      if (!mounted) return;
      final data = resp is Map ? (resp['data'] ?? []) : resp;
      setState(() {
        _resumo = resp is Map && resp['resumo'] is Map
            ? Map<String, dynamic>.from(resp['resumo'] as Map)
            : {};
        _items = data is List
            ? data
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .toList()
            : [];
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro ao carregar auditoria: $e'),
        backgroundColor: AppTheme.danger,
      ));
    }
  }

  Future<void> _marcarAuditado(String id) async {
    await AppState.instance.api
        .post('/auditoria/abastecimentos-suspeitos/$id/auditar', {});
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
                Text(
                  '${_resumo['total'] ?? _items.length} abastecimento(s) para revisar',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                if (_items.isEmpty)
                  const EmptyState(
                    icone: Icons.fact_check_outlined,
                    titulo: 'Nenhuma inconsistência encontrada',
                  )
                else
                  ..._items.map((item) {
                    final abast = item['abastecimento'] is Map
                        ? Map<String, dynamic>.from(
                            item['abastecimento'] as Map)
                        : item;
                    final suspeitas = item['suspeitas'] is List
                        ? List<Map<String, dynamic>>.from(
                            (item['suspeitas'] as List)
                                .whereType<Map>()
                                .map(Map<String, dynamic>.from),
                          )
                        : <Map<String, dynamic>>[];
                    final veiculo = abast['veiculo'] is Map
                        ? Map<String, dynamic>.from(abast['veiculo'] as Map)
                        : <String, dynamic>{};
                    final proprietario = abast['proprietario'] is Map
                        ? Map<String, dynamic>.from(
                            abast['proprietario'] as Map)
                        : <String, dynamic>{};
                    final id = (abast['id_abastecimento'] ?? abast['id'] ?? '')
                        .toString();
                    final placa = abast['placa1'] ??
                        veiculo['placa'] ??
                        abast['placa'] ??
                        'Sem placa';
                    final motivos = suspeitas
                        .map((s) =>
                            '• ${s['mensagem'] ?? s['tipo'] ?? 'Suspeita'}')
                        .join('\n');

                    return Card(
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.fact_check_outlined,
                                    color: AppTheme.warning),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    '$placa · ${AppDates.money(abast['valor_total'])}',
                                    style:
                                        Theme.of(context).textTheme.titleMedium,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text([
                              if (abast['data_hora'] != null)
                                AppDates.formatDateTimeBr(abast['data_hora']),
                              if (proprietario['nome'] != null)
                                'Proprietário: ${proprietario['nome']}',
                              if (abast['local'] != null)
                                'Filial: ${abast['local']}',
                            ].join('\n')),
                            if (motivos.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              Text(
                                motivos,
                                style: const TextStyle(color: AppTheme.warning),
                              ),
                            ],
                            const SizedBox(height: 8),
                            Align(
                              alignment: Alignment.centerRight,
                              child: FilledButton.icon(
                                onPressed: id.isEmpty
                                    ? null
                                    : () => _marcarAuditado(id),
                                icon: const Icon(Icons.check),
                                label: const Text('Marcar auditado'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  }),
              ],
            ),
    );
  }
}
