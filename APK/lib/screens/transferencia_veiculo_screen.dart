import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/models.dart';
import '../widgets/common.dart';

class TransferenciaVeiculoScreen extends StatefulWidget {
  const TransferenciaVeiculoScreen({super.key});

  @override
  State<TransferenciaVeiculoScreen> createState() =>
      _TransferenciaVeiculoScreenState();
}

class _TransferenciaVeiculoScreenState
    extends State<TransferenciaVeiculoScreen> {
  bool _loading = true;
  bool _salvando = false;

  List<Veiculo> _veiculos = [];
  List<Proprietario> _proprietarios = [];

  Veiculo? _veiculoSelecionado;
  Proprietario? _novoProprietario;

  final _veiculoBuscaCtrl = TextEditingController();
  final _proprietarioBuscaCtrl = TextEditingController();
  final _observacaoCtrl = TextEditingController();
  DateTime _dataTransferencia = DateTime.now();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _veiculoBuscaCtrl.dispose();
    _proprietarioBuscaCtrl.dispose();
    _observacaoCtrl.dispose();
    super.dispose();
  }

  String _norm(String? value) => (value ?? '').trim().toLowerCase();

  List<Veiculo> get _veiculosFiltrados {
    final term = _norm(_veiculoBuscaCtrl.text);
    if (term.isEmpty) return _veiculos.take(80).toList();
    return _veiculos.where((v) {
      return _norm(v.placa).contains(term) ||
          _norm(v.modelo).contains(term) ||
          _norm(v.marca).contains(term) ||
          _norm(v.proprietarioNome).contains(term);
    }).take(80).toList();
  }

  List<Proprietario> get _proprietariosFiltrados {
    final term = _norm(_proprietarioBuscaCtrl.text);
    if (term.isEmpty) return _proprietarios.take(80).toList();
    return _proprietarios.where((p) {
      return _norm(p.nome).contains(term) ||
          _norm(p.celular).contains(term) ||
          _norm(p.local).contains(term);
    }).take(80).toList();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final local = AppState.instance.auth.filialAtual;
    final veiculos = await AppState.instance.db.listVeiculos(local: local);
    final props = await AppState.instance.db.listProprietarios(local: local);
    if (!mounted) return;
    setState(() {
      _veiculos = veiculos;
      _proprietarios = props;
      _loading = false;
    });
  }

  bool _podeTransferir() {
    final v = _veiculoSelecionado;
    final p = _novoProprietario;
    return v != null &&
        p != null &&
        v.idVeiculo != null &&
        p.idProprietario != null &&
        v.idProprietario != p.idProprietario;
  }

  Future<void> _transferir() async {
    if (!_podeTransferir()) return;

    final veiculo = _veiculoSelecionado!;
    final proprietario = _novoProprietario!;

    setState(() => _salvando = true);

    try {
      final ymd = _dataTransferencia.toIso8601String().substring(0, 10);
      final reqBody = {
        'id_proprietario': proprietario.idProprietario,
        'data_transferencia': ymd,
        'observacao': _observacaoCtrl.text.trim(),
      };

      final resp = await AppState.instance.api.post(
        '/veiculos/${veiculo.idVeiculo}/transferir',
        reqBody,
      );

      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(resp is Map && resp['message'] != null
            ? resp['message'].toString()
            : 'Veículo transferido'),
        backgroundColor: AppTheme.success,
      ));
      
      // Trigger local sync refresh
      AppState.instance.sync.run();
      
      // Update UI state
      if (resp is Map && resp['veiculo'] != null) {
         // This is a simplified way to just reset the screen to force load from updated DB
         await _load();
         setState(() {
           _veiculoSelecionado = null;
           _novoProprietario = null;
           _veiculoBuscaCtrl.clear();
           _proprietarioBuscaCtrl.clear();
           _observacaoCtrl.clear();
         });
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Erro ao transferir: $e'),
        backgroundColor: AppTheme.danger,
      ));
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Transferência de Veículo'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _buildContent(),
    );
  }

  Widget _buildContent() {
    return Column(
      children: [
        Expanded(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Coluna Veículos
              Expanded(
                child: Container(
                  decoration: const BoxDecoration(
                    border: Border(right: BorderSide(color: Colors.white12)),
                  ),
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(12),
                        child: TextField(
                          controller: _veiculoBuscaCtrl,
                          onChanged: (_) => setState(() {}),
                          decoration: const InputDecoration(
                            labelText: 'Buscar veículo',
                            prefixIcon: Icon(Icons.search),
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        alignment: Alignment.centerLeft,
                        child: Text(
                          '${_veiculosFiltrados.length} encontrados',
                          style: const TextStyle(fontSize: 12, color: Colors.grey),
                        ),
                      ),
                      Expanded(
                        child: ListView.builder(
                          itemCount: _veiculosFiltrados.length,
                          itemBuilder: (context, i) {
                            final v = _veiculosFiltrados[i];
                            final isSel = v.idVeiculo ==
                                _veiculoSelecionado?.idVeiculo;
                            return ListTile(
                              selected: isSel,
                              selectedTileColor: AppTheme.primary.withOpacity(0.2),
                              title: Text(v.placa,
                                  style: const TextStyle(
                                      fontFamily: 'monospace',
                                      fontWeight: FontWeight.bold,
                                      color: AppTheme.primary)),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(v.modelo ?? v.marca ?? 'Sem modelo'),
                                  Text(v.proprietarioNome ?? 'Sem proprietário',
                                      style: const TextStyle(
                                          fontSize: 12, color: Colors.grey)),
                                ],
                              ),
                              onTap: () {
                                setState(() {
                                  _veiculoSelecionado = v;
                                  _veiculoBuscaCtrl.text = v.placa;
                                });
                              },
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              // Coluna Proprietários
              Expanded(
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: TextField(
                        controller: _proprietarioBuscaCtrl,
                        onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(
                          labelText: 'Novo proprietário',
                          prefixIcon: Icon(Icons.search),
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      alignment: Alignment.centerLeft,
                      child: Text(
                        '${_proprietariosFiltrados.length} encontrados',
                        style: const TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ),
                    Expanded(
                      child: ListView.builder(
                        itemCount: _proprietariosFiltrados.length,
                        itemBuilder: (context, i) {
                          final p = _proprietariosFiltrados[i];
                          final isSel = p.idProprietario ==
                              _novoProprietario?.idProprietario;
                          return ListTile(
                            selected: isSel,
                            selectedTileColor: AppTheme.primary.withOpacity(0.2),
                            title: Text(p.nome, style: const TextStyle(fontWeight: FontWeight.bold)),
                            subtitle: Text(p.local ?? 'Filial não informada', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                            onTap: () {
                              setState(() {
                                _novoProprietario = p;
                                _proprietarioBuscaCtrl.text = p.nome;
                              });
                            },
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        // Resumo
        Container(
          padding: const EdgeInsets.all(16),
          color: AppTheme.surface,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Veículo selecionado:',
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: Colors.grey)),
                        Text(_veiculoSelecionado?.placa ?? 'Nenhum',
                            style: const TextStyle(
                                fontSize: 16, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Novo Proprietário:',
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: Colors.grey)),
                        Text(_novoProprietario?.nome ?? 'Nenhum',
                            style: const TextStyle(
                                fontSize: 16, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Row(
                      children: [
                        const Text('Data: ',
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: Colors.grey)),
                        TextButton(
                          onPressed: () async {
                            final dt = await showDatePicker(
                              context: context,
                              initialDate: _dataTransferencia,
                              firstDate: DateTime(2000),
                              lastDate: DateTime(2100),
                            );
                            if (dt != null) {
                              setState(() => _dataTransferencia = dt);
                            }
                          },
                          child: Text(
                              _dataTransferencia.toIso8601String().substring(0, 10)),
                        )
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _observacaoCtrl,
                decoration: const InputDecoration(
                  labelText: 'Observação (Ex.: venda, contrato, etc.)',
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _salvando || !_podeTransferir() ? null : _transferir,
                  child: _salvando
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Transferir Titularidade'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
