import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/local_db.dart';

class SyncLogsScreen extends StatefulWidget {
  const SyncLogsScreen({super.key});

  @override
  State<SyncLogsScreen> createState() => _SyncLogsScreenState();
}

class _SyncLogsScreenState extends State<SyncLogsScreen> {
  bool _loading = true;
  List<SyncItem> _queue = [];
  List<Map<String, dynamic>> _logs = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final queue = await AppState.instance.db.listQueue();
    final logs = await AppState.instance.db.listSyncLogs(limit: 300);
    if (!mounted) return;
    setState(() {
      _queue = queue;
      _logs = logs;
      _loading = false;
    });
  }

  String _buildCopyText() {
    final b = StringBuffer();
    b.writeln('=== LOGS DE SINCRONIZACAO ===');
    b.writeln('Gerado em: ${DateTime.now().toIso8601String()}');
    b.writeln('');
    b.writeln('--- FILA PENDENTE (${_queue.length}) ---');
    if (_queue.isEmpty) {
      b.writeln('Sem itens pendentes.');
    } else {
      for (final q in _queue) {
        b.writeln(
            '#${q.id} | ${q.entity}/${q.action} | attempts=${q.attempts} | erro=${q.lastError ?? '-'}');
        b.writeln('payload=${q.payloadJson}');
        b.writeln('');
      }
    }
    b.writeln('');
    b.writeln('--- EVENTOS DE SYNC (${_logs.length}) ---');
    if (_logs.isEmpty) {
      b.writeln('Sem logs registrados.');
    } else {
      for (final l in _logs) {
        b.writeln(
            '[${l['ts'] ?? '-'}] ${l['level'] ?? 'info'} | ${l['message'] ?? '-'}');
        if ((l['context'] ?? '').toString().trim().isNotEmpty) {
          b.writeln('context=${l['context']}');
        }
      }
    }
    return b.toString();
  }

  Future<void> _copyAll() async {
    final text = _buildCopyText();
    await Clipboard.setData(ClipboardData(text: text));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      content: Text('Logs copiados para a area de transferencia.'),
      backgroundColor: AppTheme.success,
    ));
  }

  Future<void> _clearLogs() async {
    await AppState.instance.db.clearSyncLogs();
    await _load();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      content: Text('Logs limpos.'),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Logs de Sync'),
        actions: [
          IconButton(
            tooltip: 'Recarregar',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: 'Copiar tudo',
            onPressed: _loading ? null : _copyAll,
            icon: const Icon(Icons.copy_all),
          ),
          IconButton(
            tooltip: 'Limpar logs',
            onPressed: _loading ? null : _clearLogs,
            icon: const Icon(Icons.delete_sweep),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(12),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Fila pendente: ${_queue.length}',
                            style: const TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        if (_queue.isEmpty)
                          const Text('Sem pendencias no momento.')
                        else
                          ..._queue.map((q) => Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: Container(
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    color: AppTheme.surfaceAlt,
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(color: AppTheme.border),
                                  ),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        '#${q.id} ${q.entity}/${q.action}',
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w700),
                                      ),
                                      Text('Tentativas: ${q.attempts}'),
                                      if ((q.lastError ?? '').trim().isNotEmpty)
                                        Text(
                                          'Erro: ${q.lastError}',
                                          style: const TextStyle(
                                            color: AppTheme.warning,
                                          ),
                                        ),
                                      const SizedBox(height: 6),
                                      SelectableText(
                                        q.payloadJson,
                                        style: const TextStyle(fontSize: 11),
                                      ),
                                    ],
                                  ),
                                ),
                              )),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Eventos de sync: ${_logs.length}',
                            style: const TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        if (_logs.isEmpty)
                          const Text('Sem eventos registrados.')
                        else
                          ..._logs.map((l) => Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: Container(
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    color: AppTheme.surfaceAlt,
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(color: AppTheme.border),
                                  ),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        '[${l['level'] ?? 'info'}] ${l['message'] ?? ''}',
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w700),
                                      ),
                                      Text('${l['ts'] ?? ''}',
                                          style: const TextStyle(
                                              color: AppTheme.textMuted,
                                              fontSize: 12)),
                                      if ((l['context'] ?? '')
                                          .toString()
                                          .trim()
                                          .isNotEmpty)
                                        SelectableText(
                                          (l['context'] ?? '').toString(),
                                          style: const TextStyle(fontSize: 12),
                                        ),
                                    ],
                                  ),
                                ),
                              )),
                      ],
                    ),
                  ),
                ),
              ],
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _loading ? null : _copyAll,
        icon: const Icon(Icons.copy_all),
        label: const Text('Copiar erros/logs'),
      ),
    );
  }
}
