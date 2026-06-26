import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/analysis_config.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/thermal_printer.dart';

class ConfiguracoesScreen extends StatefulWidget {
  const ConfiguracoesScreen({super.key});

  @override
  State<ConfiguracoesScreen> createState() => _ConfiguracoesScreenState();
}

class _ConfiguracoesScreenState extends State<ConfiguracoesScreen> {
  bool _loading = true;
  bool _useAiAnalysis = false;
  bool _savingAnalysis = false;
  bool _savingEncerrante = false;
  bool _loadingPrinters = false;
  bool _printingTest = false;
  bool _autoPrintAbastecimento = false;
  String _encerranteHora = '08:00';
  String? _printerAddress;
  String? _printerName;
  List<ThermalPrinterDevice> _printers = const [];
  late final TextEditingController _aiOrientationCtrl;
  late final TextEditingController _notaFiscalPromptCtrl;

  @override
  void dispose() {
    _aiOrientationCtrl.dispose();
    _notaFiscalPromptCtrl.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _aiOrientationCtrl = TextEditingController();
    _notaFiscalPromptCtrl = TextEditingController();
    _load();
  }

  Future<void> _load() async {
    String encerranteHora = '08:00';
    var analysisConfig = await AnalysisConfig.loadLocal();
    try {
      final resp =
          await AppState.instance.api.get('/configuracoes/encerrante-bomba');
      if (resp is Map) {
        final value = resp['hora_obrigatoria']?.toString();
        if (value != null && value.trim().isNotEmpty) {
          encerranteHora = value.trim();
        }
      }
    } catch (_) {
      // Configuracao remota e opcional para visualizacao local.
    }
    analysisConfig = await AnalysisConfig.loadRemote(AppState.instance.api);
    if (!mounted) return;
    setState(() {
      _useAiAnalysis = analysisConfig.useAi;
      _aiOrientationCtrl.text = analysisConfig.orientation;
      _notaFiscalPromptCtrl.text = analysisConfig.notaFiscalPrompt;
      _encerranteHora = encerranteHora;
    });
    final prefs = await SharedPreferences.getInstance();
    final autoPrint =
        await ThermalPrinterService.instance.autoPrintAbastecimentoEnabled();
    if (!mounted) return;
    setState(() {
      _printerName = prefs.getString('thermal_printer_name');
      _printerAddress = prefs.getString('thermal_printer_address');
      _autoPrintAbastecimento = autoPrint;
      _loading = false;
    });
  }

