import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api_client.dart';
import '../core/app_state.dart';
import '../core/cached_remote_image.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../core/models.dart';
import '../widgets/common.dart';
import '../widgets/empresa_picker.dart';

class NovaBaixaComprovanteScreen extends StatefulWidget {
  final List<String>? initialSharedFiles;
  const NovaBaixaComprovanteScreen({super.key, this.initialSharedFiles});

  @override
  State<NovaBaixaComprovanteScreen> createState() =>
      _NovaBaixaComprovanteScreenState();
}

class _NovaBaixaComprovanteScreenState
    extends State<NovaBaixaComprovanteScreen> {
  bool _loading = true;
  bool _uploading = false;
  bool _mostrarAplicados = false;
  List<Proprietario> _proprietarios = [];
  List<Map<String, dynamic>> _comprovantes = [];
  final Map<String, _GrupoState> _states = {};

  bool get _isAdmin => Roles.isAdmin(AppState.instance.auth.tipo);

  @override
  void initState() {
    super.initState();
    _load().then((_) {
      if (widget.initialSharedFiles != null &&
          widget.initialSharedFiles!.isNotEmpty) {
        _processarArquivos(widget.initialSharedFiles!);
      }
    });
  }

  Future<void> _load({bool notify = false}) async {
    setState(() => _loading = true);
    try {
      final props = await AppState.instance.db.listProprietarios(
        local: AppState.instance.auth.filialAtual,
      );
      final comps = await AppState.instance.api.getPaginated(
        '/comprovantes-pagamento',
        query: _mostrarAplicados ? {} : {'apenas_pendentes': 1},
        perPage: 50,
      );
      final lista = comps
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      if (!mounted) return;
      setState(() {
        _proprietarios = props;
        _comprovantes = lista;
        _ensureStates();
        _loading = false;
      });
      _carregarPendentesDosGrupos();
      if (notify && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('${lista.length} comprovante(s) carregado(s).'),
          backgroundColor: AppTheme.success,
        ));
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro ao carregar comprovantes: $e'),
        backgroundColor: AppTheme.danger,
      ));
    }
  }

  void _ensureStates() {
    for (final grupo in _grupos()) {
      final atual = _states[grupo.chave];
      if (atual == null) {
        _states[grupo.chave] = _GrupoState(
          proprietarioId: grupo.proprietarioId,
          proprietarioNome: grupo.proprietarioNome,
          busca: grupo.proprietarioNome ?? '',
          dataPagamento: _dataGrupo(grupo.comprovantes) ?? AppDates.todayIso(),
        );
      } else {
        atual.proprietarioId = grupo.proprietarioId;
        atual.proprietarioNome = grupo.proprietarioNome;
      }
    }
  }

  List<_GrupoComprovante> _grupos() {
    final mapa = <String, _GrupoComprovante>{};
    for (final comp in _comprovantes) {
      final isolado = _bool(comp['isolado']);
      final propId = comp['proprietario_id']?.toString();
      final status = comp['status']?.toString() ?? 'pendente';
      final nota = comp['nota_entrada']?.toString() ?? '';
      // Aplicados precisam permanecer separados por baixa. Sem isso, um
      // aplicado e um pendente do mesmo proprietário viram uma única caixa.
      final chave = isolado || propId == null || propId.isEmpty
          ? 'comp:${comp['id']}'
          : status == 'aplicado'
              ? 'aplicado:$propId:$nota'
              : 'pendente:$propId';
      mapa.putIfAbsent(
        chave,
        () => _GrupoComprovante(
          chave: chave,
          proprietarioId: propId,
          proprietarioNome: comp['proprietario_nome']?.toString(),
          remetente: comp['remetente_extraido']?.toString(),
          comprovantes: [],
        ),
      );
      mapa[chave]!.comprovantes.add(comp);
    }
    final grupos = mapa.values.toList();
    grupos.sort((a, b) {
      final ap = a.proprietarioNome ?? a.remetente ?? '';
      final bp = b.proprietarioNome ?? b.remetente ?? '';
      return ap.toLowerCase().compareTo(bp.toLowerCase());
    });
    return grupos;
  }

  void _carregarPendentesDosGrupos() {
    for (final grupo in _grupos()) {
      final state = _states[grupo.chave];
      if (state?.proprietarioId?.isNotEmpty == true &&
          !state!.confirmado &&
          state.pendentes.isEmpty &&
          !state.carregandoPendentes) {
        _carregarPendentes(grupo.chave);
      }
    }
  }

  Future<void> _processarArquivos(List<String> paths) async {
    if (paths.isEmpty) return;
    setState(() => _uploading = true);
    var enviados = 0;
    var falhas = 0;
    final arquivosComFalha = <String>[];
    try {
      for (final path in paths) {
        try {
          final upload = await AppState.instance.api.uploadDriveDireto(path);
          final file = upload is Map ? upload['file'] : null;
          final arquivoUrl = file is Map
              ? '${file['downloadUrl'] ?? ''}'
              : '${upload is Map ? upload['url'] ?? '' : ''}';
          if (arquivoUrl.isEmpty) {
            throw Exception('Upload concluído sem URL do comprovante.');
          }
          await AppState.instance.api.post('/comprovantes-pagamento', {
            'arquivo_url': arquivoUrl,
          });
          enviados++;
        } catch (_) {
          falhas++;
          arquivosComFalha.add(path.split(RegExp(r'[/\\]')).last);
        }
      }
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(falhas > 0
            ? '$enviados enviado(s), $falhas falha(s): ${arquivosComFalha.join(', ')}'
            : '$enviados comprovante(s) enviado(s).'),
        backgroundColor: falhas > 0 ? AppTheme.warning : AppTheme.success,
      ));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _selecionarArquivos() async {
    final result = await FilePicker.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    );
    if (result == null || result.files.isEmpty) return;
    final paths = result.files.map((f) => f.path).whereType<String>().toList();
    await _processarArquivos(paths);
  }

  Future<void> _carregarPendentes(String chave) async {
    final state = _states[chave];
    if (state == null || state.proprietarioId == null) return;

    setState(() => state.carregandoPendentes = true);
    final ids = <String>[
      state.proprietarioId!,
      ...state.terceiros.map((e) => e.id),
    ].where((id) => id.isNotEmpty).toSet().toList();

    final mapa = <String, Map<String, dynamic>>{};
    try {
      for (final id in ids) {
        final resp = await AppState.instance.api.get(
          '/abastecimentos/filter/baixa-pendente',
          query: {
            'limit': 300,
            'id_proprietario': id,
            'local': AppState.instance.auth.filialAtual,
            if (state.filtroInicio.isNotEmpty)
              'data_inicio': state.filtroInicio,
            if (state.filtroFim.isNotEmpty) 'data_fim': state.filtroFim,
          },
        );
        if (resp is List) {
          for (final item in resp.whereType<Map>()) {
            final map = Map<String, dynamic>.from(item);
            final idAbast = map['id_abastecimento']?.toString();
            if (idAbast != null) mapa[idAbast] = map;
          }
        }
      }
      if (!mounted) return;
      setState(() {
        state.pendentes = mapa.values.toList();
        state.selecionados.clear();
        state.carregandoPendentes = false;
      });
      try {
        final credito = await AppState.instance.api
            .get('/proprietarios/${state.proprietarioId}/credito');
        if (mounted) {
          setState(() => state.saldoCredito =
              credito is Map ? _toDouble(credito['saldo']) : 0);
        }
      } catch (_) {
        if (mounted) setState(() => state.saldoCredito = 0);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => state.carregandoPendentes = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro ao carregar abastecimentos: $e'),
        backgroundColor: AppTheme.danger,
      ));
    }
  }

  Future<void> _atribuirProprietario(
    _GrupoComprovante grupo,
    Proprietario prop,
  ) async {
    final id = prop.idProprietario;
    if (id == null || id.isEmpty) return;

    try {
      for (final comp in grupo.comprovantes) {
        await AppState.instance.api.patch(
          '/comprovantes-pagamento/${comp['id']}',
          {'proprietario_id': id, 'salvar_alias': true},
        );
      }
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro ao vincular proprietário: $e'),
        backgroundColor: AppTheme.danger,
      ));
    }
  }

  Future<void> _adicionarTerceiro(String chave) async {
    final state = _states[chave];
    if (state == null) return;
    final result = await showEmpresaPicker(
      context,
      proprietarios: _proprietarios
          .where((p) =>
              p.idProprietario != state.proprietarioId &&
              !state.terceiros.any((t) => t.id == p.idProprietario))
          .toList(),
      titulo: 'Pagar terceiros',
    );
    if (result?.idProprietario == null) return;
    setState(() {
      state.terceiros.add(_Terceiro(
        id: result!.idProprietario!,
        nome: result.nome ?? 'Proprietário',
      ));
    });
    await _carregarPendentes(chave);
  }

  Future<void> _alterarFormaPagamento(
    Map<String, dynamic> comp,
    String forma,
  ) async {
    final anterior = comp['forma_pagamento']?.toString() ?? 'PIX';
    setState(() => comp['forma_pagamento'] = forma);
    try {
      await AppState.instance.api.patch(
        '/comprovantes-pagamento/${comp['id']}/forma-pagamento',
        {'forma_pagamento': forma},
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => comp['forma_pagamento'] = anterior);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro ao alterar forma de pagamento: $e'),
        backgroundColor: AppTheme.danger,
      ));
    }
  }

  Future<void> _verificarNovamente(_GrupoComprovante grupo) async {
    try {
      for (final comp in grupo.comprovantes) {
        await AppState.instance.api
            .post('/comprovantes-pagamento/${comp['id']}/verificar', {});
      }
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro ao verificar comprovante: $e'),
        backgroundColor: AppTheme.danger,
      ));
    }
  }

  Future<void> _separarOuDesvincular(Map<String, dynamic> comp) async {
    final aplicado = comp['status']?.toString() == 'aplicado';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
            aplicado ? 'Desvincular comprovante?' : 'Separar comprovante?'),
        content: Text(aplicado
            ? 'O comprovante volta para esta tela e, se for o último da baixa, os abastecimentos voltam para pendente.'
            : 'O comprovante será separado em uma caixa própria.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(aplicado ? 'Desvincular' : 'Separar')),
        ],
      ),
    );
    if (ok != true) return;

    try {
      await AppState.instance.api.post(
        '/comprovantes-pagamento/${comp['id']}/${aplicado ? 'desvincular' : 'isolar'}',
        {},
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro: $e'),
        backgroundColor: AppTheme.danger,
      ));
    }
  }

  Future<void> _excluirDefinitivo(Map<String, dynamic> comp) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Excluir comprovante?'),
        content: const Text('Essa ação remove o comprovante da fila.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Excluir')),
        ],
      ),
    );
    if (ok != true) return;

    await AppState.instance.api.delete('/comprovantes-pagamento/${comp['id']}');
    await _load();
  }

  void _selecionarTodos(_GrupoState state) {
    setState(() {
      state.selecionados = state.pendentes
          .map((a) => a['id_abastecimento']?.toString())
          .whereType<String>()
          .toSet();
    });
  }

  void _selecionarPorValor(_GrupoComprovante grupo, _GrupoState state) {
    final alvo = (_valorGrupo(grupo) * 100).round();
    final itens = state.pendentes
        .map((a) => _SubsetItem(
              id: a['id_abastecimento']?.toString() ?? '',
              cent: (_toDouble(a['valor_total']) * 100).round(),
            ))
        .where((i) => i.id.isNotEmpty && i.cent > 0)
        .toList();
    final ids = _encontrarCombinacao(itens, alvo);
    if (ids == null || ids.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Não encontrei combinação com o valor do comprovante.'),
        backgroundColor: AppTheme.warning,
      ));
      return;
    }
    setState(() => state.selecionados = ids.toSet());
  }

  List<String>? _encontrarCombinacao(List<_SubsetItem> itens, int alvoCent) {
    const tolerancia = 1;
    final ordenados = [...itens]..sort((a, b) => b.cent.compareTo(a.cent));
    final sufixo = List<int>.filled(ordenados.length + 1, 0);
    for (var i = ordenados.length - 1; i >= 0; i--) {
      sufixo[i] = sufixo[i + 1] + ordenados[i].cent;
    }
    List<int>? melhor;
    var tentativas = 0;

    bool buscar(int idx, int restante, List<int> escolhidos) {
      if (restante.abs() <= tolerancia) {
        melhor = [...escolhidos];
        return true;
      }
      if (idx >= ordenados.length || restante < -tolerancia) return false;
      if (sufixo[idx] < restante - tolerancia) return false;
      if (++tentativas > 200000) return false;
      escolhidos.add(idx);
      if (buscar(idx + 1, restante - ordenados[idx].cent, escolhidos)) {
        return true;
      }
      escolhidos.removeLast();
      return buscar(idx + 1, restante, escolhidos);
    }

    buscar(0, alvoCent, []);
    return melhor?.map((i) => ordenados[i].id).toList();
  }

  Future<void> _confirmarBaixa(
    _GrupoComprovante grupo,
    _GrupoState state,
  ) async {
    if (state.selecionados.isEmpty || state.proprietarioId == null) return;
    final total = _totalSelecionado(state);
    var v1 = _toDouble(state.valorRecebedor1);
    final v2 = _toDouble(state.valorRecebedor2);
    final abono = _toDouble(state.abonoDesconto);
    final creditoUsado = _toDouble(state.creditoUsado);
    if (v1 == 0 && v2 == 0 && abono == 0) v1 = total;

    if (creditoUsado > state.saldoCredito + 0.005) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
          'Crédito maior que o saldo disponível (${AppDates.money(state.saldoCredito)}).',
        ),
        backgroundColor: AppTheme.warning,
      ));
      return;
    }
    final falta = total - v1 - v2 - abono - creditoUsado;
    if (falta > 0.005) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Ainda falta cobrir ${AppDates.money(falta)}.'),
        backgroundColor: AppTheme.warning,
      ));
      return;
    }

    setState(() => state.confirmando = true);
    try {
      await AppState.instance.api
          .post('/comprovantes-pagamento/confirmar-grupo', {
        'comprovante_ids': grupo.comprovantes.map((c) => c['id']).toList(),
        'ids_abastecimentos': state.selecionados.toList(),
        'proprietarios_terceiros': state.terceiros.map((t) => t.id).toList(),
        'forma_pagamento': state.formaPagamento,
        'data_pagamento': state.dataPagamento.isNotEmpty
            ? state.dataPagamento
            : (_dataGrupo(grupo.comprovantes) ?? state.dataBaixa),
        'data_baixa': state.dataBaixa,
        'tipo_despesa': 'Combustível',
        'descricao':
            state.descricao.trim().isEmpty ? null : state.descricao.trim(),
        'recebedor': 'VIPE TRANSPORTES MULTIMODAIS LTDA',
        'recebedor2': v2 > 0 ? 'Augusto' : null,
        'valor_recebedor1': v1,
        'valor_recebedor2': v2,
        'abono_desconto': abono,
        'valor_recebido': v1 + v2,
        'credito_usado': creditoUsado,
        'observacao':
            state.observacao.trim().isEmpty ? null : state.observacao.trim(),
      });
      if (!mounted) return;
      setState(() {
        state.confirmado = true;
        state.confirmando = false;
      });
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Baixa aplicada com sucesso.'),
        backgroundColor: AppTheme.success,
      ));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => state.confirmando = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(e.message),
        backgroundColor: AppTheme.danger,
      ));
    } catch (e) {
      if (!mounted) return;
      setState(() => state.confirmando = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro ao confirmar baixa: $e'),
        backgroundColor: AppTheme.danger,
      ));
    }
  }

  Future<void> _abrirArquivo(Map<String, dynamic> comp) async {
    final url = comp['arquivo_url']?.toString();
    if (url == null || url.trim().isEmpty) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final grupos = _grupos();

    return RefreshIndicator(
      onRefresh: () => _load(notify: true),
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _uploading ? null : _selecionarArquivos,
                  icon: _uploading
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.upload_file),
                  label: Text(_uploading
                      ? 'Enviando...'
                      : 'Analisar comprovante(s) com IA'),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.outlined(
                tooltip: 'Atualizar',
                onPressed: () => _load(notify: true),
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
          if (_isAdmin)
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Mostrar aplicados'),
              value: _mostrarAplicados,
              onChanged: (v) {
                setState(() => _mostrarAplicados = v);
                _load();
              },
            ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              Chip(label: Text('${_comprovantes.length} comprovante(s)')),
              if (_comprovantes.isNotEmpty)
                Chip(
                    label:
                        Text('Total: ${AppDates.money(_totalComprovantes())}')),
            ],
          ),
          const SizedBox(height: 8),
          if (grupos.isEmpty)
            const EmptyState(
              icone: Icons.receipt_long_outlined,
              titulo: 'Nenhum comprovante processado',
              mensagem: 'Envie um comprovante ou toque em atualizar.',
            )
          else
            ...grupos.map((grupo) {
              final state = _states.putIfAbsent(
                grupo.chave,
                () => _GrupoState(
                  proprietarioId: grupo.proprietarioId,
                  proprietarioNome: grupo.proprietarioNome,
                  busca: grupo.proprietarioNome ?? '',
                ),
              );
              return _GrupoCard(
                grupo: grupo,
                state: state,
                proprietarios: _proprietarios,
                isAdmin: _isAdmin,
                onAbrir: _abrirArquivo,
                onAtribuir: (p) => _atribuirProprietario(grupo, p),
                onReprocessar: () => _verificarNovamente(grupo),
                onForma: _alterarFormaPagamento,
                onSeparar: _separarOuDesvincular,
                onExcluir: _excluirDefinitivo,
                onReloadPendentes: () => _carregarPendentes(grupo.chave),
                onAddTerceiro: () => _adicionarTerceiro(grupo.chave),
                onStateChanged: () => setState(() {}),
                onSelecionarTodos: () => _selecionarTodos(state),
                onSelecionarPorValor: () => _selecionarPorValor(grupo, state),
                onConfirmar: () => _confirmarBaixa(grupo, state),
              );
            }),
        ],
      ),
    );
  }

  double _totalComprovantes() =>
      _comprovantes.fold(0, (s, c) => s + _valorComprovante(c));
}

