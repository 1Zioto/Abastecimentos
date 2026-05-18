import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api_client.dart';
import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../core/models.dart';
import '../widgets/common.dart';

class EntradaNotasScreen extends StatefulWidget {
  const EntradaNotasScreen({super.key});

  @override
  State<EntradaNotasScreen> createState() => _EntradaNotasScreenState();
}

class _EntradaNotasScreenState extends State<EntradaNotasScreen> {
  bool _loading = true;
  bool _saving = false;
  bool _uploading = false;

  final List<EntradaNota> _notas = [];
  EntradaNota? _editando;
  bool _showForm = false;

  String _filtroTipo = '';
  String _filtroDataInicio = '';
  String _filtroDataFim = '';
  List<String> _tiposCombustivel = const ['OLEO DIESEL S10'];

  String _data = AppDates.todayIso();
  final _numeroNfCtrl = TextEditingController();
  String _tipo = 'OLEO DIESEL S10';
  final _qtdCtrl = TextEditingController();
  final _valorLitroCtrl = TextEditingController();
  final _responsavelCtrl = TextEditingController();
  String? _fotoNotaUrl;
  double _valorTotal = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _numeroNfCtrl.dispose();
    _qtdCtrl.dispose();
    _valorLitroCtrl.dispose();
    _responsavelCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final valores = await AppState.instance.db.listValoresCombustivel();
      _tiposCombustivel = _extrairTiposCombustivel(valores);
      if (_filtroTipo.isNotEmpty && !_tiposCombustivel.contains(_filtroTipo)) {
        _filtroTipo = '';
      }
      if (!_tiposCombustivel.contains(_tipo)) {
        _tipo = _tiposCombustivel.first;
      }

      final resp = await AppState.instance.api.get('/entrada-notas', query: {
        'tipo': _filtroTipo,
        'data_inicio': _filtroDataInicio,
        'data_fim': _filtroDataFim,
        'per_page': 100,
      });
      final listRaw = (resp is Map && resp['data'] is List)
          ? List<dynamic>.from(resp['data'] as List)
          : <dynamic>[];
      _notas
        ..clear()
        ..addAll(
          listRaw
              .whereType<Map>()
              .map((m) => EntradaNota.fromJson(Map<String, dynamic>.from(m))),
        );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erro ao carregar notas: $e'),
            backgroundColor: AppTheme.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
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

  void _newItem() {
    final nome = AppState.instance.auth.nome ?? AppState.instance.auth.login ?? '';
    setState(() {
      _editando = null;
      _showForm = true;
      _data = AppDates.todayIso();
      _numeroNfCtrl.text = '';
      _tipo = _tiposCombustivel.first;
      _qtdCtrl.text = '';
      _valorLitroCtrl.text = '';
      _responsavelCtrl.text = nome;
      _fotoNotaUrl = null;
      _valorTotal = 0;
    });
  }

  void _edit(EntradaNota n) {
    setState(() {
      _editando = n;
      _showForm = true;
      _data = n.data;
      _numeroNfCtrl.text = n.numeroNotaFiscal ?? '';
      _tipo = (n.tipo == null || n.tipo!.trim().isEmpty) ? _tiposCombustivel.first : n.tipo!;
      if (!_tiposCombustivel.contains(_tipo)) {
        _tiposCombustivel = [..._tiposCombustivel, _tipo];
      }
      _qtdCtrl.text = (n.quantidade ?? 0).toString().replaceAll('.', ',');
      _valorLitroCtrl.text = (n.valorLitro ?? 0).toString().replaceAll('.', ',');
      _responsavelCtrl.text =
          AppState.instance.auth.nome ?? n.responsavel ?? '';
      _fotoNotaUrl = n.fotoNota;
      _valorTotal = n.valor ?? 0;
    });
  }

  void _cancelForm() {
    setState(() {
      _showForm = false;
      _editando = null;
    });
  }

  void _calcValor() {
    final qtd = parseDecimal(_qtdCtrl.text) ?? 0;
    final vl = parseDecimal(_valorLitroCtrl.text) ?? 0;
    setState(() => _valorTotal = qtd * vl);
  }

