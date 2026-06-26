import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shorebird_code_push/shorebird_code_push.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../core/models.dart';
import '../widgets/common.dart';
import 'abastecimentos/form_screen.dart';

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
  List<Abastecimento> _inconsistencias = [];
  String? _appVersionLabel;

  String? _selectedMesRef;
  String? _selectedStatus;

  @override
  void initState() {
    super.initState();
    _loadAppVersion();
    _load();
  }

  Future<void> _loadAppVersion() async {
    try {
      final info = await PackageInfo.fromPlatform();
      final version = info.version.trim();
      final build = info.buildNumber.trim();
      final base = build.isEmpty ? version : '$version+$build';
      var label = base;
      try {
        final patch = await ShorebirdUpdater().readCurrentPatch();
        label = patch == null
            ? '$base - Sem patch'
            : '$base - Patch ${patch.number}';
      } catch (_) {}
      if (!mounted) return;
      setState(() => _appVersionLabel = label);
    } catch (_) {}
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    final api = AppState.instance.api;
    try {
      final local = AppState.instance.auth.filialAtual;
      final resp = await api.get(
        '/dashboard',
        query: local == null ? null : {'local': local},
      );
      if (resp is! Map<String, dynamic>) {
        throw Exception('Payload de dashboard inválido');
      }
      final parsed = _DashboardData.fromJson(resp);
      final inconsistencias = await AppState.instance.db
          .listAbastecimentos(status: 'Inconsistente', local: local, limit: 50);
      await _saveCache(resp);
      if (!mounted) return;
      setState(() {
        _data = parsed;
        _inconsistencias = inconsistencias;
        _loading = false;
      });
      return;
    } catch (_) {
      final inconsistencias = await AppState.instance.db.listAbastecimentos(
          status: 'Inconsistente',
          local: AppState.instance.auth.filialAtual,
          limit: 50);
      final cached = await _loadCache();
      if (!mounted) return;
      if (cached != null) {
        setState(() {
          _data = cached;
          _inconsistencias = inconsistencias;
          _loading = false;
          _error = 'Sem conexão. Exibindo último dashboard salvo.';
        });
        return;
      }
      setState(() {
        _loading = false;
        _inconsistencias = inconsistencias;
        _error = 'Não foi possível carregar o dashboard.';
      });
    }
  }

  void _abrirInconsistencias() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (sheetContext, setSheetState) {
            return SafeArea(
              child: DraggableScrollableSheet(
                expand: false,
                initialChildSize: 0.72,
                minChildSize: 0.38,
                maxChildSize: 0.92,
                builder: (scrollContext, controller) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 14, 8, 8),
                        child: Row(
                          children: [
                            const Expanded(
                              child: Text(
                                'Abastecimentos inconsistentes',
                                style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                            IconButton(
                              onPressed: () => Navigator.pop(sheetContext),
                              icon: const Icon(Icons.close),
                            ),
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Text(
                          '${_inconsistencias.length} registro(s) pendente(s) de conferencia',
                          style: const TextStyle(color: AppTheme.textMuted),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Expanded(
                        child: _inconsistencias.isEmpty
                            ? const Center(
                                child: Text('Nenhuma inconsistencia pendente.'),
                              )
                            : ListView.separated(
                                controller: controller,
                                padding: const EdgeInsets.all(12),
                                itemCount: _inconsistencias.length,
                                separatorBuilder: (_, __) =>
                                    const SizedBox(height: 8),
                                itemBuilder: (_, i) {
                                  final item = _inconsistencias[i];
                                  return Card(
                                    color: AppTheme.warning.withOpacity(0.10),
                                    child: Padding(
                                      padding: const EdgeInsets.all(14),
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              const Icon(
                                                Icons.flag_outlined,
                                                color: AppTheme.warning,
                                              ),
                                              const SizedBox(width: 8),
                                              Expanded(
                                                child: Text(
                                                  item.veiculoPlaca ??
                                                      item.idVeiculo ??
                                                      'Veiculo ?',
                                                  style: const TextStyle(
                                                    fontWeight: FontWeight.w800,
                                                    fontSize: 16,
                                                  ),
                                                ),
                                              ),
                                              Text(
                                                AppDates.money(item
                                                        .valorTotal ??
                                                    ((item.valorPorLitro ?? 0) *
                                                        item.quantidadeLitros)),
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.w800,
                                                ),
                                              ),
                                            ],
                                          ),
                                          const SizedBox(height: 10),
                                          Wrap(
                                            spacing: 8,
                                            runSpacing: 8,
                                            children: [
                                              _InfoPill(
                                                label: 'Data',
                                                value: AppDates.formatDateBr(
                                                    item.data),
                                              ),
                                              _InfoPill(
                                                label: 'Litros',
                                                value:
                                                    '${AppDates.number(item.quantidadeLitros, digits: 2)} L',
                                              ),
                                              _InfoPill(
                                                label: 'Odometro',
                                                value: item.odometro == null
                                                    ? '-'
                                                    : AppDates.number(
                                                        item.odometro!,
                                                        digits: 1,
                                                      ),
                                              ),
                                              _InfoPill(
                                                label: 'Local',
                                                value: item.local ?? '-',
                                              ),
                                              _InfoPill(
                                                label: 'Combustivel',
                                                value:
                                                    item.tipoCombustivel ?? '-',
                                              ),
                                              _InfoPill(
                                                label: 'Proprietario',
                                                value: item.proprietarioNome ??
                                                    'Sem proprietario',
                                              ),
                                              _InfoPill(
                                                label: 'Motorista',
                                                value:
                                                    item.motoristaNome ?? '-',
                                              ),
                                            ],
                                          ),
                                          if (_temAnexo(item)) ...[
                                            const SizedBox(height: 12),
                                            Wrap(
                                              spacing: 10,
                                              runSpacing: 10,
                                              children: [
                                                if ((item.fotoOdometro ?? '')
                                                    .trim()
                                                    .isNotEmpty)
                                                  _AnexoThumb(
                                                    url: item.fotoOdometro!,
                                                    label: 'Hodometro',
                                                  ),
                                                if ((item.bomba ?? '')
                                                    .trim()
                                                    .isNotEmpty)
                                                  _AnexoThumb(
                                                    url: item.bomba!,
                                                    label: 'Bomba',
                                                  ),
                                              ],
                                            ),
                                          ] else ...[
                                            const SizedBox(height: 10),
                                            const Text(
                                              'Sem imagem anexada.',
                                              style: TextStyle(
                                                color: AppTheme.textMuted,
                                              ),
                                            ),
                                          ],
                                          const SizedBox(height: 12),
                                          Wrap(
                                            spacing: 8,
                                            runSpacing: 8,
                                            children: [
                                              OutlinedButton.icon(
                                                onPressed: () async {
                                                  final navigator =
                                                      Navigator.of(
                                                          sheetContext);
                                                  Navigator.pop(sheetContext);
                                                  if (!mounted) return;
                                                  final ok = await navigator
                                                      .push<bool>(
                                                    MaterialPageRoute(
                                                      builder: (_) =>
                                                          AbastecimentoFormScreen(
                                                        original: item,
                                                      ),
                                                    ),
                                                  );
                                                  if (ok == true && mounted) {
                                                    await _load();
                                                  }
                                                },
                                                icon: const Icon(
                                                  Icons.edit_outlined,
                                                  size: 18,
                                                ),
                                                label: const Text(
                                                    'Editar abastecimento'),
                                              ),
                                              FilledButton.icon(
                                                onPressed: () =>
                                                    _marcarVerificado(
                                                  sheetContext,
                                                  item,
                                                  refreshSheet: () {
                                                    if (sheetContext.mounted) {
                                                      setSheetState(() {});
                                                    }
                                                  },
                                                ),
                                                icon: const Icon(
                                                  Icons.verified_outlined,
                                                  size: 18,
                                                ),
                                                label: const Text('Verificado'),
                                              ),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                },
                              ),
                      ),
                    ],
                  );
                },
              ),
            );
          },
        );
      },
    );
  }

  bool _temAnexo(Abastecimento item) =>
      (item.fotoOdometro ?? '').trim().isNotEmpty ||
      (item.bomba ?? '').trim().isNotEmpty;

  Future<void> _marcarVerificado(
    BuildContext sheetContext,
    Abastecimento item, {
    VoidCallback? refreshSheet,
  }) async {
    final id = item.idAbastecimento?.trim();
    if (id == null || id.isEmpty) return;
    try {
      final resp = await AppState.instance.api
          .post('/abastecimentos/$id/verificar-inconsistencia', {});
      Abastecimento? atualizado;
      if (resp is Map) {
        atualizado = Abastecimento.fromJson(Map<String, dynamic>.from(resp));
        await AppState.instance.db.upsertAbastecimentosRemotos([atualizado]);
      }
      await AppState.instance.db.marcarAbastecimentoConsistenteLocal(
        id,
        verificadoPorId: atualizado?.imagemVerificadaPorId,
        verificadoPor: atualizado?.imagemVerificadaPor,
        verificadoEm: atualizado?.imagemVerificadaEm,
      );
      if (!mounted) return;
      setState(() {
        _inconsistencias =
            _inconsistencias.where((a) => a.idAbastecimento != id).toList();
      });
      if (sheetContext.mounted) {
        refreshSheet?.call();
      }
      if (sheetContext.mounted && _inconsistencias.isEmpty) {
        Navigator.pop(sheetContext);
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Abastecimento marcado como consistente.'),
          backgroundColor: AppTheme.success,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao marcar consistente: $e'),
          backgroundColor: AppTheme.danger,
        ),
      );
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

  ({double tanque, double comprado, double abastecido}) _tankFuelSummary() {
    final data = _data;
    if (data == null) {
      return (tanque: 0, comprado: 0, abastecido: 0);
    }

    if (_selectedMesRef == null) {
      final compradoTotal = data.totais.combustivelCompradoLitros;
      final abastecidoTotal = data.totais.combustivelVendidoLitros;
      final tanqueTotal = data.totais.combustivelTanqueLitros;
      if (compradoTotal > 0 || abastecidoTotal > 0 || tanqueTotal > 0) {
        return (
          tanque: math.max(0, tanqueTotal),
          comprado: compradoTotal,
          abastecido: abastecidoTotal,
        );
      }
    }

    final meses = _mesesFiltrados;
    double comprado = 0;
    double abastecido = 0;
    for (final m in meses) {
      comprado += m.compradoLitros;
      abastecido += m.vendidoLitros;
    }

    if (meses.isEmpty || (comprado <= 0 && abastecido <= 0)) {
      abastecido = data.totais.litros;
    }

    return (
      tanque: math.max(0, comprado - abastecido),
      comprado: comprado,
      abastecido: abastecido,
    );
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

  Future<void> _trocarFilialDashboard(String? filial) async {
    if (filial == null || filial.isEmpty) return;
    final auth = AppState.instance.auth;
    if (!auth.canAccessFilial(filial) || auth.filialAtual == filial) return;
    await auth.setFilialAtual(filial);
    _clearFiltros();
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    await _load();
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
    final tanque = _tankFuelSummary();

    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Expanded(child: SectionHeader(texto: 'Dashboard')),
            const SizedBox(width: 10),
            _DashboardFilialSelector(
              filialAtual: AppState.instance.auth.filialAtual ?? 'Matriz',
              filiais: AppState.instance.auth.filiaisAcesso,
              onChanged: _trocarFilialDashboard,
            ),
          ],
        ),
        Text(
          'Visão geral dos últimos 12 meses',
          style: TextStyle(
            color: AppTheme.textMuted.withOpacity(0.9),
            fontSize: 13,
          ),
        ),
        if (_appVersionLabel != null) ...[
          const SizedBox(height: 6),
          Align(
            alignment: Alignment.centerLeft,
            child: _VersionChip(version: _appVersionLabel!),
          ),
        ],
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
        if (_inconsistencias.isNotEmpty) ...[
          Card(
            color: AppTheme.warning.withOpacity(0.10),
            child: ListTile(
              leading: const CircleAvatar(
                backgroundColor: Color(0xFFFFEDD5),
                child: Icon(Icons.flag_outlined, color: AppTheme.warning),
              ),
              title: const Text(
                'Log de inconsistencias',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              subtitle: Text(
                  '${_inconsistencias.length} abastecimento(s) aguardando conferencia'),
              trailing: FilledButton.tonal(
                onPressed: _abrirInconsistencias,
                child: const Text('Acessar'),
              ),
            ),
          ),
          const SizedBox(height: 10),
        ],
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
                _Chip(text: 'Baixa: $_selectedStatus'),
              OutlinedButton(
                onPressed: _clearFiltros,
                child: const Text('Limpar filtros'),
              ),
            ],
          ),
        const SizedBox(height: 10),
        _TankFuelCard(
          litrosTanque: tanque.tanque,
          compradoLitros: tanque.comprado,
          abastecidoLitros: tanque.abastecido,
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
              titulo: 'Litros vendidos hoje',
              valor:
                  '${AppDates.number(data.totais.litrosVendidosHoje, digits: 2)} L',
              icone: Icons.local_gas_station_outlined,
              cor: const Color(0xFF0EA5E9),
            ),
            KpiCard(
              titulo: 'Valor vendido hoje',
              valor: AppDates.money(data.totais.valorVendidoHoje),
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
          title: 'Baixa: Pendente x Pago (L)',
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
          title: 'Últimos 12 meses — Custo final x Vendido (R\$)',
          legendA: 'Comprado com transporte (R\$)',
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
          title: 'Últimos 12 meses — Baixa Pendente x Pago (R\$)',
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
                    subtitle: Text('${entry.value.total} abastecimento(s)'),
                    trailing: Text(
                      AppDates.money(entry.value.valor),
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ),
      ],
    );
  }
}

