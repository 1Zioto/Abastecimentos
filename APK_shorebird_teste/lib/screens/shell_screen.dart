import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shorebird_code_push/shorebird_code_push.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import 'abastecimentos/list_screen.dart';
import 'baixa_screen.dart';
import 'balancete_screen.dart';
import 'configuracoes_screen.dart';
import 'dashboard_screen.dart';
import 'encerrante_bomba_screen.dart';
import 'entrada_notas_screen.dart';
import 'graficos_screen.dart';
import 'login_screen.dart';
import 'motoristas_screen.dart';
import 'precos_screen.dart';
import 'proprietarios_screen.dart';
import 'relatorios_screen.dart';
import 'sync_logs_screen.dart';
import 'usuarios_screen.dart';
import 'veiculos_screen.dart';

class _NavItem {
  final String label;
  final IconData icon;
  final Widget Function() build;
  final bool adminOnly;
  final bool operadorOnly;
  final bool privateOnly;
  _NavItem(this.label, this.icon, this.build,
      {this.adminOnly = false,
      this.operadorOnly = false,
      this.privateOnly = false});
}

class ShellScreen extends StatefulWidget {
  const ShellScreen({super.key});

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen> with WidgetsBindingObserver {
  int _index = 0;
  bool _syncing = false;
  String _syncMsg = '';
  int _pendentes = 0;
  int _filialVersion = 0;
  bool _tentouCargaCompletaComBaseVazia = false;
  bool _updateCheckDone = false;
  bool _updateDialogOpen = false;
  bool _downloadingUpdate = false;
  double? _updateDownloadProgress;
  String? _appVersionLabel;
  UpdateStatus? _patchUpdateStatus;
  String? _patchUpdateMessage;
  Timer? _autoSyncTimer;
  final ShorebirdUpdater _shorebirdUpdater = ShorebirdUpdater();
  static const _appUpdateChannel =
      MethodChannel('com.vipe.abastecimento/app_update');

  // Conectividade
  final Connectivity _connectivity = Connectivity();
  StreamSubscription<List<ConnectivityResult>>? _connSub;
  bool _online = true;

  late final List<_NavItem> _items;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _items = [
      _NavItem(
          'Dashboard', Icons.dashboard_outlined, () => const DashboardScreen(),
          adminOnly: true),
      _NavItem(
          'Graficos', Icons.analytics_outlined, () => const GraficosScreen(),
          adminOnly: true),
      _NavItem('Abastecimentos', Icons.local_gas_station_outlined,
          () => const AbastecimentosListScreen()),
      _NavItem('Baixa em Lote', Icons.price_check_outlined,
          () => const BaixaScreen(),
          adminOnly: true),
      _NavItem('Entrada de Notas', Icons.receipt_long_outlined,
          () => const EntradaNotasScreen()),
      _NavItem('Encerrante', Icons.speed_outlined,
          () => const EncerranteBombaScreen(),
          operadorOnly: true),
      _NavItem('Relatorios', Icons.assessment_outlined,
          () => const RelatoriosScreen(),
          adminOnly: true),
      _NavItem('Balancete', Icons.table_chart_outlined,
          () => const BalanceteScreen(),
          adminOnly: true, privateOnly: true),
      _NavItem('Precos', Icons.attach_money, () => const PrecosScreen(),
          adminOnly: true),
      _NavItem('Proprietarios', Icons.groups_outlined,
          () => const ProprietariosScreen()),
      _NavItem('Veiculos', Icons.directions_car_outlined,
          () => const VeiculosScreen()),
      _NavItem('Transferir Veiculo', Icons.swap_horiz_outlined,
          () => const VeiculosScreen(),
          adminOnly: true),
      _NavItem(
          'Motoristas', Icons.badge_outlined, () => const MotoristasScreen()),
      _NavItem('Usuarios', Icons.admin_panel_settings_outlined,
          () => const UsuariosScreen(),
          adminOnly: true),
      _NavItem('Configuracoes', Icons.settings_outlined,
          () => const ConfiguracoesScreen()),
    ];
    AppState.instance.auth.filialAtualNotifier
        .addListener(_onFilialAtualChanged);
    _loadAppVersionLabel();
    _refreshPatchStateOnly();
    _refreshPendentes();
    _startAutoSync();
    _startConnectivityWatcher();
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkForUpdate());
  }

  Future<void> _loadAppVersionLabel() async {
    try {
      final info = await PackageInfo.fromPlatform();
      final version = info.version.trim();
      final build = info.buildNumber.trim();
      final base = build.isEmpty ? version : '$version+$build';
      var label = base;
      try {
        final patch = await _shorebirdUpdater.readCurrentPatch();
        label = patch == null
            ? '$base - Sem patch'
            : '$base - Patch ${patch.number}';
      } catch (_) {}
      if (mounted) setState(() => _appVersionLabel = label);
    } catch (_) {}
  }

  @override
  void dispose() {
    _autoSyncTimer?.cancel();
    _connSub?.cancel();
    AppState.instance.auth.filialAtualNotifier
        .removeListener(_onFilialAtualChanged);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _onFilialAtualChanged() {
    if (!mounted) return;
    setState(() {
      _filialVersion++;
      _tentouCargaCompletaComBaseVazia = false;
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _loadAppVersionLabel();
      _refreshPatchStateOnly();
      _syncPendentesSeOnline();
    }
  }

  Future<void> _refreshPatchStateOnly() async {
    if (!Platform.isAndroid || !_shorebirdUpdater.isAvailable) return;
    try {
      final current = await _shorebirdUpdater.readCurrentPatch();
      final next = await _shorebirdUpdater.readNextPatch();
      if (!mounted) return;
      final hasDownloadedPatch = next != null && next.number != current?.number;
      setState(() {
        if (hasDownloadedPatch) {
          _patchUpdateStatus = UpdateStatus.restartRequired;
          _patchUpdateMessage =
              'Atualizacao parcial baixada. Feche e abra o app para aplicar.';
        } else if (_patchUpdateStatus == UpdateStatus.restartRequired) {
          _patchUpdateStatus = null;
          _patchUpdateMessage = null;
        }
      });
    } catch (_) {}
  }

  Future<void> _showPatchUpdateDialog() async {
    if (!Platform.isAndroid) return;
    await showDialog<void>(
      context: context,
      builder: (_) => _PatchUpdateDialog(
        updater: _shorebirdUpdater,
        versionLabel: _appVersionLabel,
        onStatusChanged: (status, message) {
          if (!mounted) return;
          setState(() {
            _patchUpdateStatus = status == UpdateStatus.restartRequired
                ? UpdateStatus.restartRequired
                : null;
            _patchUpdateMessage =
                status == UpdateStatus.restartRequired ? message : null;
          });
        },
      ),
    );
    await _loadAppVersionLabel();
    await _refreshPatchStateOnly();
  }

  Future<void> _refreshPendentes() async {
    final c = await AppState.instance.db.pendingCount();
    if (mounted) setState(() => _pendentes = c);
  }

  List<_NavItem> get _visibleItems {
    final tipo = AppState.instance.auth.tipo;
    return _items.where((i) {
      if (i.adminOnly && !Roles.isAdmin(tipo)) return false;
      if (i.operadorOnly && tipo != 'operador') return false;
      if (i.privateOnly && !_canAccessPrivateScreens()) return false;
      return true;
    }).toList();
  }

  bool _canAccessPrivateScreens() {
    final auth = AppState.instance.auth;
    final ident = '${auth.login ?? ''} ${auth.nome ?? ''}'.toLowerCase();
    return Roles.isAdmin(auth.tipo) &&
        (auth.login == 'admin' || ident.contains('douglas'));
  }

  void _startAutoSync() {
    _autoSyncTimer?.cancel();
    // Mantem apenas a fila pendente drenando quando houver internet.
    _autoSyncTimer = Timer.periodic(const Duration(minutes: 3), (_) async {
      await _syncPendentesSeOnline();
    });
  }

  /// Escuta mudancas de conectividade: quando o dispositivo sai de "sem rede"
  /// para "com rede", envia apenas a fila pendente.
  Future<void> _startConnectivityWatcher() async {
    try {
      final initial = await _connectivity.checkConnectivity();
      _online = _anyOnline(initial);
    } catch (e) {
      debugPrint('[conn] checkConnectivity falhou: $e');
      _online = true; // fallback otimista
    }

    _connSub = _connectivity.onConnectivityChanged.listen((results) async {
      final nowOnline = _anyOnline(results);
      final wasOnline = _online;
      _online = nowOnline;
      if (!mounted) return;
      setState(() {});
      if (!wasOnline && nowOnline) {
        await _syncPendentesSeOnline();
      }
    });

    if (_online) {
      await _syncPendentesSeOnline();
    }
  }

  Future<void> _syncPendentesSeOnline() async {
    if (!mounted || _syncing || !_online) return;
    await _refreshPendentes();
    if (!mounted || _syncing || !_online || _pendentes <= 0) return;
    await _sync(silent: true);
  }

  bool _anyOnline(List<ConnectivityResult> results) {
    return results.any((r) =>
        r == ConnectivityResult.wifi ||
        r == ConnectivityResult.mobile ||
        r == ConnectivityResult.ethernet ||
        r == ConnectivityResult.vpn);
  }

  Future<bool> _verificarOnline() async {
    try {
      final status = await _connectivity.checkConnectivity();
      final nowOnline = _anyOnline(status);
      if (mounted && _online != nowOnline) {
        setState(() => _online = nowOnline);
      } else {
        _online = nowOnline;
      }
      return nowOnline;
    } catch (_) {
      return _online;
    }
  }

  Future<void> _sync({bool silent = false, bool forceFull = false}) async {
    if (_syncing) return;
    final onlineNow = await _verificarOnline();
    if (!onlineNow) {
      await _refreshPendentes();
      if (!mounted || silent) return;
      final msg = _pendentes > 0
          ? 'Sem internet. $_pendentes pendente${_pendentes == 1 ? '' : 's'} aguardando conexao.'
          : 'Sem internet. Dados locais mantidos.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg),
          backgroundColor: AppTheme.warning,
        ),
      );
      return;
    }

    setState(() {
      _syncing = true;
      _syncMsg = 'Iniciando sincronizacao...';
    });

    var result = await AppState.instance.sync.run(
      forceFull: forceFull,
      onProgress: (m) {
        if (mounted) setState(() => _syncMsg = m);
      },
    );

    if (!mounted) return;

    final totalAbastecimentos =
        await AppState.instance.db.countAbastecimentos();
    if (!forceFull &&
        totalAbastecimentos == 0 &&
        !_tentouCargaCompletaComBaseVazia) {
      _tentouCargaCompletaComBaseVazia = true;
      setState(() => _syncMsg = 'Baixando base completa...');
      result = await AppState.instance.sync.run(
        forceFull: true,
        onProgress: (m) {
          if (mounted) setState(() => _syncMsg = m);
        },
      );
      if (!mounted) return;
    }

    setState(() {
      _syncing = false;
      _syncMsg = '';
      _filialVersion++;
    });
    await _refreshPendentes();

    final shouldNotify = !silent || result.enviados > 0;
    if (shouldNotify) {
      final sb = SnackBar(
        content: Text(result.resumo),
        backgroundColor: result.success
            ? AppTheme.success
            : (result.erroGlobal != null ? AppTheme.danger : AppTheme.warning),
      );
      ScaffoldMessenger.of(context).showSnackBar(sb);
    }

    if (result.erroGlobal != null && _isAuthError(result.erroGlobal!)) {
      await _logout(reason: 'Sessao encerrada apos erro de sincronizacao');
      return;
    }

    if (result.success) {
      await _checkForUpdate(force: true);
    }
  }

  bool _isAuthError(String msg) {
    final m = msg.toLowerCase();
    return m.contains('token') ||
        m.contains('unauthenti') ||
        m.contains('unauthorized') ||
        m.contains('401');
  }

  Future<void> _logout({String? reason}) async {
    if (reason != null) {
      await AppState.instance.errorReporter.capture(
        tipo: 'auth_logout',
        origem: 'shell_sync',
        tela: 'shell',
        mensagem: reason,
        detalhe: 'Usuario enviado para login automaticamente.',
      );
    }
    await AppState.instance.auth.clear();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  Future<void> _trocarFilial(String filial) async {
    final auth = AppState.instance.auth;
    if (!auth.canAccessFilial(filial) || auth.filialAtual == filial) return;
    await auth.setFilialAtual(filial);
  }

  @override
  Widget build(BuildContext context) {
    final items = _visibleItems;
    if (_index >= items.length) _index = 0;
    final current = items[_index];
    final filialAtual = AppState.instance.auth.filialAtual ?? 'Matriz';

    return Scaffold(
      appBar: AppBar(
        title: _AppBarTitle(
          title: current.label,
          version: current.label == 'Dashboard' ? _appVersionLabel : null,
        ),
        actions: [
          if (_pendentes > 0) _PendingIcon(count: _pendentes),
          if (!_online)
            const Tooltip(
              message: 'Sem conexao - trabalhando offline',
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: 4),
                child: Icon(Icons.cloud_off_outlined, color: AppTheme.warning),
              ),
            ),
          _FilialSwitcher(
            filialAtual: filialAtual,
            filiais: AppState.instance.auth.filiaisAcesso,
            onChanged: _trocarFilial,
          ),
          IconButton(
            tooltip: 'Sincronizar',
            onPressed: _syncing ? null : () => _sync(forceFull: true),
            icon: _syncing
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                        color: Colors.white, strokeWidth: 2.5),
                  )
                : const Icon(Icons.sync),
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert),
            onSelected: (v) async {
              if (v == 'update') await _checkForUpdate(manual: true);
              if (v == 'patch_update') await _showPatchUpdateDialog();
              if (v == 'logout') await _logout();
              if (v == 'reset') await _confirmReset();
            },
            itemBuilder: (_) => const [
              PopupMenuItem(
                  value: 'update', child: Text('Verificar atualização')),
              PopupMenuItem(
                  value: 'patch_update', child: Text('Atualização parcial')),
              PopupMenuItem(value: 'reset', child: Text('Limpar cache local')),
              PopupMenuItem(value: 'logout', child: Text('Sair')),
            ],
          ),
        ],
      ),
      drawer: _buildDrawer(items),
      body: Column(
        children: [
          if (_patchUpdateStatus == UpdateStatus.restartRequired)
            _PatchUpdateBar(
              message: _patchUpdateMessage ??
                  'Atualizacao parcial baixada. Feche e abra o app para aplicar.',
              onTap: _showPatchUpdateDialog,
            ),
          if (_syncing) _SyncBar(message: _syncMsg),
          Expanded(
            child: IndexedStack(
              index: _index,
              children: items
                  .map((i) => KeyedSubtree(
                        key:
                            ValueKey('${i.label}-$filialAtual-$_filialVersion'),
                        child: i.build(),
                      ))
                  .toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDrawer(List<_NavItem> items) {
    final auth = AppState.instance.auth;
    return Drawer(
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 20),
              color: AppTheme.surface,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.asset(
                          'assets/logo.jpg',
                          width: 30,
                          height: 30,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Icon(
                            Icons.local_gas_station_outlined,
                            color: AppTheme.primary,
                            size: 26,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Text('Abastecimento Vipe',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          )),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(auth.nome ?? '',
                      style: const TextStyle(color: AppTheme.textMuted)),
                  const SizedBox(height: 2),
                  Text('${auth.login ?? ''} - ${auth.tipo ?? ''}',
                      style: const TextStyle(
                          color: AppTheme.textMuted, fontSize: 12)),
                  const SizedBox(height: 8),
                  _FilialBadge(filial: auth.filialAtual ?? 'Matriz'),
                  if ((_appVersionLabel ?? '').isNotEmpty) ...[
                    const SizedBox(height: 8),
                    _VersionInfoLine(version: _appVersionLabel!),
                  ],
                ],
              ),
            ),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(vertical: 6),
                itemCount: items.length,
                itemBuilder: (_, i) {
                  final it = items[i];
                  final selected = i == _index;
                  return ListTile(
                    leading: Icon(it.icon,
                        color:
                            selected ? AppTheme.primary : AppTheme.textMuted),
                    title: Text(it.label,
                        style: TextStyle(
                          color: selected ? AppTheme.primary : null,
                          fontWeight:
                              selected ? FontWeight.w700 : FontWeight.w500,
                        )),
                    selected: selected,
                    onTap: () {
                      setState(() => _index = i);
                      Navigator.of(context).pop();
                    },
                  );
                },
              ),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.sync, color: AppTheme.primary),
              title: Text(_pendentes > 0
                  ? 'Sincronizar ($_pendentes pendente${_pendentes == 1 ? '' : 's'})'
                  : 'Sincronizar agora'),
              onTap: () {
                Navigator.of(context).pop();
                _sync(silent: false, forceFull: true);
              },
            ),
            ListTile(
              leading:
                  const Icon(Icons.system_update_alt, color: AppTheme.primary),
              title: const Text('Atualização parcial'),
              subtitle: _patchUpdateStatus == UpdateStatus.restartRequired
                  ? const Text('Reinicie para aplicar a atualização')
                  : null,
              onTap: () {
                Navigator.of(context).pop();
                _showPatchUpdateDialog();
              },
            ),
            ListTile(
              leading: const Icon(Icons.bug_report_outlined,
                  color: AppTheme.warning),
              title: const Text('Logs de sincronizacao'),
              onTap: () {
                Navigator.of(context).pop();
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const SyncLogsScreen()),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.logout, color: AppTheme.danger),
              title: const Text('Sair'),
              onTap: () async {
                Navigator.of(context).pop();
                await _logout();
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmReset() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Limpar cache local?'),
        content: const Text(
            'Todos os registros baixados serao apagados. Registros pendentes de envio tambem serao perdidos.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Limpar')),
        ],
      ),
    );
    if (ok == true) {
      await AppState.instance.db.resetAll();
      await _refreshPendentes();
      if (!mounted) return;
      setState(() {
        _filialVersion++;
        _tentouCargaCompletaComBaseVazia = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Cache local limpo.')),
      );
    }
  }

  Future<void> _checkForUpdate(
      {bool manual = false, bool force = false}) async {
    if (!Platform.isAndroid) return;
    if (!mounted ||
        _updateDialogOpen ||
        (_updateCheckDone && !manual && !force)) return;
    _updateCheckDone = true;

    try {
      final packageInfo = await PackageInfo.fromPlatform();
      final currentCode = int.tryParse(packageInfo.buildNumber) ?? 0;
      final currentName = packageInfo.version;
      final response = await AppState.instance.api.get(
        '/app-update',
        query: {
          'platform': 'android',
          'current_version_code': currentCode,
          'current_version_name': currentName,
        },
      );
      if (response is! Map) return;

      final latestCode =
          int.tryParse(response['latest_version_code']?.toString() ?? '') ?? 0;
      if (latestCode <= currentCode) {
        if (manual && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Aplicativo já está atualizado.')),
          );
        }
        return;
      }

      final info = _AppUpdateInfo.fromResponse(
        response,
        latestCode: latestCode,
      );
      if (info.apkUrl.isEmpty) return;

      if (!mounted) return;
      _updateDialogOpen = true;
      _updateDownloadProgress = null;
      _downloadingUpdate = false;
      await showDialog<void>(
        context: context,
        barrierDismissible: !info.required,
        builder: (ctx) => StatefulBuilder(
          builder: (ctx, setDialogState) => AlertDialog(
            title: Text(info.title),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Versão instalada: $currentName'),
                  Text('Versão disponível: ${info.versionName}'),
                  const SizedBox(height: 12),
                  Text(info.message),
                  if (info.notes.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    const Text(
                      'Novidades:',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                    ...info.notes.map((n) => Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Text('- $n'),
                        )),
                  ],
                  if (_downloadingUpdate) ...[
                    const SizedBox(height: 16),
                    LinearProgressIndicator(value: _updateDownloadProgress),
                    const SizedBox(height: 8),
                    Text(
                      _updateDownloadProgress == null
                          ? 'Baixando atualização...'
                          : 'Baixando atualização: ${((_updateDownloadProgress ?? 0) * 100).clamp(0, 100).toStringAsFixed(0)}%',
                      style: const TextStyle(color: AppTheme.textMuted),
                    ),
                  ],
                ],
              ),
            ),
            actions: [
              if (!info.required && !_downloadingUpdate)
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Depois'),
                ),
              ElevatedButton.icon(
                onPressed: _downloadingUpdate
                    ? null
                    : () async {
                        await _downloadAndInstallUpdate(
                          info,
                          onState: setDialogState,
                        );
                      },
                icon: const Icon(Icons.system_update_alt),
                label: Text(_downloadingUpdate ? 'Baixando...' : 'Atualizar'),
              ),
            ],
          ),
        ),
      );
      _updateDialogOpen = false;
    } catch (e) {
      if (!manual) {
        _updateCheckDone = false;
      }
      if (manual && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Não foi possível verificar atualização: $e'),
            backgroundColor: AppTheme.warning,
          ),
        );
      }
    } finally {
      _updateDialogOpen = false;
      if (mounted) {
        setState(() {
          _downloadingUpdate = false;
          _updateDownloadProgress = null;
        });
      }
    }
  }

  Future<void> _downloadAndInstallUpdate(
    _AppUpdateInfo info, {
    required StateSetter onState,
  }) async {
    setState(() {
      _downloadingUpdate = true;
      _updateDownloadProgress = null;
    });
    onState(() {});

    try {
      final path = await _downloadApk(info, onProgress: (progress) {
        if (!mounted) return;
        setState(() => _updateDownloadProgress = progress);
        onState(() {});
      });
      await _appUpdateChannel.invokeMethod<bool>('installApk', {'path': path});
    } on PlatformException catch (e) {
      if (!mounted) return;
      final message = e.message ?? 'Falha ao instalar atualização.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message), backgroundColor: AppTheme.warning),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Falha ao baixar atualização: $e'),
          backgroundColor: AppTheme.danger,
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _downloadingUpdate = false;
          _updateDownloadProgress = null;
        });
        onState(() {});
      }
    }
  }

  Future<String> _downloadApk(
    _AppUpdateInfo info, {
    required void Function(double? progress) onProgress,
  }) async {
    final uri = Uri.parse(info.apkUrl);
    final tempDir = await getTemporaryDirectory();
    final file =
        File('${tempDir.path}/vipe-abastecimento-${info.versionCode}.apk');
    if (await file.exists()) {
      await file.delete();
    }

    final client = HttpClient();
    try {
      final request = await client.getUrl(uri);
      final response = await request.close();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception('Download falhou (HTTP ${response.statusCode}).');
      }

      final total = response.contentLength;
      var received = 0;
      final sink = file.openWrite();
      try {
        await for (final chunk in response) {
          received += chunk.length;
          sink.add(chunk);
          onProgress(total > 0 ? received / total : null);
        }
      } finally {
        await sink.close();
      }
      final savedLength = await file.length();
      if (total > 0 && savedLength != total) {
        await file.delete();
        throw Exception(
          'Download incompleto (${_formatBytes(savedLength)} de ${_formatBytes(total)}). Tente atualizar novamente.',
        );
      }
      if (savedLength < 1024 * 1024) {
        await file.delete();
        throw Exception(
            'Arquivo de atualização inválido. Tente baixar novamente.');
      }
      onProgress(1);
      return file.path;
    } finally {
      client.close(force: true);
    }
  }

  String _formatBytes(int bytes) {
    if (bytes >= 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    if (bytes >= 1024) {
      return '${(bytes / 1024).toStringAsFixed(1)} KB';
    }
    return '$bytes bytes';
  }
}

