import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api_client.dart';
import '../../core/app_state.dart';
import '../../core/constants.dart';
import '../../core/date_utils.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';

class AbastecimentoFormScreen extends StatefulWidget {
  final Abastecimento? original;
  const AbastecimentoFormScreen({super.key, this.original});

  @override
  State<AbastecimentoFormScreen> createState() =>
      _AbastecimentoFormScreenState();
}

class _AbastecimentoFormScreenState extends State<AbastecimentoFormScreen> {
  bool _loading = true;
  bool _saving = false;

  List<Proprietario> _proprietarios = [];
  List<Veiculo> _veiculos = [];
  List<Motorista> _motoristas = [];
  List<ValorCombustivel> _valores = [];
  List<String> _tiposCombustivel = const ['OLEO DIESEL S10'];

  // form
  int? _idProprietario;
  int? _idVeiculo;
  int? _idMotorista;
  String? _tipoCombustivel;
  String? _local = 'Garagem';
  String? _status = 'Pendente';
  String _data = AppDates.todayIso();
  final _litrosCtrl = TextEditingController();
  final _odometroCtrl = TextEditingController();
  final _obsCtrl = TextEditingController();

  double? _valorPorLitro;
  double? _valorTotal;
  double? _odometroMin;
  String? _fotoOdometroUrl;
  String? _bombaUrl;

  bool get _isEdit => widget.original != null;
  String get _proprietarioNomeSelecionado {
    final id = _idProprietario;
    if (id == null) return '';
    final p = _proprietarios.where((x) => x.idProprietario == id);
    if (p.isEmpty) return '';
    final item = p.first;
    return '${item.nome}${item.status == 'bloqueado' ? ' (bloqueado)' : ''}';
  }

  String get _veiculoNomeSelecionado {
    final id = _idVeiculo;
    if (id == null) return '';
    final v = _veiculos.where((x) => x.idVeiculo == id);
    if (v.isEmpty) return '';
    return v.first.resumo;
  }

  String get _motoristaNomeSelecionado {
    final id = _idMotorista;
    if (id == null) return 'Nao informado';
    final m = _motoristas.where((x) => x.idMotorista == id);
    if (m.isEmpty) return '';
    return m.first.nome;
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _litrosCtrl.dispose();
    _odometroCtrl.dispose();
    _obsCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final db = AppState.instance.db;
    _proprietarios = await db.listProprietarios();
    _veiculos = await db.listVeiculos();
    _motoristas = await db.listMotoristas();
    _valores = await db.listValoresCombustivel();
    _tiposCombustivel = _extrairTiposCombustivel(_valores);

    if (_isEdit) {
      final o = widget.original!;
      _idProprietario = o.idProprietario;
      _idVeiculo = o.idVeiculo;
      _idMotorista = o.idMotorista;
      _tipoCombustivel = o.tipoCombustivel;
      _local = o.local ?? 'Garagem';
      _status = o.status ?? 'Pendente';
      _data = o.data;
      _litrosCtrl.text =
          o.quantidadeLitros.toString().replaceAll('.', ',');
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
    }

    await _atualizarOdometroMin();
    _recalcular();

    if (!mounted) return;
    setState(() => _loading = false);
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
    _odometroMin = await AppState.instance.db.maxOdometro(_idVeiculo!);
  }

