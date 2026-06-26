import 'dart:io';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_state.dart';
import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/date_utils.dart';
import '../../core/file_opener.dart';
import '../../core/models.dart';
import '../../core/thermal_printer.dart';
import '../../widgets/common.dart';
import '../../widgets/empresa_picker.dart';
import '../encerrante_bomba_screen.dart';
import 'form_screen.dart';

class AbastecimentosListScreen extends StatefulWidget {
  const AbastecimentosListScreen({super.key});

  @override
  State<AbastecimentosListScreen> createState() =>
      _AbastecimentosListScreenState();
}

class _AbastecimentosListScreenState extends State<AbastecimentosListScreen> {
  bool _loading = true;
  List<Abastecimento> _items = [];
  List<String> _tiposCombustivel = const ['OLEO DIESEL S10'];

  // filtros
  String? _filtroProprietario;
  String? _filtroPlaca;
  String? _filtroTipo;
  String? _dataInicio;
  String? _dataFim;

  final _placaCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _placaCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() => _loading = true);
    final valores = await AppState.instance.db.listValoresCombustivel(
      local: AppState.instance.auth.filialAtual,
    );
    _tiposCombustivel = _extrairTiposCombustivel(valores);
    if (_filtroTipo != null && !_tiposCombustivel.contains(_filtroTipo)) {
      _filtroTipo = null;
    }
    var items = await AppState.instance.db.listAbastecimentos(
      idProprietario: _filtroProprietario,
      placa: _filtroPlaca,
      tipoCombustivel: _filtroTipo,
      dataInicio: _dataInicio,
      dataFim: _dataFim,
      local: AppState.instance.auth.filialAtual,
    );

    if (!mounted) return;
    setState(() {
      _items = items;
      _loading = false;
    });
  }

  List<String> _extrairTiposCombustivel(List<ValorCombustivel> valores) {
    final tipos = valores
        .map((v) => v.tipoCombustivel.trim())
        .where((t) => t.isNotEmpty)
        .toSet()
        .toList();
    tipos.sort((a, b) => a.compareTo(b));
    if (tipos.isEmpty) return const ['OLEO DIESEL S10'];
    return tipos;
  }

  Future<void> _abrirFiltros() async {
    final props = await AppState.instance.db
        .listProprietarios(local: AppState.instance.auth.filialAtual);
    if (!mounted) return;

    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppTheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) => _FiltrosSheet(
        proprietarios: props,
        tiposCombustivel: _tiposCombustivel,
        initialProprietario: _filtroProprietario,
        initialPlaca: _filtroPlaca,
        initialTipo: _filtroTipo,
        initialDataInicio: _dataInicio,
        initialDataFim: _dataFim,
      ),
    );

    if (result != null) {
      if (!mounted) return;
      setState(() {
        _filtroProprietario = result['proprietario'] as String?;
        _filtroPlaca = result['placa'] as String?;
        _filtroTipo = result['tipo'] as String?;
        _dataInicio = result['data_inicio'] as String?;
        _dataFim = result['data_fim'] as String?;
      });
      await _load();
    }
  }

  Future<void> _novo() async {
    final podeCriar = await _validarEncerranteOperador();
    if (!podeCriar) return;
    if (!mounted) return;
    final ok = await Navigator.of(context).push<bool>(
        MaterialPageRoute(builder: (_) => const AbastecimentoFormScreen()));
    if (!mounted || ok != true) return;
    await _load();
  }

  Future<bool> _validarEncerranteOperador() async {
    if (!Roles.canCreate(AppState.instance.auth.tipo)) return true;

    try {
      final resp = await AppState.instance.api.get(
        '/encerrantes-bomba/status',
        query: {'local': AppState.instance.auth.filialAtual ?? 'Matriz'},
      );
      final podeAbastecer = resp is Map && resp['pode_abastecer'] == true;
      if (podeAbastecer) return true;

      if (!mounted) return false;
      final abrir = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Encerrante pendente'),
          content: const Text(
            'Informe o encerrante semanal da bomba antes de criar novo abastecimento.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Informar agora'),
            ),
          ],
        ),
      );
      if (abrir == true && mounted) {
        await Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const EncerranteBombaScreen()),
        );
      }
      return false;
    } catch (e) {
      if (!mounted) return false;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Nao foi possivel validar o encerrante: $e'),
        backgroundColor: AppTheme.warning,
      ));
      return false;
    }
  }

  Future<void> _editar(Abastecimento a) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => AbastecimentoFormScreen(original: a),
    ));
    if (ok == true) _load();
  }

  Future<void> _abrirDetalhes(Abastecimento a) async {
    final isAdmin = Roles.isAdmin(AppState.instance.auth.tipo);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppTheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) => _DetalhesAbastecimentoSheet(
        item: a,
        isAdmin: isAdmin,
        onEditar: () async {
          Navigator.pop(ctx);
          await _editar(a);
        },
        onExcluir: () async {
          Navigator.pop(ctx);
          await _excluir(a);
        },
      ),
    );
  }

  Future<void> _excluir(Abastecimento a) async {
    if (!Roles.isAdmin(AppState.instance.auth.tipo)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Somente administradores podem excluir abastecimentos.'),
        backgroundColor: AppTheme.danger,
      ));
      return;
    }

    final id = (a.idAbastecimento ?? a.localUuid ?? '').trim();
    if (id.isEmpty) return;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Excluir abastecimento'),
        content: Text(
          'Excluir o abastecimento da placa ${a.veiculoPlaca ?? a.idVeiculo ?? '-'}?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Excluir'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    try {
      if ((a.idAbastecimento ?? '').trim().isNotEmpty) {
        await AppState.instance.api
            .delete('/abastecimentos/${a.idAbastecimento}');
      }
      await AppState.instance.db
          .deleteAbastecimentoLocal(id, enqueueSync: false);
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Abastecimento excluido.'),
        backgroundColor: AppTheme.success,
      ));
    } on OfflineException {
      await AppState.instance.db.deleteAbastecimentoLocal(id);
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Sem internet: exclusao enfileirada.'),
        backgroundColor: AppTheme.warning,
      ));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro ao excluir: $e'),
        backgroundColor: AppTheme.danger,
      ));
    }
  }

  bool get _temFiltros =>
      _filtroProprietario != null ||
      (_filtroPlaca != null && _filtroPlaca!.isNotEmpty) ||
      _filtroTipo != null ||
      _dataInicio != null ||
      _dataFim != null;

  Future<void> _trocarFilial(String? filial) async {
    if (filial == null || filial.isEmpty) return;
    final auth = AppState.instance.auth;
    if (!auth.canAccessFilial(filial) || auth.filialAtual == filial) return;
    await auth.setFilialAtual(filial);
    if (!mounted) return;
    setState(() {
      _filtroProprietario = null;
      _filtroPlaca = null;
      _filtroTipo = null;
      _dataInicio = null;
      _dataFim = null;
    });
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final canCreate = Roles.canCreate(AppState.instance.auth.tipo);
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Column(
        children: [
          _ToolBar(
            filialAtual: AppState.instance.auth.filialAtual ?? 'Matriz',
            filiais: AppState.instance.auth.filiaisAcesso,
            onFilialChanged: _trocarFilial,
            temFiltros: _temFiltros,
            onFiltros: _abrirFiltros,
            onLimpar: _temFiltros
                ? () {
                    setState(() {
                      _filtroProprietario = null;
                      _filtroPlaca = null;
                      _filtroTipo = null;
                      _dataInicio = null;
                      _dataFim = null;
                    });
                    _load();
                  }
                : null,
          ),
          if (_loading)
            const Expanded(child: Center(child: CircularProgressIndicator()))
          else if (_items.isEmpty)
            const Expanded(
              child: EmptyState(
                icone: Icons.local_gas_station_outlined,
                titulo: 'Sem abastecimentos',
                mensagem: 'Sincronize para baixar ou crie um novo registro.',
              ),
            )
          else
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                itemCount: _items.length,
                itemBuilder: (_, i) => _AbastTile(
                  item: _items[i],
                  onTap: () => _abrirDetalhes(_items[i]),
                  onVerified: _load,
                ),
              ),
            ),
        ],
      ),
      floatingActionButton: canCreate
          ? FloatingActionButton.extended(
              onPressed: _novo,
              icon: const Icon(Icons.add),
              label: const Text('Novo'),
            )
          : null,
    );
  }
}

