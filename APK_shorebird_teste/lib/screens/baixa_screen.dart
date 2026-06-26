import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api_client.dart';
import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../core/models.dart';
import '../widgets/common.dart';
import '../widgets/empresa_picker.dart';

class BaixaScreen extends StatefulWidget {
  const BaixaScreen({super.key});

  @override
  State<BaixaScreen> createState() => _BaixaScreenState();
}

class _BaixaScreenState extends State<BaixaScreen> {
  bool _loadingBaixas = true;
  bool _loadingPendentes = false;
  bool _saving = false;
  bool _uploadingAnexo = false;
  bool _showNovaBaixa = false;

  List<Map<String, dynamic>> _baixas = [];
  List<Abastecimento> _pendentes = [];
  List<Proprietario> _proprietarios = [];
  final Set<String> _selecionados = {};
  final _scrollCtrl = ScrollController();

  // filtros modal
  String? _idProprietario;
  final _placaCtrl = TextEditingController();
  String _dataInicio = '';
  String _dataFim = '';

  // form baixa
  String _dataBaixa = AppDates.todayIso();
  String _horaBaixa = AppDates.currentTimeIso();
  String _tipoDespesa = 'Combustível';
  final _descricaoCtrl = TextEditingController();
  String _formaPagamento = '';
  String _dataPagamento = AppDates.todayIso();
  String _horaPagamento = AppDates.currentTimeIso();
  String _recebedor = 'Vipe Transportes';
  final _recebedorOutrosCtrl = TextEditingController();
  final _observacaoCtrl = TextEditingController();
  final List<String> _anexoUrls = [];

