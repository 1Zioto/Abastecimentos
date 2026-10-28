import 'dart:io';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_filex/open_filex.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../widgets/common.dart';

class EncerranteDiarioScreen extends StatefulWidget {
  const EncerranteDiarioScreen({super.key});
  @override
  State<EncerranteDiarioScreen> createState() => _EncerranteDiarioScreenState();
}

class _EncerranteDiarioScreenState extends State<EncerranteDiarioScreen> {
  final _litros = TextEditingController();
  String? _regua, _medidor;
  bool _saving = false, _loading = false;
  int _page = 1, _lastPage = 1;
  String? _error;
  num? _saldoAtual;
  List<Map<String, dynamic>> _rows = [], _pending = [];
  String get _local => AppState.instance.auth.filialAtual ?? '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _litros.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _saldoAtual = null;
    });
    try {
      final queue = await AppState.instance.db.listQueue();
      if (!mounted) return;
      setState(() => _pending = queue
          .where((q) =>
              q.entity == 'encerrante_diario' && q.payload['local'] == _local)
          .map((q) => {...q.payload, 'pending': true, 'error': q.lastError})
          .toList());
      final response = await AppState.instance.api.get('/encerrantes-diarios',
          query: {'local': _local, 'page': _page, 'per_page': 50});
      if (!mounted) return;
      setState(() {
        _rows = (response['data'] as List)
            .map((r) => Map<String, dynamic>.from(r as Map))
            .toList();
        _lastPage = (response['last_page'] as num).toInt();
      });
      final preview = await AppState.instance.api
          .get('/encerrantes-diarios/saldo', query: {'local': _local});
      if (mounted && preview is Map) {
        setState(() =>
            _saldoAtual = num.tryParse(preview['saldo_sistema'].toString()));
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error =
            'Histórico remoto indisponível: $e. Os registros pendentes abaixo continuam no aparelho.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _photo(bool ruler) async {
    try {
      final image = await ImagePicker()
          .pickImage(source: ImageSource.camera, imageQuality: 85);
      if (image == null || !mounted) return;
      setState(() {
        if (ruler) {
          _regua = image.path;
        } else {
          _medidor = image.path;
        }
      });
    } catch (e) {
      _message('Não foi possível abrir a câmera: $e');
    }
  }

  void _message(String text) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
    }
  }

  String _formatRowHeader(Map<String, dynamic> row) {
    final data = row['data']?.toString() ?? '';
    String hora = '';
    final rawTime = row['created_at'] ?? row['saldo_consultado_em'];
    if (rawTime != null) {
      try {
        final dt = DateTime.parse(rawTime.toString()).toLocal();
        hora = ' ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
      } catch (_) {}
    }
    return '$data$hora · ${row['quantidade_tanque']} L';
  }

  Future<void> _save() async {
    if (_saving || !Roles.canCreate(AppState.instance.auth.tipo)) return;
    final litros = parseDecimal(_litros.text);
    final day = AppDates.todayIso();
    final local = _local;
    if (_local.isEmpty ||
        litros == null ||
        !litros.isFinite ||
        litros < 0 ||
        _regua == null ||
        _medidor == null) {
      _message(
          'Informe a quantidade em litros (zero é permitido) e tire as duas fotos.');
      return;
    }
    setState(() => _saving = true);
    try {
      final key =
          '${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 32)}';
      // Capturar antes de enfileirar, nunca recalcular durante a sincronização.
      final snapshot = await AppState.instance.api
          .get('/encerrantes-diarios/saldo', query: {'local': local});
      if (snapshot is! Map ||
          snapshot['saldo_snapshot'] == null ||
          snapshot['saldo_sistema'] == null ||
          snapshot['data'] != day) {
        throw const FormatException(
            'Não foi possível confirmar o saldo atual. Tente novamente com internet.');
      }
      final dir = await getApplicationDocumentsDirectory();
      final folder = await Directory('${dir.path}/encerrantes_diarios/$key')
          .create(recursive: true);
      final regua = await File(_regua!).copy('${folder.path}/regua.jpg');
      final medidor = await File(_medidor!).copy('${folder.path}/medidor.jpg');
      await AppState.instance.db.enqueue(
          entity: 'encerrante_diario',
          action: 'create',
          uuid: key,
          payload: {
            '_client_request_id': key,
            'data': day,
            'local': local,
            'quantidade_tanque': litros,
            'saldo_snapshot': snapshot['saldo_snapshot'],
            'saldo_sistema': snapshot['saldo_sistema'],
            'saldo_consultado_em': snapshot['saldo_consultado_em'],
            'foto_regua': regua.path,
            'foto_medidor': medidor.path,
            'usuario_nome':
                AppState.instance.auth.nome ?? AppState.instance.auth.login,
            '_registro_login': AppState.instance.auth.login,
          });
      if (!mounted) return;
      setState(() {
        _litros.clear();
        _regua = null;
        _medidor = null;
        _page = 1;
      });
      _message(
          'Registro salvo no aparelho. Use Sincronizar ou aguarde a sincronização automática.');
      await _load();
    } catch (e) {
      _message('Não foi possível salvar: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _open(String path) async {
    try {
      if (path.startsWith('https://') || path.startsWith('http://')) {
        await launchUrl(Uri.parse(path), mode: LaunchMode.externalApplication);
      } else {
        await OpenFilex.open(path);
      }
    } catch (e) {
      _message('Não foi possível abrir a foto: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!Roles.canCreate(AppState.instance.auth.tipo)) {
      return const Center(
          child: Text('Acesso restrito a frentistas e administradores.'));
    }
    return ListView(padding: const EdgeInsets.all(16), children: [
      Text('Encerrante diário · $_local',
          style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 8),
      const Text(
          'Medição física do tanque. Não altera o saldo de combustível.'),
      Text(
          'Saldo do sistema: ${_saldoAtual == null ? 'aguardando consulta' : '${AppDates.number(_saldoAtual!.toDouble(), digits: 2)} L'}',
          style: const TextStyle(fontWeight: FontWeight.bold)),
      const Text(
          'Ao registrar, o saldo do sistema será consultado e guardado separadamente. É necessária conexão nesse momento; as fotos podem sincronizar depois.'),
      Card(
          child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Registro de ${AppDates.todayIso()}'),
                    const SizedBox(height: 12),
                    TextField(
                        controller: _litros,
                        enabled: !_saving,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        decoration: const InputDecoration(
                            labelText: 'Quantidade no tanque (litros) *')),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                        onPressed: _saving ? null : () => _photo(true),
                        icon: const Icon(Icons.camera_alt),
                        label: Text(_regua == null
                            ? 'Fotografar régua *'
                            : 'Foto da régua selecionada — trocar')),
                    if (_regua != null)
                      Image.file(File(_regua!),
                          height: 100, fit: BoxFit.contain),
                    OutlinedButton.icon(
                        onPressed: _saving ? null : () => _photo(false),
                        icon: const Icon(Icons.camera_alt),
                        label: Text(_medidor == null
                            ? 'Fotografar medidor *'
                            : 'Foto do medidor selecionada — trocar')),
                    if (_medidor != null)
                      Image.file(File(_medidor!),
                          height: 100, fit: BoxFit.contain),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                        onPressed: _saving ? null : _save,
                        icon: const Icon(Icons.save_outlined),
                        label: Text(_saving
                            ? 'Salvando...'
                            : 'Registrar encerrante diário')),
                  ]))),
      Row(children: [
        const Expanded(child: Text('Histórico e pendências')),
        IconButton(
            onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh))
      ]),
      if (_loading) const LinearProgressIndicator(),
      if (_error != null)
        Text(_error!, style: const TextStyle(color: AppTheme.warning)),
      for (final row in [..._pending, ..._rows])
        Card(
            child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_formatRowHeader(Map<String, dynamic>.from(row as Map)),
                          style: const TextStyle(fontWeight: FontWeight.bold)),
                      Text(
                          'Saldo do sistema: ${row['saldo_sistema'] ?? 'não capturado'}${row['saldo_sistema'] == null ? '' : ' L'}'),
                      if (row['saldo_sistema'] != null)
                        Text(
                            'Diferença (físico − sistema): ${((num.tryParse(row['quantidade_tanque'].toString()) ?? 0) - (num.tryParse(row['saldo_sistema'].toString()) ?? 0)).toStringAsFixed(2)} L'),
                      if (row['saldo_consultado_em'] != null)
                        Text(
                            'Saldo consultado em: ${row['saldo_consultado_em']}'),
                      Text(
                          '${row['usuario_nome'] ?? ''} · ${row['pending'] == true ? 'Pendente de sincronização' : 'Sincronizado'}'),
                      if (row['error'] != null)
                        Text(row['error'].toString(),
                            style: const TextStyle(color: AppTheme.danger)),
                      Wrap(children: [
                        for (final field in ['foto_regua', 'foto_medidor'])
                          TextButton(
                              onPressed: () => _open(row[field].toString()),
                              child: Text(field == 'foto_regua'
                                  ? 'Ver régua'
                                  : 'Ver medidor'))
                      ]),
                    ]))),
      if (!_loading && _pending.isEmpty && _rows.isEmpty)
        const Text('Nenhum registro encontrado.'),
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        TextButton(
            onPressed: _loading || _page <= 1
                ? null
                : () {
                    _page--;
                    _load();
                  },
            child: const Text('Anterior')),
        Text('$_page / $_lastPage'),
        TextButton(
            onPressed: _loading || _page >= _lastPage
                ? null
                : () {
                    _page++;
                    _load();
                  },
            child: const Text('Próxima')),
      ]),
    ]);
  }
}
