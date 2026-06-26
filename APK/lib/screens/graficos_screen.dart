import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../widgets/common.dart';

class GraficosScreen extends StatefulWidget {
  const GraficosScreen({super.key});

  @override
  State<GraficosScreen> createState() => _GraficosScreenState();
}

class _GraficosScreenState extends State<GraficosScreen> {
  bool _loading = true;
  String? _error;
  _GraficosData? _data;
  late String _inicio;
  late String _fim;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _inicio = '${now.year}-${now.month.toString().padLeft(2, '0')}-01';
    _fim = AppDates.todayIso();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final local = AppState.instance.auth.filialAtual;
      final resp = await AppState.instance.api.get(
        '/graficos-gerenciais',
        query: {
          'data_inicio': _inicio,
          'data_fim': _fim,
          if (local != null && local.trim().isNotEmpty) 'local': local,
        },
      );
      if (resp is! Map) {
        throw Exception('Payload de graficos invalido');
      }
      if (!mounted) return;
      setState(() {
        _data = _GraficosData.fromJson(Map<String, dynamic>.from(resp));
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Erro ao carregar graficos: $e';
        _loading = false;
      });
    }
  }

  void _setMesAtual() {
    final now = DateTime.now();
    setState(() {
      _inicio = '${now.year}-${now.month.toString().padLeft(2, '0')}-01';
      _fim = AppDates.todayIso();
    });
    _load();
  }

  void _setHoje() {
    setState(() {
      _inicio = AppDates.todayIso();
      _fim = AppDates.todayIso();
    });
    _load();
  }

  Future<void> _pickInicio() async {
    final picked = await pickDateIso(context, initialIso: _inicio);
    if (picked == null) return;
    setState(() => _inicio = picked);
    _load();
  }

  Future<void> _pickFim() async {
    final picked = await pickDateIso(context, initialIso: _fim);
    if (picked == null) return;
    setState(() => _fim = picked);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _data == null) {
      return const Center(child: CircularProgressIndicator());
    }

    final data = _data;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          Row(
            children: [
              const Expanded(child: SectionHeader(texto: 'Graficos')),
              IconButton(
                tooltip: 'Atualizar',
                onPressed: _loading ? null : _load,
                icon: _loading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh),
              ),
            ],
          ),
          Text(
            'Indicadores gerenciais por periodo e filial.',
            style: TextStyle(
              color: AppTheme.textMuted.withValues(alpha: 0.9),
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 10),
          _FiltersCard(
            inicio: _inicio,
            fim: _fim,
            onInicio: _pickInicio,
            onFim: _pickFim,
            onMes: _setMesAtual,
            onHoje: _setHoje,
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Card(
              color: const Color(0xFFFEF2F2),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(
                  _error!,
                  style: const TextStyle(
                    color: AppTheme.danger,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ],
          if (data != null) ...[
            const SizedBox(height: 10),
            _PeriodCard(data: data),
            const SizedBox(height: 8),
            _MetricGrid(metrics: _metrics(data)),
            if (data.porFilial.isNotEmpty) ...[
              const SizedBox(height: 8),
              _BranchProfitList(filiais: data.porFilial),
            ],
            const SizedBox(height: 8),
            _BarCompareCard(
              title: 'Comprado x Vendido',
              leftLabel: 'Comprado',
              rightLabel: 'Vendido',
              leftValue: data.totais.compradoValor,
              rightValue: data.totais.vendidoValor,
              valueFormatter: AppDates.money,
              leftColor: AppTheme.warning,
              rightColor: AppTheme.primary,
            ),
            const SizedBox(height: 8),
            _BarCompareCard(
              title: 'Preco medio',
              leftLabel: 'Compra',
              rightLabel: 'Venda',
              leftValue: data.totais.precoMedioComprado,
              rightValue: data.totais.precoMedioVendido,
              valueFormatter: (v) => '${AppDates.money(v)}/L',
              leftColor: AppTheme.warning,
              rightColor: AppTheme.success,
            ),
            const SizedBox(height: 8),
            _UltimaNotaCard(nota: data.ultimaEntradaNota),
            const SizedBox(height: 8),
            _ProprietariosControleCard(data: data.proprietariosControle),
          ],
        ],
      ),
    );
  }

  List<_Metric> _metrics(_GraficosData data) {
    final t = data.totais;
    return [
      _Metric(
        'Margem bruta',
        AppDates.money(t.margemBruta),
        detail:
            '${AppDates.money(t.vendidoValor)} vendido - ${AppDates.money(t.compradoValor)} comprado com transporte',
        tone: t.margemBruta >= 0 ? _MetricTone.success : _MetricTone.danger,
      ),
      _Metric(
        'Custo transporte',
        AppDates.money(t.custoTransporteTotal),
        detail:
            '${AppDates.number(t.compradoLitros, digits: 2)} L x ${AppDates.money(0.04)}/L',
        tone: _MetricTone.warning,
      ),
      _Metric(
        'Litros pendentes',
        '${AppDates.number(t.pendenteBaixaLitros, digits: 2)} L',
        detail:
            '${AppDates.money(t.pendenteBaixaValor)} em ${t.pendenteBaixaTotal} abastecimento(s)',
        tone: t.pendenteBaixaTotal > 0
            ? _MetricTone.warning
            : _MetricTone.success,
      ),
      _Metric(
        'Ticket medio',
        AppDates.money(t.ticketMedio),
        detail: '${t.abastecimentosTotal} abastecimento(s)',
        tone: _MetricTone.primary,
      ),
      _Metric(
        'Preco medio comprado',
        '${AppDates.money(t.precoMedioComprado)}/L',
        detail:
            '${AppDates.number(t.compradoLitros, digits: 2)} L comprados, transporte incluso',
        tone: _MetricTone.warning,
      ),
      _Metric(
        'Preco medio vendido',
        '${AppDates.money(t.precoMedioVendido)}/L',
        detail: '${AppDates.number(t.vendidoLitros, digits: 2)} L vendidos',
        tone: _MetricTone.info,
      ),
      _Metric(
        'Diferenca por litro',
        '${AppDates.money(t.diferencaMediaLitro)}/L',
        detail: 'Venda media menos compra media',
        tone: t.diferencaMediaLitro >= 0
            ? _MetricTone.success
            : _MetricTone.danger,
      ),
      _Metric(
        'Inconsistencias',
        AppDates.intNumber(t.inconsistencias),
        detail: 'Itens criticos no periodo',
        tone: t.inconsistencias > 0 ? _MetricTone.danger : _MetricTone.success,
      ),
      _Metric(
        'Bloqueados / limite',
        '${t.proprietariosBloqueados} / ${t.proprietariosProximosLimite}',
        detail: '${t.proprietariosLimiteEstourado} com limite estourado',
        tone: (t.proprietariosBloqueados +
                    t.proprietariosProximosLimite +
                    t.proprietariosLimiteEstourado) >
                0
            ? _MetricTone.warning
            : _MetricTone.success,
      ),
      _Metric(
        'Estoque estimado',
        AppDates.money(t.estoqueEstimadoValor),
        detail:
            '${AppDates.number(t.tanqueLitros, digits: 2)} L no tanque x preco medio',
        tone: _MetricTone.neutral,
      ),
      _Metric(
        'Ultima nota',
        data.ultimaEntradaNota == null
            ? '-'
            : AppDates.formatDateBr(data.ultimaEntradaNota!.data),
        detail: data.ultimaEntradaNota == null
            ? 'Sem nota cadastrada'
            : '${AppDates.number(data.ultimaEntradaNota!.quantidade, digits: 2)} L - ${AppDates.money(data.ultimaEntradaNota!.valorFinal)}',
        tone: _MetricTone.neutral,
      ),
    ];
  }
}

