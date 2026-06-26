import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../widgets/common.dart';

class BalanceteScreen extends StatefulWidget {
  const BalanceteScreen({super.key});

  @override
  State<BalanceteScreen> createState() => _BalanceteScreenState();
}

class _BalanceteScreenState extends State<BalanceteScreen> {
  bool _loading = true;
  String? _error;
  _BalanceteData? _data;
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

  bool get _canAccess {
    final auth = AppState.instance.auth;
    final ident = '${auth.login ?? ''} ${auth.nome ?? ''}'.toLowerCase();
    return Roles.isAdmin(auth.tipo) &&
        (auth.login == 'admin' || ident.contains('douglas'));
  }

  Future<void> _load() async {
    if (!_canAccess) {
      setState(() => _loading = false);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final resp = await AppState.instance.api.get(
        '/balancete-privado',
        query: {
          'data_inicio': _inicio,
          'data_fim': _fim,
        },
      );
      if (resp is! Map) {
        throw Exception('Payload de balancete invalido');
      }
      if (!mounted) return;
      setState(() {
        _data = _BalanceteData.fromJson(Map<String, dynamic>.from(resp));
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Erro ao carregar balancete: $e';
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
    if (!_canAccess) {
      return const EmptyState(
        icone: Icons.lock_outline,
        titulo: 'Balancete restrito',
        mensagem: 'Acesso permitido somente ao administrador autorizado.',
      );
    }

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
              const Expanded(child: SectionHeader(texto: 'Balancete privado')),
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
            'Matriz x Viana com compras, vendas, baixas e despesas.',
            style: TextStyle(
              color: AppTheme.textMuted.withOpacity(0.9),
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
            _ConsolidadoCard(item: data.consolidado),
            const SizedBox(height: 8),
            ...data.locais.map((item) => _LocalBalanceteCard(item: item)),
          ],
        ],
      ),
    );
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

class _ConsolidadoCard extends StatelessWidget {
  final _BalanceteLocal item;

  const _ConsolidadoCard({required this.item});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Consolidado',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 12),
            _MetricGrid(
              metrics: [
                _Metric('Resultado caixa', AppDates.money(item.resultadoCaixa),
                    negative: item.resultadoCaixa < 0),
                _Metric(
                  'Resultado competencia',
                  AppDates.money(item.resultadoCompetencia),
                  negative: item.resultadoCompetencia < 0,
                ),
                _Metric('Pendente', AppDates.money(item.pendentes.valor)),
                _Metric(
                  'Transporte',
                  AppDates.money(-item.compras.custoTransporte),
                  detail: 'custo embutido nas compras',
                  negative: true,
                ),
                _Metric(
                  'Estoque periodo',
                  '${AppDates.number(item.estoquePeriodoLitros, digits: 2)} L',
                  negative: item.estoquePeriodoLitros < 0,
                ),
              ],
            ),
            const SizedBox(height: 12),
            _FinanceFlowCard(item: item, title: 'Fluxo financeiro consolidado'),
          ],
        ),
      ),
    );
  }
}

class _LocalBalanceteCard extends StatelessWidget {
  final _BalanceteLocal item;

