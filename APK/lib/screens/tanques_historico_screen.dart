import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../widgets/common.dart';

class TanquesHistoricoScreen extends StatefulWidget {
  const TanquesHistoricoScreen({super.key});

  @override
  State<TanquesHistoricoScreen> createState() => _TanquesHistoricoScreenState();
}

class _TanquesHistoricoScreenState extends State<TanquesHistoricoScreen> {
  bool _loading = true;
  Map<String, dynamic> _data = {};
  String _inicio = DateTime(DateTime.now().year, DateTime.now().month, 1)
      .toIso8601String()
      .substring(0, 10);
  String _fim = AppDates.todayIso();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final resp = await AppState.instance.api.get(
        '/tanques-privado/historico',
        query: {
          'data_inicio': _inicio,
          'data_fim': _fim,
        },
      );
      if (!mounted) return;
      setState(() {
        _data = resp is Map ? Map<String, dynamic>.from(resp) : {};
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro ao carregar histórico do tanque: $e'),
        backgroundColor: AppTheme.danger,
      ));
    }
  }

  List<Map<String, dynamic>> get _locais {
    final raw = _data['locais'];
    if (raw is List) {
      final locais = raw
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      locais.sort((a, b) {
        const order = {'Matriz': 0, 'Viana': 1};
        return (order[a['local']] ?? 99).compareTo(order[b['local']] ?? 99);
      });
      return locais;
    }
    return const [];
  }

  double get _totalAtual =>
      _locais.fold(0, (sum, item) => sum + _num(item['saldo_final_litros']));
  double get _totalComprado => _locais.fold(
      0, (sum, item) => sum + _num(item['entrada_periodo_litros']));
  double get _totalAbastecido =>
      _locais.fold(0, (sum, item) => sum + _num(item['saida_periodo_litros']));
  double get _totalEspacoLivre => _locais.fold(
      0,
      (sum, item) =>
          sum + _capacidade(item) - _num(item['saldo_final_litros']));

  void _setPeriodoMes() {
    final hoje = DateTime.now();
    setState(() {
      _inicio =
          DateTime(hoje.year, hoje.month, 1).toIso8601String().substring(0, 10);
      _fim = AppDates.todayIso();
    });
    _load();
  }

  void _setPeriodo30Dias() {
    final fim = DateTime.now();
    final inicio = fim.subtract(const Duration(days: 29));
    setState(() {
      _inicio = inicio.toIso8601String().substring(0, 10);
      _fim = AppDates.todayIso();
    });
    _load();
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
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final p =
                              await pickDateIso(context, initialIso: _inicio);
                          if (p != null) {
                            setState(() => _inicio = p);
                            await _load();
                          }
                        },
                        icon: const Icon(Icons.event_outlined),
                        label:
                            Text('Início: ${AppDates.formatDateBr(_inicio)}'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final p =
                              await pickDateIso(context, initialIso: _fim);
                          if (p != null) {
                            setState(() => _fim = p);
                            await _load();
                          }
                        },
                        icon: const Icon(Icons.event_available_outlined),
                        label: Text('Fim: ${AppDates.formatDateBr(_fim)}'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _setPeriodoMes,
                        child: const Text('Mês atual'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _setPeriodo30Dias,
                        child: const Text('Últimos 30 dias'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if (_locais.isEmpty)
                  const EmptyState(
                    icone: Icons.water_drop_outlined,
                    titulo: 'Sem histórico do tanque',
                  )
                else ...[
                  _ResumoTanques(
                    totalAtual: _totalAtual,
                    totalComprado: _totalComprado,
                    totalAbastecido: _totalAbastecido,
                    totalEspacoLivre: math.max(0, _totalEspacoLivre),
                  ),
                  const SectionHeader(texto: 'Nível de combustível'),
                  ..._locais.map((local) => _TanqueVisualCard(local: local)),
                  const SectionHeader(texto: 'Histórico diário'),
                  ..._locais.map((local) => _LocalHistoricoCard(local: local)),
                ],
              ],
            ),
    );
  }
}