class _FiltersCard extends StatelessWidget {
  final String inicio;
  final String fim;
  final VoidCallback onInicio;
  final VoidCallback onFim;
  final VoidCallback onMes;
  final VoidCallback onHoje;

  const _FiltersCard({
    required this.inicio,
    required this.fim,
    required this.onInicio,
    required this.onFim,
    required this.onMes,
    required this.onHoje,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onInicio,
                    icon: const Icon(Icons.event),
                    label: Text('Inicio: ${AppDates.formatDateBr(inicio)}'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onFim,
                    icon: const Icon(Icons.event_available),
                    label: Text('Fim: ${AppDates.formatDateBr(fim)}'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: FilledButton.tonal(
                    onPressed: onMes,
                    child: const Text('Mes atual'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton.tonal(
                    onPressed: onHoje,
                    child: const Text('Hoje'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PeriodCard extends StatelessWidget {
  final _GraficosData data;
  const _PeriodCard({required this.data});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.analytics_outlined, color: AppTheme.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    data.periodo.local,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                Text(
                  '${data.totais.abastecimentosTotal} abastecimento(s)',
                  style: const TextStyle(
                    color: AppTheme.textMuted,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${AppDates.formatDateBr(data.periodo.dataInicio)} ate ${AppDates.formatDateBr(data.periodo.dataFim)}',
              style: const TextStyle(color: AppTheme.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}

class _MetricGrid extends StatelessWidget {
  final List<_Metric> metrics;

  const _MetricGrid({required this.metrics});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth > 560 ? 3 : 2;
        return GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: columns,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: columns == 3 ? 1.58 : 1.28,
          children:
              metrics.map((metric) => _MetricCard(metric: metric)).toList(),
        );
      },
    );
  }
}

class _MetricCard extends StatelessWidget {
  final _Metric metric;
  const _MetricCard({required this.metric});

  @override
  Widget build(BuildContext context) {
    final color = metric.tone.color;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    metric.label.toUpperCase(),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppTheme.textMuted,
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              metric.value,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: color,
                fontSize: 18,
                fontWeight: FontWeight.w900,
              ),
            ),
            if (metric.detail != null) ...[
              const Spacer(),
              Text(
                metric.detail!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: AppTheme.textMuted,
                  fontSize: 11,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _BranchProfitList extends StatelessWidget {
  final List<_GraficosData> filiais;
  const _BranchProfitList({required this.filiais});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Margem por filial',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 10),
            ...filiais.map((filial) => _BranchProfitRow(filial: filial)),
          ],
        ),
      ),
    );
  }
}

class _BranchProfitRow extends StatelessWidget {
  final _GraficosData filial;
  const _BranchProfitRow({required this.filial});

  @override
  Widget build(BuildContext context) {
    final t = filial.totais;
    final positive = t.margemBruta >= 0;
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: positive ? const Color(0xFFF0FDF4) : const Color(0xFFFEF2F2),
        border: Border.all(
          color: positive ? const Color(0xFFBBF7D0) : const Color(0xFFFECACA),
        ),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  filial.periodo.local,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Text(
                AppDates.money(t.margemBruta),
                style: TextStyle(
                  color: positive ? AppTheme.success : AppTheme.danger,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _InfoChip(text: 'Compra ${AppDates.money(t.compradoValor)}'),
              _InfoChip(
                  text:
                      'Transporte ${AppDates.money(t.custoTransporteTotal)}'),
              _InfoChip(text: 'Venda ${AppDates.money(t.vendidoValor)}'),
              _InfoChip(
                  text: 'Dif. ${AppDates.money(t.diferencaMediaLitro)}/L'),
              _InfoChip(text: '${t.abastecimentosTotal} abastecimento(s)'),
            ],
          ),
        ],
      ),
    );
  }
}

class _BarCompareCard extends StatelessWidget {
  final String title;
  final String leftLabel;
  final String rightLabel;
  final double leftValue;
  final double rightValue;
  final String Function(num?) valueFormatter;
  final Color leftColor;
  final Color rightColor;

  const _BarCompareCard({
    required this.title,
    required this.leftLabel,
    required this.rightLabel,
    required this.leftValue,
    required this.rightValue,
    required this.valueFormatter,
    required this.leftColor,
    required this.rightColor,
  });

  @override
  Widget build(BuildContext context) {
    final maxValue =
        [leftValue, rightValue, 1.0].reduce((a, b) => a > b ? a : b);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style:
                    const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
            const SizedBox(height: 14),
            _ProgressLine(
              label: leftLabel,
              value: leftValue,
              maxValue: maxValue,
              color: leftColor,
              valueFormatter: valueFormatter,
            ),
            const SizedBox(height: 10),
            _ProgressLine(
              label: rightLabel,
              value: rightValue,
              maxValue: maxValue,
              color: rightColor,
              valueFormatter: valueFormatter,
            ),
          ],
        ),
      ),
    );
  }
}