class _AppBarTitle extends StatelessWidget {
  final String title;
  final String? version;

  const _AppBarTitle({required this.title, this.version});

  @override
  Widget build(BuildContext context) {
    final versionText = version;
    if (versionText == null || versionText.trim().isEmpty) {
      return Text(title, overflow: TextOverflow.ellipsis);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
        ),
        Text(
          versionText,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: AppTheme.textMuted,
          ),
        ),
      ],
    );
  }
}

class _VersionInfoLine extends StatelessWidget {
  final String version;

  const _VersionInfoLine({required this.version});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.sync, size: 15, color: AppTheme.textMuted),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            version,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: AppTheme.textMuted,
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );
  }
}

class _AppUpdateInfo {
  final int versionCode;
  final String versionName;
  final String apkUrl;
  final bool required;
  final String title;
  final String message;
  final List<String> notes;

  const _AppUpdateInfo({
    required this.versionCode,
    required this.versionName,
    required this.apkUrl,
    required this.required,
    required this.title,
    required this.message,
    required this.notes,
  });

  factory _AppUpdateInfo.fromResponse(
    Map response, {
    required int latestCode,
  }) {
    final notes = (response['release_notes'] is List)
        ? (response['release_notes'] as List)
            .map((e) => e.toString().trim())
            .where((e) => e.isNotEmpty)
            .toList()
        : <String>[];

    return _AppUpdateInfo(
      versionCode: latestCode,
      versionName:
          response['latest_version_name']?.toString().trim().isNotEmpty == true
              ? response['latest_version_name'].toString().trim()
              : 'nova versão',
      apkUrl: response['apk_url']?.toString().trim() ?? '',
      required: response['required'] == true,
      title: response['title']?.toString().trim().isNotEmpty == true
          ? response['title'].toString().trim()
          : 'Nova atualização disponível',
      message: response['message']?.toString().trim().isNotEmpty == true
          ? response['message'].toString().trim()
          : 'Atualize o aplicativo para receber as melhorias mais recentes.',
      notes: notes,
    );
  }
}