  const _LocalBalanceteCard({required this.item});

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
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'FILIAL',
                        style: TextStyle(
                          color: AppTheme.textMuted,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.9,
                        ),
                      ),
                      Text(
                        item.local,
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  AppDates.money(item.resultadoCaixa),
                  style: TextStyle(
                    color: item.resultadoCaixa < 0
                        ? AppTheme.danger
                        : AppTheme.success,
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _MetricGrid(
              metrics: [
                _Metric(
                  'Comprado',
                  '${AppDates.number(item.compras.litros, digits: 2)} L',
                  detail:
                      '${AppDates.money(item.compras.valor)} com transporte',
                ),
                _Metric(
                  'Transporte',
                  AppDates.money(-item.compras.custoTransporte),
                  detail: '${AppDates.money(0.04)}/L embutido',
                  negative: true,
                ),
                _Metric(
                  'Vendido',
                  '${AppDates.number(item.vendas.litros, digits: 2)} L',
                  detail: AppDates.money(item.vendas.valor),
                ),
                _Metric(
                  'Recebido',
                  AppDates.money(item.recebidos.valor),
                  detail: '${item.recebidos.registros} baixa(s)',
                ),
                _Metric(
                  'Pendente',
                  AppDates.money(item.pendentes.valor),
                  detail: '${item.pendentes.registros} abastecimento(s)',
                ),
                _Metric(
                  'Despesas',
                  AppDates.money(item.despesas.valor),
                  detail: '${item.despesas.registros} lancamento(s)',
                ),
                _Metric(
                  'Saldo litros',
                  '${AppDates.number(item.estoquePeriodoLitros, digits: 2)} L',
                  negative: item.estoquePeriodoLitros < 0,
                ),
              ],
            ),
            const SizedBox(height: 12),
            _MetricGrid(
              metrics: [
                _Metric(
                  'Competencia',
                  AppDates.money(item.resultadoCompetencia),
                  negative: item.resultadoCompetencia < 0,
                ),
                _Metric(
                  'Caixa',
                  AppDates.money(item.resultadoCaixa),
                  negative: item.resultadoCaixa < 0,
                ),
              ],
            ),
            const SizedBox(height: 12),
            _FinanceFlowCard(item: item, title: 'Entradas e saidas'),
            const SizedBox(height: 12),
            _SimpleList(
              title: 'Pendentes',
              rows: item.topPendentes
                  .map((e) => (label: e.nome, value: AppDates.money(e.valor)))
                  .toList(),
              empty: 'Sem pendencias',
            ),
            const SizedBox(height: 10),
            _SimpleList(
              title: 'Despesas',
              rows: item.despesas.categorias
                  .map((e) =>
                      (label: e.categoria, value: AppDates.money(e.valor)))
                  .toList(),
              empty: 'Sem despesas',
            ),
          ],
        ),
      ),
    );
  }
}

class _FinanceFlowCard extends StatelessWidget {
  final _BalanceteLocal item;
  final String title;

  const _FinanceFlowCard({
    required this.item,
    required this.title,
  });

  @override
  Widget build(BuildContext context) {
    final compraSemTransporte =
        item.compras.valor > item.compras.custoTransporte
            ? item.compras.valor - item.compras.custoTransporte
            : 0.0;
    final entradas = [
      _FlowRow(
        'Recebido em baixas',
        item.recebidos.valor,
        detail: '${item.recebidos.registros} baixa(s)',
        positive: true,
      ),
      _FlowRow(
        'Vendido pendente',
        item.pendentes.valor,
        detail: '${item.pendentes.registros} abastecimento(s) a receber',
        positive: true,
      ),
      _FlowRow(
        'Total vendido',
        item.vendas.valor,
        detail:
            '${AppDates.number(item.vendas.litros, digits: 2)} L no periodo',
        positive: true,
        muted: true,
      ),
    ];
    final saidas = [
      _FlowRow(
        'Compra de combustivel',
        -compraSemTransporte,
        detail:
            '${AppDates.number(item.compras.litros, digits: 2)} L sem transporte',
      ),
      _FlowRow(
        'Transporte das notas',
        -item.compras.custoTransporte,
        detail: '${AppDates.money(0.04)}/L incluido no custo final',
      ),
      _FlowRow(
        'Despesas avulsas',
        -item.despesas.valor,
        detail: '${item.despesas.registros} lancamento(s)',
      ),
    ];
    final custos = [
      _FlowRow(
        'Custo final de compra',
        -item.compras.valor,
        detail: 'combustivel + transporte',
      ),
      ...item.despesas.categorias.map(
        (cat) => _FlowRow(
          cat.categoria,
          -cat.valor,
          detail: 'despesa avulsa',
        ),
      ),
    ];

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: AppTheme.border),
        borderRadius: BorderRadius.circular(10),
        color: Colors.white,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Text(
                AppDates.money(item.resultadoCompetencia),
                style: TextStyle(
                  color: item.resultadoCompetencia < 0
                      ? AppTheme.danger
                      : AppTheme.success,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _FlowSection(title: 'Entradas / a receber', rows: entradas),
          const SizedBox(height: 10),
          _FlowSection(title: 'Saidas / custos', rows: saidas),
          const SizedBox(height: 10),
          _FlowSection(title: 'Custos localizados', rows: custos),
          const Divider(height: 18),
          _FlowTotalRow(
            label: 'Saldo caixa',
            value: item.resultadoCaixa,
            detail: 'recebido - compras - despesas',
          ),
          const SizedBox(height: 6),
          _FlowTotalRow(
            label: 'Saldo competencia',
            value: item.resultadoCompetencia,
            detail: 'recebido + pendente - compras - despesas',
          ),
        ],
      ),
    );
  }
}