  String _sortBy = 'data_hora';
  bool _sortAsc = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    _scrollCtrl.dispose();
    _placaCtrl.dispose();
    _descricaoCtrl.dispose();
    _recebedorOutrosCtrl.dispose();
    _observacaoCtrl.dispose();
    super.dispose();
  }

  Future<void> _init() async {
    _proprietarios = await AppState.instance.db
        .listProprietarios(local: AppState.instance.auth.filialAtual);
    await _loadBaixas();
    if (!mounted) return;
    setState(() {});
  }

  Future<void> _loadBaixas() async {
    setState(() => _loadingBaixas = true);
    try {
      final resp =
          await AppState.instance.api.get('/baixas', query: {'per_page': 200});
      final rows = (resp is Map && resp['data'] is List)
          ? List<dynamic>.from(resp['data'] as List)
          : <dynamic>[];
      _baixas = rows
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      _baixas = [];
    } finally {
      if (mounted) setState(() => _loadingBaixas = false);
    }
  }

  Future<void> _loadPendentes() async {
    if (_idProprietario == null) {
      _pendentes = [];
      _selecionados.clear();
      if (mounted) setState(() => _loadingPendentes = false);
      return;
    }
    setState(() => _loadingPendentes = true);
    try {
      final resp = await AppState.instance.api.get(
        '/abastecimentos/filter/baixa-pendente',
        query: {
          if (AppState.instance.auth.filialAtual != null)
            'local': AppState.instance.auth.filialAtual,
          if (_idProprietario != null) 'id_proprietario': _idProprietario,
          if (_placaCtrl.text.trim().isNotEmpty)
            'placa': _placaCtrl.text.trim(),
          if (_dataInicio.isNotEmpty) 'data_inicio': _dataInicio,
          if (_dataFim.isNotEmpty) 'data_fim': _dataFim,
          'limit': 200,
        },
      );

      final list = (resp is List)
          ? resp
          : (resp is Map && resp['data'] is List
              ? List<dynamic>.from(resp['data'])
              : <dynamic>[]);

      _pendentes = list
          .whereType<Map>()
          .map((m) => Abastecimento.fromJson(Map<String, dynamic>.from(m)))
          .toList();
    } catch (_) {
      // fallback local
      _pendentes = await AppState.instance.db.listAbastecimentos(
        idProprietario: _idProprietario,
        placa: _placaCtrl.text.trim().isEmpty ? null : _placaCtrl.text.trim(),
        dataInicio: _dataInicio.isEmpty ? null : _dataInicio,
        dataFim: _dataFim.isEmpty ? null : _dataFim,
        local: AppState.instance.auth.filialAtual,
        limit: 800,
      );
      _pendentes = _pendentes
          .where(
              (a) => !a.baixaAbastecimento && (a.status ?? '') != 'Cancelado')
          .toList();
    } finally {
      _selecionados.clear();
      if (mounted) setState(() => _loadingPendentes = false);
    }
  }

  double get _totalSelecionado => _pendentes
      .where((a) => _selecionados.contains(a.idAbastecimento ?? ''))
      .fold<double>(
        0,
        (acc, a) =>
            acc +
            (a.valorTotal ?? ((a.valorPorLitro ?? 0) * a.quantidadeLitros)),
      );

  void _toggleSelect(String id) {
    setState(() {
      if (_selecionados.contains(id)) {
        _selecionados.remove(id);
      } else {
        _selecionados.add(id);
      }
    });
  }

  void _selectAll() {
    setState(() {
      _selecionados
        ..clear()
        ..addAll(_pendentes.map((a) => a.idAbastecimento).whereType<String>());
    });
  }

  void _clearSelection() {
    setState(() => _selecionados.clear());
  }

  bool _isPdfUrl(String url) => url.toLowerCase().contains('.pdf');

  String? _uploadUrlFromResponse(dynamic resp) {
    final fileMap = (resp is Map && resp['file'] is Map)
        ? Map<String, dynamic>.from(resp['file'] as Map)
        : <String, dynamic>{};
    return (fileMap['downloadUrl'] ??
            fileMap['webViewLink'] ??
            fileMap['webContentLink'])
        ?.toString();
  }

  Future<String?> _uploadAnexoPath(String filePath) async {
    final resp = await AppState.instance.api.postMultipartFile(
      '/uploads/drive',
      filePath: filePath,
    );
    final url = _uploadUrlFromResponse(resp);
    if (url == null || url.trim().isEmpty) {
      throw Exception('Upload sem URL de retorno');
    }
    return url;
  }

  Future<String?> _pickAnexoSource() async {
    return showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Camera'),
              subtitle: const Text('Anexar uma foto'),
              onTap: () => Navigator.of(ctx).pop('camera'),
            ),
            ListTile(
              leading: const Icon(Icons.folder_open_outlined),
              title: const Text('Galeria ou arquivos'),
              subtitle: const Text('Selecione imagens ou PDFs, até 4 no total'),
              onTap: () => Navigator.of(ctx).pop('files'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _uploadAnexo() async {
    if (_anexoUrls.length >= 4) return;

    final source = await _pickAnexoSource();
    if (source == null) return;

    final paths = <String>[];
    if (source == 'camera') {
      final file = await ImagePicker()
          .pickImage(source: ImageSource.camera, imageQuality: 80);
      if (file == null) return;
      paths.add(file.path);
    } else {
      final slots = 4 - _anexoUrls.length;
      final result = await FilePicker.platform.pickFiles(
        allowMultiple: true,
        type: FileType.custom,
        allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
      );
      if (result == null || result.files.isEmpty) return;
      paths.addAll(
        result.files.map((file) => file.path).whereType<String>().take(slots),
      );
    }

    if (paths.isEmpty) return;

    setState(() => _uploadingAnexo = true);
    try {
      var enviados = 0;
      for (final path in paths) {
        if (_anexoUrls.length >= 4) break;
        final url = await _uploadAnexoPath(path);
        if (url != null && !_anexoUrls.contains(url)) {
          _anexoUrls.add(url);
          enviados++;
        }
      }
      if (!mounted) return;
      setState(() {});
      if (enviados > 0) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('$enviados comprovante(s) anexado(s).'),
          backgroundColor: AppTheme.success,
        ));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text('Erro no upload: $e'),
            backgroundColor: AppTheme.danger),
      );
    } finally {
      if (mounted) setState(() => _uploadingAnexo = false);
    }
  }

  Future<void> _openUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _submitBaixa() async {
    if (_selecionados.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Selecione ao menos um abastecimento'),
        backgroundColor: AppTheme.warning,
      ));
      return;
    }
    if (_idProprietario == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Selecione a empresa antes de registrar a baixa'),
        backgroundColor: AppTheme.warning,
      ));
      return;
    }

    setState(() => _saving = true);
    final recebedor =
        _recebedor == 'Outros' ? _recebedorOutrosCtrl.text.trim() : _recebedor;
    final payload = <String, dynamic>{
      'ids': _selecionados.toList(),
      'data_baixa': AppDates.combineDateTime(_dataBaixa, _horaBaixa),
      'tipo_despesa': _tipoDespesa,
      'descricao': _descricaoCtrl.text.trim(),
      'forma_pagamento': _formaPagamento,
      'data_pagamento':
          AppDates.combineDateTime(_dataPagamento, _horaPagamento),
      'recebedor': recebedor,
      'observacao': _observacaoCtrl.text.trim(),
      'anexo': _anexoUrls.isEmpty ? null : _anexoUrls.first,
      'anexos': _anexoUrls,
    };

    try {
      await AppState.instance.api.post('/baixas/lote', payload);
      await _loadBaixas();
      await _loadPendentes();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Baixas registradas com sucesso!'),
        backgroundColor: AppTheme.success,
      ));
      setState(() {
        _showNovaBaixa = false;
        _dataBaixa = AppDates.todayIso();
        _horaBaixa = AppDates.currentTimeIso();
        _tipoDespesa = 'Combustível';
        _dataPagamento = AppDates.todayIso();
        _horaPagamento = AppDates.currentTimeIso();
        _recebedor = 'Vipe Transportes';
        _recebedorOutrosCtrl.clear();
        _observacaoCtrl.clear();
        _descricaoCtrl.clear();
        _anexoUrls.clear();
      });
    } on OfflineException {
      await AppState.instance.db.enqueue(
        entity: 'baixa_lote',
        action: 'baixa_lote',
        payload: payload,
      );
      await AppState.instance.db.applyBaixaLocal(
        uuids: _pendentes
            .where((a) => _selecionados.contains(a.idAbastecimento ?? ''))
            .map((a) => a.localUuid)
            .whereType<String>()
            .toList(),
        dataPagamento: _dataPagamento,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Offline: baixa enfileirada para sincronização.'),
        backgroundColor: AppTheme.warning,
      ));
      setState(() => _showNovaBaixa = false);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text('Erro: ${e.message}'),
            backgroundColor: AppTheme.danger),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _deleteBaixa(String idBaixa) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Excluir baixa'),
        content: const Text(
            'O abastecimento voltará para pendente de baixa. Confirmar?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Excluir')),
        ],
      ),
    );
    if (ok != true) return;

    try {
      await AppState.instance.api.delete('/baixas/$idBaixa');
      await _loadBaixas();
      if (_showNovaBaixa) await _loadPendentes();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text(
            'Baixa excluída e abastecimento voltou para pendente de baixa.'),
        backgroundColor: AppTheme.success,
      ));
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text('Erro ao excluir: ${e.message}'),
            backgroundColor: AppTheme.danger),
      );
    }
  }

  double _toDouble(dynamic value) {
    if (value == null) return 0;
    if (value is num) return value.toDouble();
    final raw = value.toString().trim();
    if (raw.isEmpty) return 0;
    final normalized =
        raw.contains(',') ? raw.replaceAll('.', '').replaceAll(',', '.') : raw;
    return double.tryParse(normalized) ?? 0;
  }

  List<String> _anexosFrom(dynamic value) {
    if (value is List) {
      return value
          .map((e) => e.toString().trim())
          .where((e) => e.isNotEmpty)
          .take(4)
          .toList();
    }
    final raw = (value ?? '').toString().trim();
    if (raw.isEmpty) return [];
    if (raw.startsWith('[')) {
      try {
        final parsed = jsonDecode(raw);
        if (parsed is List) {
          return parsed
              .map((e) => e.toString().trim())
              .where((e) => e.isNotEmpty)
              .take(4)
              .toList();
        }
      } catch (_) {}
    }
    return [raw];
  }

  List<Map<String, dynamic>> get _baixasOrdenadas {
    final list = [..._baixas];
    list.sort((a, b) {
      dynamic l;
      dynamic r;
      switch (_sortBy) {
        case 'empresa':
          l = ((a['abastecimento']?['nome_proprietario']) ??
                  (a['abastecimento']?['proprietario']?['nome']) ??
                  '')
              .toString()
              .toLowerCase();
          r = ((b['abastecimento']?['nome_proprietario']) ??
                  (b['abastecimento']?['proprietario']?['nome']) ??
                  '')
              .toString()
              .toLowerCase();
          break;
        case 'placa':
          l = ((a['abastecimento']?['veiculo']?['placa']) ?? '')
              .toString()
              .toLowerCase();
          r = ((b['abastecimento']?['veiculo']?['placa']) ?? '')
              .toString()
              .toLowerCase();
          break;
        case 'valor':
          l = _toDouble(a['abastecimento']?['valor_total']);
          r = _toDouble(b['abastecimento']?['valor_total']);
          break;
        case 'data_pagamento':
          l = DateTime.tryParse((a['data_pagamento'] ?? '').toString())
                  ?.millisecondsSinceEpoch ??
              0;
          r = DateTime.tryParse((b['data_pagamento'] ?? '').toString())
                  ?.millisecondsSinceEpoch ??
              0;
          break;
        default:
          l = DateTime.tryParse((a['data_hora'] ?? '').toString())
                  ?.millisecondsSinceEpoch ??
              0;
          r = DateTime.tryParse((b['data_hora'] ?? '').toString())
                  ?.millisecondsSinceEpoch ??
              0;
      }
      if (l is num && r is num) {
        return _sortAsc ? l.compareTo(r) : r.compareTo(l);
      }
      return _sortAsc
          ? l.toString().compareTo(r.toString())
          : r.toString().compareTo(l.toString());
    });
    return list;
  }

  void _setSort(String key) {
    setState(() {
      if (_sortBy == key) {
        _sortAsc = !_sortAsc;
      } else {
        _sortBy = key;
        _sortAsc = key == 'empresa' || key == 'placa';
      }
    });
  }

  Future<void> _abrirNovaBaixa() async {
    setState(() {
      _showNovaBaixa = true;
      _pendentes = [];
      _selecionados.clear();
    });
    await Future<void>.delayed(Duration.zero);
    if (_scrollCtrl.hasClients) {
      _scrollCtrl.animateTo(
        0,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return LoadingOverlay(
      show: _saving,
      message: 'Processando baixa...',
      child: ListView(
        controller: _scrollCtrl,
        padding: const EdgeInsets.all(12),
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Baixas',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
                ),
              ),
              ElevatedButton.icon(
                onPressed: _loadingPendentes ? null : _abrirNovaBaixa,
                icon: const Icon(Icons.add),
                label:
                    Text(_showNovaBaixa ? 'Nova Baixa aberta' : 'Nova Baixa'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (_showNovaBaixa) ...[
            _buildNovaBaixaCard(),
            const SizedBox(height: 10),
          ],
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Registros de Baixa',
                          style: TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w700),
                        ),
                      ),
                      OutlinedButton.icon(
                        onPressed: _loadBaixas,
                        icon: const Icon(Icons.refresh),
                        label: const Text('Atualizar'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_loadingBaixas)
                    const Padding(
                      padding: EdgeInsets.all(32),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else if (_baixas.isEmpty)
                    const EmptyState(
                      icone: Icons.receipt_long_outlined,
                      titulo: 'Nenhuma baixa registrada',
                    )
                  else
                    ..._baixasOrdenadas.map((b) {
                      final id = (b['id_baixa'] ?? '').toString();
                      final abastecimento = (b['abastecimento'] is Map)
                          ? Map<String, dynamic>.from(b['abastecimento'] as Map)
                          : <String, dynamic>{};
                      final empresa = (abastecimento['nome_proprietario'] ??
                              abastecimento['proprietario']?['nome'] ??
                              '—')
                          .toString();
                      final placa = (abastecimento['veiculo']?['placa'] ?? '—')
                          .toString();
                      final motorista = (abastecimento['nome_motorista'] ??
                              abastecimento['motorista']?['nome'] ??
                              '—')
                          .toString();
                      final valor = _toDouble(abastecimento['valor_total']);
                      final anexos = _anexosFrom(abastecimento['anexo']);
                      return Card(
                        color: AppTheme.surfaceAlt,
                        child: ListTile(
                          title: Text('$empresa • $placa'),
                          subtitle: Text(
                            '${AppDates.formatDateTimeBr((b['data_hora'] ?? '').toString())}  •  '
                            '$motorista  •  ${b['forma_pagamento'] ?? '—'}',
                          ),
                          trailing: Wrap(
                            spacing: 4,
                            children: [
                              Text(
                                AppDates.money(valor),
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    color: AppTheme.success),
                              ),
                              for (var i = 0; i < anexos.length; i++)
                                IconButton(
                                  tooltip: 'Comprovante ${i + 1}',
                                  onPressed: () => _openUrl(anexos[i]),
                                  icon: const Icon(Icons.image_outlined),
                                ),
                              IconButton(
                                onPressed:
                                    id.isEmpty ? null : () => _deleteBaixa(id),
                                icon: const Icon(Icons.delete_outline,
                                    color: AppTheme.danger),
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNovaBaixaCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text('Nova Baixa',
                      style:
                          TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                ),
                IconButton(
                  onPressed: () => setState(() => _showNovaBaixa = false),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.success.withOpacity(0.10),
                border: Border.all(color: AppTheme.success.withOpacity(0.35)),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  const Icon(Icons.payments_outlined, color: AppTheme.success),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      'Valor do acerto',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                  Text(
                    AppDates.money(_totalSelecionado),
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      color: AppTheme.success,
                      fontSize: 18,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            // filtros
            Row(children: [
              Expanded(
                child: EmpresaPickerField(
                  proprietarios: _proprietarios,
                  value: _idProprietario,
                  allowNull: false,
                  label: 'Empresa',
                  onChanged: (v) async {
                    setState(() {
                      _idProprietario = v;
                      _selecionados.clear();
                    });
                    await _loadPendentes();
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _placaCtrl,
                  decoration: const InputDecoration(labelText: 'Placa'),
                  onChanged: (_) => _loadPendentes(),
                ),
              ),
            ]),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final p =
                        await pickDateIso(context, initialIso: _dataInicio);
                    if (p != null) {
                      setState(() => _dataInicio = p);
                      await _loadPendentes();
                    }
                  },
                  icon: const Icon(Icons.event),
                  label: Text(_dataInicio.isEmpty
                      ? 'Data Início'
                      : AppDates.formatDateBr(_dataInicio)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final p = await pickDateIso(context, initialIso: _dataFim);
                    if (p != null) {
                      setState(() => _dataFim = p);
                      await _loadPendentes();
                    }
                  },
                  icon: const Icon(Icons.event),
                  label: Text(_dataFim.isEmpty
                      ? 'Data Fim'
                      : AppDates.formatDateBr(_dataFim)),
                ),
              ),
            ]),
            const SizedBox(height: 12),
            if (_loadingPendentes)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_pendentes.isEmpty)
              EmptyState(
                icone: Icons.check_circle_outline,
                titulo: _idProprietario == null
                    ? 'Selecione uma empresa para carregar os pendentes'
                    : 'Sem pendentes para o filtro',
              )
            else
              SizedBox(
                height: 280,
                child: Column(
                  children: [
                    Row(
                      children: [
                        TextButton.icon(
                          onPressed: _selectAll,
                          icon: const Icon(Icons.select_all),
                          label: const Text('Selecionar Todos'),
                        ),
                        TextButton.icon(
                          onPressed: _clearSelection,
                          icon: const Icon(Icons.clear_all),
                          label: const Text('Limpar'),
                        ),
                        const Spacer(),
                        Text('${_selecionados.length} selecionado(s)'),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Expanded(
                      child: ListView.builder(
                        itemCount: _pendentes.length,
                        itemBuilder: (_, i) {
                          final a = _pendentes[i];
                          final id = a.idAbastecimento ?? '';
                          final checked = _selecionados.contains(id);
                          return Card(
                            color: checked
                                ? AppTheme.surfaceAlt
                                : AppTheme.surface,
                            child: CheckboxListTile(
                              value: checked,
                              onChanged:
                                  id.isEmpty ? null : (_) => _toggleSelect(id),
                              title: Text(
                                  '${a.veiculoPlaca ?? '—'} • ${a.proprietarioNome ?? '—'}'),
                              subtitle: Text(
                                '${AppDates.formatDateTimeOrDateBr(a.dataHora, a.data)} • ${a.motoristaNome ?? '—'} • ${AppDates.number(a.quantidadeLitros)} L',
                              ),
                              secondary: Text(
                                AppDates.money(
                                  a.valorTotal ??
                                      ((a.valorPorLitro ?? 0) *
                                          a.quantidadeLitros),
                                ),
                                style: const TextStyle(
                                  color: AppTheme.success,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            // form baixa
            Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final p =
                        await pickDateIso(context, initialIso: _dataBaixa);
                    if (p != null) setState(() => _dataBaixa = p);
                  },
                  icon: const Icon(Icons.event),
                  label: Text(
                      'Data da Baixa: ${AppDates.formatDateBr(_dataBaixa)}'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _tipoDespesa,
                  decoration: const InputDecoration(labelText: 'Tipo de Baixa'),
                  items: const [
                    DropdownMenuItem(
                        value: 'Combustível', child: Text('Combustível')),
                    DropdownMenuItem(
                        value: 'Manutenção', child: Text('Manutenção')),
                    DropdownMenuItem(value: 'Outros', child: Text('Outros')),
                  ],
                  onChanged: (v) =>
                      setState(() => _tipoDespesa = v ?? 'Combustível'),
                ),
              ),
            ]),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final parts = _horaBaixa.split(':');
                    final selected = await showTimePicker(
                      context: context,
                      initialTime: TimeOfDay(
                        hour: int.tryParse(parts.first) ?? DateTime.now().hour,
                        minute: parts.length > 1
                            ? (int.tryParse(parts[1]) ?? DateTime.now().minute)
                            : DateTime.now().minute,
                      ),
                    );
                    if (selected != null) {
                      setState(() {
                        _horaBaixa =
                            '${selected.hour.toString().padLeft(2, '0')}:${selected.minute.toString().padLeft(2, '0')}';
                      });
                    }
                  },
                  icon: const Icon(Icons.schedule_outlined),
                  label: Text('Hora Baixa: $_horaBaixa'),
                ),
              ),
            ]),
            const SizedBox(height: 8),
            TextField(
              controller: _descricaoCtrl,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'Descrição'),
            ),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _formaPagamento,
                  decoration:
                      const InputDecoration(labelText: 'Forma de Pagamento'),
                  items: const [
                    DropdownMenuItem(value: '', child: Text('Selecione...')),
                    DropdownMenuItem(
                        value: 'Dinheiro', child: Text('Dinheiro')),
                    DropdownMenuItem(value: 'PIX', child: Text('PIX')),
                    DropdownMenuItem(
                        value: 'Cartão Crédito', child: Text('Cartão Crédito')),
                    DropdownMenuItem(
                        value: 'Cartão Débito', child: Text('Cartão Débito')),
                    DropdownMenuItem(value: 'Cheque', child: Text('Cheque')),
                    DropdownMenuItem(
                        value: 'Transferência', child: Text('Transferência')),
                    DropdownMenuItem(value: 'Boleto', child: Text('Boleto')),
                  ],
                  onChanged: (v) => setState(() => _formaPagamento = v ?? ''),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final p =
                        await pickDateIso(context, initialIso: _dataPagamento);
                    if (p != null) setState(() => _dataPagamento = p);
                  },
                  icon: const Icon(Icons.event),
                  label: Text(
                      'Data Pgto: ${AppDates.formatDateBr(_dataPagamento)}'),
                ),
              ),
            ]),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final parts = _horaPagamento.split(':');
                    final selected = await showTimePicker(
                      context: context,
                      initialTime: TimeOfDay(
                        hour: int.tryParse(parts.first) ?? DateTime.now().hour,
                        minute: parts.length > 1
                            ? (int.tryParse(parts[1]) ?? DateTime.now().minute)
                            : DateTime.now().minute,
                      ),
                    );
                    if (selected != null) {
                      setState(() {
                        _horaPagamento =
                            '${selected.hour.toString().padLeft(2, '0')}:${selected.minute.toString().padLeft(2, '0')}';
                      });
                    }
                  },
                  icon: const Icon(Icons.schedule_outlined),
                  label: Text('Hora Pgto: $_horaPagamento'),
                ),
              ),
            ]),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _recebedor,
                  decoration: const InputDecoration(labelText: 'Recebedor'),
                  items: const [
                    DropdownMenuItem(
                        value: 'Vipe Transportes',
                        child: Text('Vipe Transportes')),
                    DropdownMenuItem(value: 'Augusto', child: Text('Augusto')),
                    DropdownMenuItem(value: 'Outros', child: Text('Outros')),
                  ],
                  onChanged: (v) =>
                      setState(() => _recebedor = v ?? 'Vipe Transportes'),
                ),
              ),
            ]),
            if (_recebedor == 'Outros') ...[
              const SizedBox(height: 8),
              TextField(
                controller: _recebedorOutrosCtrl,
                decoration:
                    const InputDecoration(labelText: 'Recebedor (Outros)'),
              ),
            ],
            const SizedBox(height: 8),
            TextField(
              controller: _observacaoCtrl,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'Observação'),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _uploadingAnexo || _anexoUrls.length >= 4
                        ? null
                        : _uploadAnexo,
                    icon: const Icon(Icons.attach_file),
                    label: Text(
                      _uploadingAnexo
                          ? 'Enviando...'
                          : 'Comprovante (${_anexoUrls.length}/4)',
                    ),
                  ),
                ),
              ],
            ),
            if (_anexoUrls.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (var i = 0; i < _anexoUrls.length; i++)
                    InputChip(
                      avatar: Icon(
                        _isPdfUrl(_anexoUrls[i])
                            ? Icons.picture_as_pdf_outlined
                            : Icons.image_outlined,
                        size: 18,
                      ),
                      label: Text('Comprovante ${i + 1}'),
                      onPressed: () => _openUrl(_anexoUrls[i]),
                      onDeleted: () => setState(() => _anexoUrls.removeAt(i)),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                const Spacer(),
                ElevatedButton.icon(
                  onPressed: _selecionados.isEmpty ? null : _submitBaixa,
                  icon: const Icon(Icons.check_circle_outline),
                  label: Text('Registrar Baixa (${_selecionados.length})'),
                  style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.success),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
