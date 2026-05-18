import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import 'abastecimentos/list_screen.dart';
import 'baixa_screen.dart';
import 'dashboard_screen.dart';
import 'entrada_notas_screen.dart';
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
  _NavItem(this.label, this.icon, this.build, {this.adminOnly = false});
}

class ShellScreen extends StatefulWidget {
  const ShellScreen({super.key});

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen>
    with WidgetsBindingObserver {
  int _index = 0;
  bool _syncing = false;
  String _syncMsg = '';
  int _pendentes = 0;
  Timer? _autoSyncTimer;

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
      _NavItem('Dashboard', Icons.dashboard_outlined, () => const DashboardScreen(),
          adminOnly: true),
      _NavItem('Abastecimentos', Icons.local_gas_station_outlined,
          () => const AbastecimentosListScreen()),
      _NavItem('Baixa em Lote', Icons.price_check_outlined,
          () => const BaixaScreen(), adminOnly: true),
      _NavItem('Entrada de Notas', Icons.receipt_long_outlined,
          () => const EntradaNotasScreen()),
      _NavItem('Relatorios', Icons.assessment_outlined,
          () => const RelatoriosScreen(), adminOnly: true),
      _NavItem('Precos', Icons.attach_money, () => const PrecosScreen(),
          adminOnly: true),
      _NavItem('Proprietarios', Icons.groups_outlined,
          () => const ProprietariosScreen()),
      _NavItem('Veiculos', Icons.directions_car_outlined,
          () => const VeiculosScreen()),
      _NavItem('Motoristas', Icons.badge_outlined, () => const MotoristasScreen()),
      _NavItem('Usuarios', Icons.admin_panel_settings_outlined,
          () => const UsuariosScreen(), adminOnly: true),
    ];
    _refreshPendentes();
    _startAutoSync();
    _startConnectivityWatcher();
  }

  @override
  void dispose() {
    _autoSyncTimer?.cancel();
    _connSub?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _sync(silent: true);
    }
  }

  Future<void> _refreshPendentes() async {
    final c = await AppState.instance.db.pendingCount();
    if (mounted) setState(() => _pendentes = c);
  }

  List<_NavItem> get _visibleItems {
    final tipo = AppState.instance.auth.tipo;
    return _items.where((i) => !i.adminOnly || Roles.isAdmin(tipo)).toList();
  }

  void _startAutoSync() {
    _sync(silent: true);
    _autoSyncTimer?.cancel();
    // 3 minutos: economiza bateria e ainda mantem backlog drenando
    _autoSyncTimer = Timer.periodic(const Duration(minutes: 3), (_) async {
      if (!mounted || _syncing) return;
      if (!_online) return;
      if (_pendentes > 0) {
        await _sync(silent: true);
      }
    });
  }

  /// Escuta mudancas de conectividade: quando o dispositivo sai de "sem rede"
  /// para "com rede", dispara uma sync silenciosa imediata.
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
      // voltou a ter rede -> sincroniza se ha pendentes ou esta idle
      if (!wasOnline && nowOnline && !_syncing) {
        await _sync(silent: true);
      }
    });
  }

  bool _anyOnline(List<ConnectivityResult> results) {
    return results.any((r) =>
        r == ConnectivityResult.wifi ||
        r == ConnectivityResult.mobile ||
        r == ConnectivityResult.ethernet ||
        r == ConnectivityResult.vpn);
  }

  Future<void> _sync({bool silent = false, bool forceFull = false}) async {
    if (_syncing) return;
    setState(() {
      _syncing = true;
      _syncMsg = 'Iniciando sincronizacao...';
    });

    final result = await AppState.instance.sync.run(
      forceFull: forceFull,
      onProgress: (m) {
      if (mounted) setState(() => _syncMsg = m);
      },
    );

    if (!mounted) return;
    setState(() {
      _syncing = false;
      _syncMsg = '';
    });
    await _refreshPendentes();

    final shouldNotify = !silent || !result.success || result.enviados > 0;
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
      await _logout();
    }
  }

  bool _isAuthError(String msg) {
    final m = msg.toLowerCase();
    return m.contains('token') ||
        m.contains('unauthenti') ||
        m.contains('unauthorized') ||
        m.contains('401');
  }

  Future<void> _logout() async {
    await AppState.instance.auth.clear();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final items = _visibleItems;
    final current = items[_index];

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Text(current.label),
            if (_pendentes > 0) ...[
              const SizedBox(width: 10),
              _PendingBadge(count: _pendentes),
            ],
            if (!_online) ...[
              const SizedBox(width: 10),
              Tooltip(
                message: 'Sem conexao - trabalhando offline',
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: Colors.black26,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.cloud_off, size: 14, color: Colors.white70),
                    SizedBox(width: 4),
                    Text('offline',
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.white70,
                          fontWeight: FontWeight.w600,
                        )),
                  ]),
                ),
              ),
            ],
          ],
        ),
        actions: [
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
          if (_syncing) _SyncBar(message: _syncMsg),
          Expanded(
            child: IndexedStack(
              index: _index,
              children: items.map((i) => i.build()).toList(),
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
                        color: selected
                            ? AppTheme.primary
                            : AppTheme.textMuted),
                    title: Text(it.label,
                        style: TextStyle(
                          color: selected ? AppTheme.primary : null,
                          fontWeight: selected
                              ? FontWeight.w700
                              : FontWeight.w500,
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
              leading: const Icon(Icons.bug_report_outlined, color: AppTheme.warning),
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
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Cache local limpo.')),
      );
    }
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

class _PendingBadge extends StatelessWidget {
  final int count;
  const _PendingBadge({required this.count});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppTheme.warning,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        '$count pendente${count == 1 ? '' : 's'}',
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: Colors.black,
        ),
      ),
    );
  }
}