class _PatchUpdateDialog extends StatefulWidget {
  final ShorebirdUpdater updater;
  final String? versionLabel;
  final void Function(UpdateStatus? status, String? message) onStatusChanged;

  const _PatchUpdateDialog({
    required this.updater,
    required this.versionLabel,
    required this.onStatusChanged,
  });

  @override
  State<_PatchUpdateDialog> createState() => _PatchUpdateDialogState();
}

class _PatchUpdateDialogState extends State<_PatchUpdateDialog> {
  bool _checking = true;
  bool _downloading = false;
  UpdateStatus? _status;
  Patch? _currentPatch;
  Patch? _nextPatch;
  String _message = 'Verificando atualização parcial...';
  String? _error;

  @override
  void initState() {
    super.initState();
    Future.microtask(_check);
  }

  void _setStatus(UpdateStatus status, String message) {
    if (!mounted) return;
    setState(() {
      _checking = false;
      _downloading = false;
      _status = status;
      _message = message;
    });
    widget.onStatusChanged(status, message);
  }

  Future<void> _check() async {
    if (!widget.updater.isAvailable) {
      _setStatus(
        UpdateStatus.unavailable,
        'Atualização parcial indisponível nesta instalação.',
      );
      return;
    }

    setState(() {
      _checking = true;
      _downloading = false;
      _error = null;
      _message = 'Verificando atualização parcial...';
    });

    try {
      final status = await widget.updater.checkForUpdate();
      final current = await widget.updater.readCurrentPatch();
      final next = await widget.updater.readNextPatch();
      if (!mounted) return;
      setState(() {
        _status = status;
        _currentPatch = current;
        _nextPatch = next;
        _checking = false;
        _message = _messageFor(status);
      });
      widget.onStatusChanged(status, _messageFor(status));
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _checking = false;
        _error = 'Não foi possível verificar agora: $e';
        _message = 'Verificação interrompida.';
      });
      widget.onStatusChanged(null, null);
    }
  }

  Future<void> _download() async {
    setState(() {
      _downloading = true;
      _error = null;
      _message = 'Baixando e preparando atualização...';
    });

    try {
      await widget.updater.update();
      final current = await widget.updater.readCurrentPatch();
      final next = await widget.updater.readNextPatch();
      if (!mounted) return;
      setState(() {
        _downloading = false;
        _status = UpdateStatus.restartRequired;
        _currentPatch = current;
        _nextPatch = next;
        _message = _messageFor(UpdateStatus.restartRequired);
      });
      widget.onStatusChanged(UpdateStatus.restartRequired, _message);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _downloading = false;
        _error = 'Falha ao baixar atualização parcial: $e';
        _message = 'Falha ao preparar atualização.';
      });
      widget.onStatusChanged(null, null);
    }
  }

  String _messageFor(UpdateStatus status) {
    switch (status) {
      case UpdateStatus.outdated:
        return 'Atualização parcial disponível.';
      case UpdateStatus.restartRequired:
        return 'Atualização baixada. Feche e abra o app para aplicar.';
      case UpdateStatus.upToDate:
        return 'O app já está com a atualização parcial mais recente.';
      case UpdateStatus.unavailable:
        return 'Atualização parcial indisponível nesta instalação.';
    }
  }

  @override
  Widget build(BuildContext context) {
    final busy = _checking || _downloading;
    final version = widget.versionLabel?.trim();
    final currentText = _currentPatch == null
        ? 'Patch instalado: nenhum'
        : 'Patch instalado: ${_currentPatch!.number}';
    final nextText =
        _nextPatch == null ? null : 'Patch preparado: ${_nextPatch!.number}';

    return AlertDialog(
      title: const Text('Atualização parcial'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (version != null && version.isNotEmpty) ...[
              Text('Versão atual: $version'),
              const SizedBox(height: 8),
            ],
            Text(currentText),
            if (nextText != null) Text(nextText),
            const SizedBox(height: 14),
            Text(_message),
            if (busy) ...[
              const SizedBox(height: 16),
              const LinearProgressIndicator(),
              const SizedBox(height: 8),
              Text(
                _downloading
                    ? 'O Shorebird não informa porcentagem real; este progresso mostra a etapa atual.'
                    : 'Consultando atualizações disponíveis...',
                style: const TextStyle(
                  color: AppTheme.textMuted,
                  fontSize: 12,
                ),
              ),
            ],
            if (_status == UpdateStatus.restartRequired && !busy) ...[
              const SizedBox(height: 12),
              const Text(
                'Para usar a atualização, feche o aplicativo completamente e abra de novo.',
                style: TextStyle(color: AppTheme.textMuted),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: const TextStyle(color: AppTheme.danger),
              ),
            ],
          ],
        ),
      ),
      actions: [
        if (!busy)
          TextButton(
            onPressed: _check,
            child: const Text('Verificar'),
          ),
        if (_status == UpdateStatus.outdated && !busy)
          ElevatedButton.icon(
            onPressed: _download,
            icon: const Icon(Icons.system_update_alt),
            label: const Text('Baixar'),
          )
        else
          TextButton(
            onPressed: busy ? null : () => Navigator.pop(context),
            child: const Text('Fechar'),
          ),
      ],
    );
  }
}