class _GrupoCard extends StatelessWidget {
  final _GrupoComprovante grupo;
  final _GrupoState state;
  final List<Proprietario> proprietarios;
  final bool isAdmin;
  final Future<void> Function(Map<String, dynamic>) onAbrir;
  final Future<void> Function(Proprietario) onAtribuir;
  final Future<void> Function() onReprocessar;
  final Future<void> Function(Map<String, dynamic>, String) onForma;
  final Future<void> Function(Map<String, dynamic>) onSeparar;
  final Future<void> Function(Map<String, dynamic>) onExcluir;
  final Future<void> Function() onReloadPendentes;
  final Future<void> Function() onAddTerceiro;
  final VoidCallback onStateChanged;
  final VoidCallback onSelecionarTodos;
  final VoidCallback onSelecionarPorValor;
  final Future<void> Function() onConfirmar;

  const _GrupoCard({
    required this.grupo,
    required this.state,
    required this.proprietarios,
    required this.isAdmin,
    required this.onAbrir,
    required this.onAtribuir,
    required this.onReprocessar,
    required this.onForma,
    required this.onSeparar,
    required this.onExcluir,
    required this.onReloadPendentes,
    required this.onAddTerceiro,
    required this.onStateChanged,
    required this.onSelecionarTodos,
    required this.onSelecionarPorValor,
    required this.onConfirmar,
  });