class _DetalhesAbastecimentoSheet extends StatelessWidget {
  final Abastecimento item;
  final bool isAdmin;
  final VoidCallback onEditar;
  final VoidCallback onExcluir;

  const _DetalhesAbastecimentoSheet({
    required this.item,
    required this.isAdmin,
    required this.onEditar,
    required this.onExcluir,
  });

  String? get _verificadoPor {
    final nome = item.imagemVerificadaPor?.trim();
    if (nome == null || nome.isEmpty) return null;
    final quando = AppDates.formatDateTimeBr(item.imagemVerificadaEm);
    return quando.isEmpty ? nome : '$nome\n$quando';
  }

  @override
  Widget build(BuildContext context) {
    final total = item.valorTotal ??
        (((item.valorPorLitro ?? 0) * item.quantidadeLitros) + 0.000001)
            .floorToDouble();
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          16,
          18,
          16,
          18 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.veiculoPlaca ?? item.idVeiculo ?? 'Abastecimento',
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        AppDates.formatDateTimeOrDateBr(
                            item.dataHora, item.data),
                        style: const TextStyle(color: AppTheme.textMuted),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _DetailInfo(
                    label: 'Proprietario', value: item.proprietarioNome),
                _DetailInfo(label: 'Motorista', value: item.motoristaNome),
                _DetailInfo(label: 'Combustivel', value: item.tipoCombustivel),
                _DetailInfo(label: 'Verificado por', value: _verificadoPor),
                _DetailInfo(
                  label: 'Quantidade',
                  value:
                      '${AppDates.number(item.quantidadeLitros, digits: 2)} L',
                ),
                _DetailInfo(
                  label: 'Valor por litro',
                  value: item.valorPorLitro == null
                      ? null
                      : AppDates.number(item.valorPorLitro!, digits: 3),
                ),
                _DetailInfo(label: 'Valor total', value: AppDates.money(total)),
                _DetailInfo(
                  label: 'Hodometro',
                  value: item.odometro == null
                      ? null
                      : AppDates.number(item.odometro!, digits: 0),
                ),
                _DetailInfo(label: 'Local', value: item.local),
                _DetailInfo(
                  label: 'Baixa',
                  value: item.baixaAbastecimento ? 'Baixado' : 'Pendente',
                ),
              ],
            ),
            if ((item.observacao ?? '').trim().isNotEmpty) ...[
              const SizedBox(height: 12),
              _DetailInfo(label: 'Observacao', value: item.observacao),
            ],
            if ((item.fotoOdometro ?? '').isNotEmpty ||
                (item.bomba ?? '').isNotEmpty) ...[
              const SizedBox(height: 14),
              Row(
                children: [
                  if ((item.fotoOdometro ?? '').isNotEmpty)
                    _ImagemMiniatura(
                      url: item.fotoOdometro!,
                      label: 'Hodometro',
                    ),
                  if ((item.fotoOdometro ?? '').isNotEmpty &&
                      (item.bomba ?? '').isNotEmpty)
                    const SizedBox(width: 10),
                  if ((item.bomba ?? '').isNotEmpty)
                    _ImagemMiniatura(
                      url: item.bomba!,
                      label: 'Bomba',
                    ),
                ],
              ),
            ],
            if (isAdmin) ...[
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: onExcluir,
                      icon: const Icon(Icons.delete_outline),
                      label: const Text('Excluir'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppTheme.danger,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: onEditar,
                      icon: const Icon(Icons.edit_outlined),
                      label: const Text('Editar'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DetailInfo extends StatelessWidget {
  final String label;
  final String? value;

  const _DetailInfo({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 165,
      constraints: const BoxConstraints(minHeight: 64),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppTheme.surfaceAlt,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: const TextStyle(
              color: AppTheme.textMuted,
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            (value == null || value!.trim().isEmpty) ? '-' : value!,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _ToolBar extends StatelessWidget {
  final String filialAtual;
  final List<String> filiais;
  final ValueChanged<String?> onFilialChanged;
  final bool temFiltros;
  final VoidCallback onFiltros;
  final VoidCallback? onLimpar;
  const _ToolBar({
    required this.filialAtual,
    required this.filiais,
    required this.onFilialChanged,
    required this.temFiltros,
    required this.onFiltros,
    required this.onLimpar,
  });
  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppTheme.surface,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          SizedBox(
            width: 160,
            child: DropdownButtonFormField<String>(
              value: filiais.contains(filialAtual)
                  ? filialAtual
                  : (filiais.isNotEmpty ? filiais.first : 'Matriz'),
              isDense: true,
              decoration: const InputDecoration(
                labelText: 'Filial',
                prefixIcon: Icon(Icons.business_outlined, size: 18),
                contentPadding:
                    EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              ),
              items: filiais
                  .map((filial) =>
                      DropdownMenuItem(value: filial, child: Text(filial)))
                  .toList(),
              onChanged: filiais.length <= 1 ? null : onFilialChanged,
            ),
          ),
          SizedBox(
            width: 160,
            child: OutlinedButton.icon(
                onPressed: onFiltros,
                icon: const Icon(Icons.filter_list),
                label: Text(temFiltros ? 'Filtros ativos' : 'Filtros'),
                style: OutlinedButton.styleFrom(
                  foregroundColor:
                      temFiltros ? AppTheme.primary : AppTheme.textMuted,
                )),
          ),
          if (onLimpar != null) ...[
            IconButton(
              onPressed: onLimpar,
              icon: const Icon(Icons.clear, color: AppTheme.danger),
              tooltip: 'Limpar filtros',
            ),
          ],
        ],
      ),
    );
  }
}

class _AbastTile extends StatelessWidget {
  final Abastecimento item;
  final VoidCallback? onTap;
  final VoidCallback onVerified;
  const _AbastTile({
    required this.item,
    required this.onTap,
    required this.onVerified,
  });

  String? _telefoneWhatsapp(String? raw) {
    final digits = (raw ?? '').replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return null;
    if (digits.startsWith('55')) return digits;
    if (digits.length == 10 || digits.length == 11) return '55$digits';
    return digits;
  }

  Future<Proprietario?> _buscarProprietario() async {
    final db = AppState.instance.db;
    final id = item.idProprietario?.trim();
    try {
      if (id != null && id.isNotEmpty) {
        final proprietario = await db.findProprietario(id);
        if (proprietario != null) return proprietario;
      }

      final nome = item.proprietarioNome?.trim().toLowerCase();
      if (nome == null || nome.isEmpty) return null;
      final proprietarios = await db.listProprietarios(local: item.local);
      final encontrados =
          proprietarios.where((p) => p.nome.trim().toLowerCase() == nome);
      return encontrados.isEmpty ? null : encontrados.first;
    } catch (_) {
      return null;
    }
  }

  Future<void> _shareWhatsapp(BuildContext context) async {
    final proprietario = await _buscarProprietario();
    if (!context.mounted) return;

    final telefone = _telefoneWhatsapp(proprietario?.celular);
    final dataHora = _formatDateTimeWhatsapp(item.dataHora ?? item.data);
    final motorista = item.motoristaNome ?? '-';
    final placa = item.veiculoPlaca ?? '-';
    final odometro = item.odometro == null
        ? '-'
        : AppDates.number(item.odometro!, digits: 0);
    final litros = _formatNumberWhatsapp(item.quantidadeLitros);
    final valorTotal = _formatNumberWhatsapp(item.valorTotal ??
        (((item.valorPorLitro ?? 0) * item.quantidadeLitros) + 0.000001)
            .floorToDouble());
    final msg = [
      'Prezado',
      'Segue os dados do abastecimento.',
      'Data/Hora: $dataHora',
      'Motorista: $motorista',
      'Placa: $placa',
      'KM do Veiculo: $odometro',
      'Quantidade abastecida: $litros Litros',
      '*Valor Total:$valorTotal*',
    ].join('\n');

    if (telefone == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
              'Proprietario sem telefone cadastrado. Abrindo sem destinatario.'),
          backgroundColor: AppTheme.warning,
        ),
      );
    }

    final uri = Uri.parse(telefone == null
        ? 'https://wa.me/?text=${Uri.encodeComponent(msg)}'
        : 'https://wa.me/$telefone?text=${Uri.encodeComponent(msg)}');
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Não foi possível abrir o WhatsApp.'),
          backgroundColor: AppTheme.danger,
        ),
      );
    }
  }

  String _formatDateTimeWhatsapp(String? iso) {
    if (iso == null || iso.isEmpty) return '-';
    try {
      final parsed = DateTime.parse(iso);
      final d = parsed.isUtc ? parsed.toLocal() : parsed;
      String two(int value) => value.toString().padLeft(2, '0');
      return '${two(d.day)}/${two(d.month)}/${d.year} ${two(d.hour)}:${two(d.minute)}:${two(d.second)}';
    } catch (_) {
      return iso;
    }
  }

  String _formatNumberWhatsapp(num? value) {
    if (value == null) return '0';
    final rounded = value.roundToDouble();
    if ((value - rounded).abs() < 0.001) {
      return rounded.toStringAsFixed(0);
    }
    return AppDates.number(value, digits: 2);
  }

  Future<void> _verificarInconsistencia(BuildContext context) async {
    final id = item.idAbastecimento?.trim();
    if (id == null || id.isEmpty) return;
    try {
      final resp = await AppState.instance.api
          .post('/abastecimentos/$id/verificar-inconsistencia', {});
      Abastecimento? atualizado;
      if (resp is Map<String, dynamic>) {
        atualizado = Abastecimento.fromJson(resp);
        await AppState.instance.db.upsertAbastecimentosRemotos([atualizado]);
      }
      await AppState.instance.db.marcarAbastecimentoConsistenteLocal(
        id,
        verificadoPorId: atualizado?.imagemVerificadaPorId,
        verificadoPor: atualizado?.imagemVerificadaPor,
        verificadoEm: atualizado?.imagemVerificadaEm,
      );
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Abastecimento marcado como consistente.'),
        backgroundColor: AppTheme.success,
      ));
      onVerified();
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro ao marcar consistente: $e'),
        backgroundColor: AppTheme.danger,
      ));
    }
  }

  Future<void> _abrirComprovante(BuildContext context) async {
    final id = item.idAbastecimento?.trim();
    if (id == null || id.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content:
              Text('Sincronize o abastecimento antes de abrir o comprovante.'),
          backgroundColor: AppTheme.warning,
        ),
      );
      return;
    }

    try {
      final file = await downloadAuthenticatedFile(
        api: AppState.instance.api,
        path: '/abastecimentos/$id/comprovante',
        filename: 'comprovante_$id.pdf',
      );
      await openDownloadedFile(file);
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao abrir comprovante: $e'),
          backgroundColor: AppTheme.danger,
        ),
      );
    }
  }

  Future<void> _imprimirComprovante(BuildContext context) async {
    try {
      await ThermalPrinterService.instance.printAbastecimento(item);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Comprovante enviado para a impressora.'),
        backgroundColor: AppTheme.success,
      ));
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro ao imprimir: $e'),
        backgroundColor: AppTheme.danger,
      ));
    }
  }

  String? get _verificadoPor {
    final nome = item.imagemVerificadaPor?.trim();
    if (nome == null || nome.isEmpty) return null;
    final quando = AppDates.formatDateTimeBr(item.imagemVerificadaEm);
    return quando.isEmpty ? nome : '$nome - $quando';
  }

  @override
  Widget build(BuildContext context) {
    final inconsistent =
        (item.status ?? '').trim().toLowerCase() == 'inconsistente';
    final verificadoPor = _verificadoPor;
    return Card(
      color: inconsistent ? AppTheme.warning.withOpacity(0.10) : null,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      item.veiculoPlaca ??
                          (item.idVeiculo != null
                              ? 'Veiculo ${item.idVeiculo}'
                              : 'Veiculo ?'),
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  if (inconsistent) ...[
                    const SizedBox(width: 6),
                    const Tooltip(
                      message: 'Flag de inconsistencia',
                      child: Icon(Icons.flag_outlined,
                          size: 20, color: AppTheme.warning),
                    ),
                  ],
                  if (item.pendingSync) ...[
                    const SizedBox(width: 6),
                    const Tooltip(
                      message: 'Pendente de envio',
                      child: Icon(Icons.cloud_upload_outlined,
                          size: 18, color: AppTheme.warning),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 4),
              Text(item.proprietarioNome ?? '',
                  style: const TextStyle(color: AppTheme.textMuted)),
              const SizedBox(height: 6),
              Row(
                children: [
                  const Icon(Icons.calendar_today_outlined,
                      size: 14, color: AppTheme.textMuted),
                  const SizedBox(width: 4),
                  Text(
                      AppDates.formatDateTimeOrDateBr(item.dataHora, item.data),
                      style: const TextStyle(
                          fontSize: 12, color: AppTheme.textMuted)),
                  const SizedBox(width: 12),
                  const Icon(Icons.opacity,
                      size: 14, color: AppTheme.textMuted),
                  const SizedBox(width: 4),
                  Text('${AppDates.number(item.quantidadeLitros, digits: 2)} L',
                      style: const TextStyle(
                          fontSize: 12, color: AppTheme.textMuted)),
                  const Spacer(),
                  Text(
                    AppDates.money(item.valorTotal ??
                        (((item.valorPorLitro ?? 0) * item.quantidadeLitros) +
                                0.000001)
                            .floorToDouble()),
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
              if (item.tipoCombustivel != null) ...[
                const SizedBox(height: 6),
                Text(item.tipoCombustivel!,
                    style:
                        const TextStyle(fontSize: 12, color: AppTheme.primary)),
              ],
              if (verificadoPor != null) ...[
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(Icons.verified_user_outlined,
                        size: 14, color: AppTheme.success),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        'Verificado por $verificadoPor',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppTheme.textMuted,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton.icon(
                    onPressed: () => _abrirComprovante(context),
                    icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
                    label: const Text('PDF'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => _imprimirComprovante(context),
                    icon: const Icon(Icons.print_outlined, size: 18),
                    label: const Text('Imprimir'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => _shareWhatsapp(context),
                    icon: const Icon(Icons.share_outlined, size: 18),
                    label: const Text('WhatsApp'),
                  ),
                  if (inconsistent)
                    OutlinedButton.icon(
                      onPressed: () => _verificarInconsistencia(context),
                      icon: const Icon(Icons.verified_outlined, size: 18),
                      label: const Text('Marcar consistente'),
                    ),
                ],
              ),
              if ((item.fotoOdometro ?? '').isNotEmpty ||
                  (item.bomba ?? '').isNotEmpty) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    if ((item.fotoOdometro ?? '').isNotEmpty)
                      _ImagemMiniatura(
                        url: item.fotoOdometro!,
                        label: 'Odometro',
                      ),
                    if ((item.fotoOdometro ?? '').isNotEmpty &&
                        (item.bomba ?? '').isNotEmpty)
                      const SizedBox(width: 8),
                    if ((item.bomba ?? '').isNotEmpty)
                      _ImagemMiniatura(
                        url: item.bomba!,
                        label: 'Bomba',
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _ImagemMiniatura extends StatelessWidget {
  final String url;
  final String label;
  const _ImagemMiniatura({required this.url, required this.label});

  bool get _remote {
    final value = url.trim().toLowerCase();
    return value.startsWith('http://') ||
        value.startsWith('https://') ||
        value.startsWith('data:image/');
  }

  File get _localFile {
    final value = url.trim();
    final uri = Uri.tryParse(value);
    if (uri != null && uri.scheme == 'file') {
      return File.fromUri(uri);
    }
    return File(value);
  }

  Widget _image({
    required double width,
    required double height,
    required BoxFit fit,
    required Widget Function() fallback,
  }) {
    if (_remote) {
      return Image.network(
        url,
        width: width,
        height: height,
        fit: fit,
        errorBuilder: (_, __, ___) => fallback(),
      );
    }
    return Image.file(
      _localFile,
      width: width,
      height: height,
      fit: fit,
      errorBuilder: (_, __, ___) => fallback(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () {
        showDialog(
          context: context,
          builder: (_) => Dialog(
            backgroundColor: Colors.black,
            child: InteractiveViewer(
              child: _image(
                width: double.infinity,
                height: double.infinity,
                fit: BoxFit.contain,
                fallback: () => const Center(
                  child: Icon(
                    Icons.broken_image_outlined,
                    color: Colors.white70,
                  ),
                ),
              ),
            ),
          ),
        );
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: _image(
              width: 58,
              height: 58,
              fit: BoxFit.cover,
              fallback: () => Container(
                width: 58,
                height: 58,
                color: AppTheme.surfaceAlt,
                alignment: Alignment.center,
                child: const Icon(Icons.broken_image_outlined,
                    color: AppTheme.textMuted, size: 20),
              ),
            ),
          ),
          const SizedBox(height: 3),
          Text(
            label,
            style: const TextStyle(fontSize: 10, color: AppTheme.textMuted),
          ),
        ],
      ),
    );
  }
}

class _FiltrosSheet extends StatefulWidget {
  final List<Proprietario> proprietarios;
  final List<String> tiposCombustivel;
  final String? initialProprietario;
  final String? initialPlaca;
  final String? initialTipo;
  final String? initialDataInicio;
  final String? initialDataFim;

  const _FiltrosSheet({
    required this.proprietarios,
    required this.tiposCombustivel,
    required this.initialProprietario,
    required this.initialPlaca,
    required this.initialTipo,
    required this.initialDataInicio,
    required this.initialDataFim,
  });

  @override
  State<_FiltrosSheet> createState() => _FiltrosSheetState();
}

class _FiltrosSheetState extends State<_FiltrosSheet> {
  String? _prop;
  String? _tipo;
  String? _di;
  String? _df;
  late TextEditingController _placaCtrl;

  @override
  void initState() {
    super.initState();
    _prop = widget.initialProprietario;
    _tipo = widget.initialTipo;
    if (_tipo != null && !widget.tiposCombustivel.contains(_tipo)) {
      _tipo = null;
    }
    _di = widget.initialDataInicio;
    _df = widget.initialDataFim;
    _placaCtrl = TextEditingController(text: widget.initialPlaca ?? '');
  }

  @override
  void dispose() {
    _placaCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Filtros',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            EmpresaPickerField(
              proprietarios: widget.proprietarios,
              value: _prop,
              allowNull: true,
              nullLabel: 'Todos',
              label: 'Proprietario',
              onChanged: (v) => setState(() => _prop = v),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _placaCtrl,
              decoration: const InputDecoration(labelText: 'Placa contem'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              value: _tipo,
              isExpanded: true,
              decoration:
                  const InputDecoration(labelText: 'Tipo de combustivel'),
              items: [
                const DropdownMenuItem<String?>(
                    value: null, child: Text('Todos')),
                ...widget.tiposCombustivel
                    .map((t) => DropdownMenuItem(value: t, child: Text(t))),
              ],
              onChanged: (v) => setState(() => _tipo = v),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                    child: _DateBtn(
                        label: 'De',
                        iso: _di,
                        onChanged: (v) => setState(() => _di = v))),
                const SizedBox(width: 8),
                Expanded(
                    child: _DateBtn(
                        label: 'Ate',
                        iso: _df,
                        onChanged: (v) => setState(() => _df = v))),
              ],
            ),
            const SizedBox(height: 22),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context, <String, dynamic>{
                      'proprietario': null,
                      'placa': null,
                      'tipo': null,
                      'data_inicio': null,
                      'data_fim': null,
                    }),
                    child: const Text('Limpar'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => Navigator.pop(context, <String, dynamic>{
                      'proprietario': _prop,
                      'placa': _placaCtrl.text.trim().isEmpty
                          ? null
                          : _placaCtrl.text.trim(),
                      'tipo': _tipo,
                      'data_inicio': _di,
                      'data_fim': _df,
                    }),
                    child: const Text('Aplicar'),
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

class _DateBtn extends StatelessWidget {
  final String label;
  final String? iso;
  final ValueChanged<String?> onChanged;
  const _DateBtn(
      {required this.label, required this.iso, required this.onChanged});
  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: () async {
        final p = await pickDateIso(context, initialIso: iso);
        if (p != null) onChanged(p);
      },
      icon: const Icon(Icons.calendar_today_outlined, size: 16),
      label: Text(iso == null ? label : AppDates.formatDateBr(iso)),
    );
  }
}
