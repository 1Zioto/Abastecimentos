import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import 'abastecimentos/list_screen.dart';
import 'app_erros_screen.dart';
import 'auditoria_abastecimentos_screen.dart';
import 'baixa_screen.dart';
import 'balancete_screen.dart';
import 'conciliacao_bancaria_screen.dart';
import 'conferencia_vipe_screen.dart';
import 'configuracoes_screen.dart';
import 'controle_encerrante_screen.dart';
import 'dashboard_screen.dart';
import 'despesas_avulsas_screen.dart';
import 'encerrante_bomba_screen.dart';
import 'encerrante_diario_screen.dart';
import 'entrada_notas_screen.dart';
import 'graficos_screen.dart';
import 'historico_alteracoes_screen.dart';
import 'integracao_atua/integracao_atua_screen.dart';
import 'login_screen.dart';
import 'motoristas_screen.dart';
import 'precos_screen.dart';
import 'pingo_screen.dart';
import 'proprietarios_screen.dart';
import 'relatorios_screen.dart';
import 'sync_logs_screen.dart';
import 'tanques_historico_screen.dart';
import 'transferencia_veiculo_screen.dart';
import 'usuarios_screen.dart';
import 'veiculos_screen.dart';
import 'nova_baixa_comprovante_screen.dart';
import '../core/background_tank_monitor.dart';
import 'notificacoes_criticas_screen.dart';

class _NavItem {
  final String label;
  final IconData icon;
  final Widget Function() build;
  final bool adminOnly;
  final bool operationalOnly;
  final bool privateOnly;
  _NavItem(this.label, this.icon, this.build,
      {this.adminOnly = false,
      this.operationalOnly = false,
      this.privateOnly = false});
}