class _PatchUpdateBar extends StatelessWidget {
  final String message;
  final VoidCallback onTap;

  const _PatchUpdateBar({
    required this.message,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppTheme.warning.withOpacity(0.18),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          child: Row(
            children: [
              const Icon(Icons.system_update_alt,
                  color: AppTheme.warning, size: 18),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  message,
                  style: const TextStyle(
                    color: AppTheme.textStrong,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                'Ver',
                style: TextStyle(
                  color: AppTheme.primary,
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FilialSwitcher extends StatelessWidget {
  final String filialAtual;
  final List<String> filiais;
  final ValueChanged<String> onChanged;

  const _FilialSwitcher({
    required this.filialAtual,
    required this.filiais,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    if (filiais.length <= 1) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Center(child: _FilialBadge(filial: filialAtual, light: true)),
      );
    }
    return PopupMenuButton<String>(
      tooltip: 'Trocar filial',
      initialValue: filialAtual,
      onSelected: onChanged,
      itemBuilder: (_) => filiais
          .map(
            (filial) => PopupMenuItem<String>(
              value: filial,
              child: Row(
                children: [
                  Icon(
                    filial == 'Matriz'
                        ? Icons.business_outlined
                        : Icons.warehouse_outlined,
                    size: 18,
                  ),
                  const SizedBox(width: 8),
                  Text(filial),
                  if (filial == filialAtual) ...[
                    const Spacer(),
                    const Icon(Icons.check, size: 18, color: AppTheme.success),
                  ],
                ],
              ),
            ),
          )
          .toList(),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Center(child: _FilialBadge(filial: filialAtual, light: true)),
      ),
    );
  }
}

class _FilialBadge extends StatelessWidget {
  final String filial;
  final bool light;

  const _FilialBadge({required this.filial, this.light = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: light ? AppTheme.surfaceAlt : AppTheme.primary.withOpacity(0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: light ? AppTheme.border : AppTheme.primary.withOpacity(0.35),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            filial == 'Matriz'
                ? Icons.business_outlined
                : Icons.warehouse_outlined,
            size: 14,
            color: light ? AppTheme.textStrong : AppTheme.primary,
          ),
          const SizedBox(width: 5),
          Text(
            filial,
            style: TextStyle(
              color: light ? AppTheme.textStrong : AppTheme.primary,
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _SyncBar extends StatelessWidget {
  final String message;
  const _SyncBar({required this.message});
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: AppTheme.primary.withOpacity(0.15),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      child: Row(
        children: [
          const SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(
                strokeWidth: 2, color: AppTheme.primary),
          ),
          const SizedBox(width: 10),
          Expanded(
              child: Text(message.isEmpty ? 'Sincronizando...' : message,
                  style: const TextStyle(fontSize: 13))),
        ],
      ),
    );
  }
}

class _PendingIcon extends StatelessWidget {
  final int count;
  const _PendingIcon({required this.count});

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message:
          '$count registro${count == 1 ? '' : 's'} pendente${count == 1 ? '' : 's'} de sincronizacao',
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2),
        child: Center(
          child: Container(
            constraints: const BoxConstraints(minWidth: 28, minHeight: 24),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: AppTheme.warning,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              count > 99 ? '99+' : '$count',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.black,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
