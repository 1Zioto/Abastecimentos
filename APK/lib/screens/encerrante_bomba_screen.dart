import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api_client.dart';
import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../widgets/common.dart';

class EncerranteBombaScreen extends StatefulWidget {
  const EncerranteBombaScreen({super.key});

  @override
  State<EncerranteBombaScreen> createState() => _EncerranteBombaScreenState();
}

class _EncerranteBombaScreenState extends State<EncerranteBombaScreen> {
  bool _loading = true;
  bool _saving = false;
  bool _uploading = false;
  bool _obrigatorio = false;
  String _horaObrigatoria = '08:00';
  Map<String, dynamic>? _ultimo;

  String _data = AppDates.todayIso();
  final _tanqueCtrl = TextEditingController();
  final _bombaCtrl = TextEditingController();
  String? _fotoUrl;

  @override
  void initState() {
    super.initState();
    _loadStatus();
  }

  @override
  void dispose() {
    _tanqueCtrl.dispose();
    _bombaCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadStatus() async {
    setState(() => _loading = true);
    try {
      final resp = await AppState.instance.api.get(
        '/encerrantes-bomba/status',
        query: {'local': AppState.instance.auth.filialAtual ?? 'Matriz'},
      );
      if (resp is Map) {
        setState(() {
          _obrigatorio = resp['obrigatorio'] == true;
          _horaObrigatoria =
              resp['hora_obrigatoria']?.toString() ?? _horaObrigatoria;
          _ultimo = resp['ultimo'] is Map
              ? Map<String, dynamic>.from(resp['ultimo'] as Map)
              : null;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Erro ao carregar status: $e'),
          backgroundColor: AppTheme.warning,
        ));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<ImageSource?> _pickSource() {
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

  Future<void> _uploadFoto() async {
    final source = await _pickSource();
    if (source == null) return;
    final picked = await ImagePicker().pickImage(
      source: source,
      imageQuality: 80,
    );
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
      final url =
          (file['downloadUrl'] ?? file['webViewLink'] ?? file['webContentLink'])
              ?.toString();
      if (url == null || url.trim().isEmpty) {
        throw Exception('Upload sem URL');
      }
      setState(() => _fotoUrl = url);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro ao enviar foto: $e'),
        backgroundColor: AppTheme.danger,
      ));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _save() async {
    final tanque = _parseLitrosEncerrante(_tanqueCtrl.text);
    final bomba = _parseLitrosEncerrante(_bombaCtrl.text);
    if (tanque == null || bomba == null || (_fotoUrl ?? '').trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Preencha tanque, litros da bomba e foto.'),
        backgroundColor: AppTheme.warning,
      ));
      return;
    }

    setState(() => _saving = true);
    try {
      await AppState.instance.api.post('/encerrantes-bomba', {
        'data': _data,
        'local': AppState.instance.auth.filialAtual ?? 'Matriz',
        'quantidade_tanque': tanque,
        'litros_bomba': bomba,
        'foto': _fotoUrl,
      });
      _tanqueCtrl.clear();
      _bombaCtrl.clear();
      _fotoUrl = null;
      await _loadStatus();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Encerrante registrado com sucesso.'),
        backgroundColor: AppTheme.success,
      ));
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro: ${e.message}'),
        backgroundColor: AppTheme.danger,
      ));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro ao salvar: $e'),
        backgroundColor: AppTheme.danger,
      ));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _openUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  double? _parseLitrosEncerrante(String? value) {
    final raw = (value ?? '').trim();
    if (raw.isEmpty) return null;
    final onlyAllowed = raw.replaceAll(RegExp(r'[^0-9,.]'), '');
    if (onlyAllowed.isEmpty) return null;

    final lastComma = onlyAllowed.lastIndexOf(',');
    final lastDot = onlyAllowed.lastIndexOf('.');
    final lastSeparator = lastComma > lastDot ? lastComma : lastDot;

    if (lastSeparator >= 0) {
      final before = onlyAllowed.substring(0, lastSeparator);
      final after = onlyAllowed.substring(lastSeparator + 1);
      final otherSeparators = before.contains(',') || before.contains('.');

      if (after.length == 3) {
        if (otherSeparators) {
          final integerPart = before.replaceAll(RegExp(r'[,.]'), '');
          return double.tryParse('$integerPart.$after');
        }
        return double.tryParse(before + after);
      }

      final decimalBefore = before.replaceAll(RegExp(r'[,.]'), '');
      return double.tryParse('$decimalBefore.$after');
    }

    return double.tryParse(onlyAllowed);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return LoadingOverlay(
      show: _saving,
      message: 'Salvando...',
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          Card(
            color: _obrigatorio
                ? AppTheme.warning.withOpacity(0.10)
                : AppTheme.success.withOpacity(0.08),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    _obrigatorio
                        ? Icons.warning_amber_outlined
                        : Icons.check_circle_outline,
                    color: _obrigatorio ? AppTheme.warning : AppTheme.success,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _obrigatorio
                          ? 'Encerrante semanal pendente. Informe antes de criar novo abastecimento.'
                          : 'Encerrante semanal em dia.',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Obrigatorio toda semana a partir de $_horaObrigatoria',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 14),
                  OutlinedButton.icon(
                    onPressed: () async {
                      final p = await pickDateIso(context, initialIso: _data);
                      if (p != null) setState(() => _data = p);
                    },
                    icon: const Icon(Icons.event_outlined),
                    label: Text(AppDates.formatDateBr(_data)),
                  ),
                  const SizedBox(height: 12),
                  DecimalField(
                    controller: _tanqueCtrl,
                    label: 'Combustivel no tanque (L)',
                  ),
                  const SizedBox(height: 12),
                  DecimalField(
                    controller: _bombaCtrl,
                    label: 'Litros registrados na bomba',
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _uploading ? null : _uploadFoto,
                    icon: const Icon(Icons.photo_camera_outlined),
                    label: Text(_uploading
                        ? 'Enviando foto...'
                        : (_fotoUrl == null
                            ? 'Anexar foto'
                            : 'Substituir foto')),
                  ),
                  if ((_fotoUrl ?? '').trim().isNotEmpty) ...[
                    const SizedBox(height: 12),
                    InkWell(
                      onTap: () => _openUrl(_fotoUrl!),
                      borderRadius: BorderRadius.circular(10),
                      child: InputDecorator(
                        decoration: const InputDecoration(
                          labelText: 'Foto',
                          suffixIcon: Icon(Icons.open_in_new),
                        ),
                        child: Text(
                          _fotoUrl!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: AppTheme.primary),
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 18),
                  ElevatedButton.icon(
                    onPressed: _saving ? null : _save,
                    icon: const Icon(Icons.save_outlined),
                    label: const Text('Salvar encerrante'),
                  ),
                ],
              ),
            ),
          ),
          if (_ultimo != null) ...[
            const SizedBox(height: 10),
            Card(
              child: ListTile(
                leading: const Icon(Icons.history_outlined),
                title: Text(
                  'Ultimo registro: ${AppDates.formatDateBr(_ultimo!['data']?.toString())}',
                ),
                subtitle: Text(
                  '${_ultimo!['quantidade_tanque'] ?? '-'} L no tanque | ${_ultimo!['litros_bomba'] ?? '-'} L na bomba',
                ),
                trailing: (_ultimo!['foto']?.toString().trim().isNotEmpty ??
                        false)
                    ? IconButton(
                        onPressed: () => _openUrl(_ultimo!['foto'].toString()),
                        icon: const Icon(Icons.image_outlined),
                      )
                    : null,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