  @override
  Widget build(BuildContext context) {
    final confirmado =
        grupo.comprovantes.any((c) => c['status'] == 'aplicado') ||
            state.confirmado;
    final totalGrupo = _valorGrupo(grupo);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: grupo.comprovantes
                  .map((c) => _ComprovanteThumb(
                        comp: c,
                        onAbrir: () => onAbrir(c),
                        onForma: (forma) => onForma(c, forma),
                        onSeparar: () => onSeparar(c),
                        onExcluir: () => onExcluir(c),
                        isAdmin: isAdmin,
                      ))
                  .toList(),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(
                    state.proprietarioNome ??
                        grupo.proprietarioNome ??
                        'Proprietário não identificado',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                if (confirmado)
                  const Chip(
                    label: Text('Baixa aplicada'),
                    backgroundColor: Color(0xFFD1FAE5),
                  ),
              ],
            ),
            if (grupo.remetente != null)
              Text(
                'IA leu: ${grupo.remetente}',
                style: const TextStyle(color: AppTheme.textMuted),
              ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                Chip(label: Text('Total: ${AppDates.money(totalGrupo)}')),
                if (_dataGrupo(grupo.comprovantes) != null)
                  Chip(
                      label: Text(AppDates.formatDateBr(
                          _dataGrupo(grupo.comprovantes)))),
                if (grupo.comprovantes.first['confianca_ia'] != null)
                  Chip(
                    avatar: Icon(
                      _toDouble(grupo.comprovantes.first['confianca_ia']) < 0.7
                          ? Icons.warning_amber_outlined
                          : Icons.auto_awesome,
                      size: 18,
                    ),
                    label: Text(
                      'IA ${(_toDouble(grupo.comprovantes.first['confianca_ia']) * 100).round()}%',
                    ),
                    backgroundColor:
                        _toDouble(grupo.comprovantes.first['confianca_ia']) <
                                0.7
                            ? const Color(0xFFFEF3C7)
                            : null,
                  ),
                OutlinedButton.icon(
                  onPressed: () async {
                    final result = await showEmpresaPicker(
                      context,
                      proprietarios: proprietarios,
                      selecionado: state.proprietarioId,
                      titulo: 'Trocar proprietário',
                    );
                    final prop = proprietarios.firstWhere(
                      (p) => p.idProprietario == result?.idProprietario,
                      orElse: () => Proprietario(nome: ''),
                    );
                    if (prop.idProprietario != null) await onAtribuir(prop);
                  },
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Trocar'),
                ),
                OutlinedButton.icon(
                  onPressed: onReprocessar,
                  icon: const Icon(Icons.auto_fix_high_outlined),
                  label: const Text('Verificar novamente'),
                ),
              ],
            ),
            if (state.proprietarioId != null && !confirmado) ...[
              const Divider(height: 24),
              _PendentesToolbar(
                state: state,
                onChanged: onStateChanged,
                onReload: onReloadPendentes,
                onSelecionarTodos: onSelecionarTodos,
                onSelecionarPorValor:
                    totalGrupo > 0 ? onSelecionarPorValor : null,
              ),
              const SizedBox(height: 8),
              _TerceirosBox(
                state: state,
                onAdd: onAddTerceiro,
                onChanged: () {
                  onStateChanged();
                  onReloadPendentes();
                },
              ),
              if (state.carregandoPendentes)
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (state.pendentes.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: Text('Nenhum abastecimento pendente.')),
                )
              else
                ...state.pendentes.map(
                  (a) => _PendenteTile(
                    item: a,
                    selected: state.selecionados
                        .contains(a['id_abastecimento']?.toString()),
                    showProprietario: state.terceiros.isNotEmpty,
                    onTap: () {
                      final id = a['id_abastecimento']?.toString();
                      if (id == null) return;
                      state.selecionados.contains(id)
                          ? state.selecionados.remove(id)
                          : state.selecionados.add(id);
                      onStateChanged();
                    },
                  ),
                ),
              const SizedBox(height: 8),
              Text(
                '${state.selecionados.length} selecionado(s) · ${AppDates.money(_totalSelecionado(state))}',
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              _BaixaForm(state: state, onChanged: onStateChanged),
              const SizedBox(height: 10),
              FilledButton.icon(
                onPressed: state.selecionados.isEmpty || state.confirmando
                    ? null
                    : onConfirmar,
                icon: state.confirmando
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.check_circle_outline),
                label: Text(
                  state.confirmando
                      ? 'Aplicando baixa...'
                      : 'Confirmar baixa (${state.selecionados.length})',
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ComprovanteThumb extends StatelessWidget {
  final Map<String, dynamic> comp;
  final VoidCallback onAbrir;
  final ValueChanged<String> onForma;
  final VoidCallback onSeparar;
  final VoidCallback onExcluir;
  final bool isAdmin;

  const _ComprovanteThumb({
    required this.comp,
    required this.onAbrir,
    required this.onForma,
    required this.onSeparar,
    required this.onExcluir,
    required this.isAdmin,
  });

  @override
  Widget build(BuildContext context) {
    final tipo = comp['arquivo_tipo']?.toString();
    final url = comp['arquivo_url']?.toString() ?? '';
    final aplicado = comp['status']?.toString() == 'aplicado';
    final valor = _valorComprovante(comp);

    return SizedBox(
      width: 128,
      child: Column(
        children: [
          InkWell(
            onTap: onAbrir,
            borderRadius: BorderRadius.circular(10),
            child: Container(
              height: 96,
              width: 110,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                border: Border.all(color: AppTheme.border),
                borderRadius: BorderRadius.circular(10),
                color: AppTheme.surfaceAlt,
              ),
              child: tipo == 'image' && url.isNotEmpty
                  ? CachedRemoteImage(
                      url: url,
                      fit: BoxFit.cover,
                      error: const Icon(Icons.receipt_long_outlined),
                    )
                  : const Center(
                      child: Icon(Icons.picture_as_pdf_outlined, size: 34)),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            valor > 0 ? AppDates.money(valor) : 'sem valor',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 11,
              color: valor > 0 ? AppTheme.success : AppTheme.warning,
              fontWeight: FontWeight.w700,
            ),
          ),
          DropdownButton<String>(
            value: comp['forma_pagamento']?.toString().isNotEmpty == true
                ? comp['forma_pagamento'].toString()
                : 'PIX',
            isDense: true,
            items: _formasPagamento
                .map((f) => DropdownMenuItem(value: f, child: Text(f)))
                .toList(),
            onChanged: (v) {
              if (v != null) onForma(v);
            },
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(
                tooltip: aplicado ? 'Desvincular' : 'Separar',
                icon: Icon(aplicado ? Icons.undo : Icons.call_split, size: 18),
                onPressed: aplicado && !isAdmin ? null : onSeparar,
              ),
              IconButton(
                tooltip: 'Excluir',
                icon: const Icon(Icons.delete_outline, size: 18),
                onPressed: aplicado ? null : onExcluir,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PendentesToolbar extends StatelessWidget {
  final _GrupoState state;
  final VoidCallback onChanged;
  final VoidCallback onReload;
  final VoidCallback onSelecionarTodos;
  final VoidCallback? onSelecionarPorValor;

  const _PendentesToolbar({
    required this.state,
    required this.onChanged,
    required this.onReload,
    required this.onSelecionarTodos,
    required this.onSelecionarPorValor,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: onSelecionarPorValor,
              icon: const Icon(Icons.attach_money),
              label: const Text('Pelo valor'),
            ),
            OutlinedButton(
              onPressed: onSelecionarTodos,
              child: const Text('Todos'),
            ),
            OutlinedButton(
              onPressed: () {
                state.selecionados.clear();
                onChanged();
              },
              child: const Text('Limpar'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () async {
                  final p = await pickDateIso(
                    context,
                    initialIso: state.filtroInicio.isEmpty
                        ? AppDates.todayIso()
                        : state.filtroInicio,
                  );
                  if (p != null) {
                    state.filtroInicio = p;
                    onChanged();
                    onReload();
                  }
                },
                icon: const Icon(Icons.event_outlined),
                label: Text(state.filtroInicio.isEmpty
                    ? 'Data de'
                    : AppDates.formatDateBr(state.filtroInicio)),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () async {
                  final p = await pickDateIso(
                    context,
                    initialIso: state.filtroFim.isEmpty
                        ? AppDates.todayIso()
                        : state.filtroFim,
                  );
                  if (p != null) {
                    state.filtroFim = p;
                    onChanged();
                    onReload();
                  }
                },
                icon: const Icon(Icons.event_available_outlined),
                label: Text(state.filtroFim.isEmpty
                    ? 'Data até'
                    : AppDates.formatDateBr(state.filtroFim)),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _TerceirosBox extends StatelessWidget {
  final _GrupoState state;
  final Future<void> Function() onAdd;
  final VoidCallback onChanged;

  const _TerceirosBox({
    required this.state,
    required this.onAdd,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        border: Border.all(color: AppTheme.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Pagar terceiros',
            style: TextStyle(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              ...state.terceiros.map(
                (t) => Chip(
                  label: Text(t.nome),
                  onDeleted: () {
                    state.terceiros.removeWhere((x) => x.id == t.id);
                    onChanged();
                  },
                ),
              ),
              ActionChip(
                avatar: const Icon(Icons.add, size: 18),
                label: const Text('Adicionar'),
                onPressed: onAdd,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PendenteTile extends StatelessWidget {
  final Map<String, dynamic> item;
  final bool selected;
  final bool showProprietario;
  final VoidCallback onTap;

  const _PendenteTile({
    required this.item,
    required this.selected,
    required this.showProprietario,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final veiculo = item['veiculo'] is Map
        ? Map<String, dynamic>.from(item['veiculo'] as Map)
        : <String, dynamic>{};
    return Card(
      color: selected ? AppTheme.primary.withOpacity(0.08) : null,
      child: ListTile(
        onTap: onTap,
        leading: Icon(
          selected ? Icons.check_box : Icons.check_box_outline_blank,
          color: selected ? AppTheme.primary : AppTheme.textMuted,
        ),
        title: Text(
          '${veiculo['placa'] ?? item['placa'] ?? '—'} · ${AppDates.money(_toDouble(item['valor_total']))}',
        ),
        subtitle: Text([
          if (item['data'] != null)
            AppDates.formatDateBr(item['data']?.toString()),
          if (item['nome_motorista'] != null)
            'Motorista: ${item['nome_motorista']}',
          if (showProprietario && item['nome_proprietario'] != null)
            'Proprietário: ${item['nome_proprietario']}',
        ].join('\n')),
        isThreeLine: true,
      ),
    );
  }
}

class _BaixaForm extends StatelessWidget {
  final _GrupoState state;
  final VoidCallback onChanged;

  const _BaixaForm({required this.state, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final restante = _totalSelecionado(state) -
        _toDouble(state.valorRecebedor1) -
        _toDouble(state.valorRecebedor2) -
        _toDouble(state.abonoDesconto) -
        _toDouble(state.creditoUsado);
    return Column(
      children: [
        DropdownButtonFormField<String>(
          value: state.formaPagamento,
          decoration: const InputDecoration(labelText: 'Forma pagamento'),
          items: _formasPagamento
              .map((f) => DropdownMenuItem(value: f, child: Text(f)))
              .toList(),
          onChanged: (v) {
            state.formaPagamento = v ?? 'PIX';
            onChanged();
          },
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () async {
                  final p = await pickDateIso(context,
                      initialIso: state.dataPagamento);
                  if (p != null) {
                    state.dataPagamento = p;
                    onChanged();
                  }
                },
                icon: const Icon(Icons.event_outlined),
                label:
                    Text('Pgto: ${AppDates.formatDateBr(state.dataPagamento)}'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () async {
                  final p =
                      await pickDateIso(context, initialIso: state.dataBaixa);
                  if (p != null) {
                    state.dataBaixa = p;
                    onChanged();
                  }
                },
                icon: const Icon(Icons.event_available_outlined),
                label: Text('Baixa: ${AppDates.formatDateBr(state.dataBaixa)}'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        _TextValue(
          label: 'Recebedor VIPE (R\$)',
          value: state.valorRecebedor1,
          keyboard: TextInputType.number,
          onChanged: (v) {
            state.valorRecebedor1 = v;
            onChanged();
          },
        ),
        const SizedBox(height: 8),
        _TextValue(
          label: 'Recebedor Augusto (R\$)',
          value: state.valorRecebedor2,
          keyboard: TextInputType.number,
          onChanged: (v) {
            state.valorRecebedor2 = v;
            onChanged();
          },
        ),
        const SizedBox(height: 8),
        _TextValue(
          label: 'Abono/Desconto (R\$)',
          value: state.abonoDesconto,
          keyboard: TextInputType.number,
          onChanged: (v) {
            state.abonoDesconto = v;
            onChanged();
          },
        ),
        const SizedBox(height: 8),
        _TextValue(
          label: 'Crédito usado (saldo ${AppDates.money(state.saldoCredito)})',
          value: state.creditoUsado,
          keyboard: TextInputType.number,
          onChanged: (v) {
            state.creditoUsado = v;
            onChanged();
          },
        ),
        const SizedBox(height: 6),
        Align(
          alignment: Alignment.centerLeft,
          child: Text(
            'Falta ratear: ${AppDates.money(restante)}',
            style: TextStyle(
              color:
                  restante.abs() < 0.01 ? AppTheme.success : AppTheme.warning,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        const SizedBox(height: 8),
        _TextValue(
          label: 'Descrição',
          value: state.descricao,
          onChanged: (v) => state.descricao = v,
        ),
        const SizedBox(height: 8),
        _TextValue(
          label: 'Observação',
          value: state.observacao,
          onChanged: (v) => state.observacao = v,
        ),
      ],
    );
  }
}

class _TextValue extends StatefulWidget {
  final String label;
  final String value;
  final TextInputType? keyboard;
  final ValueChanged<String> onChanged;

  const _TextValue({
    required this.label,
    required this.value,
    required this.onChanged,
    this.keyboard,
  });

  @override
  State<_TextValue> createState() => _TextValueState();
}

class _TextValueState extends State<_TextValue> {
  late final TextEditingController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.value);
  }

  @override
  void didUpdateWidget(covariant _TextValue oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value != _ctrl.text) {
      _ctrl.text = widget.value;
      _ctrl.selection = TextSelection.collapsed(offset: _ctrl.text.length);
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _ctrl,
      keyboardType: widget.keyboard,
      decoration: InputDecoration(labelText: widget.label),
      onChanged: widget.onChanged,
    );
  }
}

class _GrupoComprovante {
  final String chave;
  final String? proprietarioId;
  final String? proprietarioNome;
  final String? remetente;
  final List<Map<String, dynamic>> comprovantes;

  _GrupoComprovante({
    required this.chave,
    required this.proprietarioId,
    required this.proprietarioNome,
    required this.remetente,
    required this.comprovantes,
  });
}

class _GrupoState {
  String? proprietarioId;
  String? proprietarioNome;
  String busca;
  bool carregandoPendentes = false;
  List<Map<String, dynamic>> pendentes = [];
  Set<String> selecionados = {};
  List<_Terceiro> terceiros = [];
  String filtroInicio = '';
  String filtroFim = '';
  String formaPagamento = 'PIX';
  String dataPagamento;
  String dataBaixa = AppDates.todayIso();
  String valorRecebedor1 = '';
  String valorRecebedor2 = '';
  String abonoDesconto = '';
  String creditoUsado = '';
  double saldoCredito = 0;
  String descricao = '';
  String observacao = '';
  bool confirmando = false;
  bool confirmado = false;

  _GrupoState({
    required this.proprietarioId,
    required this.proprietarioNome,
    required this.busca,
    String? dataPagamento,
  }) : dataPagamento = dataPagamento ?? AppDates.todayIso();
}

class _Terceiro {
  final String id;
  final String nome;

  _Terceiro({required this.id, required this.nome});
}

class _SubsetItem {
  final String id;
  final int cent;
  _SubsetItem({required this.id, required this.cent});
}

const _formasPagamento = [
  'PIX',
  'Transferência',
  'TED',
  'DOC',
  'Dinheiro',
  'Cheque',
  'Boleto',
];

double _valorGrupo(_GrupoComprovante grupo) =>
    grupo.comprovantes.fold(0, (s, c) => s + _valorComprovante(c));

double _valorComprovante(Map<String, dynamic> comp) {
  final direto = _toDouble(comp['valor_extraido']);
  if (direto > 0) return direto;
  final valores = comp['valores_comprovantes'];
  if (valores is List) {
    final soma = valores.fold<double>(0, (s, v) => s + _toDouble(v));
    if (soma > 0) return soma;
  }
  return _parseValorTexto(comp['valor_pago_texto']?.toString() ?? '');
}

double _parseValorTexto(String texto) {
  final limpo = texto.replaceAll(RegExp(r'[^\d.,-]'), '');
  if (limpo.isEmpty) return 0;
  final ultimaVirgula = limpo.lastIndexOf(',');
  final ultimoPonto = limpo.lastIndexOf('.');
  var normalizado = limpo;
  if (ultimaVirgula != -1 && ultimoPonto != -1) {
    normalizado = ultimaVirgula > ultimoPonto
        ? limpo.replaceAll('.', '').replaceAll(',', '.')
        : limpo.replaceAll(',', '');
  } else if (ultimaVirgula != -1) {
    normalizado = limpo.replaceAll('.', '').replaceAll(',', '.');
  }
  return double.tryParse(normalizado) ?? 0;
}

String? _dataGrupo(List<Map<String, dynamic>> comprovantes) {
  final datas = comprovantes
      .map((c) => c['data_pagamento_extraida']?.toString())
      .whereType<String>()
      .where((d) => d.isNotEmpty)
      .toList()
    ..sort();
  return datas.isEmpty ? null : datas.last;
}

double _totalSelecionado(_GrupoState state) => state.pendentes
    .where(
        (a) => state.selecionados.contains(a['id_abastecimento']?.toString()))
    .fold(0, (s, a) => s + _toDouble(a['valor_total']));

double _toDouble(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse('$value'.replaceAll(',', '.')) ?? 0;
}

bool _bool(dynamic value) {
  if (value is bool) return value;
  final s = '$value'.toLowerCase();
  return s == 'true' || s == '1';
}