  Future<void> _loadPrinters() async {
    setState(() => _loadingPrinters = true);
    try {
      final devices = await ThermalPrinterService.instance.listPairedDevices();
      if (!mounted) return;
      setState(() => _printers = devices);
      if (devices.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Nenhuma impressora Bluetooth pareada encontrada.'),
          backgroundColor: AppTheme.warning,
        ));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro ao listar Bluetooth: $e'),
        backgroundColor: AppTheme.danger,
      ));
    } finally {
      if (mounted) setState(() => _loadingPrinters = false);
    }
  }

  Future<void> _savePrinter(String? address) async {
    if (address == null || address.isEmpty) return;
    final device = _printers.firstWhere(
      (printer) => printer.address == address,
      orElse: () => ThermalPrinterDevice(
        name: _printerName ?? 'Impressora Bluetooth',
        address: address,
      ),
    );
    await ThermalPrinterService.instance.saveSelectedPrinter(device);
    if (!mounted) return;
    setState(() {
      _printerAddress = device.address;
      _printerName = device.name;
    });
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text('Impressora salva: ${device.name}'),
      backgroundColor: AppTheme.success,
    ));
  }

  Future<void> _clearPrinter() async {
    await ThermalPrinterService.instance.clearSelectedPrinter();
    await ThermalPrinterService.instance
        .saveAutoPrintAbastecimentoEnabled(false);
    if (!mounted) return;
    setState(() {
      _printerAddress = null;
      _printerName = null;
      _autoPrintAbastecimento = false;
    });
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      content: Text('Impressora removida das configuracoes.'),
      backgroundColor: AppTheme.success,
    ));
  }

  Future<void> _setAutoPrintAbastecimento(bool value) async {
    if (value && (_printerAddress == null || _printerAddress!.isEmpty)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Selecione uma impressora antes de ativar a impressao.'),
        backgroundColor: AppTheme.warning,
      ));
      return;
    }
    await ThermalPrinterService.instance
        .saveAutoPrintAbastecimentoEnabled(value);
    if (!mounted) return;
    setState(() => _autoPrintAbastecimento = value);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(value
          ? 'Impressao automatica ativada neste aparelho.'
          : 'Impressao automatica desativada neste aparelho.'),
      backgroundColor: AppTheme.success,
    ));
  }

  Future<void> _printTest() async {
    setState(() => _printingTest = true);
    try {
      await ThermalPrinterService.instance.printTest();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Teste enviado para a impressora.'),
        backgroundColor: AppTheme.success,
      ));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro ao imprimir teste: $e'),
        backgroundColor: AppTheme.danger,
      ));
    } finally {
      if (mounted) setState(() => _printingTest = false);
    }
  }

  Future<void> _setUseAiAnalysis(bool value) async {
    if (!Roles.isAdmin(AppState.instance.auth.tipo)) return;
    await _saveAnalysisConfig(useAi: value);
  }

  Future<void> _saveAiOrientation() async {
    if (!Roles.isAdmin(AppState.instance.auth.tipo)) return;
    await _saveAnalysisConfig(useAi: _useAiAnalysis);
  }

  Future<void> _saveNotaFiscalPrompt() async {
    if (!Roles.isAdmin(AppState.instance.auth.tipo)) return;
    await _saveAnalysisConfig(useAi: _useAiAnalysis);
  }

  Future<void> _restoreDefaultAiOrientation() async {
    _aiOrientationCtrl.text = AnalysisConfig.defaultAiOrientation.trim();
    await _saveAiOrientation();
  }

  Future<void> _restoreDefaultNotaFiscalPrompt() async {
    _notaFiscalPromptCtrl.text = AnalysisConfig.defaultNotaFiscalPrompt.trim();
    await _saveNotaFiscalPrompt();
  }

  Future<void> _saveAnalysisConfig({required bool useAi}) async {
    setState(() => _savingAnalysis = true);
    try {
      final config = await AnalysisConfig.saveRemote(
        AppState.instance.api,
        useAi: useAi,
        orientation: _aiOrientationCtrl.text,
        notaFiscalPrompt: _notaFiscalPromptCtrl.text,
      );
      if (!mounted) return;
      setState(() {
        _useAiAnalysis = config.useAi;
        _aiOrientationCtrl.text = config.orientation;
        _notaFiscalPromptCtrl.text = config.notaFiscalPrompt;
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Configuracao de analise salva para todos os aparelhos.'),
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
        content: Text('Erro ao salvar configuracao: $e'),
        backgroundColor: AppTheme.danger,
      ));
    } finally {
      if (mounted) setState(() => _savingAnalysis = false);
    }
  }

  Future<void> _pickEncerranteHora() async {
    final parts = _encerranteHora.split(':');
    final initial = TimeOfDay(
      hour: int.tryParse(parts.first) ?? 8,
      minute: parts.length > 1 ? (int.tryParse(parts[1]) ?? 0) : 0,
    );
    final selected = await showTimePicker(
      context: context,
      initialTime: initial,
    );
    if (selected == null) return;
    setState(() {
      _encerranteHora =
          '${selected.hour.toString().padLeft(2, '0')}:${selected.minute.toString().padLeft(2, '0')}';
    });
  }

  Future<void> _saveEncerranteHora() async {
    setState(() => _savingEncerrante = true);
    try {
      final resp = await AppState.instance.api.put(
        '/configuracoes/encerrante-bomba',
        {'hora_obrigatoria': _encerranteHora},
      );
      if (resp is Map && resp['hora_obrigatoria'] != null) {
        _encerranteHora = resp['hora_obrigatoria'].toString();
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Horario do encerrante salvo.'),
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
        content: Text('Erro ao salvar horario: $e'),
        backgroundColor: AppTheme.danger,
      ));
    } finally {
      if (mounted) setState(() => _savingEncerrante = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    final isAdmin = Roles.isAdmin(AppState.instance.auth.tipo);

    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        if (isAdmin) ...[
          const Text(
            'Comprovantes',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: AppTheme.textMuted,
              letterSpacing: 2,
            ),
          ),
          const SizedBox(height: 10),
          Card(
            child: SwitchListTile(
              value: _useAiAnalysis,
              onChanged:
                  Roles.isAdmin(AppState.instance.auth.tipo) && !_savingAnalysis
                      ? _setUseAiAnalysis
                      : null,
              title: const Text(
                'Usar IA na analise do comprovante',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: Text(_useAiAnalysis
                  ? 'Ativado para todos os aparelhos: fotos serao analisadas pela IA do backend.'
                  : 'Desativado para todos os aparelhos: fotos serao analisadas por OCR local.'),
              secondary: Icon(
                _useAiAnalysis
                    ? Icons.psychology_alt_outlined
                    : Icons.document_scanner_outlined,
                color: AppTheme.primary,
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
                  const Text(
                    'Orientacao da IA',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Texto usado para orientar a leitura de fotos de bomba, recibos e comprovantes.',
                    style: TextStyle(color: AppTheme.textMuted),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _aiOrientationCtrl,
                    enabled: Roles.isAdmin(AppState.instance.auth.tipo) &&
                        !_savingAnalysis,
                    minLines: 7,
                    maxLines: 12,
                    decoration: const InputDecoration(
                      alignLabelWithHint: true,
                      labelText: 'Regras de leitura',
                    ),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: Roles.isAdmin(AppState.instance.auth.tipo) &&
                            !_savingAnalysis
                        ? _restoreDefaultAiOrientation
                        : null,
                    icon: const Icon(Icons.restore_outlined),
                    label: const Text('Restaurar padrao'),
                  ),
                  const SizedBox(height: 8),
                  ElevatedButton.icon(
                    onPressed: Roles.isAdmin(AppState.instance.auth.tipo) &&
                            !_savingAnalysis
                        ? _saveAiOrientation
                        : null,
                    icon: const Icon(Icons.save_outlined),
                    label: const Text('Salvar orientacao'),
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
                  const Text(
                    'Prompt da nota fiscal',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Texto usado para decidir se o anexo da entrada parece uma nota fiscal/documento fiscal.',
                    style: TextStyle(color: AppTheme.textMuted),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _notaFiscalPromptCtrl,
                    enabled: Roles.isAdmin(AppState.instance.auth.tipo) &&
                        !_savingAnalysis,
                    minLines: 7,
                    maxLines: 12,
                    decoration: const InputDecoration(
                      alignLabelWithHint: true,
                      labelText: 'Regras para nota fiscal',
                    ),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: Roles.isAdmin(AppState.instance.auth.tipo) &&
                            !_savingAnalysis
                        ? _restoreDefaultNotaFiscalPrompt
                        : null,
                    icon: const Icon(Icons.restore_outlined),
                    label: const Text('Restaurar padrao da nota'),
                  ),
                  const SizedBox(height: 8),
                  ElevatedButton.icon(
                    onPressed: Roles.isAdmin(AppState.instance.auth.tipo) &&
                            !_savingAnalysis
                        ? _saveNotaFiscalPrompt
                        : null,
                    icon: const Icon(Icons.save_outlined),
                    label: const Text('Salvar prompt da nota'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 18),
        ],
        const Text(
          'Impressora termica',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w800,
            color: AppTheme.textMuted,
            letterSpacing: 2,
          ),
        ),
        const SizedBox(height: 10),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Bluetooth direta',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 6),
                Text(
                  _printerAddress == null
                      ? 'Pareie a POS 5808L no Android e selecione aqui para imprimir sem abrir seletor.'
                      : 'Selecionada: ${_printerName ?? 'Impressora Bluetooth'} ($_printerAddress)',
                  style: const TextStyle(color: AppTheme.textMuted),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: _loadingPrinters ? null : _loadPrinters,
                  icon: _loadingPrinters
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.bluetooth_searching_outlined),
                  label: Text(
                      _loadingPrinters ? 'Buscando...' : 'Buscar pareadas'),
                ),
                if (_printers.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue:
                        _printers.any((p) => p.address == _printerAddress)
                            ? _printerAddress
                            : null,
                    decoration: const InputDecoration(
                      labelText: 'Impressora',
                      prefixIcon: Icon(Icons.print_outlined),
                    ),
                    items: _printers
                        .map(
                          (printer) => DropdownMenuItem(
                            value: printer.address,
                            child: Text(
                              '${printer.name} (${printer.address})',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: _savePrinter,
                  ),
                ],
                const SizedBox(height: 10),
                ElevatedButton.icon(
                  onPressed: _printerAddress == null || _printingTest
                      ? null
                      : _printTest,
                  icon: _printingTest
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.receipt_long_outlined),
                  label:
                      Text(_printingTest ? 'Imprimindo...' : 'Imprimir teste'),
                ),
                const SizedBox(height: 6),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _autoPrintAbastecimento,
                  onChanged: _setAutoPrintAbastecimento,
                  title: const Text(
                    'Imprimir ao registrar abastecimento',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  subtitle: const Text(
                    'Configuracao local deste aparelho. Usa a impressora selecionada acima.',
                  ),
                  secondary: const Icon(Icons.local_printshop_outlined),
                ),
                if (_printerAddress != null) ...[
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _clearPrinter,
                    icon: const Icon(Icons.link_off_outlined),
                    label: const Text('Remover impressora'),
                  ),
                ],
              ],
            ),
          ),
        ),
        if (isAdmin) ...[
          const SizedBox(height: 18),
          const Text(
            'Encerrante da bomba',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: AppTheme.textMuted,
              letterSpacing: 2,
            ),
          ),
          const SizedBox(height: 10),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Horario obrigatorio semanal',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Operadores precisam informar o encerrante da bomba uma vez por semana antes de criar novo abastecimento.',
                    style: TextStyle(color: AppTheme.textMuted),
                  ),
                  const SizedBox(height: 14),
                  OutlinedButton.icon(
                    onPressed: Roles.isAdmin(AppState.instance.auth.tipo) &&
                            !_savingEncerrante
                        ? _pickEncerranteHora
                        : null,
                    icon: const Icon(Icons.schedule_outlined),
                    label: Text(_encerranteHora),
                  ),
                  const SizedBox(height: 10),
                  ElevatedButton.icon(
                    onPressed: Roles.isAdmin(AppState.instance.auth.tipo) &&
                            !_savingEncerrante
                        ? _saveEncerranteHora
                        : null,
                    icon: _savingEncerrante
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.save_outlined),
                    label: Text(
                        _savingEncerrante ? 'Salvando...' : 'Salvar horario'),
                  ),
                  if (!Roles.isAdmin(AppState.instance.auth.tipo)) ...[
                    const SizedBox(height: 10),
                    const Text(
                      'Somente administradores podem alterar este horario.',
                      style: TextStyle(color: AppTheme.textMuted, fontSize: 12),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}
