import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';

class NotificacoesCriticasScreen extends StatefulWidget {
  final bool standalone;
  final void Function(int naoVistasCount)? onUnreadCountChanged;

  const NotificacoesCriticasScreen({
    super.key,
    this.standalone = false,
    this.onUnreadCountChanged,
  });

  @override
  State<NotificacoesCriticasScreen> createState() =>
      _NotificacoesCriticasScreenState();
}

class _NotificacoesCriticasScreenState
    extends State<NotificacoesCriticasScreen> {
  bool _loading = true;
  bool _marcandoTodas = false;
  String _statusLeitura = 'todas';
  String _categoria = '';
  String _local = '';
  int _naoVistasCount = 0;
  List<Map<String, dynamic>> _items = [];

  static const _categorias = [
    ['', 'Todas as categorias'],
    ['abastecimentos', 'Abastecimentos'],
    ['tanques_estoque', 'Tanques e Estoque'],
    ['financeiro', 'Financeiro e Baixas'],
    ['cadastros_integracoes', 'Cadastros, Usuários e Atua'],
  ];

  static const _locais = [
    ['', 'Todas as filiais'],
    ['Matriz', 'Matriz'],
    ['Viana', 'Viana'],
    ['Geral', 'Geral'],
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() => _loading = true);
    try {
      final query = <String, dynamic>{
        'per_page': 50,
        'status_leitura': _statusLeitura,
        if (_categoria.isNotEmpty) 'categoria': _categoria,
        if (_local.isNotEmpty) 'local': _local,
      };
      final resp = await AppState.instance.api.get(
        '/notificacoes-criticas',
        query: query,
      );
      if (!mounted) return;

      final rawList = resp is Map ? (resp['data'] as List? ?? const []) : const [];
      final naoVistas = resp is Map
          ? (int.tryParse('${resp['nao_vistas_count'] ?? 0}') ?? 0)
          : 0;

      setState(() {
        _items = rawList
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _naoVistasCount = naoVistas;
        _loading = false;
      });
      widget.onUnreadCountChanged?.call(naoVistas);
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao carregar notificações críticas: $e'),
          backgroundColor: AppTheme.danger,
        ),
      );
    }
  }

  Future<void> _marcarUmaComoVista(Map<String, dynamic> item) async {
    final id = int.tryParse('${item['id'] ?? 0}') ?? 0;
    if (id <= 0 || item['vista_por_mim'] == true) return;

    try {
      final resp = await AppState.instance.api.post(
        '/notificacoes-criticas/$id/marcar-vista',
        {'dispositivo': 'APK Android'},
      );
      if (!mounted) return;
      final vistaEm = resp is Map
          ? '${resp['vista_em'] ?? DateTime.now().toIso8601String()}'
          : DateTime.now().toIso8601String();
      final meuNome =
          AppState.instance.auth.nome ?? AppState.instance.auth.login ?? 'Admin';
      final meuLogin = AppState.instance.auth.login ?? meuNome;

      setState(() {
        item['vista_por_mim'] = true;
        item['minha_leitura_em'] = vistaEm;
        item['vista_em'] ??= vistaEm;
        item['vista_por_nome'] ??= meuNome;
        final leituras = List<Map<String, dynamic>>.from(
          (item['leituras'] as List? ?? const [])
              .whereType<Map>()
              .map((x) => Map<String, dynamic>.from(x)),
        );
        leituras.add({
          'usuario_nome': meuNome,
          'usuario_login': meuLogin,
          'dispositivo': 'APK Android',
          'vista_em': vistaEm,
        });
        item['leituras'] = leituras;
        if (_naoVistasCount > 0) _naoVistasCount--;
      });
      widget.onUnreadCountChanged?.call(_naoVistasCount);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Não foi possível registrar visualização: $e'),
          backgroundColor: AppTheme.danger,
        ),
      );
    }
  }

  Future<void> _marcarTodasComoVistas() async {
    if (_marcandoTodas || _naoVistasCount == 0) return;
    setState(() => _marcandoTodas = true);
    try {
      await AppState.instance.api.post(
        '/notificacoes-criticas/marcar-vistas',
        {'todas': true, 'dispositivo': 'APK Android'},
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
              'Todas as notificações críticas foram registradas como vistas.'),
          backgroundColor: AppTheme.success,
        ),
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao marcar todas como vistas: $e'),
          backgroundColor: AppTheme.danger,
        ),
      );
    } finally {
      if (mounted) setState(() => _marcandoTodas = false);
    }
  }

  void _abrirDetalhes(Map<String, dynamic> item) {
    if (item['vista_por_mim'] != true) {
      _marcarUmaComoVista(item);
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) {
        final leituras = (item['leituras'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        final prioridade =
            '${item['prioridade'] ?? 'critica'}'.toLowerCase() == 'critica'
                ? 'CRÍTICA'
                : 'ALTA';
        final isCrit = prioridade == 'CRÍTICA';

        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: isCrit
                              ? const Color(0xFFFEE2E2)
                              : const Color(0xFFFEF3C7),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          prioridade,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: isCrit
                                ? const Color(0xFFDC2626)
                                : const Color(0xFFB45309),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      if (item['local'] != null)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: const Color(0xFFE0E7FF),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            'Filial: ${item['local']}',
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF1E40AF),
                            ),
                          ),
                        ),
                      const Spacer(),
                      IconButton(
                        onPressed: () => Navigator.of(ctx).pop(),
                        icon: const Icon(Icons.close),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${item['titulo'] ?? 'Alerta Crítico'}',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${item['mensagem'] ?? ''}',
                    style: const TextStyle(fontSize: 14, height: 1.4),
                  ),
                  const SizedBox(height: 12),
                  const Divider(),
                  _infoLine(
                    'Data/Hora do Evento',
                    item['created_at'] != null
                        ? AppDates.formatDateTimeBr('${item['created_at']}')
                        : '-',
                  ),
                  _infoLine(
                    'Autor da Ação',
                    '${item['autor_nome'] ?? 'Sistema'}',
                  ),
                  if (item['tabela_origem'] != null)
                    _infoLine(
                      'Origem / Registro',
                      '${item['tabela_origem']} (${item['registro_id'] ?? '-'})',
                    ),
                  const SizedBox(height: 12),
                  const Text(
                    'REGISTRO DE VISUALIZAÇÃO (ADMINISTRADORES)',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: AppTheme.textMuted,
                    ),
                  ),
                  const SizedBox(height: 6),
                  if (leituras.isEmpty)
                    const Text(
                      'Registrando sua visualização...',
                      style: TextStyle(fontSize: 13, color: AppTheme.textMuted),
                    )
                  else
                    ...leituras.map((l) {
                      final nome = '${l['usuario_nome'] ?? 'Admin'}';
                      final login = '${l['usuario_login'] ?? ''}';
                      final quando = l['vista_em'] != null
                          ? AppDates.formatDateTimeBr('${l['vista_em']}')
                          : '-';
                      return Container(
                        margin: const EdgeInsets.only(bottom: 6),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 8),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF0FDF4),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFFBBF7D0)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.visibility,
                                size: 16, color: Color(0xFF15803D)),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                '$nome${login.isNotEmpty && login != nome ? ' ($login)' : ''} • Visto em $quando',
                                style: const TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF166534),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _infoLine(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 140,
            child: Text(
              '$label:',
              style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: AppTheme.textMuted,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    final auth = AppState.instance.auth;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          // Resumo do usuário logado e contador de não vistas
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: _naoVistasCount > 0
                  ? const Color(0xFFFEF2F2)
                  : const Color(0xFFF0FDF4),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: _naoVistasCount > 0
                    ? const Color(0xFFFECACA)
                    : const Color(0xFFBBF7D0),
              ),
            ),
            child: Row(
              children: [
                Icon(
                  _naoVistasCount > 0
                      ? Icons.notification_important
                      : Icons.verified_user_outlined,
                  color: _naoVistasCount > 0
                      ? const Color(0xFFDC2626)
                      : const Color(0xFF15803D),
                  size: 28,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _naoVistasCount > 0
                            ? '$_naoVistasCount notificação(ões) crítica(s) não vista(s)'
                            : 'Todas as notificações críticas foram vistas',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 13.5,
                          color: _naoVistasCount > 0
                              ? const Color(0xFF991B1B)
                              : const Color(0xFF166534),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Logado como: ${auth.nome ?? auth.login ?? 'Admin'} (todas as filiais monitoradas)',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppTheme.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                if (_naoVistasCount > 0)
                  FilledButton.icon(
                    onPressed: _marcandoTodas ? null : _marcarTodasComoVistas,
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFFDC2626),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 8),
                    ),
                    icon: const Icon(Icons.done_all, size: 16),
                    label: Text(
                      _marcandoTodas ? '...' : 'Ler todas',
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 10),

          // Filtros de leitura
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _buildStatusChip('todas', 'Todas'),
                const SizedBox(width: 6),
                _buildStatusChip('nao_vistas', 'Não vistas por mim'),
                const SizedBox(width: 6),
                _buildStatusChip('vistas', 'Já vistas'),
              ],
            ),
          ),
          const SizedBox(height: 10),

          // Filtros de Categoria e Filial
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _categoria,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Categoria',
                    isDense: true,
                  ),
                  items: _categorias
                      .map((c) => DropdownMenuItem(
                            value: c[0],
                            child: Text(
                              c[1],
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 13),
                            ),
                          ))
                      .toList(),
                  onChanged: (v) {
                    setState(() => _categoria = v ?? '');
                    _load();
                  },
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 145,
                child: DropdownButtonFormField<String>(
                  value: _local,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Filial',
                    isDense: true,
                  ),
                  items: _locais
                      .map((l) => DropdownMenuItem(
                            value: l[0],
                            child: Text(
                              l[1],
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 13),
                            ),
                          ))
                      .toList(),
                  onChanged: (v) {
                    setState(() => _local = v ?? '');
                    _load();
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          if (_loading)
            const Padding(
              padding: EdgeInsets.all(36),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_items.isEmpty)
            const Padding(
              padding: EdgeInsets.all(36),
              child: Center(
                child: Text(
                  'Nenhuma notificação crítica encontrada para este filtro.',
                  style: TextStyle(color: AppTheme.textMuted),
                ),
              ),
            )
          else
            ..._items.map(_buildCard),
        ],
      ),
    );
  }

  Widget _buildStatusChip(String value, String label) {
    final selected = _statusLeitura == value;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) {
        setState(() => _statusLeitura = value);
        _load();
      },
    );
  }

  Widget _buildCard(Map<String, dynamic> item) {
    final vistaPorMim = item['vista_por_mim'] == true;
    final prioridade =
        '${item['prioridade'] ?? 'critica'}'.toLowerCase() == 'critica'
            ? 'CRÍTICA'
            : 'ALTA';
    final isCrit = prioridade == 'CRÍTICA';
    final leituras = (item['leituras'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();

    final minhaLeituraFmt = item['minha_leitura_em'] != null
        ? AppDates.formatDateTimeBr('${item['minha_leitura_em']}')
        : null;

    final resumoLeituras = leituras.map((l) {
      final quem = '${l['usuario_nome'] ?? 'Admin'}';
      final dt = l['vista_em'] != null
          ? AppDates.formatDateTimeBr('${l['vista_em']}')
          : '';
      return dt.isNotEmpty ? '$quem ($dt)' : quem;
    }).join(' • ');

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      elevation: vistaPorMim ? 0.5 : 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: vistaPorMim
              ? const Color(0xFFE2E8F0)
              : (isCrit ? const Color(0xFFEF4444) : const Color(0xFFF59E0B)),
          width: vistaPorMim ? 1 : 1.5,
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _abrirDetalhes(item),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(
                      color: isCrit
                          ? const Color(0xFFFEE2E2)
                          : const Color(0xFFFEF3C7),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      prioridade,
                      style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w800,
                        color: isCrit
                            ? const Color(0xFFDC2626)
                            : const Color(0xFFB45309),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  if (item['local'] != null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        '${item['local']}',
                        style: const TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF334155),
                        ),
                      ),
                    ),
                  const SizedBox(width: 6),
                  if (!vistaPorMim)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFFDC2626),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text(
                        'NOVA',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  const Spacer(),
                  if (item['created_at'] != null)
                    Text(
                      AppDates.formatDateTimeBr('${item['created_at']}'),
                      style: const TextStyle(
                        fontSize: 11.5,
                        color: AppTheme.textMuted,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                '${item['titulo'] ?? 'Alerta Crítico'}',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: vistaPorMim ? FontWeight.w700 : FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${item['mensagem'] ?? ''}',
                style: const TextStyle(fontSize: 13, height: 1.35),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: vistaPorMim
                        ? Row(
                            children: [
                              const Icon(Icons.done_all,
                                  size: 15, color: Color(0xFF15803D)),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(
                                  resumoLeituras.isNotEmpty
                                      ? 'Visto por: $resumoLeituras'
                                      : 'Vista por você em ${minhaLeituraFmt ?? '-'}',
                                  style: const TextStyle(
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xFF15803D),
                                  ),
                                ),
                              ),
                            ],
                          )
                        : Text(
                            leituras.isNotEmpty
                                ? 'Já visto por: $resumoLeituras'
                                : 'Ainda não visualizada',
                            style: const TextStyle(
                              fontSize: 11.5,
                              color: AppTheme.textMuted,
                            ),
                          ),
                  ),
                  if (!vistaPorMim)
                    TextButton.icon(
                      onPressed: () => _marcarUmaComoVista(item),
                      style: TextButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                      ),
                      icon: const Icon(Icons.visibility_outlined, size: 16),
                      label: const Text(
                        'Marcar vista',
                        style: TextStyle(fontSize: 12),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.standalone) {
      return _buildBody();
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notificações Críticas (Admin)'),
        actions: [
          IconButton(
            tooltip: 'Atualizar',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _buildBody(),
    );
  }
}