class _ProgressLine extends StatelessWidget {
  final String label;
  final double value;
  final double maxValue;
  final Color color;
  final String Function(num?) valueFormatter;

  const _ProgressLine({
    required this.label,
    required this.value,
    required this.maxValue,
    required this.color,
    required this.valueFormatter,
  });

  @override
  Widget build(BuildContext context) {
    final pct = maxValue <= 0 ? 0.0 : (value / maxValue).clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(label,
                  style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
            Text(valueFormatter(value),
                style: const TextStyle(fontWeight: FontWeight.w900)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: pct,
            minHeight: 11,
            backgroundColor: AppTheme.surfaceAlt,
            color: color,
          ),
        ),
      ],
    );
  }
}

class _UltimaNotaCard extends StatelessWidget {
  final _UltimaEntradaNota? nota;
  const _UltimaNotaCard({required this.nota});

  @override
  Widget build(BuildContext context) {
    final item = nota;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Ultima entrada de nota',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 10),
            if (item == null)
              const Text('Sem nota encontrada.',
                  style: TextStyle(color: AppTheme.textMuted))
            else ...[
              Text(
                item.numeroNotaFiscal?.trim().isEmpty == false
                    ? item.numeroNotaFiscal!
                    : 'Sem numero',
                style:
                    const TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _InfoChip(
                      text: AppDates.formatDateTimeOrDateBr(
                          item.dataHora, item.data)),
                  _InfoChip(
                      text: '${AppDates.number(item.quantidade, digits: 2)} L'),
                  _InfoChip(text: 'Final ${AppDates.money(item.valorFinal)}'),
                  _InfoChip(
                      text:
                          'Transporte ${AppDates.money(item.custoTransporteTotal)}'),
                  if ((item.local ?? '').isNotEmpty)
                    _InfoChip(text: item.local!),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ProprietariosControleCard extends StatelessWidget {
  final _ProprietariosControle data;
  const _ProprietariosControleCard({required this.data});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Proprietarios em atencao',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
                  ),
                ),
                Text(
                  '${data.itens.length} exibido(s)',
                  style: const TextStyle(color: AppTheme.textMuted),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (data.itens.isEmpty)
              const Text(
                'Nenhum proprietario bloqueado ou proximo do limite.',
                style: TextStyle(color: AppTheme.textMuted),
              )
            else
              ...data.itens.map((item) => _ProprietarioControleRow(item: item)),
          ],
        ),
      ),
    );
  }
}