  Future<ImageSource?> _pickSource() async {
    return showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Camera'),
              onTap: () => Navigator.of(ctx).pop(ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Galeria'),
              onTap: () => Navigator.of(ctx).pop(ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _uploadFotoNota() async {
    final src = await _pickSource();
    if (src == null) return;
    final picked = await ImagePicker().pickImage(source: src, imageQuality: 80);
    if (picked == null) return;
    setState(() => _uploading = true);
    try {
      final resp = await AppState.instance.api.postMultipartFile(
        '/uploads/drive',
        filePath: picked.path,
      );
      final file = (resp is Map && resp['file'] is Map)
          ? Map<String, dynamic>.from(resp['file'] as Map)
          : <String, dynamic>{};
      final url = (file['downloadUrl'] ?? file['webViewLink'] ?? file['webContentLink'])
          ?.toString();
      if (url == null || url.trim().isEmpty) {
        throw Exception('Upload sem URL');
      }
      setState(() => _fotoNotaUrl = url);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro upload: $e'),
          backgroundColor: AppTheme.danger,
        ),
      );
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _openUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _save() async {
    if (_data.trim().isEmpty) return;
    setState(() => _saving = true);
    final payload = <String, dynamic>{
      'data': _data,
      'numero_nota_fiscal': _numeroNfCtrl.text.trim().isEmpty
          ? null
          : _numeroNfCtrl.text.trim(),
      'tipo': _tipo,
      'quantidade': parseDecimal(_qtdCtrl.text),
      'valor_litro': parseDecimal(_valorLitroCtrl.text),
      'valor': _valorTotal,
      'responsavel': _responsavelCtrl.text.trim().isEmpty
          ? (AppState.instance.auth.nome ?? AppState.instance.auth.login ?? '')
          : _responsavelCtrl.text.trim(),
      'foto_nota': _fotoNotaUrl,
    };
    try {
      if (_editando?.idFinanceiro != null) {
        await AppState.instance.api
            .put('/entrada-notas/${_editando!.idFinanceiro}', payload);
      } else {
        await AppState.instance.api.post('/entrada-notas', payload);
      }
      _cancelForm();
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Nota salva com sucesso.'),
        backgroundColor: AppTheme.success,
      ));
    } on OfflineException {
      await AppState.instance.db.enqueue(
        entity: 'entrada_notas',
        action: _editando?.idFinanceiro != null ? 'update' : 'create',
        remoteId: _editando?.idFinanceiro,
        payload: payload,
      );
      _cancelForm();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Sem internet: nota enfileirada para sincronizacao.'),
        backgroundColor: AppTheme.warning,
      ));
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro: ${e.message}'),
        backgroundColor: AppTheme.danger,
      ));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _delete(EntradaNota n) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Excluir nota'),
        content: Text('Excluir nota ${n.numeroNotaFiscal ?? n.idFinanceiro}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Excluir')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      if (n.idFinanceiro != null) {
        await AppState.instance.api.delete('/entrada-notas/${n.idFinanceiro}');
      }
      await _load();
    } on OfflineException {
      await AppState.instance.db.enqueue(
        entity: 'entrada_notas',
        action: 'delete',
        remoteId: n.idFinanceiro,
        payload: {},
      );
      setState(() => _notas.removeWhere((x) => x.idFinanceiro == n.idFinanceiro));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Sem internet: exclusao enfileirada.'),
        backgroundColor: AppTheme.warning,
      ));
    }
  }

  double get _totalLitros =>
      _notas.fold<double>(0, (a, n) => a + (n.quantidade ?? 0));
  double get _totalValor => _notas.fold<double>(0, (a, n) => a + (n.valor ?? 0));

  @override
  Widget build(BuildContext context) {
    final isAdmin = Roles.isAdmin(AppState.instance.auth.tipo);
    final canCreate = Roles.canCreate(AppState.instance.auth.tipo);
    return LoadingOverlay(
      show: _saving,
      message: 'Salvando...',
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Row(
            children: [
              const Expanded(
                child: Text('Entrada de Notas',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
              ),
              if (canCreate)
                ElevatedButton.icon(
                  onPressed: _newItem,
                  icon: const Icon(Icons.add),
                  label: const Text('Nova Nota'),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                children: [
                  Row(children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: _filtroTipo,
                        decoration: const InputDecoration(labelText: 'Tipo'),
                        items: [
                          const DropdownMenuItem(value: '', child: Text('Todos')),
                          ..._tiposCombustivel.map(
                            (t) => DropdownMenuItem(value: t, child: Text(t)),
                          ),
                        ],
                        onChanged: (v) => setState(() => _filtroTipo = v ?? ''),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final p = await pickDateIso(context, initialIso: _filtroDataInicio);
                          if (p != null) setState(() => _filtroDataInicio = p);
                        },
                        icon: const Icon(Icons.event),
                        label: Text(_filtroDataInicio.isEmpty
                            ? 'Data Inicio'
                            : AppDates.formatDateBr(_filtroDataInicio)),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final p = await pickDateIso(context, initialIso: _filtroDataFim);
                          if (p != null) setState(() => _filtroDataFim = p);
                        },
                        icon: const Icon(Icons.event),
                        label: Text(_filtroDataFim.isEmpty
                            ? 'Data Fim'
                            : AppDates.formatDateBr(_filtroDataFim)),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerRight,
                    child: OutlinedButton.icon(
                      onPressed: _load,
                      icon: const Icon(Icons.filter_alt_outlined),
                      label: const Text('Aplicar filtros'),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (_showForm) ...[
            const SizedBox(height: 10),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _editando == null ? 'Nova Nota Fiscal' : 'Editar Nota Fiscal',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 10),
                    Row(children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () async {
                            final p = await pickDateIso(context, initialIso: _data);
                            if (p != null) setState(() => _data = p);
                          },
                          icon: const Icon(Icons.event),
                          label: Text(AppDates.formatDateBr(_data)),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: _numeroNfCtrl,
                          decoration: const InputDecoration(labelText: 'Numero da NF'),
                        ),
                      ),
                    ]),
                    const SizedBox(height: 8),
                    Row(children: [
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          value: _tipo,
                          decoration: const InputDecoration(labelText: 'Tipo'),
                          items: _tiposCombustivel
                              .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                              .toList(),
                          onChanged: (v) => setState(() => _tipo = v ?? _tiposCombustivel.first),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: DecimalField(
                          controller: _qtdCtrl,
                          label: 'Quantidade (L)',
                          onChanged: (_) => _calcValor(),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: DecimalField(
                          controller: _valorLitroCtrl,
                          label: 'Valor por Litro(compra)',
                          onChanged: (_) => _calcValor(),
                        ),
                      ),
                    ]),
                    const SizedBox(height: 8),
                    Row(children: [
                      Expanded(
                        child: InputDecorator(
                          decoration: const InputDecoration(labelText: 'Valor Total'),
                          child: Text(
                            AppDates.money(_valorTotal),
                            style: const TextStyle(
                              color: AppTheme.success,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: _responsavelCtrl,
                          readOnly: true,
                          decoration: const InputDecoration(labelText: 'Responsavel'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _uploading ? null : _uploadFotoNota,
                          icon: const Icon(Icons.attach_file),
                          label: Text(_uploading ? 'Enviando...' : 'Foto / Anexo (Imagem)'),
                        ),
                      ),
                    ]),
                    if ((_fotoNotaUrl ?? '').trim().isNotEmpty) ...[
                      const SizedBox(height: 8),
                      InkWell(
                        onTap: () => _openUrl(_fotoNotaUrl!),
                        child: InputDecorator(
                          decoration: const InputDecoration(
                            labelText: 'Anexo',
                            suffixIcon: Icon(Icons.open_in_new),
                          ),
                          child: Text(
                            _fotoNotaUrl!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: AppTheme.primary),
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        OutlinedButton(onPressed: _cancelForm, child: const Text('Cancelar')),
                        const SizedBox(width: 8),
                        ElevatedButton(onPressed: _save, child: const Text('Salvar Nota')),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 10),
          if (isAdmin) ...[
            KpiCard(
              titulo: 'Registros',
              valor: '${_notas.length}',
              icone: Icons.receipt_long_outlined,
            ),
            KpiCard(
              titulo: 'Total Litros',
              valor: '${AppDates.number(_totalLitros)} L',
              icone: Icons.local_gas_station_outlined,
              cor: AppTheme.primary,
            ),
            KpiCard(
              titulo: 'Valor Total',
              valor: AppDates.money(_totalValor),
              icone: Icons.attach_money,
              cor: AppTheme.success,
            ),
          ] else ...[
            KpiCard(
              titulo: 'Registros',
              valor: '${_notas.length}',
              icone: Icons.receipt_long_outlined,
            ),
          ],
          const SizedBox(height: 10),
          if (_loading)
            const SizedBox(
              height: 220,
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_notas.isEmpty)
            const SizedBox(
              height: 220,
              child: EmptyState(
                icone: Icons.receipt_long_outlined,
                titulo: 'Nenhuma nota registrada',
              ),
            )
          else
            ..._notas.map(
              (n) => Card(
                child: ListTile(
                  title: Text('${n.numeroNotaFiscal ?? '—'} • ${n.tipo ?? '—'}'),
                  subtitle: Text(
                    '${AppDates.formatDateBr(n.data)} • ${AppDates.number(n.quantidade)} L • ${AppDates.money(n.valor)}',
                  ),
                  trailing: Wrap(
                    spacing: 6,
                    children: [
                      if (isAdmin)
                        IconButton(
                          onPressed: () => _edit(n),
                          icon: const Icon(Icons.edit_outlined),
                        ),
                      if ((n.fotoNota ?? '').trim().isNotEmpty)
                        IconButton(
                          onPressed: () => _openUrl(n.fotoNota!),
                          icon: const Icon(Icons.image_outlined),
                        ),
                      if (isAdmin)
                        IconButton(
                          onPressed: () => _delete(n),
                          icon: const Icon(Icons.delete_outline, color: AppTheme.danger),
                        ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
