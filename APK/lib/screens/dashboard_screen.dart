import 'dart:convert';
import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../widgets/common.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  static const _cacheKey = 'dashboard_cache_v2';
  static const _statusPendente = 'Pendente';
  static const _statusPago = 'Pago';

  bool _loading = true;
  String? _error;
  _DashboardData? _data;

  String? _selectedMesRef;
  String? _selectedStatus;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    final api = AppState.instance.api;
    try {
      final resp = await api.get('/dashboard');
      if (resp is! Map<String, dynamic>) {
        throw Exception('Payload de dashboard inválido');
      }
      final parsed = _DashboardData.fromJson(resp);
      await _saveCache(resp);
      if (!mounted) return;
      setState(() {
        _data = parsed;
        _loading = false;
      });
      return;
    } catch (_) {
      final cached = await _loadCache();
      if (!mounted) return;
      if (cached != null) {
        setState(() {
          _data = cached;
          _loading = false;
          _error = 'Sem conexão. Exibindo último dashboard salvo.';
        });
        return;
      }
      setState(() {
        _loading = false;
        _error = 'Não foi possível carregar o dashboard.';
      });
    }
  }

  Future<void> _saveCache(Map<String, dynamic> jsonMap) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_cacheKey, jsonEncode(jsonMap));
  }

  Future<_DashboardData?> _loadCache() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_cacheKey);
    if (raw == null || raw.trim().isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) {
        return _DashboardData.fromJson(decoded);
      }
    } catch (_) {}
    return null;
  }

  List<_MonthData> get _mesesFiltrados {
    final data = _data;
    if (data == null) return const [];
    if (_selectedMesRef == null) return data.comparativo12Meses;
    return data.comparativo12Meses
        .where((m) => m.mesRef == _selectedMesRef)
        .toList();
  }

  List<_StatusData> get _statusResumoFiltrado {
    final data = _data;
    if (data == null) return const [];
    final selectedMes = _selectedMesRef;
    if (selectedMes == null) {
      final base = data.statusResumo;
      if (_selectedStatus == null) return base;
      return base.where((s) => s.status == _selectedStatus).toList();
    }
    final mes = data.comparativo12Meses
        .where((m) => m.mesRef == selectedMes)
        .cast<_MonthData?>()
        .firstWhere((m) => m != null, orElse: () => null);
    if (mes == null) return const [];
    final calculated = <_StatusData>[
      _StatusData(
        status: _statusPendente,
        total: 0,
        valorTotal: mes.vendidoValorPendente,
        litrosTotal: mes.vendidoLitrosPendente,
      ),
      _StatusData(
        status: _statusPago,
        total: 0,
        valorTotal: mes.vendidoValorPago,
        litrosTotal: mes.vendidoLitrosPago,
      ),
    ];
    if (_selectedStatus == null) return calculated;
    return calculated.where((s) => s.status == _selectedStatus).toList();
  }

  double _getVendidoLitros(_MonthData m) {
    if (_selectedStatus == _statusPendente) return m.vendidoLitrosPendente;
    if (_selectedStatus == _statusPago) return m.vendidoLitrosPago;
    return m.vendidoLitros;
  }

  double _getVendidoValor(_MonthData m) {
    if (_selectedStatus == _statusPendente) return m.vendidoValorPendente;
    if (_selectedStatus == _statusPago) return m.vendidoValorPago;
    return m.vendidoValor;
  }

  ({double vendido, double pendente, double recebido}) _kpis() {
    final data = _data;
    if (data == null) {
      return (vendido: 0, pendente: 0, recebido: 0);
    }

    final meses = _mesesFiltrados;
    double vendido = 0;
    double pendente = 0;
    double recebido = 0;
    for (final m in meses) {
      vendido += m.vendidoValor;
      pendente += m.vendidoValorPendente;
      recebido += m.vendidoValorPago;
    }

    if (meses.isEmpty || (vendido <= 0 && pendente <= 0 && recebido <= 0)) {
      vendido = data.totais.valorTotalVendido > 0
          ? data.totais.valorTotalVendido
          : data.totais.valor;
      pendente = data.totais.valorTotalPendenteBaixa;
      recebido = data.totais.valorTotalRecebido;
    }

    if (vendido > 0 && pendente <= 0 && recebido <= 0) {
      pendente = vendido;
      recebido = 0;
    }

    if (_selectedStatus == _statusPendente) {
      vendido = pendente;
      recebido = 0;
    } else if (_selectedStatus == _statusPago) {
      vendido = recebido;
      pendente = 0;
    }

    return (vendido: vendido, pendente: pendente, recebido: recebido);
  }

  void _toggleMes(String mesRef) {
    setState(() {
      _selectedMesRef = _selectedMesRef == mesRef ? null : mesRef;
    });
  }

  void _toggleStatus(String status) {
    setState(() {
      _selectedStatus = _selectedStatus == status ? null : status;
    });
  }

  void _clearFiltros() {
    setState(() {
      _selectedMesRef = null;
      _selectedStatus = null;
    });
  }

  String _selectedMesLabel(_DashboardData data) {
    final ref = _selectedMesRef;
    if (ref == null) return '';
    for (final item in data.comparativo12Meses) {
      if (item.mesRef == ref) return item.label;
    }
    return ref;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    final data = _data;
    if (data == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Falha ao carregar dashboard'),
              const SizedBox(height: 8),
              ElevatedButton(
                onPressed: _load,
                child: const Text('Tentar novamente'),
              ),
            ],
          ),
        ),
      );
    }

    final kpis = _kpis();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          const SectionHeader(texto: 'Dashboard'),
          Text(
            'Visão geral dos últimos 12 meses',
            style: TextStyle(
              color: AppTheme.textMuted.withOpacity(0.9),
              fontSize: 13,
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: const TextStyle(
                color: Colors.orange,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 10),
          if (_selectedMesRef != null || _selectedStatus != null)
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (_selectedMesRef != null)
                  _Chip(
                    text: 'Mês: ${_selectedMesLabel(data)}',
                  ),
                if (_selectedStatus != null)
                  _Chip(text: 'Status: $_selectedStatus'),
                OutlinedButton(
                  onPressed: _clearFiltros,
                  child: const Text('Limpar filtros'),
                ),
              ],
            ),
          const SizedBox(height: 10),
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 1,
            mainAxisSpacing: 10,
            childAspectRatio: 4.2,
            children: [
              KpiCard(
                titulo: 'Valor total vendido',
                valor: AppDates.money(kpis.vendido),
                icone: Icons.attach_money,
                cor: AppTheme.success,
              ),
              KpiCard(
                titulo: 'Valor pendente de baixa',
                valor: AppDates.money(kpis.pendente),
                icone: Icons.hourglass_top_rounded,
                cor: AppTheme.primary,
              ),
              KpiCard(
                titulo: 'Valor total recebido',
                valor: AppDates.money(kpis.recebido),
                icone: Icons.account_balance_wallet_rounded,
                cor: AppTheme.warning,
              ),
            ],
          ),
          const SizedBox(height: 10),
          _BarCard(
            title: 'Últimos 12 meses — Comprado x Vendido (L)',
            legendA: 'Comprado (Entrada de Notas)',
            legendB: 'Vendido (Registros de Abastecimento)',
            colorA: AppTheme.primary,
            colorB: AppTheme.success,
            groups: data.comparativo12Meses,
            valueA: (m) => m.compradoLitros,
            valueB: _getVendidoLitros,
            selectedMesRef: _selectedMesRef,
            onMesTap: _toggleMes,
            compact: false,
          ),
          const SizedBox(height: 10),
          _DonutCard(
            title: 'Pendente x Pago (L)',
            items: _statusResumoFiltrado
                .map((s) => _DonutSliceData(
                      label: s.status,
                      value: s.litrosTotal,
                      color: s.status == _statusPendente
                          ? const Color(0xFFF59E0B)
                          : const Color(0xFF16A34A),
                    ))
                .toList(),
            selectedStatus: _selectedStatus,
            onStatusTap: _toggleStatus,
            suffix: 'L',
          ),
          const SizedBox(height: 10),
          _BarCard(
            title: 'Últimos 12 meses — Comprado x Vendido (R\$)',
            legendA: 'Comprado (R\$)',
            legendB: 'Vendido (R\$)',
            colorA: AppTheme.primary,
            colorB: AppTheme.success,
            groups: data.comparativo12Meses,
            valueA: (m) => m.compradoValor,
            valueB: _getVendidoValor,
            selectedMesRef: _selectedMesRef,
            onMesTap: _toggleMes,
            compact: false,
          ),
          const SizedBox(height: 10),
          _DonutCard(
            title: 'Últimos 12 meses — Pendente x Pago (R\$)',
            items: _statusResumoFiltrado
                .map((s) => _DonutSliceData(
                      label: s.status,
                      value: s.valorTotal,
                      color: s.status == _statusPendente
                          ? const Color(0xFFF59E0B)
                          : const Color(0xFF16A34A),
                    ))
                .toList(),
            selectedStatus: _selectedStatus,
            onStatusTap: _toggleStatus,
            suffix: 'R\$',
          ),
          const SizedBox(height: 10),
          const SectionHeader(texto: 'Top Proprietários no Período'),
          if (data.topProprietarios.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text(
                  'Sem dados no período.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppTheme.textMuted),
                ),
              ),
            )
          else
            ...data.topProprietarios.asMap().entries.map(
                  (entry) => Card(
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundColor: AppTheme.primary.withOpacity(0.22),
                        child: Text('${entry.key + 1}'),
                      ),
                      title: Text(entry.value.nomeProprietario),
                      subtitle:
                          Text('${entry.value.total} abastecimento(s)'),
                      trailing: Text(
                        AppDates.money(entry.value.valor),
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String text;
  const _Chip({required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppTheme.primary.withOpacity(0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        text,
        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
      ),
    );
  }
}

class _BarCard extends StatelessWidget {
  final String title;
  final String legendA;
  final String legendB;
  final Color colorA;
  final Color colorB;
  final List<_MonthData> groups;
  final double Function(_MonthData) valueA;
  final double Function(_MonthData) valueB;
  final String? selectedMesRef;
  final ValueChanged<String> onMesTap;
  final bool compact;

  const _BarCard({
    required this.title,
    required this.legendA,
    required this.legendB,
    required this.colorA,
    required this.colorB,
    required this.groups,
    required this.valueA,
    required this.valueB,
    required this.selectedMesRef,
    required this.onMesTap,
    required this.compact,
  });

  @override
  Widget build(BuildContext context) {
    final maxY = _maxValue(groups, valueA, valueB);
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: compact ? 220 : 280,
              child: BarChart(
                BarChartData(
                  minY: 0,
                  maxY: maxY <= 0 ? 1 : maxY * 1.2,
                  alignment: BarChartAlignment.spaceAround,
                  barTouchData: BarTouchData(
                    enabled: true,
                    touchTooltipData: BarTouchTooltipData(
                      tooltipRoundedRadius: 8,
                      getTooltipColor: (_) => Colors.black87,
                      getTooltipItem: (group, _, rod, rodIndex) {
                        final month = groups[group.x.toInt()];
                        final label = rodIndex == 0 ? 'Comprado' : 'Vendido';
                        return BarTooltipItem(
                          '$label: ${AppDates.number(rod.toY, digits: 2)}\n${month.label}',
                          const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            fontSize: 12,
                          ),
                        );
                      },
                    ),
                    touchCallback: (event, response) {
                      if (event is! FlTapUpEvent) return;
                      final spot = response?.spot;
                      if (spot == null) return;
                      final idx = spot.touchedBarGroupIndex;
                      if (idx < 0 || idx >= groups.length) return;
                      onMesTap(groups[idx].mesRef);
                    },
                  ),
                  gridData: FlGridData(
                    show: true,
                    drawVerticalLine: false,
                    horizontalInterval: (maxY / 4).clamp(1, double.infinity),
                    getDrawingHorizontalLine: (_) => FlLine(
                      color: Colors.white.withOpacity(0.08),
                      strokeWidth: 1,
                    ),
                  ),
                  titlesData: FlTitlesData(
                    topTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false),
                    ),
                    rightTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false),
                    ),
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 40,
                        interval: (maxY / 4).clamp(1, double.infinity),
                        getTitlesWidget: (value, meta) => Text(
                          AppDates.number(value, digits: 0),
                          style: const TextStyle(
                            color: AppTheme.textMuted,
                            fontSize: 10,
                          ),
                        ),
                      ),
                    ),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 28,
                        getTitlesWidget: (value, meta) {
                          final idx = value.toInt();
                          if (idx < 0 || idx >= groups.length) {
                            return const SizedBox.shrink();
                          }
                          final m = groups[idx];
                          final selected = selectedMesRef == m.mesRef;
                          return Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Text(
                              m.label,
                              style: TextStyle(
                                color: selected
                                    ? AppTheme.primary
                                    : AppTheme.textMuted,
                                fontSize: 11,
                                fontWeight: selected
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  borderData: FlBorderData(
                    show: true,
                    border: Border.all(color: Colors.white.withOpacity(0.08)),
                  ),
                  barGroups: List.generate(groups.length, (index) {
                    final m = groups[index];
                    final selected = selectedMesRef == m.mesRef;
                    return BarChartGroupData(
                      x: index,
                      barsSpace: 6,
                      showingTooltipIndicators: const [],
                      barRods: [
                        BarChartRodData(
                          toY: valueA(m),
                          width: compact ? 8 : 12,
                          borderRadius: BorderRadius.circular(4),
                          color: selected ? colorA.withOpacity(0.95) : colorA,
                          backDrawRodData: BackgroundBarChartRodData(
                            show: true,
                            toY: maxY <= 0 ? 1 : maxY * 1.2,
                            color: Colors.white.withOpacity(0.03),
                          ),
                        ),
                        BarChartRodData(
                          toY: valueB(m),
                          width: compact ? 8 : 12,
                          borderRadius: BorderRadius.circular(4),
                          color: selected ? colorB.withOpacity(0.95) : colorB,
                          backDrawRodData: BackgroundBarChartRodData(
                            show: true,
                            toY: maxY <= 0 ? 1 : maxY * 1.2,
                            color: Colors.white.withOpacity(0.03),
                          ),
                        ),
                      ],
                    );
                  }),
                  extraLinesData: ExtraLinesData(
                    horizontalLines: [],
                  ),
                ),
                swapAnimationDuration: const Duration(milliseconds: 250),
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 12,
              runSpacing: 8,
              children: [
                _LegendDot(color: colorA, text: legendA),
                _LegendDot(color: colorB, text: legendB),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static double _maxValue(
    List<_MonthData> items,
    double Function(_MonthData) valueA,
    double Function(_MonthData) valueB,
  ) {
    double max = 0;
    for (final it in items) {
      max = math.max(max, valueA(it));
      max = math.max(max, valueB(it));
    }
    return max;
  }
}

class _LegendDot extends StatelessWidget {
  final Color color;
  final String text;
  const _LegendDot({required this.color, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(99),
          ),
        ),
        const SizedBox(width: 6),
        Text(
          text,
          style: const TextStyle(
            fontSize: 12,
            color: AppTheme.textMuted,
          ),
        ),
      ],
    );
  }
}