class _TankFuelCard extends StatelessWidget {
  final double litrosTanque;
  final double compradoLitros;
  final double abastecidoLitros;

  const _TankFuelCard({
    required this.litrosTanque,
    required this.compradoLitros,
    required this.abastecidoLitros,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: AppTheme.border),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 18, 18),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: const Color(0xFFE0F2FE),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(
                Icons.local_gas_station_rounded,
                color: Color(0xFFE11D48),
                size: 26,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '${AppDates.number(litrosTanque, digits: 2)} L',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Color(0xFF0F172A),
                      fontSize: 26,
                      height: 1,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 5),
                  const Text(
                    'COMBUSTÍVEL NO TANQUE',
                    style: TextStyle(
                      color: Color(0xFF475569),
                      fontSize: 13,
                      height: 1.1,
                      letterSpacing: 0.8,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Comprado ${AppDates.number(compradoLitros, digits: 2)} L - Abastecido ${AppDates.number(abastecidoLitros, digits: 2)} L',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppTheme.textMuted,
                      fontSize: 12,
                      height: 1.2,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            _MiniTankGauge(litros: litrosTanque),
          ],
        ),
      ),
    );
  }
}

class _MiniTankGauge extends StatelessWidget {
  final double litros;

  const _MiniTankGauge({required this.litros});

