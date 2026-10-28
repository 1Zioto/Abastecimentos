import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/app_state.dart';
import '../../core/constants.dart';

class IntegracaoAtuaScreen extends StatefulWidget {
  const IntegracaoAtuaScreen({super.key});

  @override
  State<IntegracaoAtuaScreen> createState() => _IntegracaoAtuaScreenState();
}

class _IntegracaoAtuaScreenState extends State<IntegracaoAtuaScreen> {
  bool _loading = true;
  bool _habilitado = true;
  int _total = 0;
  int _page = 1;
  int _lastPage = 1;
  String _situacao = 'todos'; // todos | enviados | erros | pendentes | historico
  final TextEditingController _buscaCtrl = TextEditingController();

  Map<String, int> _resumo = {
    'enviados': 0,
    'erros': 0,
    'pendentes': 0,
    'historico': 0,
  };

  List<Map<String, dynamic>> _itens = [];
  final Set<String> _reenviando = {};

  final NumberFormat _currencyFmt =
      NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');
  final NumberFormat _decimalFmt =
      NumberFormat.decimalPatternDigits(locale: 'pt_BR', decimalDigits: 2);

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void dispose() {
    _buscaCtrl.dispose();
    super.dispose();
  }

  Future<void> _carregar({int page = 1}) async {
    setState(() {
      _loading = true;
      _page = page;
    });

    try {
      final query = <String, dynamic>{
        'situacao': _situacao,
        'page': page,
        'per_page': 50,
      };
      final busca = _buscaCtrl.text.trim();
      if (busca.isNotEmpty) {
        query['busca'] = busca;
      }

      final resp = await AppState.instance.api.get('/atua/lancamentos', query: query);

      if (!mounted) return;

      if (resp is Map) {
        final resumoMap = resp['resumo'] as Map? ?? {};
        setState(() {
          _habilitado = resp['habilitado'] != false;
          _total = (resp['total'] as num?)?.toInt() ?? 0;
          _page = (resp['pagina'] as num?)?.toInt() ?? page;
          _lastPage = (resp['ultima_pagina'] as num?)?.toInt() ?? 1;
          _resumo = {
            'enviados': (resumoMap['enviados'] as num?)?.toInt() ?? 0,
            'erros': (resumoMap['erros'] as num?)?.toInt() ?? 0,
            'pendentes': (resumoMap['pendentes'] as num?)?.toInt() ?? 0,
            'historico': (resumoMap['historico'] as num?)?.toInt() ?? 0,
          };
          _itens = ((resp['itens'] as List?) ?? [])
              .map((i) => Map<String, dynamic>.from(i as Map))
              .toList();
          _loading = false;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro ao carregar lançamentos da Atua: $e'),
        backgroundColor: AppTheme.danger,
      ));
    }
  }

  Future<void> _reenviar(Map<String, dynamic> item) async {
    final id = item['id_abastecimento']?.toString();
    if (id == null || _reenviando.contains(id)) return;

    setState(() => _reenviando.add(id));

    try {
      final resp = await AppState.instance.api.post('/atua/reenviar/$id', {});
      if (!mounted) return;

      final msg = (resp is Map && resp['message'] != null)
          ? resp['message'].toString()
          : 'Enviado para a Atua com sucesso!';

      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: AppTheme.success,
      ));

      // Se o backend retornou o item atualizado, atualizamos localmente
      if (resp is Map && resp['item'] is Map) {
        final updated = Map<String, dynamic>.from(resp['item'] as Map);
        setState(() {
          final idx = _itens.indexWhere((i) => i['id_abastecimento']?.toString() == id);
          if (idx >= 0) {
            _itens[idx] = {..._itens[idx], ...updated};
          }
        });
      }

      await _carregar(page: _page);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Falha ao enviar para Atua: $e'),
        backgroundColor: AppTheme.danger,
      ));
    } finally {
      if (mounted) setState(() => _reenviando.remove(id));
    }
  }

  String _formatDateTime(dynamic dt) {
    if (dt == null) return '—';
    try {
      final parsed = DateTime.parse(dt.toString()).toLocal();
      return DateFormat('dd/MM/yyyy HH:mm').format(parsed);
    } catch (_) {
      return dt.toString();
    }
  }

  Color _statusColor(String? situacao) {
    switch (situacao?.toLowerCase()) {
      case 'enviado':
        return AppTheme.success;
      case 'erro':
        return AppTheme.danger;
      case 'pendente':
        return AppTheme.warning;
      case 'historico':
      default:
        return AppTheme.textMuted;
    }
  }

  String _statusLabel(String? situacao) {
    switch (situacao?.toLowerCase()) {
      case 'enviado':
        return 'Integrado';
      case 'erro':
        return 'Com erro';
      case 'pendente':
        return 'Pendente';
      case 'historico':
        return 'Histórico';
      default:
        return situacao ?? '—';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () => _carregar(page: _page),
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            if (!_habilitado)
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF3C7),
                  border: Border.all(color: const Color(0xFFFCD34D)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.warning_amber_rounded, color: Color(0xFF92400E)),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'A integração está desabilitada (ATUA_HABILITADO=false). Nenhum abastecimento está sendo enviado em lote.',
                        style: TextStyle(color: Color(0xFF92400E), fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),

            // Cartões de Situação
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _buildSummaryChip('todos', 'Todos', _total, AppTheme.primary),
                  const SizedBox(width: 8),
                  _buildSummaryChip(
                      'enviados', 'Integrados', _resumo['enviados'] ?? 0, AppTheme.success),
                  const SizedBox(width: 8),
                  _buildSummaryChip(
                      'erros', 'Com erro', _resumo['erros'] ?? 0, AppTheme.danger),
                  const SizedBox(width: 8),
                  _buildSummaryChip(
                      'pendentes', 'Pendentes', _resumo['pendentes'] ?? 0, AppTheme.warning),
                  const SizedBox(width: 8),
                  _buildSummaryChip(
                      'historico', 'Histórico', _resumo['historico'] ?? 0, AppTheme.textMuted),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // Busca e Ação
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _buscaCtrl,
                    decoration: InputDecoration(
                      hintText: 'Buscar por placa ou Vipe-000...',
                      prefixIcon: const Icon(Icons.search, size: 20),
                      isDense: true,
                      contentPadding:
                          const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                      suffixIcon: _buscaCtrl.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear, size: 18),
                              onPressed: () {
                                _buscaCtrl.clear();
                                _carregar(page: 1);
                              },
                            )
                          : null,
                    ),
                    onSubmitted: (_) => _carregar(page: 1),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filledTonal(
                  onPressed: _loading ? null : () => _carregar(page: 1),
                  tooltip: 'Buscar / Atualizar',
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
            const SizedBox(height: 12),

            if (_loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (_itens.isEmpty)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(40),
                  child: Text(
                    'Nenhum lançamento encontrado para os filtros atuais.',
                    style: TextStyle(color: AppTheme.textMuted),
                  ),
                ),
              )
            else
              ..._itens.map(_buildItemCard),

            // Paginação
            if (_lastPage > 1 && !_loading) ...[
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  OutlinedButton(
                    onPressed: _page <= 1 ? null : () => _carregar(page: _page - 1),
                    child: const Text('Anterior'),
                  ),
                  Text('Página $_page de $_lastPage (${_itens.length} itens)'),
                  OutlinedButton(
                    onPressed:
                        _page >= _lastPage ? null : () => _carregar(page: _page + 1),
                    child: const Text('Próxima'),
                  ),
                ],
              ),
              const SizedBox(height: 24),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildSummaryChip(String key, String label, int count, Color color) {
    final isSelected = _situacao == key;
    return InkWell(
      onTap: () {
        if (_situacao != key) {
          setState(() => _situacao = key);
          _carregar(page: 1);
        }
      },
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isSelected ? color.withValues(alpha: 0.15) : AppTheme.surface,
          border: Border.all(
            color: isSelected ? color : AppTheme.border,
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                color: isSelected ? color : AppTheme.textMuted,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              '$count',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: isSelected ? color : AppTheme.textStrong,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildItemCard(Map<String, dynamic> item) {
    final id = item['id_abastecimento']?.toString() ?? '';
    final atuaId = item['atua_id']?.toString() ?? '—';
    final situacao = item['situacao']?.toString() ?? '';
    final erro = item['erro']?.toString();
    final placa = item['placa']?.toString() ?? '—';
    final motorista = item['motorista']?.toString() ?? '—';
    final dataHora = _formatDateTime(item['data_hora']);
    final litros = (item['litros'] as num?)?.toDouble() ?? 0.0;
    final valorTotal = (item['valor_total'] as num?)?.toDouble() ?? 0.0;
    final odometro = item['odometro']?.toString();
    final caixa = item['atua_caixa']?.toString();
    final enviando = _reenviando.contains(id);

    final statusColor = _statusColor(situacao);
    final statusText = _statusLabel(situacao);
    final isEnviado = situacao.toLowerCase() == 'enviado';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Topo: ID Atua e Badge de Situação
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: AppTheme.border),
                  ),
                  child: Text(
                    atuaId,
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: statusColor.withValues(alpha: 0.5)),
                  ),
                  child: Text(
                    statusText,
                    style: TextStyle(
                      color: statusColor,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Informações do Veículo e Motorista
            Row(
              children: [
                const Icon(Icons.directions_bus_outlined, size: 16, color: AppTheme.textMuted),
                const SizedBox(width: 6),
                Text(
                  placa,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                ),
                const SizedBox(width: 12),
                const Icon(Icons.person_outline, size: 16, color: AppTheme.textMuted),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    motorista,
                    style: const TextStyle(fontSize: 13),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),

            // Data, Litros e Valor
            Row(
              children: [
                const Icon(Icons.calendar_today_outlined, size: 14, color: AppTheme.textMuted),
                const SizedBox(width: 6),
                Text(dataHora, style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                const Spacer(),
                Text(
                  '${_decimalFmt.format(litros)} L',
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                ),
                const SizedBox(width: 8),
                Text(
                  _currencyFmt.format(valorTotal),
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    color: AppTheme.textStrong,
                  ),
                ),
              ],
            ),

            if (odometro != null && odometro.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                'Odômetro: $odometro km${caixa != null && caixa.isNotEmpty ? ' · Caixa Atua: $caixa' : ''}',
                style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
              ),
            ],

            // Mensagem de Erro (se houver)
            if (erro != null && erro.trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF2F2),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: const Color(0xFFFCA5A5)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.error_outline, size: 16, color: AppTheme.danger),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        erro,
                        style: const TextStyle(color: AppTheme.danger, fontSize: 11),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 10),

            // Botão de Envio / Reenvio
            Align(
              alignment: Alignment.centerRight,
              child: isEnviado
                  ? OutlinedButton.icon(
                      onPressed: enviando ? null : () => _reenviar(item),
                      icon: enviando
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.replay_outlined, size: 16),
                      label: Text(enviando ? 'Enviando...' : 'Reenviar para Atua'),
                      style: OutlinedButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      ),
                    )
                  : FilledButton.icon(
                      onPressed: enviando ? null : () => _reenviar(item),
                      icon: enviando
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.send_outlined, size: 16),
                      label: Text(enviando ? 'Enviando...' : 'Enviar para Atua'),
                      style: FilledButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        backgroundColor:
                            situacao == 'erro' ? AppTheme.danger : AppTheme.primary,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