class _DonutSliceData {
  final String label;
  final double value;
  final Color color;
  const _DonutSliceData({
    required this.label,
    required this.value,
    required this.color,
  });
}

class _DonutCard extends StatelessWidget {
  final String title;
  final List<_DonutSliceData> items;
  final String? selectedStatus;
  final ValueChanged<String> onStatusTap;
  final String suffix;

  const _DonutCard({
    required this.title,
    required this.items,
    required this.selectedStatus,
    required this.onStatusTap,
    required this.suffix,
  });

  @override
  Widget build(BuildContext context) {
    final filtered =
        items.where((e) => e.value > 0).toList(growable: false);
    final total = filtered.fold<double>(0, (a, b) => a + b.value);

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 10),
            if (filtered.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(
                  child: Text(
                    'Sem dados no período selecionado.',
                    style: TextStyle(color: AppTheme.textMuted),
                  ),
                ),
              )
            else
              SizedBox(
                height: 220,
                child: PieChart(
                  PieChartData(
                    centerSpaceRadius: 52,
                    sectionsSpace: 1.5,
                    pieTouchData: PieTouchData(
                      touchCallback: (event, response) {
                        if (event is! FlTapUpEvent) return;
                        final idx = response?.touchedSection?.touchedSectionIndex;
                        if (idx == null || idx < 0 || idx >= filtered.length) {
                          return;
                        }
                        onStatusTap(filtered[idx].label);
                      },
                    ),
                    sections: List.generate(filtered.length, (index) {
                      final it = filtered[index];
                      final isSelected = selectedStatus == it.label;
                      final pct =
                          total > 0 ? (it.value / total) * 100 : 0;
                      return PieChartSectionData(
                        value: it.value,
                        color: isSelected
                            ? it.color.withOpacity(0.9)
                            : it.color,
                        radius: isSelected ? 64 : 58,
                        title:
                            '${pct.toStringAsFixed(pct >= 10 ? 0 : 1)}%',
                        titleStyle: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                      );
                    }),
                  ),
                ),
              ),
            const SizedBox(height: 8),
            ...filtered.map(
              (item) => InkWell(
                onTap: () => onStatusTap(item.label),
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          color: item.color,
                          borderRadius: BorderRadius.circular(99),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          item.label,
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                      Text(
                        suffix == 'R\$'
                            ? AppDates.money(item.value)
                            : '${AppDates.number(item.value, digits: 2)} L',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 4),
            Center(
              child: Text(
                suffix == 'R\$'
                    ? 'Total: ${AppDates.money(total)}'
                    : 'Total: ${AppDates.number(total, digits: 2)} L',
                style: const TextStyle(
                  color: AppTheme.textMuted,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

double _toDouble(dynamic value) {
  if (value == null) return 0;
  if (value is num) return value.toDouble();
  final txt = value.toString().replaceAll(',', '.');
  return double.tryParse(txt) ?? 0;
}

int _toInt(dynamic value) {
  if (value == null) return 0;
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse(value.toString()) ?? 0;
}

class _DashboardTotais {
  final int abastecimentos;
  final double litros;
  final double valor;
  final int pendenteBaixa;
  final double valorTotalVendido;
  final double valorTotalPendenteBaixa;
  final double valorTotalRecebido;

  _DashboardTotais({
    required this.abastecimentos,
    required this.litros,
    required this.valor,
    required this.pendenteBaixa,
    required this.valorTotalVendido,
    required this.valorTotalPendenteBaixa,
    required this.valorTotalRecebido,
  });

  factory _DashboardTotais.fromJson(Map<String, dynamic> json) {
    return _DashboardTotais(
      abastecimentos: _toInt(json['abastecimentos']),
      litros: _toDouble(json['litros']),
      valor: _toDouble(json['valor']),
      pendenteBaixa: _toInt(json['pendente_baixa']),
      valorTotalVendido: _toDouble(json['valor_total_vendido']),
      valorTotalPendenteBaixa: _toDouble(json['valor_total_pendente_baixa']),
      valorTotalRecebido: _toDouble(json['valor_total_recebido']),
    );
  }
}

class _MonthData {
  final String mesRef;
  final String label;
  final double compradoLitros;
  final double compradoValor;
  final double vendidoLitros;
  final double vendidoValor;
  final double vendidoLitrosPago;
  final double vendidoValorPago;
  final double vendidoLitrosPendente;
  final double vendidoValorPendente;

  _MonthData({
    required this.mesRef,
    required this.label,
    required this.compradoLitros,
    required this.compradoValor,
    required this.vendidoLitros,
    required this.vendidoValor,
    required this.vendidoLitrosPago,
    required this.vendidoValorPago,
    required this.vendidoLitrosPendente,
    required this.vendidoValorPendente,
  });

  factory _MonthData.fromJson(Map<String, dynamic> json) {
    return _MonthData(
      mesRef: (json['mes_ref'] ?? '').toString(),
      label: (json['label'] ?? '').toString(),
      compradoLitros: _toDouble(json['comprado_litros']),
      compradoValor: _toDouble(json['comprado_valor']),
      vendidoLitros: _toDouble(json['vendido_litros']),
      vendidoValor: _toDouble(json['vendido_valor']),
      vendidoLitrosPago: _toDouble(json['vendido_litros_pago']),
      vendidoValorPago: _toDouble(json['vendido_valor_pago']),
      vendidoLitrosPendente: _toDouble(json['vendido_litros_pendente']),
      vendidoValorPendente: _toDouble(json['vendido_valor_pendente']),
    );
  }
}

class _StatusData {
  final String status;
  final int total;
  final double valorTotal;
  final double litrosTotal;

  _StatusData({
    required this.status,
    required this.total,
    required this.valorTotal,
    required this.litrosTotal,
  });

  factory _StatusData.fromJson(Map<String, dynamic> json) {
    return _StatusData(
      status: (json['status'] ?? '').toString(),
      total: _toInt(json['total']),
      valorTotal: _toDouble(json['valor_total']),
      litrosTotal: _toDouble(json['litros_total']),
    );
  }
}

class _TopProprietario {
  final String idProprietario;
  final String nomeProprietario;
  final int total;
  final double valor;

  _TopProprietario({
    required this.idProprietario,
    required this.nomeProprietario,
    required this.total,
    required this.valor,
  });

  factory _TopProprietario.fromJson(Map<String, dynamic> json) {
    return _TopProprietario(
      idProprietario: (json['id_proprietario'] ?? '').toString(),
      nomeProprietario: (json['nome_proprietario'] ?? '—').toString(),
      total: _toInt(json['total']),
      valor: _toDouble(json['valor']),
    );
  }
}

class _DashboardData {
  final _DashboardTotais totais;
  final List<_MonthData> comparativo12Meses;
  final List<_StatusData> statusResumo;
  final List<_TopProprietario> topProprietarios;

  _DashboardData({
    required this.totais,
    required this.comparativo12Meses,
    required this.statusResumo,
    required this.topProprietarios,
  });

  factory _DashboardData.fromJson(Map<String, dynamic> json) {
    final totaisJson = json['totais'] is Map<String, dynamic>
        ? (json['totais'] as Map<String, dynamic>)
        : <String, dynamic>{};
    final comparativo = (json['comparativo_12_meses'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => _MonthData.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    final status = (json['status_resumo'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => _StatusData.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    final top = (json['top_proprietarios'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => _TopProprietario.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    return _DashboardData(
      totais: _DashboardTotais.fromJson(totaisJson),
      comparativo12Meses: comparativo,
      statusResumo: status,
      topProprietarios: top,
    );
  }
}