class ShellScreen extends StatefulWidget {
  const ShellScreen({super.key});

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen> with WidgetsBindingObserver {
  static const _automaticSyncInterval = Duration(hours: 1);
  static const _lastSyncKey = 'last_sync_attempt_at_v1';
  int _index = 0;
  bool _syncing = false;
  String _syncMsg = '';
  int _pendentes = 0;
  int _naoVistasCriticas = 0;
  int _filialVersion = 0;
  bool _tentouCargaCompletaComBaseVazia = false;
  String? _appVersionLabel;
  Timer? _autoSyncTimer;
  Map<String, Object?>? _updateInfo;
  final Map<String, Widget> _screenCache = {};

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
      _NavItem('Pergunte ao Pingo', Icons.smart_toy_outlined,
          () => const PingoScreen(),
          adminOnly: true),
      _NavItem(
          'Graficos', Icons.analytics_outlined, () => const GraficosScreen(),
          adminOnly: true),
      _NavItem('Abastecimentos', Icons.local_gas_station_outlined,
          () => const AbastecimentosListScreen()),
      _NavItem('Historico do Tanque', Icons.water_drop_outlined,
          () => const TanquesHistoricoScreen(),
          adminOnly: true),
      _NavItem('Lançar no Atua', Icons.sync_alt_outlined,
          () => const IntegracaoAtuaScreen(),
          adminOnly: true),
      _NavItem('Baixa em Lote', Icons.price_check_outlined,
          () => const BaixaScreen(),
          adminOnly: true),
      _NavItem('Nova Baixa (Comprovante)', Icons.receipt_long_outlined,
          () => const NovaBaixaComprovanteScreen(),
          adminOnly: true),
      _NavItem('Entrada de Notas', Icons.receipt_long_outlined,
          () => const EntradaNotasScreen()),
      _NavItem('Despesas', Icons.payments_outlined,
          () => const DespesasAvulsasScreen(),
          adminOnly: true),
      _NavItem('Conciliacao Bancaria', Icons.account_balance_outlined,
          () => const ConciliacaoBancariaScreen(),
          adminOnly: true),
      _NavItem('Encerrante', Icons.speed_outlined,
          () => const EncerranteBombaScreen(),
          adminOnly: true),
      _NavItem('Encerrante diário', Icons.straighten_outlined,
          () => const EncerranteDiarioScreen(),
          operationalOnly: true),
      _NavItem('Auditoria', Icons.fact_check_outlined,
          () => const AuditoriaAbastecimentosScreen(),
          adminOnly: true),
      _NavItem('Conferência Vipe', Icons.rule_folder_outlined,
          () => const ConferenciaVipeScreen(),
          adminOnly: true),
      _NavItem('Controle Encerrante', Icons.oil_barrel_outlined,
          () => const ControleEncerranteScreen(),
          adminOnly: true, privateOnly: true),
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
          () => const TransferenciaVeiculoScreen(),
          operationalOnly: true),
      _NavItem(
          'Motoristas', Icons.badge_outlined, () => const MotoristasScreen()),
      _NavItem('Usuarios', Icons.admin_panel_settings_outlined,
          () => const UsuariosScreen(),
          adminOnly: true),
      _NavItem('Notificações Críticas', Icons.notification_important_outlined, () => NotificacoesCriticasScreen(onUnreadCountChanged: (c) { if (mounted && _naoVistasCriticas != c) setState(() => _naoVistasCriticas = c); }), adminOnly: true),
      _NavItem('Historico', Icons.history_outlined,
          () => const HistoricoAlteracoesScreen(),
          adminOnly: true),
      _NavItem('Erros do App', Icons.warning_amber_outlined,
          () => const AppErrosScreen(),
          adminOnly: true),
      _NavItem('Configuracoes', Icons.settings_outlined,
          () => const ConfiguracoesScreen()),
    ];
    AppState.instance.auth.filialAtualNotifier
        .addListener(_onFilialAtualChanged);
    _loadAppVersionLabel();
    _refreshPendentes();
    _startAutoSync();
    _startConnectivityWatcher();
    _checkAppUpdate();
    _refreshNotificacoesCriticas(checkTanques: true);
  }

  Future<void> _loadAppVersionLabel() async {
    try {
      final info = await PackageInfo.fromPlatform();
      final version = info.version.trim();
      final build = info.buildNumber.trim();
      final base = build.isEmpty ? version : '$version+$build';
      if (mounted) setState(() => _appVersionLabel = base);
    } catch (_) {}
  }

  /// Consulta o endpoint público /app-update e, se a versão publicada for
  /// mais nova que a instalada, exibe o banner de atualização.
  Future<void> _checkAppUpdate() async {
    try {
      final info = await PackageInfo.fromPlatform();
      final instalado = int.tryParse(info.buildNumber.trim()) ?? 0;
      final resp = await AppState.instance.api.get('/app-update');
      if (resp is! Map) return;
      final publicado =
          int.tryParse('${resp['latest_version_code'] ?? ''}') ?? 0;
      if (publicado <= instalado) return;
      if (!mounted) return;
      setState(() {
        _updateInfo = {
          'version_name': '${resp['latest_version_name'] ?? ''}',
          'apk_url': '${resp['apk_url'] ?? ''}',
          'required': resp['required'] == true,
          'message': '${resp['message'] ?? 'Nova versão disponível.'}',
        };
      });
    } catch (_) {
      // Sem internet ou endpoint indisponível: segue sem banner.
    }
  }

  Future<void> _baixarAtualizacao() async {
    final url = (_updateInfo?['apk_url'] as String?) ?? '';
    if (url.isEmpty) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
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
      _screenCache.clear();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _loadAppVersionLabel();
      _syncPendentesSeOnline();
      _refreshNotificacoesCriticas(checkTanques: false);
    }
  }

  Future<void> _refreshNotificacoesCriticas({bool checkTanques = false}) async {
    if (!Roles.isAdmin(AppState.instance.auth.tipo)) return;
    try {
      if (checkTanques) {
        unawaited(verificarTanquesTodasFiliaisAdmin(AppState.instance));
      }
      final count = await verificarNotificacoesCriticasAdmin(
        AppState.instance,
        checkTanques: checkTanques,
      );
      if (mounted) setState(() => _naoVistasCriticas = count);
    } catch (_) {}
  }

  Future<void> _refreshPendentes() async {
    final c = await AppState.instance.db.pendingCount();
    if (mounted) setState(() => _pendentes = c);
  }

  List<_NavItem> get _visibleItems {
    final tipo = AppState.instance.auth.tipo;
    return _items.where((i) {
      if (i.adminOnly && !Roles.isAdmin(tipo)) return false;
      if (i.operationalOnly && !Roles.canCreate(tipo)) return false;
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
    // O timer só verifica o relógio local. A rede é acessada no máximo uma vez
    // por hora, salvo quando o usuário toca no botão Sincronizar.
    _autoSyncTimer = Timer.periodic(const Duration(minutes: 5), (_) async {
      await _syncPendentesSeOnline();
    });
  }

  Future<bool> _automaticSyncIsDue() async {
    final prefs = await SharedPreferences.getInstance();
    final lastMillis = prefs.getInt(_lastSyncKey);
    if (lastMillis == null) return true;
    final last = DateTime.fromMillisecondsSinceEpoch(lastMillis);
    return DateTime.now().difference(last) >= _automaticSyncInterval;
  }

  Future<void> _rememberSyncAttempt() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_lastSyncKey, DateTime.now().millisecondsSinceEpoch);
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
    if (!await _automaticSyncIsDue()) return;
    await _refreshPendentes();
    unawaited(_refreshNotificacoesCriticas(checkTanques: true));
    if (!mounted || _syncing || !_online) return;
    // Roda o sync silencioso mesmo sem pendências de envio: o download
    // incremental é barato (sync_token) e é ele que traz os registros novos
    // — inclusive os que disparam a notificação de novo abastecimento para
    // administradores.
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

  Future<void> _sync({
    bool silent = false,
    bool forceFull = false,
  }) async {
    if (_syncing) return;
    final onlineNow = await _verificarOnline();
    if (!onlineNow) {
      await _refreshPendentes();
    unawaited(_refreshNotificacoesCriticas(checkTanques: true));
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

    // Tanto a sincronização automática quanto a manual reiniciam a janela de
    // uma hora. Gravamos antes da chamada para evitar rajadas em caso de erro.
    await _rememberSyncAttempt();

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
      _screenCache.clear();
    });
    await _refreshPendentes();
    unawaited(_refreshNotificacoesCriticas(checkTanques: true));

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
          if (_pendentes > 0)
            InkWell(
              borderRadius: BorderRadius.circular(999),
              onTap: () async {
                await Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const SyncLogsScreen()),
                );
                await _refreshPendentes();
    unawaited(_refreshNotificacoesCriticas(checkTanques: true));
              },
              child: _PendingIcon(count: _pendentes),
            ),
          if (!_online)
            const Tooltip(
              message: 'Sem conexao - trabalhando offline',
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: 4),
                child: Icon(Icons.cloud_off_outlined, color: AppTheme.warning),
              ),
            ),
          if (Roles.isAdmin(AppState.instance.auth.tipo))
            IconButton(
              tooltip: 'Notificações Críticas (Admin)',
              onPressed: () async {
                await Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => NotificacoesCriticasScreen(
                      standalone: true,
                      onUnreadCountChanged: (c) {
                        if (mounted) setState(() => _naoVistasCriticas = c);
                      },
                    ),
                  ),
                );
                await _refreshNotificacoesCriticas(checkTanques: false);
              },
              icon: Badge(
                isLabelVisible: _naoVistasCriticas > 0,
                backgroundColor: const Color(0xFFDC2626),
                label: Text(
                  _naoVistasCriticas > 99 ? '99+' : '$_naoVistasCriticas',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                child: Icon(
                  _naoVistasCriticas > 0
                      ? Icons.notifications_active
                      : Icons.notifications_outlined,
                ),
              ),
            ),
          _FilialSwitcher(
            filialAtual: filialAtual,
            filiais: AppState.instance.auth.filiaisAcesso,
            onChanged: _trocarFilial,
          ),
          IconButton(
            tooltip: 'Sincronizar',
            onPressed: _syncing ? null : () => _sync(forceFull: false),
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
              if (v == 'logout') await _logout();
              if (v == 'reset') await _confirmReset();
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'reset', child: Text('Limpar cache local')),
              PopupMenuItem(value: 'logout', child: Text('Sair')),
            ],
          ),
        ],
      ),
      drawer: _buildDrawer(items),
      body: Column(
        children: [
          if (_updateInfo != null)
            MaterialBanner(
              backgroundColor: const Color(0xFFFFF7E0),
              leading: const Icon(Icons.system_update, color: AppTheme.warning),
              content: Text(
                'Versão ${_updateInfo!['version_name']} disponível. '
                '${_updateInfo!['message']}',
                style: const TextStyle(fontSize: 13),
              ),
              actions: [
                if (_updateInfo!['required'] != true)
                  TextButton(
                    onPressed: () => setState(() => _updateInfo = null),
                    child: const Text('Depois'),
                  ),
                FilledButton(
                  onPressed: _baixarAtualizacao,
                  child: const Text('Baixar'),
                ),
              ],
            ),
          if (_syncing) _SyncBar(message: _syncMsg),
          Expanded(
            child: IndexedStack(
              index: _index,
              children: items
                  .map((i) => _screenFor(i, active: i.label == current.label))
                  .toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _screenFor(_NavItem item, {required bool active}) {
    final cached = _screenCache[item.label];
    if (cached != null) return cached;
    if (!active) return const SizedBox.shrink();

    final screen = KeyedSubtree(
      key: ValueKey('${item.label}-$_filialVersion'),
      child: item.build(),
    );
    _screenCache[item.label] = screen;
    return screen;
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
    unawaited(_refreshNotificacoesCriticas(checkTanques: true));
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
