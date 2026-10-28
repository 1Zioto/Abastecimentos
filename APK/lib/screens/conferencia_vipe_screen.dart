import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../core/vipe_report_parser.dart';
import '../widgets/common.dart';

class ConferenciaVipeScreen extends StatefulWidget {
  const ConferenciaVipeScreen({super.key});

  @override
  State<ConferenciaVipeScreen> createState() => _ConferenciaVipeScreenState();
}

class _ConferenciaVipeScreenState extends State<ConferenciaVipeScreen> {
  final _plateController = TextEditingController();

  bool _processing = false;
  String _processingMessage = '';
  String _statusFilter = 'todos';
  String? _fileName;
  Map<String, dynamic>? _response;
  Map<String, dynamic>? _parsedFile;
  List<Map<String, dynamic>> _items = [];

  @override
  void dispose() {
    _plateController.dispose();
    super.dispose();
  }

  Future<void> _selectAndCompare() async {
    if (_processing) return;

    try {
      final picked = await FilePicker.pickFile(
        type: FileType.custom,
        allowedExtensions: const ['xlsx'],
      ).timeout(const Duration(seconds: 60));
      final path = picked?.path;
      if (path == null || path.trim().isEmpty) return;

      setState(() {
        _processing = true;
        _processingMessage = 'Lendo o relatório...';
      });

      final bytes = await File(path).readAsBytes();
      final parsed = await compute(parseVipeReportBytes, bytes);
      if (!mounted) return;

      setState(() {
        _processingMessage =
            'Conferindo as placas da Vipe Transportes no sistema...';
      });

      final response = await AppState.instance.api.post(
        '/conferencia-vipe/comparar',
        {
          'arquivo_origem':
              picked?.name ?? path.split(Platform.pathSeparator).last,
          'linhas_ignoradas': parsed['linhas_ignoradas'] ?? 0,
          'itens': parsed['itens'],
        },
      );
      if (!mounted) return;
      if (response is! Map) {
        throw const FormatException(
            'O servidor retornou uma resposta inválida.');
      }

      final normalizedResponse = Map<String, dynamic>.from(response);
      final data = normalizedResponse['data'];
      setState(() {
        _fileName = picked?.name ?? path.split(Platform.pathSeparator).last;
        _parsedFile = parsed;
        _response = normalizedResponse;
        _items = data is List
            ? data
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .toList()
            : [];
        _statusFilter = 'todos';
        _plateController.clear();
        _processing = false;
      });
    } on TimeoutException {
      _showError('A seleção do arquivo demorou demais. Tente novamente.');
    } on FormatException catch (error) {
      _showError(error.message);
    } on ApiException catch (error) {
      _showError(error.message);
    } catch (error) {
      _showError('Não foi possível conferir este relatório: $error');
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    setState(() => _processing = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppTheme.danger,
      ),
    );
  }