class _ResumoTanques extends StatelessWidget {
  final double totalAtual;
  final double totalComprado;
  final double totalAbastecido;
  final double totalEspacoLivre;

  const _ResumoTanques({
    required this.totalAtual,
    required this.totalComprado,
    required this.totalAbastecido,
    required this.totalEspacoLivre,
  });

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.85,
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
      children: [
        _MetricTile(label: 'Total no tanque', value: _litros(totalAtual)),
        _MetricTile(label: 'Comprado', value: _litros(totalComprado)),
        _MetricTile(label: 'Abastecido', value: _litros(totalAbastecido)),
        _MetricTile(label: 'Espaço livre', value: _litros(totalEspacoLivre)),
      ],
    );
  }
}

class _TanqueVisualCard extends StatelessWidget {
  final Map<String, dynamic> local;
  const _TanqueVisualCard({required this.local});

  @override
  Widget build(BuildContext context) {
    final nome = (local['local'] ?? 'Filial').toString();
    final atual = _num(local['saldo_final_litros']);
    final comprado = _num(local['entrada_periodo_litros']);
    final abastecido = _num(local['saida_periodo_litros']);
    final capacidade = _capacidade(local);
    final espaco = math.max(0.0, capacidade - atual);
    final percentual =
        capacidade <= 0 ? 0.0 : (atual / capacidade).clamp(0.0, 1.0);
    final alturaCm = (percentual * 186).round();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
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
                        'Filial',
                        style: TextStyle(
                          color: AppTheme.textMuted,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        nome,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ],
                  ),
                ),
                Text(
                  _litros(atual),
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.primaryDark,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            LayoutBuilder(
              builder: (context, constraints) {
                final compact = constraints.maxWidth < 520;
                final visual = _TanqueVisual(
                  percentual: percentual,
                  atual: atual,
                  capacidade: capacidade,
                );
                final details = _TanqueDetalhes(
                  atual: atual,
                  capacidade: capacidade,
                  comprado: comprado,
                  abastecido: abastecido,
                  espaco: espaco,
                  alturaCm: alturaCm,
                );
                if (compact) {
                  return Column(
                    children: [
                      visual,
                      const SizedBox(height: 12),
                      details,
                    ],
                  );
                }
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: 240, child: visual),
                    const SizedBox(width: 12),
                    Expanded(child: details),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _TanqueVisual extends StatelessWidget {
  final double percentual;
  final double atual;
  final double capacidade;

  const _TanqueVisual({
    required this.percentual,
    required this.atual,
    required this.capacidade,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 250,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: CustomPaint(
              painter: _TankPainter(percentual: percentual),
              child: Center(
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.90),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppTheme.border),
                  ),
                  child: Text(
                    _litros(atual, digits: 0),
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      color: AppTheme.primaryDark,
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          _CmRuler(percentual: percentual),
          const SizedBox(width: 8),
          _LiterScale(capacidade: capacidade),
        ],
      ),
    );
  }
}

class _CmRuler extends StatelessWidget {
  final double percentual;
  const _CmRuler({required this.percentual});

  static const marks = [186, 180, 160, 140, 120, 100, 80, 60, 40, 20, 0];

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 58,
      child: Stack(
        children: [
          Positioned.fill(
            left: 22,
            right: 18,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: AppTheme.surfaceAlt,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppTheme.border),
              ),
              child: Align(
                alignment: Alignment.bottomCenter,
                child: FractionallySizedBox(
                  heightFactor: percentual.clamp(0.0, 1.0),
                  widthFactor: 1,
                  alignment: Alignment.bottomCenter,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: AppTheme.primary.withOpacity(0.24),
                      borderRadius: BorderRadius.circular(20),
                    ),
                  ),
                ),
              ),
            ),
          ),
          ...marks.map((cm) {
            final pct = (cm / 186).clamp(0.0, 1.0);
            return Positioned(
              bottom: pct * 226,
              left: 0,
              right: 0,
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '$cm',
                      textAlign: TextAlign.right,
                      style: const TextStyle(
                        color: AppTheme.textMuted,
                        fontSize: 9,
                      ),
                    ),
                  ),
                  const SizedBox(width: 3),
                  Container(width: 14, height: 1, color: AppTheme.border),
                ],
              ),
            );
          }),
          Positioned(
            bottom: percentual.clamp(0.0, 1.0) * 226,
            left: 18,
            right: 2,
            child: Container(height: 2, color: AppTheme.primaryDark),
          ),
        ],
      ),
    );
  }
}