class _ProprietarioControleRow extends StatelessWidget {
  final _ProprietarioControleItem item;
  const _ProprietarioControleRow({required this.item});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.surfaceAlt,
        border: Border.all(color: AppTheme.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.nome,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 3),
                Text(
                  '${item.local} - ${item.status.isEmpty ? item.situacao : item.status}',
                  style:
                      const TextStyle(color: AppTheme.textMuted, fontSize: 12),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                AppDates.money(item.pendenteValor),
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
              Text(
                '${AppDates.number(item.pendenteLitros, digits: 2)} L',
                style: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  final String text;
  const _InfoChip({required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: AppTheme.surfaceAlt,
        border: Border.all(color: AppTheme.border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _Metric {
  final String label;
  final String value;
  final String? detail;
  final _MetricTone tone;

  const _Metric(
    this.label,
    this.value, {
    this.detail,
    this.tone = _MetricTone.neutral,
  });
}

enum _MetricTone {
  primary(AppTheme.primary),
  success(AppTheme.success),
  danger(AppTheme.danger),
  warning(AppTheme.warning),
  info(Color(0xFF0891B2)),
  neutral(AppTheme.textStrong);

  final Color color;
  const _MetricTone(this.color);
}

class _GraficosData {
  final _Periodo periodo;
  final _GraficosTotais totais;
  final _ProprietariosControle proprietariosControle;
  final _UltimaEntradaNota? ultimaEntradaNota;
  final List<_GraficosData> porFilial;

  const _GraficosData({
    required this.periodo,
    required this.totais,
    required this.proprietariosControle,
    required this.ultimaEntradaNota,
    this.porFilial = const [],
  });

  factory _GraficosData.fromJson(Map<String, dynamic> json) {
    return _GraficosData(
      periodo: _Periodo.fromJson(_map(json['periodo'])),
      totais: _GraficosTotais.fromJson(_map(json['totais'])),
      proprietariosControle:
          _ProprietariosControle.fromJson(_map(json['proprietarios_controle'])),
      ultimaEntradaNota: json['ultima_entrada_nota'] is Map
          ? _UltimaEntradaNota.fromJson(_map(json['ultima_entrada_nota']))
          : null,
      porFilial: (json['por_filial'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => _GraficosData.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }
}

class _Periodo {
  final String dataInicio;
  final String dataFim;
  final String local;

  const _Periodo({
    required this.dataInicio,
    required this.dataFim,
    required this.local,
  });

  factory _Periodo.fromJson(Map<String, dynamic> json) {
    return _Periodo(
      dataInicio: (json['data_inicio'] ?? '').toString(),
      dataFim: (json['data_fim'] ?? '').toString(),
      local: (json['local'] ?? '').toString(),
    );
  }
}

class _GraficosTotais {
  final double compradoValor;
  final double compradoValorSemTransporte;
  final double compradoLitros;
  final int compradoRegistros;
  final double custoTransporteTotal;
  final double vendidoValor;
  final double vendidoLitros;
  final int abastecimentosTotal;
  final double margemBruta;
  final double pendenteBaixaValor;
  final double pendenteBaixaLitros;
  final int pendenteBaixaTotal;
  final double ticketMedio;
  final double precoMedioComprado;
  final double precoMedioVendido;
  final double diferencaMediaLitro;
  final int inconsistencias;
  final int proprietariosBloqueados;
  final int proprietariosProximosLimite;
  final int proprietariosLimiteEstourado;
  final double tanqueLitros;
  final double estoqueEstimadoValor;

  const _GraficosTotais({
    required this.compradoValor,
    required this.compradoValorSemTransporte,
    required this.compradoLitros,
    required this.compradoRegistros,
    required this.custoTransporteTotal,
    required this.vendidoValor,
    required this.vendidoLitros,
    required this.abastecimentosTotal,
    required this.margemBruta,
    required this.pendenteBaixaValor,
    required this.pendenteBaixaLitros,
    required this.pendenteBaixaTotal,
    required this.ticketMedio,
    required this.precoMedioComprado,
    required this.precoMedioVendido,
    required this.diferencaMediaLitro,
    required this.inconsistencias,
    required this.proprietariosBloqueados,
    required this.proprietariosProximosLimite,
    required this.proprietariosLimiteEstourado,
    required this.tanqueLitros,
    required this.estoqueEstimadoValor,
  });

  factory _GraficosTotais.fromJson(Map<String, dynamic> json) {
    return _GraficosTotais(
      compradoValor: _toDouble(json['comprado_valor']),
      compradoValorSemTransporte:
          _toDouble(json['comprado_valor_sem_transporte']),
      compradoLitros: _toDouble(json['comprado_litros']),
      compradoRegistros: _toInt(json['comprado_registros']),
      custoTransporteTotal: _toDouble(json['custo_transporte_total']),
      vendidoValor: _toDouble(json['vendido_valor']),
      vendidoLitros: _toDouble(json['vendido_litros']),
      abastecimentosTotal: _toInt(json['abastecimentos_total']),
      margemBruta: _toDouble(json['margem_bruta']),
      pendenteBaixaValor: _toDouble(json['pendente_baixa_valor']),
      pendenteBaixaLitros: _toDouble(json['pendente_baixa_litros']),
      pendenteBaixaTotal: _toInt(json['pendente_baixa_total']),
      ticketMedio: _toDouble(json['ticket_medio']),
      precoMedioComprado: _toDouble(json['preco_medio_comprado']),
      precoMedioVendido: _toDouble(json['preco_medio_vendido']),
      diferencaMediaLitro: _toDouble(json['diferenca_media_litro']),
      inconsistencias: _toInt(json['inconsistencias']),
      proprietariosBloqueados: _toInt(json['proprietarios_bloqueados']),
      proprietariosProximosLimite:
          _toInt(json['proprietarios_proximos_limite']),
      proprietariosLimiteEstourado:
          _toInt(json['proprietarios_limite_estourado']),
      tanqueLitros: _toDouble(json['tanque_litros']),
      estoqueEstimadoValor: _toDouble(json['estoque_estimado_valor']),
    );
  }
}

class _ProprietariosControle {
  final int bloqueados;
  final int proximosLimite;
  final int limiteEstourado;
  final List<_ProprietarioControleItem> itens;

  const _ProprietariosControle({
    required this.bloqueados,
    required this.proximosLimite,
    required this.limiteEstourado,
    required this.itens,
  });

  factory _ProprietariosControle.fromJson(Map<String, dynamic> json) {
    return _ProprietariosControle(
      bloqueados: _toInt(json['bloqueados']),
      proximosLimite: _toInt(json['proximos_limite']),
      limiteEstourado: _toInt(json['limite_estourado']),
      itens: (json['itens'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => _ProprietarioControleItem.fromJson(
                Map<String, dynamic>.from(e),
              ))
          .toList(),
    );
  }
}

class _ProprietarioControleItem {
  final String idProprietario;
  final String nome;
  final String status;
  final String local;
  final double pendenteValor;
  final double pendenteLitros;
  final double percentualLimite;
  final String situacao;

  const _ProprietarioControleItem({
    required this.idProprietario,
    required this.nome,
    required this.status,
    required this.local,
    required this.pendenteValor,
    required this.pendenteLitros,
    required this.percentualLimite,
    required this.situacao,
  });

  factory _ProprietarioControleItem.fromJson(Map<String, dynamic> json) {
    return _ProprietarioControleItem(
      idProprietario: (json['id_proprietario'] ?? '').toString(),
      nome: (json['nome'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
      local: (json['local'] ?? '').toString(),
      pendenteValor: _toDouble(json['pendente_valor']),
      pendenteLitros: _toDouble(json['pendente_litros']),
      percentualLimite: _toDouble(json['percentual_limite']),
      situacao: (json['situacao'] ?? '').toString(),
    );
  }
}

class _UltimaEntradaNota {
  static const double _custoTransportePorLitro = 0.04;

  final String idFinanceiro;
  final String data;
  final String? dataHora;
  final String? numeroNotaFiscal;
  final double quantidade;
  final double valor;
  final double valorLitro;
  final double custoTransporteLitro;
  final double custoTransporteTotal;
  final double valorCompraFinal;
  final String? tipo;
  final String? local;

  const _UltimaEntradaNota({
    required this.idFinanceiro,
    required this.data,
    required this.dataHora,
    required this.numeroNotaFiscal,
    required this.quantidade,
    required this.valor,
    required this.valorLitro,
    required this.custoTransporteLitro,
    required this.custoTransporteTotal,
    required this.valorCompraFinal,
    required this.tipo,
    required this.local,
  });

  double get valorFinal {
    if (valorCompraFinal > 0) return valorCompraFinal;
    if (custoTransporteTotal > 0) return valor + custoTransporteTotal;
    return valor + (quantidade * _custoTransportePorLitro);
  }

  factory _UltimaEntradaNota.fromJson(Map<String, dynamic> json) {
    final quantidade = _toDouble(json['quantidade']);
    final valor = _toDouble(json['valor']);
    final custoTotal = _toDouble(json['custo_transporte_total']);
    return _UltimaEntradaNota(
      idFinanceiro: (json['id_financeiro'] ?? '').toString(),
      data: (json['data'] ?? '').toString(),
      dataHora: json['data_hora']?.toString(),
      numeroNotaFiscal: json['numero_nota_fiscal']?.toString(),
      quantidade: quantidade,
      valor: valor,
      valorLitro: _toDouble(json['valor_litro']),
      custoTransporteLitro: _toDouble(json['custo_transporte_litro']),
      custoTransporteTotal:
          custoTotal > 0 ? custoTotal : quantidade * _custoTransportePorLitro,
      valorCompraFinal: _toDouble(json['valor_compra_final']) > 0
          ? _toDouble(json['valor_compra_final'])
          : valor +
              (custoTotal > 0
                  ? custoTotal
                  : quantidade * _custoTransportePorLitro),
      tipo: json['tipo']?.toString(),
      local: json['local']?.toString(),
    );
  }
}

Map<String, dynamic> _map(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return <String, dynamic>{};
}

double _toDouble(dynamic value) {
  if (value == null) return 0;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString().replaceAll(',', '.')) ?? 0;
}

int _toInt(dynamic value) {
  if (value == null) return 0;
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse(value.toString()) ?? 0;
}