  double get _percent {
    final atual = math.max(0, litros);
    final capacidade =
        math.max(15000, (math.max(atual, 1) / 1000).ceil() * 1000);
    return (atual / capacidade).clamp(0, 1).toDouble();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 78,
      height: 78,
      child: CustomPaint(
        painter: _MiniTankPainter(_percent),
      ),
    );
  }
}

class _MiniTankPainter extends CustomPainter {
  final double percent;

  _MiniTankPainter(this.percent);

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final outer = Rect.fromLTWH(3, 3, size.width - 6, size.height - 6);
    final circlePath = Path()..addOval(outer);

    final bgPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFFE8EEEA), Color(0xFF95A39D)],
      ).createShader(outer);
    canvas.drawOval(outer, bgPaint);

    canvas.save();
    canvas.clipPath(circlePath);
    final liquidTop = outer.bottom - outer.height * percent;
    final liquidRect = Rect.fromLTRB(
      outer.left - 2,
      liquidTop,
      outer.right + 2,
      outer.bottom + 2,
    );
    final liquidPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFFF8CD63), Color(0xFFC9770D)],
      ).createShader(liquidRect);
    canvas.drawRect(liquidRect, liquidPaint);
    canvas.drawLine(
      Offset(outer.left, liquidTop),
      Offset(outer.right, liquidTop),
      Paint()
        ..color = const Color(0xFFF8DD85)
        ..strokeWidth = 2,
    );
    canvas.drawLine(
      Offset(outer.left, outer.center.dy),
      Offset(outer.right, outer.center.dy),
      Paint()
        ..color = const Color(0x3344554E)
        ..strokeWidth = 1,
    );
    canvas.restore();

    final highlight = Paint()
      ..shader = const RadialGradient(
        center: Alignment(-0.35, -0.45),
        radius: 0.58,
        colors: [Color(0xAAFFFFFF), Color(0x00FFFFFF)],
      ).createShader(rect);
    canvas.drawOval(outer, highlight);

    canvas.drawOval(
      outer,
      Paint()
        ..color = const Color(0xFFA7B5AE)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 7,
    );
  }

  @override
  bool shouldRepaint(covariant _MiniTankPainter oldDelegate) {
    return oldDelegate.percent != percent;
  }
}

