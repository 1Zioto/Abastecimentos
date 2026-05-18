import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../core/file_opener.dart';
import '../core/models.dart';
import '../widgets/common.dart';
import '../widgets/empresa_picker.dart';

class RelatoriosScreen extends StatefulWidget {
  const RelatoriosScreen({super.key});

  @override
  State<RelatoriosScreen> createState() => _RelatoriosScreenState();
}

class _RelatoriosScreenState extends State<RelatoriosScreen> {
  bool _loading = true;
  List<Proprietario> _proprietarios = [];
  int? _idProprietario;
  String _status = 'Pendente';
  String _inicio = AppDates.todayIso();
  String _fim = AppDates.todayIso();
  bool _abrindoPdf = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final props = await AppState.instance.db.listProprietarios();
    if (!mounted) return;
    setState(() {
      _proprietarios = props;
      _loading = false;
    });
  }

  Future<void> _abrirRelatorio() async {
    if (_idProprietario == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Selecione um proprietario.'),
          backgroundColor: AppTheme.warning,
        ),
      );
      return;
    }
    setState(() => _abrindoPdf = true);
    try {
      final file = await downloadAuthenticatedFile(
        api: AppState.instance.api,
        path: '/relatorios/proprietario/pdf',
        filename: 'relatorio_proprietario_${_idProprietario}_${_inicio}_$_fim.pdf',
        query: {
          'id_proprietario': _idProprietario,
          'data_inicio': _inicio,
          'data_fim': _fim,
          'status': _status,
        },
      );
      await openDownloadedFile(file);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao abrir PDF: $e'),
          backgroundColor: AppTheme.danger,
        ),
      );
    } finally {
      if (mounted) setState(() => _abrindoPdf = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        const SectionHeader(texto: 'Filtro do relatorio'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              children: [
                EmpresaPickerField(
                  proprietarios: _proprietarios,
                  value: _idProprietario,
                  label: 'Proprietario',
                  hint: 'Selecione um proprietario',
                  onChanged: (v) => setState(() => _idProprietario = v),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: _status,
                  decoration: const InputDecoration(labelText: 'Status'),
                  items: const [
                    DropdownMenuItem(value: 'Pendente', child: Text('Pendente')),
                    DropdownMenuItem(value: 'Confirmado', child: Text('Confirmado')),
                    DropdownMenuItem(value: 'Pago', child: Text('Pago')),
                    DropdownMenuItem(value: 'Cancelado', child: Text('Cancelado')),
                  ],
                  onChanged: (v) => setState(() => _status = v ?? 'Pendente'),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final p = await pickDateIso(context, initialIso: _inicio);
                          if (p != null) setState(() => _inicio = p);
                        },
                        icon: const Icon(Icons.event),
                        label: Text('Inicio: ${AppDates.formatDateBr(_inicio)}'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final p = await pickDateIso(context, initialIso: _fim);
                          if (p != null) setState(() => _fim = p);
                        },
                        icon: const Icon(Icons.event_available),
                        label: Text('Fim: ${AppDates.formatDateBr(_fim)}'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                ElevatedButton.icon(
                  onPressed: _abrindoPdf ? null : _abrirRelatorio,
                  icon: _abrindoPdf
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.picture_as_pdf_outlined),
                  label: Text(_abrindoPdf ? 'Abrindo...' : 'Abrir PDF do relatorio'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
