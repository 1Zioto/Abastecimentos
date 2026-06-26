import 'dart:async';

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
import '../widgets/linked_details.dart';

class EntradaNotasScreen extends StatefulWidget {
  const EntradaNotasScreen({super.key});

  @override
  State<EntradaNotasScreen> createState() => _EntradaNotasScreenState();
}

class _EntradaNotasScreenState extends State<EntradaNotasScreen> {
  static const double _custoTransportePorLitro = 0.04;

  bool _loading = true;
  bool _saving = false;
  bool _uploading = false;

  final List<EntradaNota> _notas = [];
  EntradaNota? _editando;
  bool _formModalOpen = false;
  StateSetter? _formModalSetState;

  String _filtroTipo = '';
  String _filtroNumeroNota = '';
  String _filtroDataInicio = '';
  String _filtroDataFim = '';
  List<String> _tiposCombustivel = const ['OLEO DIESEL S10'];
  final _filtroNumeroNotaCtrl = TextEditingController();

  String _data = AppDates.todayIso();
  String _hora = AppDates.currentTimeIso();
  final _numeroNfCtrl = TextEditingController();
  String _tipo = 'OLEO DIESEL S10';
  final _qtdCtrl = TextEditingController();
  final _valorLitroCtrl = TextEditingController();
  final _valorTotalCtrl = TextEditingController();
  final _responsavelCtrl = TextEditingController();
  String? _fotoNotaUrl;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _filtroNumeroNotaCtrl.dispose();
    _numeroNfCtrl.dispose();
    _qtdCtrl.dispose();
    _valorLitroCtrl.dispose();
    _valorTotalCtrl.dispose();
    _responsavelCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final localAtual = AppState.instance.auth.filialAtual;
      final valores = await AppState.instance.db.listValoresCombustivel(
        local: localAtual,
      );
      _tiposCombustivel = _extrairTiposCombustivel(valores);
      if (_filtroTipo.isNotEmpty && !_tiposCombustivel.contains(_filtroTipo)) {
        _filtroTipo = '';
      }
      if (!_tiposCombustivel.contains(_tipo)) {
        _tipo = _tiposCombustivel.first;
      }