class _FlowSection extends StatelessWidget {
  final String title;
  final List<_FlowRow> rows;

  const _FlowSection({required this.title, required this.rows});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title.toUpperCase(),
          style: const TextStyle(
            color: AppTheme.textMuted,
            fontSize: 10,
            fontWeight: FontWeight.w900,
            letterSpacing: 0.4,
          ),
        ),
        const SizedBox(height: 4),
        ...rows.map((row) => _FlowLine(row: row)),
      ],
    );
  }
}

class _FlowLine extends StatelessWidget {
  final _FlowRow row;

  const _FlowLine({required this.row});

  @override
  Widget build(BuildContext context) {
    final valueColor = row.muted
        ? AppTheme.textMuted
        : row.positive
            ? AppTheme.success
            : AppTheme.danger;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  row.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                if (row.detail != null)
                  Text(
                    row.detail!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppTheme.textMuted,
                      fontSize: 11,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(
            _signedMoney(row.value),
            style: TextStyle(
              color: valueColor,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _FlowTotalRow extends StatelessWidget {
  final String label;
  final double value;
  final String detail;

  const _FlowTotalRow({
    required this.label,
    required this.value,
    required this.detail,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
              Text(
                detail,
                style: const TextStyle(color: AppTheme.textMuted, fontSize: 11),
              ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        Text(
          _signedMoney(value),
          style: TextStyle(
            color: value < 0 ? AppTheme.danger : AppTheme.success,
            fontSize: 15,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}

class _FlowRow {
  final String label;
  final double value;
  final String? detail;
  final bool positive;
  final bool muted;

  const _FlowRow(
    this.label,
    this.value, {
    this.detail,
    this.positive = false,
    this.muted = false,
  });
}

class _MetricGrid extends StatelessWidget {
  final List<_Metric> metrics;

  const _MetricGrid({required this.metrics});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth > 520 ? 3 : 2;
        return GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: columns,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: columns == 3 ? 2.35 : 1.65,
          children: metrics.map((m) => _MetricBox(metric: m)).toList(),
        );
      },
    );
  }
}

class _MetricBox extends StatelessWidget {
  final _Metric metric;

  const _MetricBox({required this.metric});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppTheme.surfaceAlt,
        border: Border.all(color: AppTheme.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            metric.label.toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: AppTheme.textMuted,
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            metric.value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: metric.negative ? AppTheme.danger : AppTheme.textStrong,
              fontSize: 15,
              fontWeight: FontWeight.w900,
            ),
          ),
          if (metric.detail != null) ...[
            const SizedBox(height: 3),
            Text(
              metric.detail!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: AppTheme.textMuted, fontSize: 11),
            ),
          ],
        ],
      ),
    );
  }
}

class _SimpleList extends StatelessWidget {
  final String title;
  final List<({String label, String value})> rows;
  final String empty;