  List<Map<String, dynamic>> get _filteredItems {
    final plate = _plateController.text
        .trim()
        .toUpperCase()
        .replaceAll(RegExp(r'[^A-Z0-9]'), '');
    return _items.where((item) {
      if (_statusFilter != 'todos' && item['status'] != _statusFilter) {
        return false;
      }
      if (plate.isNotEmpty &&
          !'${item['placa'] ?? ''}'.toUpperCase().contains(plate)) {
        return false;
      }
      return true;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredItems;
    return LoadingOverlay(
      show: _processing,
      message: _processingMessage,
      child: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: 1 + filtered.length,
        itemBuilder: (context, index) {
          if (index == 0) return _buildHeader(context, filtered.length);
          return _ResultCard(item: filtered[index - 1]);
        },
      ),
    );
  }

  Widget _buildHeader(BuildContext context, int filteredCount) {
    final response = _response;
    final summary = response?['resumo'] is Map
        ? Map<String, dynamic>.from(response!['resumo'] as Map)
        : <String, dynamic>{};
    final hasQuantity = _parsedFile?['possui_quantidade'] == true;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Conferência Vipe Transportes',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Anexe o relatório de despesas com combustíveis. O painel considera '
          'somente as placas cadastradas para a Vipe Transportes e confere '
          'placa, data e valores.',
          style: TextStyle(color: AppTheme.textMuted),
        ),
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: _processing ? null : _selectAndCompare,
            icon: const Icon(Icons.upload_file_outlined),
            label: Text(
              response == null
                  ? 'Anexar relatório XLSX'
                  : 'Anexar outro relatório',
            ),
          ),
        ),
        if (_fileName != null) ...[
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(
                Icons.description_outlined,
                size: 18,
                color: AppTheme.textMuted,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  _fileName!,
                  style: const TextStyle(color: AppTheme.textMuted),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ],
        if (response == null) ...[
          const SizedBox(height: 28),
          const EmptyState(
            icone: Icons.fact_check_outlined,
            titulo: 'Nenhum relatório conferido',
            mensagem:
                'Use o botão acima para selecionar o arquivo exportado do Terno.',
          ),
          const SizedBox(height: 24),
        ] else ...[
          const SizedBox(height: 18),
          _buildSummary(context, summary),
          const SizedBox(height: 10),
          if (!hasQuantity)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.warning.withValues(alpha: 0.10),
                border: Border.all(
                  color: AppTheme.warning.withValues(alpha: 0.55),
                ),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.info_outline,
                    color: AppTheme.warning,
                    size: 20,
                  ),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Este relatório não possui coluna de quantidade em '
                      'litros. Nesta conferência foram usados placa, data e '
                      'valor total; os litros do sistema aparecem apenas '
                      'como referência.',
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 14),
          TextField(
            controller: _plateController,
            onChanged: (_) => setState(() {}),
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(
              labelText: 'Buscar placa',
              prefixIcon: Icon(Icons.search),
            ),
          ),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _filterChip('todos', 'Todos', summary['total']),
                const SizedBox(width: 6),
                _filterChip('ok', 'Tudo OK', summary['ok']),
                const SizedBox(width: 6),
                _filterChip('atencao', 'Atenção', summary['atencao']),
                const SizedBox(width: 6),
                _filterChip(
                  'pendente',
                  'Pendentes',
                  summary['pendentes'],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Text(
            '$filteredCount resultado(s) exibido(s)',
            style: const TextStyle(
              color: AppTheme.textMuted,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
        ],
      ],
    );
  }

  Widget _filterChip(String value, String label, dynamic count) {
    return FilterChip(
      selected: _statusFilter == value,
      onSelected: (_) => setState(() => _statusFilter = value),
      label: Text('$label (${count ?? 0})'),
      labelStyle: TextStyle(
        color: _statusFilter == value ? Colors.white : AppTheme.textStrong,
        fontWeight: FontWeight.w600,
      ),
    );
  }

  Widget _buildSummary(
    BuildContext context,
    Map<String, dynamic> summary,
  ) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth >= 720
            ? (constraints.maxWidth - 24) / 4
            : constraints.maxWidth >= 420
                ? (constraints.maxWidth - 8) / 2
                : constraints.maxWidth;
        return Wrap(
          spacing: 8,
          runSpacing: 2,
          children: [
            SizedBox(
              width: width,
              child: KpiCard(
                titulo: 'Linhas Vipe',
                valor: '${summary['total'] ?? 0}',
                icone: Icons.directions_car_outlined,
              ),
            ),
            SizedBox(
              width: width,
              child: KpiCard(
                titulo: 'Tudo OK',
                valor: '${summary['ok'] ?? 0}',
                icone: Icons.check_circle_outline,
                cor: AppTheme.success,
              ),
            ),
            SizedBox(
              width: width,
              child: KpiCard(
                titulo: 'Pontos de atenção',
                valor: '${summary['atencao'] ?? 0}',
                icone: Icons.warning_amber_outlined,
                cor: AppTheme.warning,
              ),
            ),
            SizedBox(
              width: width,
              child: KpiCard(
                titulo: 'Pendentes',
                valor: '${summary['pendentes'] ?? 0}',
                icone: Icons.error_outline,
                cor: AppTheme.danger,
              ),
            ),
            SizedBox(
              width: width,
              child: KpiCard(
                titulo: 'Valor no relatório',
                valor: AppDates.money(summary['valor_relatorio']),
                icone: Icons.receipt_long_outlined,
              ),
            ),
            SizedBox(
              width: width,
              child: KpiCard(
                titulo: 'Valor no sistema',
                valor: AppDates.money(summary['valor_sistema']),
                icone: Icons.storage_outlined,
              ),
            ),
            SizedBox(
              width: width,
              child: KpiCard(
                titulo: 'Diferença total',
                valor: AppDates.money(summary['diferenca_valor']),
                icone: Icons.compare_arrows,
                cor: _number(summary['diferenca_valor']).abs() <= 0.05
                    ? AppTheme.success
                    : AppTheme.warning,
              ),
            ),
          ],
        );
      },
    );
  }
}