      final resp = await AppState.instance.api.get('/entrada-notas', query: {
        'local': localAtual,
        'tipo': _filtroTipo,
        'numero_nota_fiscal': _filtroNumeroNota,
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
        )
        ..sort((a, b) => _notaDateTime(b).compareTo(_notaDateTime(a)));
    } catch (e) {
      await _logEntradaNotaError('Falha ao carregar entrada de notas', e);
      if (mounted) {
        await _showMessageAboveModal(
          title: 'Erro ao carregar notas',
          message: e.toString(),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  DateTime _notaDateTime(EntradaNota nota) {
    final raw = (nota.dataHora?.trim().isNotEmpty == true)
        ? nota.dataHora!.trim()
        : nota.data.trim();
    if (raw.isEmpty) return DateTime.fromMillisecondsSinceEpoch(0);
    return DateTime.tryParse(raw.replaceFirst(' ', 'T')) ??
        DateTime.tryParse(nota.data.trim()) ??
        DateTime.fromMillisecondsSinceEpoch(0);
  }

  String _dateOnly(String? raw) {
    final value = raw?.trim() ?? '';
    if (value.isEmpty) return AppDates.todayIso();

    final isoMatch = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(value);
    if (isoMatch != null) return isoMatch.group(0)!;

    final brMatch = RegExp(r'^(\d{2})/(\d{2})/(\d{4})').firstMatch(value);
    if (brMatch != null) {
      return '${brMatch.group(3)}-${brMatch.group(2)}-${brMatch.group(1)}';
    }

    final parsed = DateTime.tryParse(value.replaceFirst(' ', 'T'));
    if (parsed != null) {
      final d = parsed.isUtc ? parsed.toLocal() : parsed;
      final year = d.year.toString().padLeft(4, '0');
      final month = d.month.toString().padLeft(2, '0');
      final day = d.day.toString().padLeft(2, '0');
      return '$year-$month-$day';
    }

    return AppDates.todayIso();
  }

  String _timeOnly(String? raw) {
    final value = raw?.trim() ?? '';
    final match = RegExp(r'^(\d{1,2}):(\d{2})').firstMatch(value);
    if (match == null) return AppDates.currentTimeIso();

    final hour = int.tryParse(match.group(1) ?? '') ?? 0;
    final minute = int.tryParse(match.group(2) ?? '') ?? 0;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return AppDates.currentTimeIso();
    }
    return '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';
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
    final nome =
        AppState.instance.auth.nome ?? AppState.instance.auth.login ?? '';
    setState(() {
      _editando = null;
      _data = AppDates.todayIso();
      _hora = AppDates.currentTimeIso();
      _numeroNfCtrl.text = '';
      _tipo = _tiposCombustivel.first;
      _qtdCtrl.text = '';
      _valorLitroCtrl.text = '';
      _valorTotalCtrl.text = '';
      _responsavelCtrl.text = nome;
      _fotoNotaUrl = null;
    });
    _openNotaFormModal();
  }

  void _edit(EntradaNota n) {
    setState(() {
      _editando = n;
      _data = _dateOnly(n.data);
      _hora = _timeOnly(AppDates.extractTime(n.dataHora ?? n.data));
      _numeroNfCtrl.text = n.numeroNotaFiscal ?? '';
      _tipo = (n.tipo == null || n.tipo!.trim().isEmpty)
          ? _tiposCombustivel.first
          : n.tipo!;
      if (!_tiposCombustivel.contains(_tipo)) {
        _tiposCombustivel = [..._tiposCombustivel, _tipo];
      }
      _qtdCtrl.text = (n.quantidade ?? 0).toString().replaceAll('.', ',');
      _valorLitroCtrl.text =
          (n.valorLitro ?? 0).toString().replaceAll('.', ',');
      _valorTotalCtrl.text = (n.valor ?? 0).toString().replaceAll('.', ',');
      _responsavelCtrl.text =
          AppState.instance.auth.nome ?? n.responsavel ?? '';
      _fotoNotaUrl = n.fotoNota;
    });
    _openNotaFormModal();
  }

  void _cancelForm() {
    if (_formModalOpen && mounted) {
      _formModalOpen = false;
      Navigator.of(context).pop();
    }
    setState(() {
      _editando = null;
    });
  }

  void _refreshFormModal() {
    _formModalSetState?.call(() {});
  }

  Future<String?> _pickAttachmentAction() async {
    return showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Camera'),
              onTap: () => Navigator.of(ctx).pop('camera'),
            ),
            ListTile(
              leading: const Icon(Icons.attach_file_outlined),
              title: const Text('Arquivo ou galeria'),
              onTap: () => Navigator.of(ctx).pop('arquivo'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _uploadFotoNota() async {
    final action = await _pickAttachmentAction();
    if (action == null) return;
    setState(() => _uploading = true);
    _refreshFormModal();
    try {
      String? path;
      if (action == 'camera') {
        final picked = await ImagePicker()
            .pickImage(source: ImageSource.camera)
            .timeout(const Duration(seconds: 60));
        path = picked?.path;
      } else {
        final picked = await FilePicker.platform.pickFiles(
          allowMultiple: false,
          type: FileType.custom,
          allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
        ).timeout(const Duration(seconds: 60));
        path = picked?.files.single.path;
      }
      if (path == null || path.trim().isEmpty) return;
      setState(() => _fotoNotaUrl = path);
      _refreshFormModal();
    } on TimeoutException {
      if (!mounted) return;
      await _logEntradaNotaError(
        'Falha ao selecionar anexo da entrada de nota',
        TimeoutException('Selecao do anexo demorou demais.'),
      );
      await _showMessageAboveModal(
        title: 'Erro no anexo',
        message: 'Selecao do anexo demorou demais. Tente novamente.',
        backgroundColor: AppTheme.warning,
      );
    } catch (e) {
      if (!mounted) return;
      await _logEntradaNotaError(
        'Falha ao selecionar anexo da entrada de nota',
        e,
      );
      await _showMessageAboveModal(
        title: 'Erro no anexo',
        message: 'Erro ao selecionar anexo: $e',
      );
    } finally {
      if (mounted) {
        setState(() => _uploading = false);
        _refreshFormModal();
      }
    }
  }

  Future<void> _openUrl(String url) async {
    final uri = _isRemoteUrl(url) ? Uri.tryParse(url) : Uri.file(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  bool _isRemoteUrl(String value) {
    final v = value.toLowerCase();
    return v.startsWith('http://') || v.startsWith('https://');
  }

  bool _isLocalAttachment(String? value) {
    final raw = value?.trim();
    if (raw == null || raw.isEmpty) return false;
    return !_isRemoteUrl(raw);
  }

  String _formatError(Object e) {
    if (e is ApiException) {
      final body = e.body.trim();
      return body.isEmpty
          ? 'status=${e.statusCode} message=${e.message}'
          : 'status=${e.statusCode} message=${e.message} body=$body';
    }
    if (e is OfflineException) return e.message;
    return e.toString();
  }

  Future<void> _logEntradaNotaError(
    String message,
    Object error, {
    Map<String, dynamic>? payload,
  }) async {
    await AppState.instance.db.addSyncLog(
      level: 'error',
      message: message,
      context: [
        'tela=entrada_notas',
        'erro=${_formatError(error)}',
        if (payload != null) 'payload=$payload',
      ].join(' '),
    );
  }

  Future<void> _showMessageAboveModal({
    required String title,
    required String message,
    Color backgroundColor = AppTheme.danger,
  }) async {
    if (!mounted) return;
    ScaffoldMessenger.of(context).clearSnackBars();
    if (_formModalOpen) {
      await showDialog<void>(
        context: context,
        useRootNavigator: true,
        builder: (ctx) => AlertDialog(
          title: Text(title),
          content: SingleChildScrollView(child: Text(message)),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: backgroundColor,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  String _attachmentLabel(String value) {
    final normalized = value.replaceAll('\\', '/');
    final parts = normalized.split('/');
    return parts.isEmpty ? value : parts.last;
  }

  Future<void> _save() async {
    if (_data.trim().isEmpty) return;
    final valorTotal = parseDecimal(_valorTotalCtrl.text);
    if (valorTotal == null || valorTotal <= 0) {
      await _showMessageAboveModal(
        title: 'Dados inválidos',
        message: 'Informe o valor total da nota.',
      );
      return;
    }
    setState(() => _saving = true);
    _refreshFormModal();
    final dataNota = _dateOnly(_data);
    final horaNota = _timeOnly(_hora);
    final payload = <String, dynamic>{
      'data': dataNota,
      'data_hora': AppDates.combineDateTime(dataNota, horaNota),
      'numero_nota_fiscal':
          _numeroNfCtrl.text.trim().isEmpty ? null : _numeroNfCtrl.text.trim(),
      'tipo': _tipo,
      'quantidade': parseDecimal(_qtdCtrl.text),
      'valor_litro': parseDecimal(_valorLitroCtrl.text),
      'valor': valorTotal,
      'responsavel': _responsavelCtrl.text.trim().isEmpty
          ? (AppState.instance.auth.nome ?? AppState.instance.auth.login ?? '')
          : _responsavelCtrl.text.trim(),
      'foto_nota': _fotoNotaUrl,
      'local': _editando?.local ?? AppState.instance.auth.filialAtual,
    };
    try {
      if (_isLocalAttachment(_fotoNotaUrl)) {
        await AppState.instance.db.enqueue(
          entity: 'entrada_notas',
          action: _editando?.idFinanceiro != null ? 'update' : 'create',
          remoteId: _editando?.idFinanceiro?.toString(),
          payload: payload,
        );
        _cancelForm();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Nota salva. O anexo sera enviado na sincronizacao.'),
          backgroundColor: AppTheme.warning,
        ));
        return;
      }
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
        remoteId: _editando?.idFinanceiro?.toString(),
        payload: payload,
      );
      _cancelForm();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Sem internet: nota enfileirada para sincronizacao.'),
        backgroundColor: AppTheme.warning,
      ));
    } on ApiException catch (e) {
      await _logEntradaNotaError('Falha ao salvar entrada de nota', e,
          payload: payload);
      await _showMessageAboveModal(
        title: 'Erro ao salvar nota',
        message: e.message,
      );
    } catch (e) {
      await _logEntradaNotaError('Erro inesperado ao salvar entrada de nota', e,
          payload: payload);
      await _showMessageAboveModal(
        title: 'Erro ao salvar nota',
        message: e.toString(),
      );
    } finally {
      if (mounted) {
        setState(() => _saving = false);
        _refreshFormModal();
      }
    }
  }

  Future<void> _openNotaFormModal() async {
    if (_formModalOpen) return;
    _formModalOpen = true;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setModalState) {
            _formModalSetState = setModalState;
            final media = MediaQuery.of(ctx);
            final bottomInset = media.viewInsets.bottom;
            final bottomSafePadding = media.viewPadding.bottom;
            return Padding(
              padding: EdgeInsets.only(bottom: bottomInset),
              child: DraggableScrollableSheet(
                initialChildSize: 0.96,
                minChildSize: 0.65,
                maxChildSize: 1.0,
                expand: false,
                builder: (ctx, scrollController) {
                  return Container(
                    decoration: BoxDecoration(
                      color: Theme.of(ctx).scaffoldBackgroundColor,
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(24),
                      ),
                    ),
                    child: Column(
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(20, 12, 10, 8),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  _editando == null
                                      ? 'Nova Nota Fiscal'
                                      : 'Editar Nota Fiscal',
                                  style: const TextStyle(
                                    fontSize: 20,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                              IconButton(
                                tooltip: 'Fechar',
                                onPressed: _cancelForm,
                                icon: const Icon(Icons.close),
                              ),
                            ],
                          ),
                        ),
                        Expanded(
                          child: ListView(
                            controller: scrollController,
                            padding: EdgeInsets.fromLTRB(
                              20,
                              4,
                              20,
                              24 + bottomSafePadding,
                            ),
                            children: [
                              OutlinedButton.icon(
                                onPressed: () async {
                                  final p = await pickDateIso(
                                    context,
                                    initialIso: _data,
                                  );
                                  if (p != null) {
                                    setState(() => _data = p);
                                    _refreshFormModal();
                                  }
                                },
                                icon: const Icon(Icons.event),
                                label: Text(AppDates.formatDateBr(_data)),
                              ),
                              const SizedBox(height: 10),
                              OutlinedButton.icon(
                                onPressed: () async {
                                  final parts = _hora.split(':');
                                  final selected = await showTimePicker(
                                    context: context,
                                    initialTime: TimeOfDay(
                                      hour: int.tryParse(parts.first) ??
                                          DateTime.now().hour,
                                      minute: parts.length > 1
                                          ? (int.tryParse(parts[1]) ??
                                              DateTime.now().minute)
                                          : DateTime.now().minute,
                                    ),
                                  );
                                  if (selected != null) {
                                    setState(() {
                                      _hora =
                                          '${selected.hour.toString().padLeft(2, '0')}:${selected.minute.toString().padLeft(2, '0')}';
                                    });
                                    _refreshFormModal();
                                  }
                                },
                                icon: const Icon(Icons.schedule_outlined),
                                label: Text('Hora: $_hora'),
                              ),
                              const SizedBox(height: 14),
                              TextField(
                                controller: _numeroNfCtrl,
                                decoration: const InputDecoration(
                                  labelText: 'Numero da NF',
                                ),
                              ),
                              const SizedBox(height: 14),
                              DropdownButtonFormField<String>(
                                initialValue: _tipo,
                                decoration:
                                    const InputDecoration(labelText: 'Tipo'),
                                items: _tiposCombustivel
                                    .map((t) => DropdownMenuItem(
                                          value: t,
                                          child: Text(t),
                                        ))
                                    .toList(),
                                onChanged: (v) {
                                  setState(() {
                                    _tipo = v ?? _tiposCombustivel.first;
                                  });
                                  _refreshFormModal();
                                },
                              ),
                              const SizedBox(height: 14),
                              DecimalField(
                                controller: _qtdCtrl,
                                label: 'Quantidade (L)',
                              ),
                              const SizedBox(height: 14),
                              DecimalField(
                                controller: _valorLitroCtrl,
                                label: 'Valor por Litro (compra)',
                              ),
                              const SizedBox(height: 14),
                              DecimalField(
                                controller: _valorTotalCtrl,
                                label: 'Valor Total',
                                prefix: 'R\$',
                              ),
                              const SizedBox(height: 14),
                              TextField(
                                controller: _responsavelCtrl,
                                readOnly: true,
                                decoration: const InputDecoration(
                                  labelText: 'Responsavel',
                                ),
                              ),
                              const SizedBox(height: 14),
                              SizedBox(
                                width: double.infinity,
                                child: OutlinedButton.icon(
                                  onPressed:
                                      _uploading ? null : _uploadFotoNota,
                                  icon: const Icon(Icons.attach_file),
                                  label: Text(
                                    _uploading
                                        ? 'Enviando...'
                                        : ((_fotoNotaUrl ?? '').trim().isEmpty
                                            ? 'Selecionar foto ou anexo'
                                            : 'Trocar foto ou anexo'),
                                  ),
                                ),
                              ),
                              if ((_fotoNotaUrl ?? '').trim().isNotEmpty) ...[
                                const SizedBox(height: 14),
                                InkWell(
                                  onTap: () => _openUrl(_fotoNotaUrl!),
                                  borderRadius: BorderRadius.circular(12),
                                  child: InputDecorator(
                                    decoration: const InputDecoration(
                                      labelText: 'Anexo',
                                      suffixIcon: Icon(Icons.open_in_new),
                                    ),
                                    child: Text(
                                      _isLocalAttachment(_fotoNotaUrl)
                                          ? _attachmentLabel(_fotoNotaUrl!)
                                          : _fotoNotaUrl!,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        color: AppTheme.primary,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                              const SizedBox(height: 22),
                              Row(
                                children: [
                                  Expanded(
                                    child: OutlinedButton(
                                      onPressed: _cancelForm,
                                      child: const Text('Cancelar'),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: ElevatedButton(
                                      onPressed: _saving ? null : _save,
                                      child: const Text('Salvar Nota'),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            );
          },
        );
      },
    );
    _formModalSetState = null;
    _formModalOpen = false;
    if (mounted) {
      setState(() {
        _editando = null;
      });
    }
  }

  Future<void> _delete(EntradaNota n) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Excluir nota'),
        content: Text('Excluir nota ${n.numeroNotaFiscal ?? n.idFinanceiro}?'),
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
      if (n.idFinanceiro != null) {
        await AppState.instance.api.delete('/entrada-notas/${n.idFinanceiro}');
      }
      await _load();
    } on OfflineException {
      await AppState.instance.db.enqueue(
        entity: 'entrada_notas',
        action: 'delete',
        remoteId: n.idFinanceiro?.toString(),
        payload: {},
      );
      setState(
          () => _notas.removeWhere((x) => x.idFinanceiro == n.idFinanceiro));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Sem internet: exclusao enfileirada.'),
        backgroundColor: AppTheme.warning,
      ));
    }
  }

  double get _totalLitros =>
      _notas.fold<double>(0, (a, n) => a + (n.quantidade ?? 0));
  double get _totalValor =>
      _notas.fold<double>(0, (a, n) => a + (n.valor ?? 0));
  double get _totalTransporte =>
      _notas.fold<double>(0, (a, n) => a + _custoTransporteTotal(n));
  double get _totalCompraFinal =>
      _notas.fold<double>(0, (a, n) => a + _valorCompraFinal(n));

  double _custoTransporteTotal(EntradaNota nota) {
    final persisted = nota.custoTransporteTotal;
    if (persisted != null && persisted > 0) return persisted;
    return ((nota.quantidade ?? 0) * _custoTransportePorLitro * 100).round() /
        100;
  }

  double _valorCompraFinal(EntradaNota nota) {
    final persisted = nota.valorCompraFinal;
    if (persisted != null && persisted > 0) return persisted;
    return (nota.valor ?? 0) + _custoTransporteTotal(nota);
  }

  String _notaVerificacaoLabel(EntradaNota nota) {
    final status = (nota.notaVerificacaoStatus ?? '').trim().toLowerCase();
    if (status == 'validada') return 'Nota validada';
    if (status == 'suspeita') return 'Suspeita';
    if (status == 'desativada') return 'IA desativada';
    return 'Pendente';
  }

  Color _notaVerificacaoColor(EntradaNota nota) {
    final status = (nota.notaVerificacaoStatus ?? '').trim().toLowerCase();
    if (status == 'validada') return AppTheme.success;
    if (status == 'suspeita') return AppTheme.warning;
    return AppTheme.textMuted;
  }

  Future<void> _abrirDetalhes(EntradaNota n) async {
    final isAdmin = Roles.isAdmin(AppState.instance.auth.tipo);
    final numero = (n.numeroNotaFiscal ?? '').trim();
    final abastecimentos = numero.isEmpty
        ? <Abastecimento>[]
        : await AppState.instance.db.listAbastecimentos(
            notaFiscal: numero,
            local: n.local ?? AppState.instance.auth.filialAtual,
            limit: 100,
          );
    if (!mounted) return;
    final action = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => EntityDetailsSheet(
        title: numero.isEmpty ? 'Nota fiscal' : 'NF $numero',
        subtitle: '${n.tipo ?? 'Combustivel'} - ${n.local ?? ''}',
        icon: Icons.receipt_long_outlined,
        actions: [
          if ((n.fotoNota ?? '').trim().isNotEmpty)
            const DetailAction(
              label: 'Abrir anexo',
              icon: Icons.open_in_new,
              action: 'attachment',
            ),
          if (isAdmin)
            const DetailAction(
              label: 'Editar',
              icon: Icons.edit_outlined,
              action: 'edit',
            ),
          if (isAdmin)
            const DetailAction(
              label: 'Excluir',
              icon: Icons.delete_outline,
              action: 'delete',
              color: AppTheme.danger,
            ),
        ],
        children: [
          DetailInfoGrid(
            fields: [
              DetailField(
                label: 'Data/Hora',
                value: AppDates.formatDateTimeOrDateBr(n.dataHora, n.data),
              ),
              DetailField(
                label: 'Tipo',
                value: n.tipo,
              ),
              DetailField(
                label: 'Quantidade',
                value: '${AppDates.number(n.quantidade)} L',
              ),
              DetailField(
                label: 'Valor/L',
                value: AppDates.money(n.valorLitro),
              ),
              DetailField(
                label: 'Valor fiscal',
                value: AppDates.money(n.valor),
              ),
              DetailField(
                label: 'Transporte/L',
                value: AppDates.money(
                    n.custoTransporteLitro ?? _custoTransportePorLitro),
              ),
              DetailField(
                label: 'Transporte',
                value: AppDates.money(_custoTransporteTotal(n)),
              ),
              DetailField(
                label: 'Custo final',
                value: AppDates.money(_valorCompraFinal(n)),
              ),
              DetailField(
                label: 'Responsavel',
                value: n.responsavel,
              ),
              DetailField(
                label: 'Filial',
                value: n.local,
              ),
              DetailField(
                label: 'Verificacao IA',
                value: _notaVerificacaoLabel(n),
              ),
              DetailField(
                label: 'Mensagem IA',
                value: n.notaVerificacaoMensagem,
              ),
              DetailField(
                label: 'Tipo detectado',
                value: n.notaVerificacaoTipo,
              ),
              DetailField(
                label: 'Anexo',
                value: (n.fotoNota ?? '').trim().isEmpty
                    ? null
                    : _attachmentLabel(n.fotoNota!),
              ),
            ],
          ),
          DetailSection(
            title: 'Abastecimentos vinculados pela NF',
            count: abastecimentos.length,
            child: DetailAbastecimentoList(items: abastecimentos),
          ),
        ],
      ),
    );
    if (!mounted || action == null) return;
    if (action == 'attachment' && (n.fotoNota ?? '').trim().isNotEmpty) {
      await _openUrl(n.fotoNota!);
    } else if (action == 'edit') {
      _edit(n);
    } else if (action == 'delete') {
      await _delete(n);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAdmin = Roles.isAdmin(AppState.instance.auth.tipo);
    final canCreate = Roles.canCreate(AppState.instance.auth.tipo);
    final bottomSafePadding = MediaQuery.of(context).viewPadding.bottom;
    return LoadingOverlay(
      show: _saving,
      message: 'Salvando...',
      child: ListView(
        padding: EdgeInsets.fromLTRB(12, 12, 12, 24 + bottomSafePadding),
        children: [
          Row(
            children: [
              const Expanded(
                child: Text('Entrada de Notas',
                    style:
                        TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
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
                        initialValue: _filtroTipo,
                        decoration: const InputDecoration(labelText: 'Tipo'),
                        items: [
                          const DropdownMenuItem(
                              value: '', child: Text('Todos')),
                          ..._tiposCombustivel.map(
                            (t) => DropdownMenuItem(value: t, child: Text(t)),
                          ),
                        ],
                        onChanged: (v) => setState(() => _filtroTipo = v ?? ''),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _filtroNumeroNotaCtrl,
                    decoration: InputDecoration(
                      labelText: 'Numero da nota',
                      prefixIcon: const Icon(Icons.receipt_long_outlined),
                      suffixIcon: _filtroNumeroNotaCtrl.text.isEmpty
                          ? null
                          : IconButton(
                              icon: const Icon(Icons.close),
                              onPressed: () {
                                _filtroNumeroNotaCtrl.clear();
                                setState(() => _filtroNumeroNota = '');
                                _load();
                              },
                            ),
                    ),
                    textInputAction: TextInputAction.search,
                    onChanged: (v) =>
                        setState(() => _filtroNumeroNota = v.trim()),
                    onSubmitted: (_) => _load(),
                  ),
                  const SizedBox(height: 10),
                  Row(children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final p = await pickDateIso(context,
                              initialIso: _filtroDataInicio);
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
                          final p = await pickDateIso(context,
                              initialIso: _filtroDataFim);
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
              titulo: 'Valor Fiscal',
              valor: AppDates.money(_totalValor),
              icone: Icons.attach_money,
              cor: AppTheme.success,
            ),
            KpiCard(
              titulo: 'Transporte',
              valor: AppDates.money(_totalTransporte),
              icone: Icons.local_shipping_outlined,
              cor: AppTheme.warning,
            ),
            KpiCard(
              titulo: 'Custo Final',
              valor: AppDates.money(_totalCompraFinal),
              icone: Icons.price_check_outlined,
              cor: AppTheme.primary,
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
                  onTap: () => _abrirDetalhes(n),
                  title:
                      Text('${n.numeroNotaFiscal ?? '—'} • ${n.tipo ?? '—'}'),
                  subtitle: Text(
                    '${AppDates.formatDateTimeOrDateBr(n.dataHora, n.data)} • ${AppDates.number(n.quantidade)} L • final ${AppDates.money(_valorCompraFinal(n))}\nIA: ${_notaVerificacaoLabel(n)}',
                  ),
                  leading: Icon(
                    n.notaVerificacaoStatus == 'suspeita'
                        ? Icons.warning_amber_outlined
                        : Icons.receipt_long_outlined,
                    color: _notaVerificacaoColor(n),
                  ),
                  isThreeLine: true,
                  dense: false,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  visualDensity: VisualDensity.compact,
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
                          icon: const Icon(Icons.delete_outline,
                              color: AppTheme.danger),
                        ),
                    ],
                  ),
                  selected: n.notaVerificacaoStatus == 'suspeita',
                  selectedTileColor: AppTheme.warning.withValues(alpha: 0.08),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