class _InfoPill extends StatelessWidget {
  final String label;
  final String value;

  const _InfoPill({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 104),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFFED7AA)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: AppTheme.warning,
              fontSize: 10,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _VersionChip extends StatelessWidget {
  final String version;

  const _VersionChip({required this.version});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.sync,
              size: 14,
              color: AppTheme.textMuted,
            ),
            const SizedBox(width: 6),
            Text(
              'Versão $version',
              style: const TextStyle(
                color: AppTheme.textMuted,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AnexoThumb extends StatelessWidget {
  final String url;
  final String label;

  const _AnexoThumb({required this.url, required this.label});

  bool get _remote =>
      url.trim().toLowerCase().startsWith('http://') ||
      url.trim().toLowerCase().startsWith('https://') ||
      url.trim().toLowerCase().startsWith('data:image/');

  File get _localFile {
    final value = url.trim();
    final uri = Uri.tryParse(value);
    if (uri != null && uri.scheme == 'file') {
      return File.fromUri(uri);
    }
    return File(value);
  }

  @override
  Widget build(BuildContext context) {
    final image = _remote
        ? Image.network(
            url,
            width: 112,
            height: 84,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => _imageFallback(),
          )
        : Image.file(
            _localFile,
            width: 112,
            height: 84,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => _imageFallback(),
          );

    return InkWell(
      onTap: () => _openPreview(context),
      child: SizedBox(
        width: 112,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: image,
            ),
            const SizedBox(height: 5),
            Text(
              label,
              style: const TextStyle(
                color: AppTheme.warning,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _imageFallback() {
    return Container(
      width: 112,
      height: 84,
      color: const Color(0xFFFFF7ED),
      alignment: Alignment.center,
      child: const Icon(Icons.broken_image_outlined, color: AppTheme.warning),
    );
  }

  void _openPreview(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (_) {
        final preview = _remote
            ? Image.network(url, fit: BoxFit.contain)
            : Image.file(_localFile, fit: BoxFit.contain);
        return Dialog(
          backgroundColor: Colors.black,
          insetPadding: const EdgeInsets.all(12),
          child: InteractiveViewer(child: preview),
        );
      },
    );
  }
}

class _DashboardFilialSelector extends StatelessWidget {
  final String filialAtual;
  final List<String> filiais;
  final ValueChanged<String?> onChanged;

  const _DashboardFilialSelector({
    required this.filialAtual,
    required this.filiais,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 128, maxWidth: 170),
      child: DropdownButtonFormField<String>(
        value: filiais.contains(filialAtual)
            ? filialAtual
            : (filiais.isNotEmpty ? filiais.first : 'Matriz'),
        isDense: true,
        decoration: InputDecoration(
          labelText: 'Filial',
          prefixIcon: Icon(
            filialAtual == 'Matriz'
                ? Icons.business_outlined
                : Icons.warehouse_outlined,
            size: 18,
          ),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        ),
        items: filiais
            .map((filial) => DropdownMenuItem(
                  value: filial,
                  child: Text(
                    filial,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ))
            .toList(),
        onChanged: filiais.length <= 1 ? null : onChanged,
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
    final filtered = items.where((e) => e.value > 0).toList(growable: false);
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
                        final idx =
                            response?.touchedSection?.touchedSectionIndex;
                        if (idx == null || idx < 0 || idx >= filtered.length) {
                          return;
                        }
                        onStatusTap(filtered[idx].label);
                      },
                    ),
                    sections: List.generate(filtered.length, (index) {
                      final it = filtered[index];
                      final isSelected = selectedStatus == it.label;
                      final pct = total > 0 ? (it.value / total) * 100 : 0;
                      return PieChartSectionData(
                        value: it.value,
                        color:
                            isSelected ? it.color.withOpacity(0.9) : it.color,
                        radius: isSelected ? 64 : 58,
                        title: '${pct.toStringAsFixed(pct >= 10 ? 0 : 1)}%',
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
  final double litrosVendidosHoje;
  final double valorVendidoHoje;
  final double combustivelCompradoLitros;
  final double combustivelVendidoLitros;
  final double combustivelTanqueLitros;

  _DashboardTotais({
    required this.abastecimentos,
    required this.litros,
    required this.valor,
    required this.pendenteBaixa,
    required this.valorTotalVendido,
    required this.valorTotalPendenteBaixa,
    required this.valorTotalRecebido,
    required this.litrosVendidosHoje,
    required this.valorVendidoHoje,
    required this.combustivelCompradoLitros,
    required this.combustivelVendidoLitros,
    required this.combustivelTanqueLitros,
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
      litrosVendidosHoje: _toDouble(json['litros_vendidos_hoje']),
      valorVendidoHoje: _toDouble(json['valor_vendido_hoje']),
      combustivelCompradoLitros: _toDouble(json['combustivel_comprado_litros']),
      combustivelVendidoLitros: _toDouble(json['combustivel_vendido_litros']),
      combustivelTanqueLitros: _toDouble(json['combustivel_tanque_litros']),
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