  void _recalcular() {
    final litros = parseDecimal(_litrosCtrl.text) ?? 0;
    double? preco = _valorPorLitro;
    if (!_isEdit && _tipoCombustivel != null) {
      // pega valor vigente da tabela local
      final first = _valores
          .where((v) => v.tipoCombustivel == _tipoCombustivel)
          .toList();
      if (first.isNotEmpty) {
        preco = first.first.valor;
      }
    }
    _valorPorLitro = preco;
    _valorTotal = (preco ?? 0) * litros;
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

  bool get _proprietarioBloqueado {
    if (_idProprietario == null) return false;
    final p = _proprietarios.firstWhere(
      (pp) => pp.idProprietario == _idProprietario,
      orElse: () => Proprietario(nome: ''),
    );
    return p.status == 'bloqueado';
  }

  String? _validar() {
    if (_idProprietario == null) return 'Selecione um proprietario.';
    if (_proprietarioBloqueado) {
      return 'Proprietario bloqueado - nao aceita novos abastecimentos.';
    }
    if (_idVeiculo == null) return 'Selecione um veiculo.';
    if (_tipoCombustivel == null) return 'Selecione o tipo de combustivel.';
    final litros = parseDecimal(_litrosCtrl.text);
    if (litros == null || litros <= 0) {
      return 'Informe uma quantidade de litros valida.';
    }
    final odom = parseDecimal(_odometroCtrl.text);
    if (odom != null && _odometroMin != null && odom < _odometroMin! - 0.01) {
      return 'Odometro nao pode ser menor que o ultimo registrado (${AppDates.number(_odometroMin!, digits: 0)}).';
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

    final abast = Abastecimento(
      idAbastecimento: widget.original?.idAbastecimento ?? clientRequestId,
      data: _data,
      dataHora: AppDates.nowLocalIso(),
      idProprietario: _idProprietario,
      idVeiculo: _idVeiculo,
      idMotorista: _idMotorista,
      tipoCombustivel: _tipoCombustivel,
      quantidadeLitros: litros,
      valorPorLitro: _valorPorLitro,
      valorTotal: _valorTotal,
      odometro: odom,
      local: _local,
      status: _status,
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
      if (!_isEdit) {
        // ---- CREATE ----
        try {
          final resp = await AppState.instance.api.post('/abastecimentos', {
            ...abast.toJson(),
            if (clientRequestId != null) '_client_request_id': clientRequestId,
          });
          if (resp is Map) {
            final created = Abastecimento.fromJson(
                Map<String, dynamic>.from(resp));
            // upsert apenas do registro criado (nao re-baixa pagina inteira)
            await db.upsertAbastecimentosRemotos([created]);
            if (!mounted) return;
            Navigator.pop(context, true);
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                content: Text('Registrado #${created.idAbastecimento}'),
                backgroundColor: AppTheme.success));
            return;
          }
        } on OfflineException {
          // cai para fila offline
        } on ApiException catch (e) {
          if (e.isUnauthorized) rethrow;
          // 4xx de negocio -> nao guarda em fila, mostra erro
          if (e.statusCode >= 400 && e.statusCode < 500) {
            rethrow;
          }
          // 5xx persistente (apos retry): cai para fila
        }

        // offline / 5xx: guarda em fila
        await db.insertAbastecimentoLocal(abast);
        if (!mounted) return;
        Navigator.pop(context, true);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Salvo localmente. Sera enviado na proxima sincronizacao.'),
          backgroundColor: AppTheme.warning,
        ));
      } else {
        // ---- UPDATE ----
        final id = widget.original!.idAbastecimento;
        try {
          await AppState.instance.api
              .put('/abastecimentos/$id', abast.toJson());
          // sucesso: atualiza cache local com a versao enviada
          final updated = _buildAbastecimentoFromForm(abast, id: id);
          await db.upsertAbastecimentosRemotos([updated]);
          if (!mounted) return;
          Navigator.pop(context, true);
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Atualizado.'),
              backgroundColor: AppTheme.success));
          return;
        } on OfflineException {
          // cai para fila offline
        } on ApiException catch (e) {
          if (e.isUnauthorized) rethrow;
          if (e.statusCode >= 400 && e.statusCode < 500) {
            rethrow;
          }
          // 5xx: cai para fila
        }

        // offline / 5xx: aplica no banco local + enfileira update
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
              'Alteracoes salvas localmente. Serao enviadas na proxima sincronizacao.'),
          backgroundColor: AppTheme.warning,
        ));
      }
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
      });

      setState(() => _saving = true);
      try {
        final resp = await AppState.instance.api.postMultipartFile(
          '/uploads/drive',
          filePath: localPath,
          fieldName: 'file',
        );
        if (resp is! Map) {
          throw Exception('Resposta invalida do upload.');
        }
        final fileMap = (resp['file'] is Map)
            ? Map<String, dynamic>.from(resp['file'] as Map)
            : <String, dynamic>{};
        final url = (fileMap['webViewLink'] ??
                fileMap['webContentLink'] ??
                fileMap['downloadUrl'])
            ?.toString();
        if (url == null || url.trim().isEmpty) {
          throw Exception('Upload concluido sem URL de retorno.');
        }

        setState(() {
          if (bomba) {
            _bombaUrl = url;
          } else {
            _fotoOdometroUrl = url;
          }
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(bomba
                ? 'Imagem da bomba anexada.'
                : 'Foto do hodometro anexada.'),
            backgroundColor: AppTheme.success,
          ),
        );
      } on OfflineException {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              bomba
                  ? 'Imagem da bomba salva localmente. Sera enviada quando houver internet.'
                  : 'Foto do hodometro salva localmente. Sera enviada quando houver internet.',
            ),
            backgroundColor: AppTheme.warning,
          ),
        );
      }
    } on ApiException catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Upload pendente: ${e.message}'),
          backgroundColor: AppTheme.warning,
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
    final ext = p.extension(source.path).isEmpty ? '.jpg' : p.extension(source.path);
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

  Future<void> _abrirUrl(String url) async {
    if (!_isRemoteUrl(url)) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
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
        content: const Text('O status passara para "Cancelado".'),
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
              return termo.isEmpty || nome.contains(termo) || cel.contains(termo);
            }).toList()
              ..sort((a, b) => a.nome.toLowerCase().compareTo(b.nome.toLowerCase()));

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
                                      final created = await _criarProprietarioInline(
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
                              separatorBuilder: (_, __) => const Divider(height: 1),
                              itemBuilder: (_, i) {
                                final p = filtrados[i];
                                return ListTile(
                                  dense: true,
                                  title: Text(
                                    '${p.nome}${p.status == 'bloqueado' ? ' (bloqueado)' : ''}',
                                  ),
                                  subtitle: p.celular == null || p.celular!.trim().isEmpty
                                      ? null
                                      : Text(p.celular!),
                                  trailing: _idProprietario == p.idProprietario
                                      ? const Icon(Icons.check_circle, color: AppTheme.success)
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
                      decoration: const InputDecoration(labelText: 'Observacao'),
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
                                content: Text('Informe o nome do proprietario.'),
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
                            );
                            final id = await AppState.instance.db.saveProprietarioLocal(
                              novo,
                              isCreate: true,
                            );
                            final created = Proprietario(
                              idProprietario: id,
                              nome: nome,
                              status: 'ativo',
                              celular: novo.celular,
                              observacao: novo.observacao,
                            );
                            if (!mounted) return;
                            setState(() {
                              _proprietarios.add(created);
                              _proprietarios.sort((a, b) =>
                                  a.nome.toLowerCase().compareTo(b.nome.toLowerCase()));
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
              ..sort((a, b) => a.placa.toLowerCase().compareTo(b.placa.toLowerCase()));

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
                              separatorBuilder: (_, __) => const Divider(height: 1),
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
                                      ? const Icon(Icons.check_circle, color: AppTheme.success)
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
    setState(() => _idVeiculo = selected.idVeiculo);
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
                          setDialogState(() => salvando = true);
                          try {
                            final novo = Veiculo(
                              placa: placa,
                              modelo: modeloCtrl.text.trim().isEmpty
                                  ? null
                                  : modeloCtrl.text.trim(),
                              idProprietario: _idProprietario,
                              tipoCombustivel: _tipoCombustivel,
                            );
                            final id = await AppState.instance.db.saveVeiculoLocal(
                              novo,
                              isCreate: true,
                            );
                            final created = Veiculo(
                              idVeiculo: id,
                              placa: placa,
                              modelo: novo.modelo,
                              idProprietario: _idProprietario,
                              tipoCombustivel: novo.tipoCombustivel,
                            );
                            if (!mounted) return;
                            setState(() {
                              _veiculos.add(created);
                              _veiculos.sort((a, b) =>
                                  a.placa.toLowerCase().compareTo(b.placa.toLowerCase()));
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
              final doc = (m.documento ?? '').toLowerCase();
              return termo.isEmpty || nome.contains(termo) || doc.contains(termo);
            }).toList()
              ..sort((a, b) => a.nome.toLowerCase().compareTo(b.nome.toLowerCase()));

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
                                      final created = await _criarMotoristaInline(
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
                              separatorBuilder: (_, __) => const Divider(height: 1),
                              itemBuilder: (_, i) {
                                final m = filtrados[i];
                                return ListTile(
                                  dense: true,
                                  title: Text(m.nome),
                                  subtitle: m.documento == null ||
                                          m.documento!.trim().isEmpty
                                      ? null
                                      : Text(m.documento!),
                                  trailing: _idMotorista == m.idMotorista
                                      ? const Icon(Icons.check_circle, color: AppTheme.success)
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

    setState(() => _idMotorista = selected?.idMotorista);
  }

  Future<Motorista?> _criarMotoristaInline({String? nomeInicial}) async {
    final nomeCtrl = TextEditingController(text: nomeInicial ?? '');
    final docCtrl = TextEditingController();
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
                          setDialogState(() => salvando = true);
                          try {
                            final novo = Motorista(
                              nome: nome,
                              documento: docCtrl.text.trim().isEmpty
                                  ? null
                                  : docCtrl.text.trim(),
                              idProprietario: _idProprietario,
                            );
                            final id = await AppState.instance.db.saveMotoristaLocal(
                              novo,
                              isCreate: true,
                            );
                            final created = Motorista(
                              idMotorista: id,
                              nome: nome,
                              documento: novo.documento,
                              idProprietario: _idProprietario,
                            );
                            if (!mounted) return;
                            setState(() {
                              _motoristas.add(created);
                              _motoristas.sort((a, b) =>
                                  a.nome.toLowerCase().compareTo(b.nome.toLowerCase()));
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
    return Scaffold(
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
                padding: const EdgeInsets.all(14),
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
                    onTap: _selecionarProprietario,
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Proprietario',
                        suffixIcon: Icon(Icons.search),
                      ),
                      child: Text(
                        _idProprietario == null
                            ? 'Toque para selecionar'
                            : _proprietarioNomeSelecionado,
                        style: TextStyle(
                          color: _idProprietario == null
                              ? AppTheme.textMuted
                              : Colors.white,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: _selecionarVeiculo,
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Veiculo',
                        suffixIcon: Icon(Icons.search),
                      ),
                      child: Text(
                        _idVeiculo == null ? 'Toque para selecionar' : _veiculoNomeSelecionado,
                        style: TextStyle(
                          color: _idVeiculo == null
                              ? AppTheme.textMuted
                              : Colors.white,
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
                        labelText: 'Motorista (opcional)',
                        suffixIcon: Icon(Icons.search),
                      ),
                      child: Text(
                        _motoristaNomeSelecionado,
                        style: TextStyle(
                          color: _idMotorista == null
                              ? AppTheme.textMuted
                              : Colors.white,
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
                      final p =
                          await pickDateIso(context, initialIso: _data);
                      if (p != null) setState(() => _data = p);
                    },
                    icon: const Icon(Icons.calendar_today_outlined),
                    label: Text('Data: ${AppDates.formatDateBr(_data)}'),
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
                        ? 'Odometro (minimo: ${AppDates.number(_odometroMin!, digits: 0)})'
                        : 'Odometro',
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
                            border:
                                Border.all(color: AppTheme.border),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Valor por litro',
                                  style: TextStyle(
                                      color: AppTheme.textMuted,
                                      fontSize: 11)),
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
                            border:
                                Border.all(color: AppTheme.primary),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Valor total',
                                  style: TextStyle(
                                      color: AppTheme.textMuted,
                                      fontSize: 11)),
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
                    items: AppConstants.locais
                        .map((l) =>
                            DropdownMenuItem(value: l, child: Text(l)))
                        .toList(),
                    onChanged: (v) => setState(() => _local = v),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: _status,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Status'),
                    items: AppConstants.statusAbastecimento
                        .map((s) =>
                            DropdownMenuItem(value: s, child: Text(s)))
                        .toList(),
                    onChanged: (v) => setState(() => _status = v),
                  ),
                  const SizedBox(height: 12),
                  const SectionHeader(texto: 'Imagens'),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _saving ? null : () => _uploadImagem(bomba: false),
                          icon: const Icon(Icons.photo_camera_outlined),
                          label: const Text('Foto Hodometro'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _saving ? null : () => _uploadImagem(bomba: true),
                          icon: const Icon(Icons.local_gas_station_outlined),
                          label: const Text('Imagem Bomba'),
                        ),
                      ),
                    ],
                  ),
                  if ((_fotoOdometroUrl ?? '').trim().isNotEmpty) ...[
                    const SizedBox(height: 8),
                    InputDecorator(
                      decoration: InputDecoration(
                        labelText: _isRemoteUrl(_fotoOdometroUrl)
                            ? 'Foto Hodometro (URL)'
                            : 'Foto Hodometro (aguardando internet)',
                        suffixIcon: _isRemoteUrl(_fotoOdometroUrl)
                            ? IconButton(
                                icon: const Icon(Icons.open_in_new),
                                onPressed: () => _abrirUrl(_fotoOdometroUrl!),
                              )
                            : const Icon(Icons.cloud_upload_outlined),
                      ),
                      child: Text(
                        _isRemoteUrl(_fotoOdometroUrl)
                            ? _fotoOdometroUrl!
                            : 'Imagem salva localmente. Será enviada na próxima sincronização.',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: _isRemoteUrl(_fotoOdometroUrl)
                              ? AppTheme.primary
                              : AppTheme.warning,
                        ),
                      ),
                    ),
                  ],
                  if ((_bombaUrl ?? '').trim().isNotEmpty) ...[
                    const SizedBox(height: 8),
                    InputDecorator(
                      decoration: InputDecoration(
                        labelText: _isRemoteUrl(_bombaUrl)
                            ? 'Imagem Bomba (URL)'
                            : 'Imagem Bomba (aguardando internet)',
                        suffixIcon: _isRemoteUrl(_bombaUrl)
                            ? IconButton(
                                icon: const Icon(Icons.open_in_new),
                                onPressed: () => _abrirUrl(_bombaUrl!),
                              )
                            : const Icon(Icons.cloud_upload_outlined),
                      ),
                      child: Text(
                        _isRemoteUrl(_bombaUrl)
                            ? _bombaUrl!
                            : 'Imagem salva localmente. Será enviada na próxima sincronização.',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: _isRemoteUrl(_bombaUrl)
                              ? AppTheme.primary
                              : AppTheme.warning,
                        ),
                      ),
                    ),
                  ],
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
    );
  }
}