class _LiterScale extends StatelessWidget {
  final double capacidade;
  const _LiterScale({required this.capacidade});

  @override
  Widget build(BuildContext context) {
    final step = capacidade <= 12000 ? 1000 : 1500;
    final values = <double>[];
    for (double value = step.toDouble(); value < capacidade; value += step) {
      values.add(value);
    }
    values.add(capacidade);
    return SizedBox(
      width: 62,
      child: Stack(
        children: values.map((value) {
          final pct =
              capacidade <= 0 ? 0.0 : (value / capacidade).clamp(0.0, 1.0);
          return Positioned(
            bottom: pct * 226,
            left: 0,
            right: 0,
            child: Text(
              _litros(value, digits: 0),
              style: const TextStyle(
                color: AppTheme.textMuted,
                fontSize: 9,
                fontWeight: FontWeight.w600,
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _TankPainter extends CustomPainter {
  final double percentual;

  _TankPainter({required this.percentual});

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromLTWH(
      8,
      12,
      size.width - 16,
      size.height - 24,
    );
    final radius = Radius.circular(math.min(rect.width, rect.height) * 0.18);
    final tank = RRect.fromRectAndRadius(rect, radius);

    final shadow = Paint()
      ..color = Colors.black.withOpacity(0.06)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8);
    canvas.drawRRect(tank.shift(const Offset(0, 4)), shadow);

    final body = Paint()..color = AppTheme.surfaceAlt;
    canvas.drawRRect(tank, body);

    canvas.save();
    canvas.clipRRect(tank);

    final fillHeight = rect.height * percentual.clamp(0.0, 1.0);
    final fillRect = Rect.fromLTWH(
      rect.left,
      rect.bottom - fillHeight,
      rect.width,
      fillHeight,
    );
    final fill = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFF38BDF8), Color(0xFF0284C7)],
      ).createShader(fillRect);
    canvas.drawRect(fillRect, fill);

    final waveY = rect.bottom - fillHeight;
    final wave = Path()..moveTo(rect.left, waveY);
    final amplitude = math.min(5.0, rect.height * 0.03);
    final waveWidth = rect.width / 2;
    for (double x = rect.left; x <= rect.right; x += 4) {
      final y = waveY +
          math.sin((x - rect.left) / waveWidth * math.pi * 2) * amplitude;
      wave.lineTo(x, y);
    }
    wave.lineTo(rect.right, rect.bottom);
    wave.lineTo(rect.left, rect.bottom);
    wave.close();
    canvas.drawPath(wave, fill);

    final centerLine = Paint()
      ..color = Colors.white.withOpacity(0.35)
      ..strokeWidth = 2;
    canvas.drawLine(
      Offset(rect.center.dx, rect.top + 10),
      Offset(rect.center.dx, rect.bottom - 10),
      centerLine,
    );

    canvas.restore();

    final border = Paint()
      ..color = AppTheme.border
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    canvas.drawRRect(tank, border);

    final topHighlight = Paint()
      ..color = Colors.white.withOpacity(0.75)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    canvas.drawArc(
      Rect.fromLTWH(rect.left + 14, rect.top + 10, rect.width - 28, 24),
      math.pi,
      math.pi,
      false,
      topHighlight,
    );
  }

  @override
  bool shouldRepaint(covariant _TankPainter oldDelegate) {
    return oldDelegate.percentual != percentual;
  }
}

class _TanqueDetalhes extends StatelessWidget {
  final double atual;
  final double capacidade;
  final double comprado;
  final double abastecido;
  final double espaco;
  final int alturaCm;

  const _TanqueDetalhes({
    required this.atual,
    required this.capacidade,
    required this.comprado,
    required this.abastecido,
    required this.espaco,
    required this.alturaCm,
  });

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.6,
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
      children: [
        _MetricTile(
            label: 'Volume atual', value: _litros(atual), highlight: true),
        _MetricTile(label: 'Capacidade', value: _litros(capacidade)),
        _MetricTile(label: 'Comprado', value: _litros(comprado)),
        _MetricTile(label: 'Abastecido', value: _litros(abastecido)),
        _MetricTile(label: 'Espaço livre', value: _litros(espaco)),
        _MetricTile(label: 'Altura estimada', value: '$alturaCm cm'),
      ],
    );
  }
}

class _MetricTile extends StatelessWidget {
  final String label;
  final String value;
  final bool highlight;

  const _MetricTile({
    required this.label,
    required this.value,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: highlight
            ? AppTheme.primary.withOpacity(0.10)
            : AppTheme.surfaceAlt,
        border: Border.all(
          color:
              highlight ? AppTheme.primary.withOpacity(0.35) : AppTheme.border,
        ),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: AppTheme.textMuted, fontSize: 11),
          ),
          const SizedBox(height: 4),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: TextStyle(
                color: highlight ? AppTheme.primaryDark : AppTheme.textStrong,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LocalHistoricoCard extends StatelessWidget {
  final Map<String, dynamic> local;
  const _LocalHistoricoCard({required this.local});

  @override
  Widget build(BuildContext context) {
    final pontos = (local['pontos'] is List)
        ? List<Map<String, dynamic>>.from(
            (local['pontos'] as List)
                .whereType<Map>()
                .map(Map<String, dynamic>.from),
          )
        : <Map<String, dynamic>>[];
    final pontosComMovimento = pontos
        .where((p) =>
            _num(p['entrada_litros']) != 0 ||
            _num(p['saida_litros']) != 0 ||
            _num(p['entradas']) != 0 ||
            _num(p['saidas']) != 0)
        .toList()
        .reversed
        .toList();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              (local['local'] ?? 'Filial').toString(),
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                Chip(
                  label: Text(
                    'Saldo inicial: ${_litros(_num(local['saldo_inicial_litros']))}',
                  ),
                ),
                Chip(
                  label: Text(
                    'Entradas: ${_litros(_num(local['entrada_periodo_litros']))}',
                  ),
                ),
                Chip(
                  label: Text(
                    'Saídas: ${_litros(_num(local['saida_periodo_litros']))}',
                  ),
                ),
                Chip(
                  label: Text(
                    'Saldo final: ${_litros(_num(local['saldo_final_litros']))}',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (pontosComMovimento.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Text('Sem movimento no período.'),
              )
            else
              ...pontosComMovimento.map((p) => ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.water_drop_outlined),
                    title: Text(AppDates.formatDateBr(p['data'])),
                    subtitle: Text(
                      'Entrada: ${_litros(_num(p['entrada_litros']))} | '
                      'Saída: ${_litros(_num(p['saida_litros']))}\n'
                      'Saldo: ${_litros(_num(p['saldo_litros']))}',
                    ),
                    isThreeLine: true,
                  )),
          ],
        ),
      ),
    );
  }
}

double _num(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse('$value') ?? 0;
}

double _capacidade(Map<String, dynamic> local) {
  const capacidadePadrao = 15000.0;
  final atual = math.max(0.0, _num(local['saldo_final_litros']));
  final arredondada = (math.max(atual, 1) / 1000).ceil() * 1000.0;
  return math.max(capacidadePadrao, arredondada);
}

String _litros(num value, {int digits = 2}) {
  return '${AppDates.number(value, digits: digits)} L';
}
