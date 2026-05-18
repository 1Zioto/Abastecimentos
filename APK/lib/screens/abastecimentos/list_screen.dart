import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_state.dart';
import '../../core/constants.dart';
import '../../core/date_utils.dart';
import '../../core/file_opener.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';
import '../../widgets/empresa_picker.dart';
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
  int? _filtroProprietario;
  String? _filtroPlaca;
  String? _filtroStatus;
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
    setState(() => _loading = true);
    final valores = await AppState.instance.db.listValoresCombustivel();
    _tiposCombustivel = _extrairTiposCombustivel(valores);
    if (_filtroTipo != null && !_tiposCombustivel.contains(_filtroTipo)) {
      _filtroTipo = null;
    }
    final items = await AppState.instance.db.listAbastecimentos(
      idProprietario: _filtroProprietario,
      placa: _filtroPlaca,
      status: _filtroStatus,
      tipoCombustivel: _filtroTipo,
      dataInicio: _dataInicio,
      dataFim: _dataFim,
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
    final props = await AppState.instance.db.listProprietarios();

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
        initialStatus: _filtroStatus,
        initialTipo: _filtroTipo,
        initialDataInicio: _dataInicio,
        initialDataFim: _dataFim,
      ),
    );

    if (result != null) {
      setState(() {
        _filtroProprietario = result['proprietario'] as int?;
        _filtroPlaca = result['placa'] as String?;
        _filtroStatus = result['status'] as String?;
        _filtroTipo = result['tipo'] as String?;
        _dataInicio = result['data_inicio'] as String?;
        _dataFim = result['data_fim'] as String?;
      });
      await _load();
    }
  }

  Future<void> _novo() async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(
        builder: (_) => const AbastecimentoFormScreen()));
    if (ok == true) _load();
  }

  Future<void> _editar(Abastecimento a) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => AbastecimentoFormScreen(original: a),
    ));
    if (ok == true) _load();
  }

  bool get _temFiltros =>
      _filtroProprietario != null ||
      (_filtroPlaca != null && _filtroPlaca!.isNotEmpty) ||
      _filtroStatus != null ||
      _filtroTipo != null ||
      _dataInicio != null ||
      _dataFim != null;

  @override
  Widget build(BuildContext context) {
    final canCreate = Roles.canCreate(AppState.instance.auth.tipo);
    final canEdit = Roles.isAdmin(AppState.instance.auth.tipo);
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Column(
        children: [
          _ToolBar(
            temFiltros: _temFiltros,
            onFiltros: _abrirFiltros,
            onLimpar: _temFiltros
                ? () {
                    setState(() {
                      _filtroProprietario = null;
                      _filtroPlaca = null;
                      _filtroStatus = null;
                      _filtroTipo = null;
                      _dataInicio = null;
                      _dataFim = null;
                    });
                    _load();
                  }
                : null,
          ),
          if (_loading)
            const Expanded(
                child: Center(child: CircularProgressIndicator()))
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
              child: RefreshIndicator(
                onRefresh: _load,
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                itemCount: _items.length,
                itemBuilder: (_, i) =>
                    _AbastTile(
                      item: _items[i],
                      onTap: canEdit ? () => _editar(_items[i]) : null,
                    ),
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

class _ToolBar extends StatelessWidget {
  final bool temFiltros;
  final VoidCallback onFiltros;
  final VoidCallback? onLimpar;
  const _ToolBar(
      {required this.temFiltros,
      required this.onFiltros,
      required this.onLimpar});
  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppTheme.surface,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: onFiltros,
              icon: const Icon(Icons.filter_list),
              label: Text(temFiltros ? 'Filtros (ativos)' : 'Filtros'),
              style: OutlinedButton.styleFrom(
                foregroundColor:
                    temFiltros ? AppTheme.primary : AppTheme.textMuted,
              ),
            ),
          ),
          if (onLimpar != null) ...[
            const SizedBox(width: 8),
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
  const _AbastTile({required this.item, required this.onTap});

  Future<void> _shareWhatsapp(BuildContext context) async {
    final id = item.idAbastecimento?.trim();
    final msg = [
      'Comprovante de Abastecimento',
      if (id != null && id.isNotEmpty) 'ID: $id',
      'Placa: ${item.veiculoPlaca ?? '-'}',
      'Data: ${AppDates.formatDateBr(item.data)}',
      'Litros: ${AppDates.number(item.quantidadeLitros, digits: 2)} L',
      'Valor: ${AppDates.money(item.valorTotal ?? ((item.valorPorLitro ?? 0) * item.quantidadeLitros))}',
    ].join('\n');

    final uri = Uri.parse(
      'https://wa.me/?text=${Uri.encodeComponent(msg)}',
    );
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

  Future<void> _abrirComprovante(BuildContext context) async {
    final id = item.idAbastecimento?.trim();
    if (id == null || id.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Sincronize o abastecimento antes de abrir o comprovante.'),
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

  @override
  Widget build(BuildContext context) {
    return Card(
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
                  StatusChip(status: item.status),
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
                  Text(AppDates.formatDateBr(item.data),
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
                        ((item.valorPorLitro ?? 0) * item.quantidadeLitros)),
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
              if (item.tipoCombustivel != null) ...[
                const SizedBox(height: 6),
                Text(item.tipoCombustivel!,
                    style: const TextStyle(
                        fontSize: 12, color: AppTheme.primary)),
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
                    onPressed: () => _shareWhatsapp(context),
                    icon: const Icon(Icons.share_outlined, size: 18),
                    label: const Text('WhatsApp'),
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

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () {
        showDialog(
          context: context,
          builder: (_) => Dialog(
            backgroundColor: Colors.black,
            child: InteractiveViewer(
              child: Image.network(url, fit: BoxFit.contain),
            ),
          ),
        );
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.network(
              url,
              width: 58,
              height: 58,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(
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
  final int? initialProprietario;
  final String? initialPlaca;
  final String? initialStatus;
  final String? initialTipo;
  final String? initialDataInicio;
  final String? initialDataFim;

  const _FiltrosSheet({
    required this.proprietarios,
    required this.tiposCombustivel,
    required this.initialProprietario,
    required this.initialPlaca,
    required this.initialStatus,
    required this.initialTipo,
    required this.initialDataInicio,
    required this.initialDataFim,
  });

  @override
  State<_FiltrosSheet> createState() => _FiltrosSheetState();
}

class _FiltrosSheetState extends State<_FiltrosSheet> {
  int? _prop;
  String? _status;
  String? _tipo;
  String? _di;
  String? _df;
  late TextEditingController _placaCtrl;

  @override
  void initState() {
    super.initState();
    _prop = widget.initialProprietario;
    _status = widget.initialStatus;
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
              value: _status,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Status'),
              items: [
                const DropdownMenuItem<String?>(value: null, child: Text('Todos')),
                ...AppConstants.statusAbastecimento
                    .map((s) => DropdownMenuItem(value: s, child: Text(s))),
              ],
              onChanged: (v) => setState(() => _status = v),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              value: _tipo,
              isExpanded: true,
              decoration:
                  const InputDecoration(labelText: 'Tipo de combustivel'),
              items: [
                const DropdownMenuItem<String?>(value: null, child: Text('Todos')),
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
                      'status': null,
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
                    onPressed: () =>
                        Navigator.pop(context, <String, dynamic>{
                      'proprietario': _prop,
                      'placa': _placaCtrl.text.trim().isEmpty
                          ? null
                          : _placaCtrl.text.trim(),
                      'status': _status,
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