class _ResultCard extends StatelessWidget {
  final Map<String, dynamic> item;

  const _ResultCard({required this.item});

  @override
  Widget build(BuildContext context) {
    final status = '${item['status'] ?? 'pendente'}';
    final color = switch (status) {
      'ok' => AppTheme.success,
      'atencao' => AppTheme.warning,
      _ => AppTheme.danger,
    };
    final system = item['abastecimento'] is Map
        ? Map<String, dynamic>.from(item['abastecimento'] as Map)
        : <String, dynamic>{};
    final document = '${item['documento'] ?? ''}'.trim();
    final reportQuantity = item['quantidade_relatorio'];
    final valueDifference = item['diferenca_valor'];

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 5),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: color.withValues(alpha: status == 'ok' ? 0.08 : 0.11),
        border: Border.all(color: color.withValues(alpha: 0.72), width: 1.3),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                status == 'ok'
                    ? Icons.check_circle
                    : status == 'atencao'
                        ? Icons.warning_amber_rounded
                        : Icons.error,
                color: color,
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${item['placa'] ?? 'Sem placa'} · '
                      '${AppDates.formatDateBr('${item['data'] ?? ''}')}',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                    Text(
                      '${item['status_label'] ?? ''}',
                      style: TextStyle(
                        color: color,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                'Linha ${item['linha'] ?? '-'}',
                style: const TextStyle(
                  color: AppTheme.textMuted,
                  fontSize: 12,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            '${item['mensagem'] ?? ''}',
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 18,
            runSpacing: 8,
            children: [
              _ValueDetail(
                label: 'Relatório',
                value: AppDates.money(item['valor_relatorio']),
              ),
              _ValueDetail(
                label: 'Sistema',
                value: system.isEmpty
                    ? 'Não encontrado'
                    : AppDates.money(system['valor_total']),
              ),
              if (valueDifference != null)
                _ValueDetail(
                  label: 'Diferença',
                  value: AppDates.money(valueDifference),
                ),
              if (reportQuantity != null)
                _ValueDetail(
                  label: 'Litros no relatório',
                  value: '${AppDates.number(reportQuantity)} L',
                ),
              if (system['quantidade_litros'] != null)
                _ValueDetail(
                  label: reportQuantity == null
                      ? 'Litros no sistema (referência)'
                      : 'Litros no sistema',
                  value: '${AppDates.number(system['quantidade_litros'])} L',
                ),
            ],
          ),
          if (document.isNotEmpty || system['local'] != null) ...[
            const SizedBox(height: 10),
            Text(
              [
                if (document.isNotEmpty) 'Documento: $document',
                if (system['local'] != null) 'Local: ${system['local']}',
              ].join('  •  '),
              style: const TextStyle(
                color: AppTheme.textMuted,
                fontSize: 12,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ValueDetail extends StatelessWidget {
  final String label;
  final String value;

  const _ValueDetail({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 112),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: AppTheme.textMuted,
              fontSize: 11,
            ),
          ),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

double _number(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse('$value'.replaceAll(',', '.')) ?? 0;
}