  const _SimpleList({
    required this.title,
    required this.rows,
    required this.empty,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: AppTheme.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          if (rows.isEmpty)
            Text(empty, style: const TextStyle(color: AppTheme.textMuted))
          else
            ...rows.map(
              (row) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        row.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      row.value,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Metric {
  final String label;
  final String value;
  final String? detail;
  final bool negative;

  const _Metric(
    this.label,
    this.value, {
    this.detail,
    this.negative = false,
  });
}

class _BalanceteResumo {
  final int registros;
  final double litros;
  final double valor;
  final double custoTransporte;

  const _BalanceteResumo({
    required this.registros,
    required this.litros,
    required this.valor,
    this.custoTransporte = 0,
  });

  factory _BalanceteResumo.fromJson(Map<String, dynamic> json) {
    return _BalanceteResumo(
      registros: _toInt(json['registros']),
      litros: _toDouble(json['litros']),
      valor: _toDouble(json['valor']),
      custoTransporte: _toDouble(json['custo_transporte']),
    );
  }
}

class _BalanceteDespesas extends _BalanceteResumo {
  final List<_CategoriaDespesa> categorias;

  const _BalanceteDespesas({
    required super.registros,
    required super.litros,
    required super.valor,
    required this.categorias,
  });

  factory _BalanceteDespesas.fromJson(Map<String, dynamic> json) {
    return _BalanceteDespesas(
      registros: _toInt(json['registros']),
      litros: _toDouble(json['litros']),
      valor: _toDouble(json['valor']),
      categorias: (json['categorias'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => _CategoriaDespesa.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }
}

class _CategoriaDespesa {
  final String categoria;
  final double valor;

  const _CategoriaDespesa({required this.categoria, required this.valor});

  factory _CategoriaDespesa.fromJson(Map<String, dynamic> json) {
    return _CategoriaDespesa(
      categoria: (json['categoria'] ?? 'Sem categoria').toString(),
      valor: _toDouble(json['valor']),
    );
  }
}

class _TopPendente {
  final String nome;
  final double valor;

  const _TopPendente({required this.nome, required this.valor});

  factory _TopPendente.fromJson(Map<String, dynamic> json) {
    return _TopPendente(
      nome: (json['nome_proprietario'] ?? 'Sem proprietario').toString(),
      valor: _toDouble(json['valor']),
    );
  }
}

class _BalanceteLocal {
  final String local;
  final _BalanceteResumo compras;
  final _BalanceteResumo vendas;
  final _BalanceteResumo recebidos;
  final _BalanceteResumo pendentes;
  final _BalanceteDespesas despesas;
  final List<_TopPendente> topPendentes;
  final double estoquePeriodoLitros;
  final double resultadoCompetencia;
  final double resultadoCaixa;

  const _BalanceteLocal({
    required this.local,
    required this.compras,
    required this.vendas,
    required this.recebidos,
    required this.pendentes,
    required this.despesas,
    required this.topPendentes,
    required this.estoquePeriodoLitros,
    required this.resultadoCompetencia,
    required this.resultadoCaixa,
  });

  factory _BalanceteLocal.fromJson(Map<String, dynamic> json) {
    return _BalanceteLocal(
      local: (json['local'] ?? 'Consolidado').toString(),
      compras: _BalanceteResumo.fromJson(_map(json['compras'])),
      vendas: _BalanceteResumo.fromJson(_map(json['vendas'])),
      recebidos: _BalanceteResumo.fromJson(_map(json['recebidos'])),
      pendentes: _BalanceteResumo.fromJson(_map(json['pendentes'])),
      despesas: _BalanceteDespesas.fromJson(_map(json['despesas'])),
      topPendentes: (json['top_pendentes'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => _TopPendente.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      estoquePeriodoLitros: _toDouble(json['estoque_periodo_litros']),
      resultadoCompetencia: _toDouble(json['resultado_competencia']),
      resultadoCaixa: _toDouble(json['resultado_caixa']),
    );
  }
}

class _BalanceteData {
  final _BalanceteLocal consolidado;
  final List<_BalanceteLocal> locais;

  const _BalanceteData({required this.consolidado, required this.locais});

  factory _BalanceteData.fromJson(Map<String, dynamic> json) {
    final locais = (json['locais'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => _BalanceteLocal.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    locais.sort((a, b) => _localOrder(a.local).compareTo(_localOrder(b.local)));
    return _BalanceteData(
      consolidado: _BalanceteLocal.fromJson({
        'local': 'Consolidado',
        ..._map(json['consolidado']),
      }),
      locais: locais,
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

String _signedMoney(double value) {
  if (value == 0) return AppDates.money(0);
  final abs = value.abs();
  return '${value > 0 ? '+' : '-'}${AppDates.money(abs)}';
}

int _localOrder(String local) {
  if (local == 'Matriz') return 0;
  if (local == 'Viana') return 1;
  return 2;
}
