import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../core/api_client.dart';
import '../../core/app_state.dart';
import '../../core/constants.dart';
import '../../core/date_utils.dart';
import '../../core/models.dart';
import '../../core/thermal_printer.dart';
import '../../widgets/common.dart';
import '../../widgets/empresa_picker.dart';

class AbastecimentoFormScreen extends StatefulWidget {
  final Abastecimento? original;
  const AbastecimentoFormScreen({super.key, this.original});

  @override
  State<AbastecimentoFormScreen> createState() =>
      _AbastecimentoFormScreenState();
}

class _AbastecimentoFormScreenState extends State<AbastecimentoFormScreen>
    with WidgetsBindingObserver {
  bool _loading = true;
  bool _saving = false;

  // Rascunho: preserva dados se o app for ao fundo ou o usuário sair sem salvar
  static const _draftKey = 'abastecimento_form_draft_v1';

  List<Proprietario> _proprietarios = [];
  List<Veiculo> _veiculos = [];
  List<Motorista> _motoristas = [];
  List<ValorCombustivel> _valores = [];
  List<String> _tiposCombustivel = const ['OLEO DIESEL S10'];

  // form
  String? _idProprietario;
  String? _idVeiculo;
  String? _idMotorista;
  String? _tipoCombustivel;
  String? _local =
      AppState.instance.auth.filialAtual ?? AppConstants.locais.first;
  String? _status = 'Pendente';
  String _data = AppDates.todayIso();
  String _hora = AppDates.currentTimeIso();
  final _litrosCtrl = TextEditingController();
  final _odometroCtrl = TextEditingController();
  final _obsCtrl = TextEditingController();

  double? _valorPorLitro;
  double? _valorTotal;
  double? _odometroMin;
  String? _fotoOdometroUrl;
  String? _bombaUrl;
  String? _proprietarioNomeFallback;
  String? _veiculoNomeFallback;
  String? _motoristaNomeFallback;

  bool get _isEdit => widget.original != null;
  String get _proprietarioNomeSelecionado {
    final id = _idProprietario;
    if (id == null) return _proprietarioNomeFallback ?? '';
    final p = _proprietarios.where((x) => x.idProprietario == id);
    if (p.isEmpty) return _proprietarioNomeFallback ?? id;
    final item = p.first;
    return '${item.nome}${_isProprietarioBloqueado(item) ? ' (bloqueado)' : ''}';
  }

  String get _veiculoNomeSelecionado {
    final id = _idVeiculo;
    if (id == null) return _veiculoNomeFallback ?? '';
    final v = _veiculos.where((x) => x.idVeiculo == id);
    if (v.isEmpty) return _veiculoNomeFallback ?? id;
    return v.first.resumo;
  }

  String get _motoristaNomeSelecionado {
    final id = _idMotorista;
    if (id == null) return _motoristaNomeFallback ?? 'Nao informado';
    final m = _motoristas.where((x) => x.idMotorista == id);
    if (m.isEmpty) return _motoristaNomeFallback ?? id;
    return m.first.nomeExibicao;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WakelockPlus.enable().catchError((_) {});
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    WakelockPlus.disable().catchError((_) {});
    _litrosCtrl.dispose();
    _odometroCtrl.dispose();
    _obsCtrl.dispose();
    super.dispose();
  }

  /// Salva rascunho quando app vai ao fundo (evita perda em sessões longas).
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_isEdit &&
        (state == AppLifecycleState.paused ||
            state == AppLifecycleState.inactive)) {
      _salvarRascunho();
    }
  }

  // ─── Rascunho ────────────────────────────────────────────────────────────

  Future<void> _salvarRascunho() async {
    if (_isEdit) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final draft = <String, dynamic>{
        'idProprietario': _idProprietario,
        'idVeiculo': _idVeiculo,
        'idMotorista': _idMotorista,
        'tipoCombustivel': _tipoCombustivel,
        'local': _local,
        'status': _status,
        'data': _data,
        'hora': _hora,
        'litros': _litrosCtrl.text,
        'odometro': _odometroCtrl.text,
        'obs': _obsCtrl.text,
        'valorPorLitro': _valorPorLitro,
        'valorTotal': _valorTotal,
        'fotoOdometroUrl': _fotoOdometroUrl,
        'bombaUrl': _bombaUrl,
        'proprietarioNomeFallback': _proprietarioNomeFallback,
        'veiculoNomeFallback': _veiculoNomeFallback,
        'motoristaNomeFallback': _motoristaNomeFallback,
        'savedAt': DateTime.now().toIso8601String(),
      };
      await prefs.setString(_draftKey, jsonEncode(draft));
    } catch (_) {}
  }

  Future<void> _tentarRestaurarRascunho() async {
    if (_isEdit || !mounted) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_draftKey);
      if (raw == null || raw.isEmpty) return;

      final draft = jsonDecode(raw) as Map<String, dynamic>;

      // Rascunhos com mais de 4 horas são descartados automaticamente
      final savedAt = DateTime.tryParse(draft['savedAt']?.toString() ?? '');
      if (savedAt != null &&
          DateTime.now().difference(savedAt).inHours >= 4) {
        await prefs.remove(_draftKey);
        return;
      }

      // Precisa ter pelo menos um campo relevante para restaurar
      final temDado = draft['idVeiculo'] != null ||
          (draft['litros']?.toString().trim().isNotEmpty ?? false) ||
          draft['bombaUrl'] != null;
      if (!temDado) return;

      if (!mounted) return;
      final restaurar = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          title: const Text('Rascunho encontrado'),
          content: const Text(
            'Há um abastecimento não finalizado. Deseja continuar de onde parou?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Descartar'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Continuar'),
            ),
          ],
        ),
      );

      if (restaurar != true) {
        await prefs.remove(_draftKey);
        return;
      }

      if (!mounted) return;
      setState(() {
        _idProprietario = draft['idProprietario']?.toString();
        _idVeiculo = draft['idVeiculo']?.toString();
        _idMotorista = draft['idMotorista']?.toString();
        _tipoCombustivel =
            draft['tipoCombustivel']?.toString() ?? _tipoCombustivel;
        // Garante que o tipo do rascunho está na lista
        if (_tipoCombustivel != null &&
            _tipoCombustivel!.trim().isNotEmpty &&
            !_tiposCombustivel.contains(_tipoCombustivel)) {
          _tiposCombustivel = [..._tiposCombustivel, _tipoCombustivel!];
        }
        _local = draft['local']?.toString() ?? _local;
        _status = draft['status']?.toString() ?? _status;
        _data = draft['data']?.toString() ?? _data;
        _hora = draft['hora']?.toString() ?? _hora;
        _litrosCtrl.text = draft['litros']?.toString() ?? '';
        _odometroCtrl.text = draft['odometro']?.toString() ?? '';
        _obsCtrl.text = draft['obs']?.toString() ?? '';
        _valorPorLitro = (draft['valorPorLitro'] as num?)?.toDouble();
        _valorTotal = (draft['valorTotal'] as num?)?.toDouble();
        _fotoOdometroUrl = draft['fotoOdometroUrl']?.toString();
        _bombaUrl = draft['bombaUrl']?.toString();
        _proprietarioNomeFallback =
            draft['proprietarioNomeFallback']?.toString();
        _veiculoNomeFallback = draft['veiculoNomeFallback']?.toString();
        _motoristaNomeFallback = draft['motoristaNomeFallback']?.toString();
      });
    } catch (_) {}
  }

  Future<void> _limparRascunho() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_draftKey);
    } catch (_) {}
  }

  /// Exibe confirmação ao pressionar voltar no formulário de novo abastecimento.
  Future<void> _confirmarSaida() async {
    if (_saving) return;

    // Modo edição: já está salvo localmente, pode sair direto
    if (_isEdit) {
      if (mounted) Navigator.of(context).pop();
      return;
    }

    if (!mounted) return;
    final acao = await showDialog<_SaidaAcao>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sair sem salvar?'),
        content:
            const Text('O abastecimento ainda não foi registrado.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, _SaidaAcao.continuar),
            child: const Text('Continuar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, _SaidaAcao.descartar),
            style:
                TextButton.styleFrom(foregroundColor: AppTheme.danger),
            child: const Text('Descartar'),
          ),
          ElevatedButton(
            onPressed: () =>
                Navigator.pop(ctx, _SaidaAcao.salvarRascunho),
            child: const Text('Salvar rascunho'),
          ),
        ],
      ),
    );

    switch (acao) {
      case _SaidaAcao.salvarRascunho:
        await _salvarRascunho();
        if (mounted) Navigator.of(context).pop();
        break;
      case _SaidaAcao.descartar:
        await _limparRascunho();
        if (mounted) Navigator.of(context).pop();
        break;
      case _SaidaAcao.continuar:
      case null:
        break;
    }
  }

  Future<void> _load() async {
    final db = AppState.instance.db;
    final localAtual = AppState.instance.auth.filialAtual;
    _local = _isEdit ? _local : (localAtual ?? AppConstants.locais.first);
    _proprietarios = await db.listProprietarios(local: localAtual);
    _veiculos = await db.listVeiculos(local: localAtual);
    _motoristas = await db.listMotoristas(local: localAtual);
    _valores = await db.listValoresCombustivel(local: localAtual);
    _tiposCombustivel = _extrairTiposCombustivel(_valores);

    if (_isEdit) {
      var o = widget.original!;
      final detalhe = await _buscarAbastecimentoAtualizado(o);
      if (detalhe != null) {
        o = detalhe;
      }
      _hidratarRelacoes(o);
      _tipoCombustivel = o.tipoCombustivel;
      _local = _normalizarLocal(o.local);
      _status = o.status ?? 'Pendente';
      _data = AppDates.dateOnly(o.data);
      _hora = AppDates.timeOnly(o.dataHora ?? o.data);
      _litrosCtrl.text = o.quantidadeLitros.toString().replaceAll('.', ',');
      _odometroCtrl.text = o.odometro?.toString().replaceAll('.', ',') ?? '';
      _obsCtrl.text = o.observacao ?? '';
      _valorPorLitro = o.valorPorLitro;
      _valorTotal = o.valorTotal;
      _fotoOdometroUrl = o.fotoOdometro;
      _bombaUrl = o.bomba;
      if (_tipoCombustivel != null &&
          _tipoCombustivel!.trim().isNotEmpty &&
          !_tiposCombustivel.contains(_tipoCombustivel)) {
        _tiposCombustivel = [..._tiposCombustivel, _tipoCombustivel!];
      }
    } else {
      _tipoCombustivel = _tiposCombustivel.first;
      _hora = AppDates.currentTimeIso();
    }

    await _atualizarOdometroMin();
    _recalcular();

    if (!mounted) return;
    setState(() => _loading = false);

    // Oferece restaurar rascunho somente em novo abastecimento
    if (!_isEdit) await _tentarRestaurarRascunho();
  }

  Future<Abastecimento?> _buscarAbastecimentoAtualizado(
      Abastecimento original) async {
    final id = original.idAbastecimento?.trim();
    if (id == null || id.isEmpty) return null;
    try {
      final resp = await AppState.instance.api
          .get('/abastecimentos/$id')
          .timeout(const Duration(seconds: 15));
      final data = resp is Map && resp['data'] is Map ? resp['data'] : resp;
      if (data is Map) {
        return Abastecimento.fromJson(Map<String, dynamic>.from(data));
      }
    } catch (_) {
      // Offline ou API indisponivel: segue com o registro salvo localmente.
    }
    return null;
  }

  void _hidratarRelacoes(Abastecimento o) {
    final veiculo = _resolverVeiculo(o);
    final motorista = _resolverMotorista(o);
    final proprietario = _resolverProprietario(o, veiculo, motorista);

    _proprietarioNomeFallback = _textoOuNull(
      proprietario?.nome ?? veiculo?.proprietarioNome ?? o.proprietarioNome,
    );
    _veiculoNomeFallback = _textoOuNull(veiculo?.resumo ?? o.veiculoPlaca);
    _motoristaNomeFallback = _textoOuNull(motorista?.nome ?? o.motoristaNome);

    _idProprietario = proprietario?.idProprietario ??
        veiculo?.idProprietario ??
        motorista?.idProprietario ??
        o.idProprietario;
    _idVeiculo = veiculo?.idVeiculo ?? o.idVeiculo;
    _idMotorista = motorista?.idMotorista ?? o.idMotorista;
  }

  Proprietario? _resolverProprietario(
    Abastecimento o,
    Veiculo? veiculo,
    Motorista? motorista,
  ) {
    final porId = _proprietarios
        .where((p) => _mesmoId(p.idProprietario, o.idProprietario));
    if (porId.isNotEmpty) return porId.first;

    final porNome =
        _proprietarios.where((p) => _mesmoTexto(p.nome, o.proprietarioNome));
    if (porNome.isNotEmpty) return porNome.first;

    final idDoVeiculo = veiculo?.idProprietario;
    if (idDoVeiculo != null) {
      final p = _proprietarios.where((x) => x.idProprietario == idDoVeiculo);
      if (p.isNotEmpty) return p.first;
    }

    final idDoMotorista = motorista?.idProprietario;
    if (idDoMotorista != null) {
      final p = _proprietarios.where((x) => x.idProprietario == idDoMotorista);
      if (p.isNotEmpty) return p.first;
    }

    return null;
  }

  Veiculo? _resolverVeiculo(Abastecimento o) {
    final porId = _veiculos.where((v) => _mesmoId(v.idVeiculo, o.idVeiculo));
    if (porId.isNotEmpty) return porId.first;

    final porPlaca =
        _veiculos.where((v) => _mesmaPlaca(v.placa, o.veiculoPlaca));
    if (porPlaca.isNotEmpty) return porPlaca.first;

    return null;
  }

  Motorista? _resolverMotorista(Abastecimento o) {
    final porId =
        _motoristas.where((m) => _mesmoId(m.idMotorista, o.idMotorista));
    if (porId.isNotEmpty) return porId.first;

    final porNome =
        _motoristas.where((m) => _mesmoTexto(m.nome, o.motoristaNome)).toList();
    if (porNome.length == 1) return porNome.first;

    if (porNome.length > 1) {
      final proprietario = _resolverProprietario(o, _resolverVeiculo(o), null);
      final idProprietario = proprietario?.idProprietario;
      final mesmoProprietario =
          porNome.where((m) => m.idProprietario == idProprietario);
      if (mesmoProprietario.isNotEmpty) return mesmoProprietario.first;
    }

    return null;
  }

  bool _mesmoId(String? a, String? b) {
    if (a == null || b == null) return false;
    return a.trim().toLowerCase() == b.trim().toLowerCase();
  }

  bool _mesmoTexto(String? a, String? b) {
    final na = _normalizarTexto(a);
    final nb = _normalizarTexto(b);
    return na.isNotEmpty && na == nb;
  }

  bool _mesmaPlaca(String? a, String? b) {
    final na = _normalizarTexto(a).replaceAll(RegExp(r'[^A-Z0-9]'), '');
    final nb = _normalizarTexto(b).replaceAll(RegExp(r'[^A-Z0-9]'), '');
    return na.isNotEmpty && na == nb;
  }

  String _normalizarTexto(String? value) {
    return (value ?? '').trim().toUpperCase().replaceAll(RegExp(r'\s+'), ' ');
  }

  String? _textoOuNull(String? value) {
    final text = value?.trim();
    return text == null || text.isEmpty ? null : text;
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

  Future<void> _atualizarOdometroMin() async {
    if (_idVeiculo == null) {
      _odometroMin = null;
      return;
    }
    _odometroMin = await AppState.instance.db.maxOdometro(
      _idVeiculo!,
      ignoreAbastecimentoId: widget.original?.idAbastecimento,
    );
  }

  void _recalcular() {
    final litros = parseDecimal(_litrosCtrl.text) ?? 0;
    double? preco = _valorPorLitro;
    if (!_isEdit && _tipoCombustivel != null) {
      // pega valor vigente da tabela local
      final localAtual = _local ?? AppState.instance.auth.filialAtual;
      final first = _valores
          .where((v) =>
              v.tipoCombustivel == _tipoCombustivel &&
              ((v.local ?? 'Matriz') == (localAtual ?? 'Matriz')))
          .toList();
      if (first.isNotEmpty) {
        preco = first.first.valor;
      }
    }
    _valorPorLitro = preco;
    final totalCalculado = (preco ?? 0) * litros;
    final totalComCentavos =
        ((totalCalculado + 0.0000001) * 100).roundToDouble() / 100;
    _valorTotal = (totalComCentavos + 0.5).floorToDouble();
    if (mounted) setState(() {});
  }

  List<Veiculo> get _veiculosFiltrados {
    if (_idProprietario == null) return _veiculos;
    return _veiculos.where((v) => v.idProprietario == _idProprietario).toList();
  }

  List<Motorista> get _motoristasFiltrados {
    if (_idProprietario == null) return _motoristas;
    return _motoristas
        .where((m) => m.idProprietario == _idProprietario)
        .toList();
  }

  Veiculo? get _veiculoSelecionado {
    final id = _idVeiculo;
    if (id == null) return null;
    final encontrados = _veiculos.where((v) => v.idVeiculo == id);
    return encontrados.isEmpty ? null : encontrados.first;
  }

  Motorista? get _motoristaSelecionado {
    final id = _idMotorista;
    if (id == null) return null;
    final encontrados = _motoristas.where((m) => m.idMotorista == id);
    return encontrados.isEmpty ? null : encontrados.first;
  }

  String _nomeProprietarioPorId(String? id) {
    if (id == null || id.trim().isEmpty) return 'sem proprietario';
    final encontrados = _proprietarios.where((p) => p.idProprietario == id);
    return encontrados.isEmpty ? id : encontrados.first.nome;
  }

  String? _validarRelacoesSelecionadas() {
    final idProprietario = _idProprietario;
    if (idProprietario == null || idProprietario.trim().isEmpty) {
      return null;
    }

    final veiculo = _veiculoSelecionado;
    if (veiculo == null) {
      return 'Placa selecionada nao foi encontrada no cadastro local. Sincronize e selecione novamente.';
    }
    final idProprietarioVeiculo = veiculo.idProprietario?.trim();
    if (idProprietarioVeiculo == null || idProprietarioVeiculo.isEmpty) {
      return 'Placa selecionada esta sem proprietario. Corrija o cadastro do veiculo antes de salvar.';
    }
    if (idProprietarioVeiculo != idProprietario) {
      return 'A placa ${veiculo.placa} pertence a ${_nomeProprietarioPorId(idProprietarioVeiculo)}, mas o abastecimento esta em ${_nomeProprietarioPorId(idProprietario)}.';
    }

    final motorista = _motoristaSelecionado;
    if (motorista == null) {
      return 'Motorista selecionado nao foi encontrado no cadastro local. Sincronize e selecione novamente.';
    }
    final idProprietarioMotorista = motorista.idProprietario?.trim();
    if (idProprietarioMotorista == null || idProprietarioMotorista.isEmpty) {
      return 'Motorista selecionado esta sem empresa responsavel. Corrija o cadastro antes de salvar.';
    }
    if (idProprietarioMotorista != idProprietario) {
      return 'O motorista ${motorista.nomeExibicao} pertence a ${_nomeProprietarioPorId(idProprietarioMotorista)}, mas o abastecimento esta em ${_nomeProprietarioPorId(idProprietario)}.';
    }

    return null;
  }

  void _preencherProprietarioPeloVeiculo(Veiculo veiculo) {
    final idProprietario = veiculo.idProprietario?.trim();
    if (idProprietario == null || idProprietario.isEmpty) {
      _proprietarioNomeFallback = _textoOuNull(veiculo.proprietarioNome);
      return;
    }

    _idProprietario = idProprietario;
    final proprietario =
        _proprietarios.where((p) => p.idProprietario == idProprietario);
    _proprietarioNomeFallback = proprietario.isNotEmpty
        ? proprietario.first.nome
        : _textoOuNull(veiculo.proprietarioNome);

    if (_idMotorista != null) {
      final motorista = _motoristas.where((m) => m.idMotorista == _idMotorista);
      if (motorista.isNotEmpty &&
          motorista.first.idProprietario != idProprietario) {
        _idMotorista = null;
        _motoristaNomeFallback = null;
      }
    }
  }

  bool get _proprietarioBloqueado {
    if (_idProprietario == null) return false;
    final p = _proprietarios.firstWhere(
      (pp) => pp.idProprietario == _idProprietario,
      orElse: () => Proprietario(nome: ''),
    );
    return _isProprietarioBloqueado(p);
  }

  bool _isProprietarioBloqueado(Proprietario p) {
    return _normalizarTexto(p.status) == 'BLOQUEADO';
  }

  Future<void> _mostrarAvisoProprietarioBloqueado(Proprietario p) async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Proprietario bloqueado'),
        content: Text(
          [
            '${p.nome} esta bloqueado e nao pode realizar novos abastecimentos.',
            if ((p.observacao ?? '').trim().isNotEmpty)
              'Motivo: ${p.observacao!.trim()}',
          ].join('\n\n'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Entendi'),
          ),
        ],
      ),
    );
  }

  bool get _proprietarioSelecionadoExigeOdometro {
    final veiculo = _veiculos.where((v) => v.idVeiculo == _idVeiculo);
    final idProprietarioVeiculo =
        veiculo.isNotEmpty ? veiculo.first.idProprietario : null;
    final idProprietario = idProprietarioVeiculo ?? _idProprietario;
    final proprietario =
        _proprietarios.where((p) => p.idProprietario == idProprietario);
    if (proprietario.isEmpty) return false;
    return proprietario.first.odometroObrigatorio;
  }

  String? _validar() {
    if (_idVeiculo == null) return 'Selecione a placa/veiculo.';
    if (_idProprietario == null) {
      return 'Proprietario nao encontrado para a placa selecionada.';
    }
    if (_proprietarioBloqueado) {
      return 'Proprietario bloqueado - nao aceita novos abastecimentos.';
    }
    if (_idMotorista == null) return 'Selecione um motorista.';
    final erroRelacoes = _validarRelacoesSelecionadas();
    if (erroRelacoes != null) return erroRelacoes;
    if ((_local ?? '').trim().isEmpty) return 'Selecione o local.';
    if (_tipoCombustivel == null) return 'Selecione o tipo de combustivel.';
    if ((_bombaUrl ?? '').trim().isEmpty) {
      return 'Anexe a imagem da bomba antes de salvar o abastecimento.';
    }
    final litros = parseDecimal(_litrosCtrl.text);
    if (litros == null || litros <= 0) {
      return 'Informe uma quantidade de litros valida.';
    }
    final odom = parseDecimal(_odometroCtrl.text);
    if (_odometroMin != null && odom == null) {
      final minimo = _odometroMin! + 1;
      return 'Odometro e obrigatorio para esta placa porque ja existe abastecimento anterior. Minimo: ${AppDates.number(minimo, digits: 0)}.';
    }
    if (_proprietarioSelecionadoExigeOdometro && odom == null) {
      return 'Odometro e obrigatorio para este proprietario.';
    }
    if (odom != null && _odometroMin != null && odom <= _odometroMin!) {
      final minimo = _odometroMin! + 1;
      return 'Odometro deve ser maior que o ultimo registrado (${AppDates.number(_odometroMin!, digits: 0)}). Minimo: ${AppDates.number(minimo, digits: 0)}.';
    }
    if (_valorPorLitro == null || _valorPorLitro! <= 0) {
      return 'Nao foi possivel obter o preco do combustivel. Cadastre um valor primeiro.';
    }
    return null;
  }

  Future<void> _salvar() async {
    final err = _validar();
    if (err != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(err), backgroundColor: AppTheme.danger),
      );
      return;
    }
    setState(() => _saving = true);

    final user = AppState.instance.auth;
    final litros = parseDecimal(_litrosCtrl.text)!;
    final odom = parseDecimal(_odometroCtrl.text);
    final clientRequestId = !_isEdit ? AppState.instance.db.newUuid() : null;
    final dataAbastecimento = AppDates.dateOnly(_data);
    final horaAbastecimento = AppDates.timeOnly(_hora);

    final abast = Abastecimento(
      idAbastecimento: widget.original?.idAbastecimento ?? clientRequestId,
      data: dataAbastecimento,
      dataHora: AppDates.combineDateTime(dataAbastecimento, horaAbastecimento),
      idProprietario: _idProprietario,
      idVeiculo: _idVeiculo,
      idMotorista: _idMotorista,
      tipoCombustivel: _tipoCombustivel,
      quantidadeLitros: litros,
      valorPorLitro: _valorPorLitro,
      valorTotal: _valorTotal,
      odometro: odom,
      local: _local,
      status: (_status ?? '').trim().isEmpty ? 'Pendente' : _status,
      responsavel: user.nome ?? user.login ?? '',
      observacao: _obsCtrl.text.trim().isEmpty ? null : _obsCtrl.text.trim(),
      notaFiscal: null,
      fotoOdometro: _fotoOdometroUrl,
      bomba: _bombaUrl,
      proprietarioNome: _proprietarios
          .firstWhere((p) => p.idProprietario == _idProprietario,
              orElse: () => Proprietario(nome: ''))
          .nome,
      veiculoPlaca: _veiculos
          .firstWhere((v) => v.idVeiculo == _idVeiculo,
              orElse: () => Veiculo(placa: ''))
          .placa,
      motoristaNome: _idMotorista == null
          ? null
          : _motoristas
              .firstWhere((m) => m.idMotorista == _idMotorista,
                  orElse: () => Motorista(nome: ''))
              .nome,
    );

    final db = AppState.instance.db;

    try {
      final missingAttachmentMessage = await _validarAnexosLocaisPresentes();
      if (missingAttachmentMessage != null) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(missingAttachmentMessage),
            backgroundColor: AppTheme.danger,
          ),
        );
        return;
      }

      if (!_isEdit) {
        await db.insertAbastecimentoLocal(abast);
        final printResult = await _printAutoIfEnabled(abast);
        if (!mounted) return;
        await _limparRascunho();
        Navigator.pop(context, true);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(_saveMessage(
            'Registro salvo. Foto e IA seguem na sincronizacao.',
            printResult,
          )),
          backgroundColor: printResult?.success == false
              ? AppTheme.warning
              : AppTheme.success,
        ));
      } else {
        final id = widget.original!.idAbastecimento;
        final updatedLocal = _buildAbastecimentoFromForm(
          abast,
          id: id,
          localUuid: widget.original!.localUuid,
        );
        await db.updateAbastecimentoLocal(updatedLocal);
        if (!mounted) return;
        Navigator.pop(context, true);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Alteracoes salvas. Upload e analise seguem na sincronizacao.'),
          backgroundColor: AppTheme.success,
        ));
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Erro: ${e.message}'),
          backgroundColor: AppTheme.danger));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Erro: $e'), backgroundColor: AppTheme.danger));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<String?> _validarAnexosLocaisPresentes() async {
    for (final item in [
      (label: 'imagem da bomba', value: _bombaUrl),
      (label: 'foto do hodometro', value: _fotoOdometroUrl),
    ]) {
      final raw = item.value?.trim();
      if (raw == null || raw.isEmpty || _isRemoteUrl(raw)) continue;
      final file = _attachmentFile(raw);
      if (!await file.exists()) {
        return 'Arquivo da ${item.label} nao foi encontrado. Anexe a foto novamente.';
      }
    }
    return null;
  }

  String _formatErrorForLog(Object error) {
    if (error is ApiException) {
      return 'ApiException(status=${error.statusCode}, message=${error.message}, body=${error.body})';
    }
    if (error is OfflineException) {
      return 'OfflineException(message=${error.message})';
    }
    return error.toString();
  }

  String _saveMessage(String base, _AutoPrintResult? printResult) {
    if (printResult == null) return base;
    return '$base ${printResult.message}';
  }

  Future<_AutoPrintResult?> _printAutoIfEnabled(
    Abastecimento abastecimento,
  ) async {
    final enabled =
        await ThermalPrinterService.instance.autoPrintAbastecimentoEnabled();
    if (!enabled) return null;
    try {
      await ThermalPrinterService.instance.printAbastecimento(abastecimento);
      return const _AutoPrintResult(
        success: true,
        message: 'Comprovante impresso automaticamente.',
      );
    } catch (e) {
      await AppState.instance.db.addSyncLog(
        level: 'warn',
        message: 'Falha na impressao automatica do abastecimento',
        context:
            'erro=${_formatErrorForLog(e)} payload=${jsonEncode(abastecimento.toJson())}',
      );
      return _AutoPrintResult(
        success: false,
        message: 'Falha na impressao automatica: $e',
      );
    }
  }

  Future<ImageSource?> _pickSource() async {
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

  String _normalizarLocal(String? local) {
    final text = local?.trim();
    if (text != null && AppConstants.locais.contains(text)) return text;
    if (text == 'Garagem' || text == 'Cariacica') return 'Matriz';
    if (text == 'Garagem Viana') return 'Viana';
    return AppConstants.locais.first;
  }

  Future<void> _uploadImagem({required bool bomba}) async {
    try {
      final src = await _pickSource();
      if (src == null) return;
      final picker = ImagePicker();
      final file = await picker.pickImage(
        source: src,
        imageQuality: 80,
      );
      if (file == null) return;

      final localPath = await _persistPickedFile(file.path, bomba: bomba);
      if (!mounted) return;
      setState(() {
        if (bomba) {
          _bombaUrl = localPath;
        } else {
          _fotoOdometroUrl = localPath;
        }
        if (!_isEdit) {
          _status = 'Pendente';
        }
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            bomba
                ? 'Imagem da bomba salva. Upload e IA serao feitos na sincronizacao.'
                : 'Foto do hodometro salva. Upload e IA serao feitos na sincronizacao.',
          ),
          backgroundColor: AppTheme.success,
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Falha ao anexar imagem: $e'),
          backgroundColor: AppTheme.danger,
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<String> _persistPickedFile(String sourcePath,
      {required bool bomba}) async {
    final source = File(sourcePath);
    if (!await source.exists()) {
      throw Exception('Arquivo de imagem não encontrado.');
    }
    final appDir = await getApplicationDocumentsDirectory();
    final folder = Directory(p.join(appDir.path, 'pending_uploads'));
    if (!await folder.exists()) {
      await folder.create(recursive: true);
    }
    final ext =
        p.extension(source.path).isEmpty ? '.jpg' : p.extension(source.path);
    final name =
        '${bomba ? 'bomba' : 'hodometro'}_${DateTime.now().microsecondsSinceEpoch}$ext';
    final targetPath = p.join(folder.path, name);
    final copied = await source.copy(targetPath);
    return copied.path;
  }

  bool _isRemoteUrl(String? value) {
    if (value == null) return false;
    final v = value.trim().toLowerCase();
    return v.startsWith('http://') || v.startsWith('https://');
  }

  File _attachmentFile(String value) {
    final uri = Uri.tryParse(value.trim());
    if (uri != null && uri.scheme == 'file') {
      return File.fromUri(uri);
    }
    return File(value.trim());
  }

  Future<void> _abrirUrl(String url) async {
    if (!_isRemoteUrl(url)) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Widget _buildImagemAnexoCard({
    required String titulo,
    required String? url,
    required bool bomba,
  }) {
    final value = (url ?? '').trim();
    final hasImage = value.isNotEmpty;
    final remote = _isRemoteUrl(value);

    Widget? preview;
    if (hasImage && remote) {
      preview = Image.network(
        value,
        height: 128,
        width: double.infinity,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => const Center(
          child: Icon(Icons.broken_image_outlined, color: AppTheme.textMuted),
        ),
      );
    } else if (hasImage) {
      preview = Image.file(
        _attachmentFile(value),
        height: 128,
        width: double.infinity,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => const Center(
          child: Icon(Icons.cloud_upload_outlined, color: AppTheme.warning),
        ),
      );
    }

    return Card(
      margin: const EdgeInsets.only(top: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  bomba
                      ? Icons.local_gas_station_outlined
                      : Icons.photo_camera_outlined,
                  size: 18,
                  color: AppTheme.primary,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    titulo,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                if (hasImage && remote)
                  IconButton(
                    tooltip: 'Abrir imagem',
                    icon: const Icon(Icons.open_in_new),
                    onPressed: () => _abrirUrl(value),
                  ),
              ],
            ),
            if (preview != null) ...[
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: SizedBox(
                  height: 128,
                  width: double.infinity,
                  child: preview,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                remote
                    ? value
                    : 'Imagem salva localmente. Será enviada na próxima sincronização.',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12,
                  color: remote ? AppTheme.primary : AppTheme.warning,
                ),
              ),
            ] else ...[
              const SizedBox(height: 6),
              const Text(
                'Nenhuma imagem anexada.',
                style: TextStyle(color: AppTheme.textMuted),
              ),
            ],
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: _saving ? null : () => _uploadImagem(bomba: bomba),
              icon: Icon(hasImage
                  ? Icons.swap_horiz_outlined
                  : Icons.add_photo_alternate_outlined),
              label: Text(hasImage ? 'Substituir' : 'Anexar'),
            ),
          ],
        ),
      ),
    );
  }

  /// Clona o Abastecimento montado a partir do form garantindo o id remoto
  /// e (opcionalmente) o localUuid existente. Usado em caminhos de update
  /// (online e offline) para evitar repeticao de campos.
  Abastecimento _buildAbastecimentoFromForm(
    Abastecimento base, {
    required String? id,
    String? localUuid,
  }) {
    return Abastecimento(
      idAbastecimento: id,
      localUuid: localUuid,
      data: base.data,
      dataHora: base.dataHora,
      idVeiculo: base.idVeiculo,
      idProprietario: base.idProprietario,
      idMotorista: base.idMotorista,
      tipoCombustivel: base.tipoCombustivel,
      quantidadeLitros: base.quantidadeLitros,
      valorPorLitro: base.valorPorLitro,
      valorTotal: base.valorTotal,
      odometro: base.odometro,
      local: base.local,
      status: base.status,
      responsavel: base.responsavel,
      observacao: base.observacao,
      notaFiscal: base.notaFiscal,
      dataPagamento: base.dataPagamento,
      nfeEmissao: base.nfeEmissao,
      fotoOdometro: base.fotoOdometro,
      bomba: base.bomba,
      anexo: base.anexo,
      baixaAbastecimento: base.baixaAbastecimento,
      dataBaixa: base.dataBaixa,
      veiculoPlaca: base.veiculoPlaca,
      proprietarioNome: base.proprietarioNome,
      motoristaNome: base.motoristaNome,
    );
  }

  Future<void> _confirmarCancelamento() async {
    final id = widget.original?.idAbastecimento;
    if (id == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancelar abastecimento?'),
        content: const Text('O abastecimento sera marcado como cancelado.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Nao')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Sim, cancelar')),
        ],
      ),
    );
    if (ok != true) return;

    setState(() => _saving = true);
    try {
      await AppState.instance.api
          .post('/abastecimentos/$id/cancelar', <String, dynamic>{});
      if (!mounted) return;
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Erro: ${e.message}'),
          backgroundColor: AppTheme.danger));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Erro: $e'), backgroundColor: AppTheme.danger));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _selecionarProprietario() async {
    final selected = await showModalBottomSheet<Proprietario>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        final buscaCtrl = TextEditingController();
        return StatefulBuilder(
          builder: (context, setModalState) {
            final termo = buscaCtrl.text.trim().toLowerCase();
            final filtrados = _proprietarios.where((p) {
              final nome = p.nome.toLowerCase();
              final cel = (p.celular ?? '').toLowerCase();
              return termo.isEmpty ||
                  nome.contains(termo) ||
                  cel.contains(termo);
            }).toList()
              ..sort((a, b) =>
                  a.nome.toLowerCase().compareTo(b.nome.toLowerCase()));

            return Padding(
              padding: EdgeInsets.only(
                left: 12,
                right: 12,
                top: 12,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 12,
              ),
              child: SizedBox(
                height: MediaQuery.of(ctx).size.height * 0.72,
                child: Column(
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Selecionar proprietario',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        TextButton.icon(
                          onPressed: () async {
                            final created = await _criarProprietarioInline(
                              nomeInicial: buscaCtrl.text.trim(),
                            );
                            if (created == null) return;
                            if (!mounted) return;
                            Navigator.of(ctx).pop(created);
                          },
                          icon: const Icon(Icons.add),
                          label: const Text('Novo'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: buscaCtrl,
                      autofocus: true,
                      decoration: const InputDecoration(
                        labelText: 'Digite para filtrar',
                        prefixIcon: Icon(Icons.search),
                      ),
                      onChanged: (_) => setModalState(() {}),
                    ),
                    const SizedBox(height: 10),
                    Expanded(
                      child: filtrados.isEmpty
                          ? Center(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Text('Nenhum proprietario encontrado'),
                                  const SizedBox(height: 8),
                                  OutlinedButton.icon(
                                    onPressed: () async {
                                      final created =
                                          await _criarProprietarioInline(
                                        nomeInicial: buscaCtrl.text.trim(),
                                      );
                                      if (created == null) return;
                                      if (!mounted) return;
                                      Navigator.of(ctx).pop(created);
                                    },
                                    icon: const Icon(Icons.add),
                                    label: const Text('Cadastrar agora'),
                                  ),
                                ],
                              ),
                            )
                          : ListView.separated(
                              itemCount: filtrados.length,
                              separatorBuilder: (_, __) =>
                                  const Divider(height: 1),
                              itemBuilder: (_, i) {
                                final p = filtrados[i];
                                return ListTile(
                                  dense: true,
                                  title: Text(
                                    '${p.nome}${_isProprietarioBloqueado(p) ? ' (bloqueado)' : ''}',
                                    style: TextStyle(
                                      color: _isProprietarioBloqueado(p)
                                          ? AppTheme.danger
                                          : null,
                                      fontWeight: _isProprietarioBloqueado(p)
                                          ? FontWeight.w700
                                          : null,
                                    ),
                                  ),
                                  subtitle: p.celular == null ||
                                          p.celular!.trim().isEmpty
                                      ? null
                                      : Text(p.celular!),
                                  trailing: _idProprietario == p.idProprietario
                                      ? const Icon(Icons.check_circle,
                                          color: AppTheme.success)
                                      : null,
                                  onTap: () => Navigator.of(ctx).pop(p),
                                );
                              },
                            ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (selected == null) return;
    if (_isProprietarioBloqueado(selected)) {
      await _mostrarAvisoProprietarioBloqueado(selected);
    }

    setState(() {
      _idProprietario = selected.idProprietario;
      _idVeiculo = null;
      _idMotorista = null;
    });
    await _atualizarOdometroMin();
  }

  Future<Proprietario?> _criarProprietarioInline({String? nomeInicial}) async {
    final nomeCtrl = TextEditingController(text: nomeInicial ?? '');
    final celularCtrl = TextEditingController();
    final obsCtrl = TextEditingController();
    bool salvando = false;

    final result = await showDialog<Proprietario>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Novo proprietario'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: nomeCtrl,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(labelText: 'Nome *'),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: celularCtrl,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(labelText: 'Celular'),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: obsCtrl,
                      maxLines: 3,
                      decoration:
                          const InputDecoration(labelText: 'Observacao'),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: salvando ? null : () => Navigator.pop(ctx),
                  child: const Text('Cancelar'),
                ),
                ElevatedButton.icon(
                  onPressed: salvando
                      ? null
                      : () async {
                          final nome = nomeCtrl.text.trim();
                          if (nome.isEmpty) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content:
                                    Text('Informe o nome do proprietario.'),
                                backgroundColor: AppTheme.danger,
                              ),
                            );
                            return;
                          }
                          setDialogState(() => salvando = true);
                          try {
                            final novo = Proprietario(
                              nome: nome,
                              status: 'ativo',
                              celular: celularCtrl.text.trim().isEmpty
                                  ? null
                                  : celularCtrl.text.trim(),
                              observacao: obsCtrl.text.trim().isEmpty
                                  ? null
                                  : obsCtrl.text.trim(),
                              local: _local,
                            );
                            final id = await AppState.instance.db
                                .saveProprietarioLocal(
                              novo,
                              isCreate: true,
                            );
                            final created = Proprietario(
                              idProprietario: id,
                              nome: nome,
                              status: 'ativo',
                              celular: novo.celular,
                              observacao: novo.observacao,
                              local: novo.local,
                            );
                            if (!mounted) return;
                            setState(() {
                              _proprietarios.add(created);
                              _proprietarios.sort((a, b) => a.nome
                                  .toLowerCase()
                                  .compareTo(b.nome.toLowerCase()));
                            });
                            Navigator.pop(ctx, created);
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                    'Proprietario criado. Sera sincronizado automaticamente.'),
                                backgroundColor: AppTheme.success,
                              ),
                            );
                          } catch (e) {
                            setDialogState(() => salvando = false);
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Erro ao criar proprietario: $e'),
                                backgroundColor: AppTheme.danger,
                              ),
                            );
                          }
                        },
                  icon: salvando
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_outlined),
                  label: Text(salvando ? 'Salvando...' : 'Salvar'),
                ),
              ],
            );
          },
        );
      },
    );

    nomeCtrl.dispose();
    celularCtrl.dispose();
    obsCtrl.dispose();
    return result;
  }

  Future<void> _selecionarVeiculo() async {
    final selected = await showModalBottomSheet<Veiculo>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        final buscaCtrl = TextEditingController();
        return StatefulBuilder(
          builder: (context, setModalState) {
            final termo = buscaCtrl.text.trim().toLowerCase();
            final base = _veiculosFiltrados;
            final filtrados = base.where((v) {
              final placa = v.placa.toLowerCase();
              final resumo = v.resumo.toLowerCase();
              return termo.isEmpty ||
                  placa.contains(termo) ||
                  resumo.contains(termo);
            }).toList()
              ..sort((a, b) =>
                  a.placa.toLowerCase().compareTo(b.placa.toLowerCase()));

            return Padding(
              padding: EdgeInsets.only(
                left: 12,
                right: 12,
                top: 12,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 12,
              ),
              child: SizedBox(
                height: MediaQuery.of(ctx).size.height * 0.72,
                child: Column(
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Selecionar veiculo',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        TextButton.icon(
                          onPressed: () async {
                            final created = await _criarVeiculoInline(
                              placaInicial: buscaCtrl.text.trim(),
                            );
                            if (created == null) return;
                            if (!mounted) return;
                            Navigator.of(ctx).pop(created);
                          },
                          icon: const Icon(Icons.add),
                          label: const Text('Novo'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: buscaCtrl,
                      autofocus: true,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(
                        labelText: 'Digite placa/modelo para filtrar',
                        prefixIcon: Icon(Icons.search),
                      ),
                      onChanged: (_) => setModalState(() {}),
                    ),
                    const SizedBox(height: 10),
                    Expanded(
                      child: filtrados.isEmpty
                          ? Center(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Text('Nenhum veiculo encontrado'),
                                  const SizedBox(height: 8),
                                  OutlinedButton.icon(
                                    onPressed: () async {
                                      final created = await _criarVeiculoInline(
                                        placaInicial: buscaCtrl.text.trim(),
                                      );
                                      if (created == null) return;
                                      if (!mounted) return;
                                      Navigator.of(ctx).pop(created);
                                    },
                                    icon: const Icon(Icons.add),
                                    label: const Text('Cadastrar agora'),
                                  ),
                                ],
                              ),
                            )
                          : ListView.separated(
                              itemCount: filtrados.length,
                              separatorBuilder: (_, __) =>
                                  const Divider(height: 1),
                              itemBuilder: (_, i) {
                                final v = filtrados[i];
                                return ListTile(
                                  dense: true,
                                  title: Text(v.resumo),
                                  subtitle: v.proprietarioNome == null ||
                                          v.proprietarioNome!.trim().isEmpty
                                      ? null
                                      : Text(v.proprietarioNome!),
                                  trailing: _idVeiculo == v.idVeiculo
                                      ? const Icon(Icons.check_circle,
                                          color: AppTheme.success)
                                      : null,
                                  onTap: () => Navigator.of(ctx).pop(v),
                                );
                              },
                            ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (selected == null) return;
    final proprietarioDoVeiculo = selected.idProprietario == null
        ? null
        : _proprietarios.where(
            (p) => p.idProprietario == selected.idProprietario,
          );
    setState(() {
      _idVeiculo = selected.idVeiculo;
      _veiculoNomeFallback = selected.resumo;
      _preencherProprietarioPeloVeiculo(selected);
    });
    if (proprietarioDoVeiculo != null &&
        proprietarioDoVeiculo.isNotEmpty &&
        _isProprietarioBloqueado(proprietarioDoVeiculo.first)) {
      await _mostrarAvisoProprietarioBloqueado(proprietarioDoVeiculo.first);
    }
    if (!_isEdit &&
        selected.tipoCombustivel != null &&
        selected.tipoCombustivel!.isNotEmpty) {
      setState(() => _tipoCombustivel = selected.tipoCombustivel);
    }
    await _atualizarOdometroMin();
    _recalcular();
  }

  Future<Veiculo?> _criarVeiculoInline({String? placaInicial}) async {
    final placaCtrl = TextEditingController(text: placaInicial ?? '');
    final modeloCtrl = TextEditingController();
    String? idProprietario = _idProprietario;
    bool salvando = false;

    final result = await showDialog<Veiculo>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Novo veiculo'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: placaCtrl,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(labelText: 'Placa *'),
                    ),
                    const SizedBox(height: 8),
                    EmpresaPickerField(
                      proprietarios: _proprietarios,
                      value: idProprietario,
                      label: 'Proprietario *',
                      hint: 'Selecione o proprietario do veiculo',
                      onChanged: (v) =>
                          setDialogState(() => idProprietario = v),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: modeloCtrl,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(labelText: 'Modelo'),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: salvando ? null : () => Navigator.pop(ctx),
                  child: const Text('Cancelar'),
                ),
                ElevatedButton.icon(
                  onPressed: salvando
                      ? null
                      : () async {
                          final placa = placaCtrl.text.trim().toUpperCase();
                          if (placa.isEmpty) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Informe a placa do veiculo.'),
                                backgroundColor: AppTheme.danger,
                              ),
                            );
                            return;
                          }
                          if ((idProprietario ?? '').trim().isEmpty) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                    'Selecione o proprietario do veiculo.'),
                                backgroundColor: AppTheme.danger,
                              ),
                            );
                            return;
                          }
                          setDialogState(() => salvando = true);
                          try {
                            final proprietarioSelecionado = _proprietarios
                                .where((p) => p.idProprietario == idProprietario)
                                .toList();
                            final localProprietario =
                                proprietarioSelecionado.isNotEmpty
                                    ? proprietarioSelecionado.first.local
                                    : null;
                            final novo = Veiculo(
                              placa: placa,
                              modelo: modeloCtrl.text.trim().isEmpty
                                  ? null
                                  : modeloCtrl.text.trim(),
                              idProprietario: idProprietario,
                              tipoCombustivel: _tipoCombustivel,
                              local: localProprietario ?? _local,
                            );
                            final id =
                                await AppState.instance.db.saveVeiculoLocal(
                              novo,
                              isCreate: true,
                            );
                            final created = Veiculo(
                              idVeiculo: id,
                              placa: placa,
                              modelo: novo.modelo,
                              idProprietario: idProprietario,
                              tipoCombustivel: novo.tipoCombustivel,
                              local: novo.local,
                              proprietarioNome:
                                  proprietarioSelecionado.isNotEmpty
                                      ? proprietarioSelecionado.first.nome
                                      : null,
                            );
                            if (!mounted) return;
                            setState(() {
                              _idProprietario = idProprietario;
                              _veiculos.add(created);
                              _veiculos.sort((a, b) => a.placa
                                  .toLowerCase()
                                  .compareTo(b.placa.toLowerCase()));
                            });
                            Navigator.pop(ctx, created);
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                    'Veiculo criado. Sera sincronizado automaticamente.'),
                                backgroundColor: AppTheme.success,
                              ),
                            );
                          } catch (e) {
                            setDialogState(() => salvando = false);
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Erro ao criar veiculo: $e'),
                                backgroundColor: AppTheme.danger,
                              ),
                            );
                          }
                        },
                  icon: salvando
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_outlined),
                  label: Text(salvando ? 'Salvando...' : 'Salvar'),
                ),
              ],
            );
          },
        );
      },
    );

    placaCtrl.dispose();
    modeloCtrl.dispose();
    return result;
  }

  Future<void> _selecionarMotorista() async {
    final selected = await showModalBottomSheet<Motorista?>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        final buscaCtrl = TextEditingController();
        return StatefulBuilder(
          builder: (context, setModalState) {
            final termo = buscaCtrl.text.trim().toLowerCase();
            final base = _motoristasFiltrados;
            final filtrados = base.where((m) {
              final nome = m.nome.toLowerCase();
              final apelido = (m.apelido ?? '').toLowerCase();
              final doc = (m.documento ?? '').toLowerCase();
              return termo.isEmpty ||
                  nome.contains(termo) ||
                  apelido.contains(termo) ||
                  doc.contains(termo);
            }).toList()
              ..sort((a, b) =>
                  a.nome.toLowerCase().compareTo(b.nome.toLowerCase()));

            return Padding(
              padding: EdgeInsets.only(
                left: 12,
                right: 12,
                top: 12,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 12,
              ),
              child: SizedBox(
                height: MediaQuery.of(ctx).size.height * 0.72,
                child: Column(
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Selecionar motorista',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        TextButton.icon(
                          onPressed: () async {
                            final created = await _criarMotoristaInline(
                              nomeInicial: buscaCtrl.text.trim(),
                            );
                            if (created == null) return;
                            if (!mounted) return;
                            Navigator.of(ctx).pop(created);
                          },
                          icon: const Icon(Icons.add),
                          label: const Text('Novo'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: buscaCtrl,
                      autofocus: true,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(
                        labelText: 'Digite para filtrar',
                        prefixIcon: Icon(Icons.search),
                      ),
                      onChanged: (_) => setModalState(() {}),
                    ),
                    const SizedBox(height: 10),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton(
                        onPressed: () => Navigator.of(ctx).pop(null),
                        child: const Text('Nao informado'),
                      ),
                    ),
                    Expanded(
                      child: filtrados.isEmpty
                          ? Center(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Text('Nenhum motorista encontrado'),
                                  const SizedBox(height: 8),
                                  OutlinedButton.icon(
                                    onPressed: () async {
                                      final created =
                                          await _criarMotoristaInline(
                                        nomeInicial: buscaCtrl.text.trim(),
                                      );
                                      if (created == null) return;
                                      if (!mounted) return;
                                      Navigator.of(ctx).pop(created);
                                    },
                                    icon: const Icon(Icons.add),
                                    label: const Text('Cadastrar agora'),
                                  ),
                                ],
                              ),
                            )
                          : ListView.separated(
                              itemCount: filtrados.length,
                              separatorBuilder: (_, __) =>
                                  const Divider(height: 1),
                              itemBuilder: (_, i) {
                                final m = filtrados[i];
                                return ListTile(
                                  dense: true,
                                  title: Text(m.nomeExibicao),
                                  subtitle: m.documento == null ||
                                          m.documento!.trim().isEmpty
                                      ? null
                                      : Text(m.documento!),
                                  trailing: _idMotorista == m.idMotorista
                                      ? const Icon(Icons.check_circle,
                                          color: AppTheme.success)
                                      : null,
                                  onTap: () => Navigator.of(ctx).pop(m),
                                );
                              },
                            ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    setState(() {
      _idMotorista = selected?.idMotorista;
      _motoristaNomeFallback = selected?.nomeExibicao;

      final idProprietarioMotorista = selected?.idProprietario?.trim();
      if (idProprietarioMotorista != null &&
          idProprietarioMotorista.isNotEmpty &&
          idProprietarioMotorista != _idProprietario) {
        _idProprietario = idProprietarioMotorista;
        _proprietarioNomeFallback =
            _nomeProprietarioPorId(idProprietarioMotorista);

        final veiculo = _veiculoSelecionado;
        if (veiculo != null &&
            veiculo.idProprietario != idProprietarioMotorista) {
          _idVeiculo = null;
          _veiculoNomeFallback = null;
          _odometroMin = null;
        }
      }
    });
    await _atualizarOdometroMin();
  }

  Future<Motorista?> _criarMotoristaInline({String? nomeInicial}) async {
    final nomeCtrl = TextEditingController(text: nomeInicial ?? '');
    final docCtrl = TextEditingController();
    String? idProprietario = _idProprietario;
    bool salvando = false;

    final result = await showDialog<Motorista>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Novo motorista'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: nomeCtrl,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(labelText: 'Nome *'),
                    ),
                    const SizedBox(height: 8),
                    EmpresaPickerField(
                      proprietarios: _proprietarios,
                      value: idProprietario,
                      label: 'Empresa responsavel *',
                      hint: 'Selecione a empresa do motorista',
                      onChanged: (v) =>
                          setDialogState(() => idProprietario = v),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: docCtrl,
                      decoration: const InputDecoration(labelText: 'Documento'),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: salvando ? null : () => Navigator.pop(ctx),
                  child: const Text('Cancelar'),
                ),
                ElevatedButton.icon(
                  onPressed: salvando
                      ? null
                      : () async {
                          final nome = nomeCtrl.text.trim();
                          if (nome.isEmpty) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Informe o nome do motorista.'),
                                backgroundColor: AppTheme.danger,
                              ),
                            );
                            return;
                          }
                          if ((idProprietario ?? '').trim().isEmpty) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                    'Selecione a empresa responsavel do motorista.'),
                                backgroundColor: AppTheme.danger,
                              ),
                            );
                            return;
                          }
                          setDialogState(() => salvando = true);
                          try {
                            final proprietarioSelecionado = _proprietarios
                                .where((p) => p.idProprietario == idProprietario)
                                .toList();
                            final localProprietario =
                                proprietarioSelecionado.isNotEmpty
                                    ? proprietarioSelecionado.first.local
                                    : null;
                            final novo = Motorista(
                              nome: nome,
                              documento: docCtrl.text.trim().isEmpty
                                  ? null
                                  : docCtrl.text.trim(),
                              idProprietario: idProprietario,
                              local: localProprietario ?? _local,
                            );
                            final id =
                                await AppState.instance.db.saveMotoristaLocal(
                              novo,
                              isCreate: true,
                            );
                            final created = Motorista(
                              idMotorista: id,
                              nome: nome,
                              documento: novo.documento,
                              idProprietario: idProprietario,
                              local: novo.local,
                            );
                            if (!mounted) return;
                            setState(() {
                              _idProprietario = idProprietario;
                              _motoristas.add(created);
                              _motoristas.sort((a, b) => a.nome
                                  .toLowerCase()
                                  .compareTo(b.nome.toLowerCase()));
                            });
                            Navigator.pop(ctx, created);
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                    'Motorista criado. Sera sincronizado automaticamente.'),
                                backgroundColor: AppTheme.success,
                              ),
                            );
                          } catch (e) {
                            setDialogState(() => salvando = false);
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Erro ao criar motorista: $e'),
                                backgroundColor: AppTheme.danger,
                              ),
                            );
                          }
                        },
                  icon: salvando
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_outlined),
                  label: Text(salvando ? 'Salvando...' : 'Salvar'),
                ),
              ],
            );
          },
        );
      },
    );

    nomeCtrl.dispose();
    docCtrl.dispose();
    return result;
  }

  @override
  Widget build(BuildContext context) {
    final bottomSafePadding = MediaQuery.of(context).viewPadding.bottom;
    return PopScope(
      canPop: false,
      onPopInvoked: (didPop) {
        if (!didPop) _confirmarSaida();
      },
      child: Scaffold(
      appBar: AppBar(
        title: Text(_isEdit ? 'Editar abastecimento' : 'Novo abastecimento'),
        actions: [
          if (_isEdit &&
              widget.original?.status != 'Cancelado' &&
              Roles.isAdmin(AppState.instance.auth.tipo))
            IconButton(
              tooltip: 'Cancelar registro',
              onPressed: _confirmarCancelamento,
              icon: const Icon(Icons.block, color: AppTheme.danger),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : LoadingOverlay(
              show: _saving,
              message: 'Salvando...',
              child: ListView(
                padding:
                    EdgeInsets.fromLTRB(14, 14, 14, 112 + bottomSafePadding),
                children: [
                  if (_proprietarioBloqueado)
                    Container(
                      padding: const EdgeInsets.all(10),
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: AppTheme.danger.withOpacity(0.15),
                        border: Border.all(color: AppTheme.danger),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        'Proprietario BLOQUEADO. Nao permite novos registros.',
                        style: TextStyle(
                            color: AppTheme.danger,
                            fontWeight: FontWeight.w600),
                      ),
                    ),
                  const SectionHeader(texto: 'Dados principais'),
                  InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: _selecionarVeiculo,
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Placa / Veiculo',
                        suffixIcon: Icon(Icons.search),
                      ),
                      child: Text(
                        _idVeiculo == null
                            ? 'Toque para selecionar'
                            : _veiculoNomeSelecionado,
                        style: TextStyle(
                          color: _idVeiculo == null
                              ? AppTheme.textMuted
                              : AppTheme.textStrong,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: _selecionarProprietario,
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Proprietario',
                        suffixIcon: Icon(Icons.search),
                      ),
                      child: Text(
                        _idProprietario == null
                            ? 'Preenchido automaticamente pela placa'
                            : _proprietarioNomeSelecionado,
                        style: TextStyle(
                          color: _idProprietario == null
                              ? AppTheme.textMuted
                              : AppTheme.textStrong,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: _selecionarMotorista,
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Motorista',
                        suffixIcon: Icon(Icons.search),
                      ),
                      child: Text(
                        _motoristaNomeSelecionado,
                        style: TextStyle(
                          color: _idMotorista == null
                              ? AppTheme.textMuted
                              : AppTheme.textStrong,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: _tipoCombustivel,
                    isExpanded: true,
                    decoration:
                        const InputDecoration(labelText: 'Tipo de combustivel'),
                    items: _tiposCombustivel
                        .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                        .toList(),
                    onChanged: _isEdit
                        ? null
                        : (v) {
                            setState(() => _tipoCombustivel = v);
                            _recalcular();
                          },
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () async {
                      final p = await pickDateIso(context, initialIso: _data);
                      if (p != null) setState(() => _data = p);
                    },
                    icon: const Icon(Icons.calendar_today_outlined),
                    label: Text('Data: ${AppDates.formatDateBr(_data)}'),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: () async {
                      final parts = _hora.split(':');
                      final selected = await showTimePicker(
                        context: context,
                        initialTime: TimeOfDay(
                          hour:
                              int.tryParse(parts.first) ?? DateTime.now().hour,
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
                      }
                    },
                    icon: const Icon(Icons.schedule_outlined),
                    label: Text('Hora: $_hora'),
                  ),
                  const SizedBox(height: 18),
                  const SectionHeader(texto: 'Medicao'),
                  DecimalField(
                    controller: _litrosCtrl,
                    label: 'Quantidade',
                    suffix: 'L',
                    onChanged: (_) => _recalcular(),
                  ),
                  const SizedBox(height: 12),
                  DecimalField(
                    controller: _odometroCtrl,
                    label: _odometroMin != null
                        ? 'Odometro${_proprietarioSelecionadoExigeOdometro ? ' *' : ''} (minimo: ${AppDates.number(_odometroMin! + 1, digits: 0)})'
                        : 'Odometro${_proprietarioSelecionadoExigeOdometro ? ' *' : ''}',
                    suffix: 'km',
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppTheme.surfaceAlt,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: AppTheme.border),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Valor por litro',
                                  style: TextStyle(
                                      color: AppTheme.textMuted, fontSize: 11)),
                              const SizedBox(height: 3),
                              Text(AppDates.money(_valorPorLitro),
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700)),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppTheme.primary.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: AppTheme.primary),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Valor total',
                                  style: TextStyle(
                                      color: AppTheme.textMuted, fontSize: 11)),
                              const SizedBox(height: 3),
                              Text(AppDates.money(_valorTotal),
                                  style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w800,
                                      color: AppTheme.primary)),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  const SectionHeader(texto: 'Outros'),
                  DropdownButtonFormField<String>(
                    value: _local,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Local'),
                    items: AppState.instance.auth.filiaisAcesso
                        .map((l) => DropdownMenuItem(value: l, child: Text(l)))
                        .toList(),
                    onChanged: (v) {
                      setState(() => _local = v);
                      _recalcular();
                    },
                  ),
                  const SizedBox(height: 12),
                  const SectionHeader(texto: 'Imagens'),
                  _buildImagemAnexoCard(
                    titulo: 'Foto Hodometro',
                    url: _fotoOdometroUrl,
                    bomba: false,
                  ),
                  _buildImagemAnexoCard(
                    titulo: 'Imagem Bomba',
                    url: _bombaUrl,
                    bomba: true,
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _obsCtrl,
                    maxLines: 3,
                    decoration: const InputDecoration(
                        labelText: 'Observacao (opcional)'),
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton.icon(
                    onPressed: _saving ? null : _salvar,
                    icon: const Icon(Icons.save_outlined),
                    label: Text(_isEdit ? 'Salvar alteracoes' : 'Registrar'),
                  ),
                  const SizedBox(height: 8),
                  if (_isEdit && widget.original!.pendingSync)
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text(
                        'Registro pendente de envio - edicao offline pode ser sobrescrita apos sync.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppTheme.warning),
                      ),
                    ),
                ],
              ),
            ),
      ),
    );
  }
}

enum _SaidaAcao { continuar, descartar, salvarRascunho }

class _AutoPrintResult {
  final bool success;
  final String message;

  const _AutoPrintResult({
    required this.success,
    required this.message,
  });
}
