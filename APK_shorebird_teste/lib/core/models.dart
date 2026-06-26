import 'dart:convert';

/// Modelos espelhando as entidades do backend Laravel.
/// Todos suportam fromJson / toJson para trafegar na API.

int? _asInt(dynamic v) {
  if (v == null) return null;
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString());
}

String? _asId(dynamic v) {
  if (v == null) return null;
  final text = v.toString().trim();
  return text.isEmpty ? null : text;
}

double? _asDouble(dynamic v) {
  if (v == null) return null;
  if (v is double) return v;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString().replaceAll(',', '.'));
}

String? _asString(dynamic v) {
  if (v == null) return null;
  return v.toString();
}

bool? _asBool(dynamic v) {
  if (v == null) return null;
  if (v is bool) return v;
  if (v is num) return v != 0;
  final txt = v.toString().toLowerCase();
  if (txt == 'true' || txt == '1') return true;
  if (txt == 'false' || txt == '0') return false;
  return null;
}

List<String> _asStringList(dynamic v) {
  final raw = <dynamic>[];
  if (v is List) {
    raw.addAll(v);
  } else if (v is String && v.trim().isNotEmpty) {
    try {
      final decoded = jsonDecode(v);
      if (decoded is List) {
        raw.addAll(decoded);
      } else {
        raw.addAll(v.split(RegExp(r'[,;|]')));
      }
    } catch (_) {
      raw.addAll(v.split(RegExp(r'[,;|]')));
    }
  }

  final out = <String>[];
  for (final item in raw) {
    final text = item.toString().trim();
    final lower = text.toLowerCase();
    final normalized = switch (lower) {
      'garagem' || 'garagem cariacica' || 'cariacica' => 'Matriz',
      'garagem viana' || 'filial viana' => 'Viana',
      _ => text,
    };
    if (['Matriz', 'Viana'].contains(normalized) && !out.contains(normalized)) {
      out.add(normalized);
    }
  }
  return out.isEmpty ? const ['Matriz', 'Viana'] : out;
}

class Proprietario {
  final String? idProprietario;
  final String nome;
  final String status; // ativo | bloqueado | inativo
  final String? responsavel;
  final String? celular;
  final String? observacao;
  final String? dataRegistro;
  final String? local;
  final bool odometroObrigatorio;

  Proprietario({
    this.idProprietario,
    required this.nome,
    this.status = 'ativo',
    this.responsavel,
    this.celular,
    this.observacao,
    this.dataRegistro,
    this.local,
    this.odometroObrigatorio = false,
  });

  factory Proprietario.fromJson(Map<String, dynamic> j) => Proprietario(
        idProprietario: _asId(j['id_proprietario']),
        nome: _asString(j['nome']) ?? '',
        status: _asString(j['status']) ?? 'ativo',
        responsavel: _asString(j['responsavel']),
        celular: _asString(j['celular']),
        observacao: _asString(j['observacao']),
        dataRegistro: _asString(j['data_registro']),
        local: _asString(j['local']),
        odometroObrigatorio: _asBool(j['odometro_obrigatorio']) ?? false,
      );

  Map<String, dynamic> toJson() => {
        if (idProprietario != null) 'id_proprietario': idProprietario,
        'nome': nome,
        'status': status,
        'responsavel': responsavel,
        'celular': celular,
        'observacao': observacao,
        'local': local,
        'odometro_obrigatorio': odometroObrigatorio,
      };
}

class Veiculo {
  final String? idVeiculo;
  final String placa;
  final String? marca;
  final String? modelo;
  final int? ano;
  final String? tipoCombustivel;
  final String? numeroChassi;
  final String? idProprietario;
  final double? odometro;
  final String? renavam;
  final String? cor;
  final String? foto;
  final String? local;

  // joins (somente leitura)
  final String? proprietarioNome;

  Veiculo({
    this.idVeiculo,
    required this.placa,
    this.marca,
    this.modelo,
    this.ano,
    this.tipoCombustivel,
    this.numeroChassi,
    this.idProprietario,
    this.odometro,
    this.renavam,
    this.cor,
    this.foto,
    this.local,
    this.proprietarioNome,
  });

  factory Veiculo.fromJson(Map<String, dynamic> j) => Veiculo(
        idVeiculo: _asId(j['id_veiculo']),
        placa: _asString(j['placa']) ?? '',
        marca: _asString(j['marca']),
        modelo: _asString(j['modelo']),
        ano: _asInt(j['ano']),
        tipoCombustivel: _asString(j['tipo_combustivel']),
        numeroChassi: _asString(j['numero_chassi']),
        idProprietario: _asId(j['id_proprietario']),
        odometro: _asDouble(j['odometro']),
        renavam: _asString(j['renavam']),
        cor: _asString(j['cor']),
        foto: _asString(j['foto']),
        local: _asString(j['local']),
        proprietarioNome: _asString(j['proprietario_nome']) ??
            _asString(
                (j['proprietario'] is Map) ? j['proprietario']['nome'] : null),
      );

  Map<String, dynamic> toJson() => {
        if (idVeiculo != null) 'id_veiculo': idVeiculo,
        'placa': placa,
        'marca': marca,
        'modelo': modelo,
        'ano': ano,
        'tipo_combustivel': tipoCombustivel,
        'numero_chassi': numeroChassi,
        'id_proprietario': idProprietario,
        'odometro': odometro,
        'renavam': renavam,
        'cor': cor,
        'foto': foto,
        'local': local,
      };

  String get resumo {
    final parts = <String>[placa];
    if (modelo != null && modelo!.isNotEmpty) {
      parts.add(modelo!);
    } else if (marca != null && marca!.isNotEmpty) {
      parts.add(marca!);
    }
    return parts.join(' - ');
  }
}

class Motorista {
  final String? idMotorista;
  final String nome;
  final String? apelido;
  final String? idProprietario;
  final String? documento;
  final String? celular;
  final String? local;
  final String? proprietarioNome;

  Motorista({
    this.idMotorista,
    required this.nome,
    this.apelido,
    this.idProprietario,
    this.documento,
    this.celular,
    this.local,
    this.proprietarioNome,
  });

  factory Motorista.fromJson(Map<String, dynamic> j) => Motorista(
        idMotorista: _asId(j['id_motorista']),
        nome: _asString(j['nome']) ?? '',
        apelido: _asString(j['apelido']),
        idProprietario: _asId(j['id_proprietario']),
        documento: _asString(j['documento']),
        celular: _asString(j['celular']),
        local: _asString(j['local']),
        proprietarioNome: _asString(j['proprietario_nome']) ??
            _asString(
                (j['proprietario'] is Map) ? j['proprietario']['nome'] : null),
      );

  Map<String, dynamic> toJson() => {
        if (idMotorista != null) 'id_motorista': idMotorista,
        'nome': nome,
        'apelido': apelido,
        'id_proprietario': idProprietario,
        'documento': documento,
        'celular': celular,
        'local': local,
      };

  String get nomeExibicao {
    final a = apelido?.trim();
    if (a == null || a.isEmpty) return nome;
    return '$nome ($a)';
  }
}

class ValorCombustivel {
  final String? idValor;
  final String tipoCombustivel;
  final double valor;
  final String data; // yyyy-MM-dd
  final String? responsavel;
  final String? local;

  ValorCombustivel({
    this.idValor,
    required this.tipoCombustivel,
    required this.valor,
    required this.data,
    this.responsavel,
    this.local,
  });

  factory ValorCombustivel.fromJson(Map<String, dynamic> j) => ValorCombustivel(
        idValor: _asId(j['id_valor']),
        tipoCombustivel: _asString(j['tipo_combustivel']) ?? '',
        valor: _asDouble(j['valor']) ?? 0,
        data: _asString(j['data']) ?? '',
        responsavel: _asString(j['responsavel']),
        local: _asString(j['local']),
      );

  Map<String, dynamic> toJson() => {
        if (idValor != null) 'id_valor': idValor,
        'tipo_combustivel': tipoCombustivel,
        'valor': valor,
        'data': data,
        'responsavel': responsavel,
        'local': local,
      };
}

class Abastecimento {
  final String? idAbastecimento;
  final String data;
  final String? dataHora;
  final String? idVeiculo;
  final String? idProprietario;
  final String? idMotorista;
  final String? tipoCombustivel;
  final double quantidadeLitros;
  final double? valorPorLitro; // imutavel apos criacao
  final double? valorTotal;
  final double? odometro;
  final String? local;
  final String? status;
  final String? responsavel;
  final String? observacao;
  final String? notaFiscal;
  final String? dataPagamento;
  final String? nfeEmissao;
  final String? fotoOdometro;
  final String? bomba;
  final String? anexo;
  final String? imagemVerificadaPorId;
  final String? imagemVerificadaPor;
  final String? imagemVerificadaEm;
  final bool baixaAbastecimento;
  final String? dataBaixa;

  // joins leitura
  final String? veiculoPlaca;
  final String? proprietarioNome;
  final String? motoristaNome;

  // offline tracking
  final String? localUuid;
  final bool pendingSync;

  Abastecimento({
    this.idAbastecimento,
    required this.data,
    this.dataHora,
    this.idVeiculo,
    this.idProprietario,
    this.idMotorista,
    this.tipoCombustivel,
    required this.quantidadeLitros,
    this.valorPorLitro,
    this.valorTotal,
    this.odometro,
    this.local,
    this.status,
    this.responsavel,
    this.observacao,
    this.notaFiscal,
    this.dataPagamento,
    this.nfeEmissao,
    this.fotoOdometro,
    this.bomba,
    this.anexo,
    this.imagemVerificadaPorId,
    this.imagemVerificadaPor,
    this.imagemVerificadaEm,
    this.baixaAbastecimento = false,
    this.dataBaixa,
    this.veiculoPlaca,
    this.proprietarioNome,
    this.motoristaNome,
    this.localUuid,
    this.pendingSync = false,
  });

  factory Abastecimento.fromJson(Map<String, dynamic> j) => Abastecimento(
        idAbastecimento: _asString(j['id_abastecimento']),
        data: _asString(j['data']) ?? '',
        dataHora: _asString(j['data_hora']),
        idVeiculo: _asId(j['id_veiculo']),
        idProprietario: _asId(j['id_proprietario']),
        idMotorista: _asId(j['id_motorista']),
        tipoCombustivel: _asString(j['tipo_combustivel']),
        quantidadeLitros: _asDouble(j['quantidade_litros']) ?? 0,
        valorPorLitro: _asDouble(j['valor_por_litro']),
        valorTotal: _asDouble(j['valor_total']),
        odometro: _asDouble(j['odometro']),
        local: _asString(j['local']),
        status: _asString(j['status']),
        responsavel: _asString(j['responsavel']),
        observacao: _asString(j['observacao']),
        notaFiscal: _asString(j['nota_fiscal']),
        dataPagamento: _asString(j['data_pagamento']),
        nfeEmissao: _asString(j['nfe_emissao']),
        fotoOdometro: _asString(j['foto_odometro']),
        bomba: _asString(j['bomba']),
        anexo: _asString(j['anexo']),
        imagemVerificadaPorId: _asString(j['imagem_verificada_por_id']),
        imagemVerificadaPor: _asString(j['imagem_verificada_por']),
        imagemVerificadaEm: _asString(j['imagem_verificada_em']),
        baixaAbastecimento: _asBool(j['baixa_abastecimento']) ?? false,
        dataBaixa: _asString(j['data_baixa']),
        veiculoPlaca: _asString(j['veiculo_placa']) ??
            _asString((j['veiculo'] is Map) ? j['veiculo']['placa'] : null),
        proprietarioNome: _asString(j['proprietario_nome']) ??
            _asString(
                (j['proprietario'] is Map) ? j['proprietario']['nome'] : null),
        motoristaNome: _asString(j['motorista_nome']) ??
            _asString((j['motorista'] is Map) ? j['motorista']['nome'] : null),
      );

  Map<String, dynamic> toJson() => {
        if (idAbastecimento != null) 'id_abastecimento': idAbastecimento,
        'data': data,
        if (dataHora != null) 'data_hora': dataHora,
        'id_veiculo': idVeiculo,
        'id_proprietario': idProprietario,
        if (idMotorista != null) 'id_motorista': idMotorista,
        'tipo_combustivel': tipoCombustivel,
        'quantidade_litros': quantidadeLitros,
        if (valorPorLitro != null) 'valor_por_litro': valorPorLitro,
        if (valorTotal != null) 'valor_total': valorTotal,
        if (odometro != null) 'odometro': odometro,
        if (local != null) 'local': local,
        if (status != null) 'status': status,
        if (responsavel != null) 'responsavel': responsavel,
        if (observacao != null) 'observacao': observacao,
        if (notaFiscal != null) 'nota_fiscal': notaFiscal,
        if (dataPagamento != null) 'data_pagamento': dataPagamento,
        if (nfeEmissao != null) 'nfe_emissao': nfeEmissao,
        if (fotoOdometro != null) 'foto_odometro': fotoOdometro,
        if (bomba != null) 'bomba': bomba,
        if (anexo != null) 'anexo': anexo,
        if (imagemVerificadaPorId != null)
          'imagem_verificada_por_id': imagemVerificadaPorId,
        if (imagemVerificadaPor != null)
          'imagem_verificada_por': imagemVerificadaPor,
        if (imagemVerificadaEm != null)
          'imagem_verificada_em': imagemVerificadaEm,
        'baixa_abastecimento': baixaAbastecimento,
        if (dataBaixa != null) 'data_baixa': dataBaixa,
      };
}

class Usuario {
  final String? idUsuario;
  final String nome;
  final String login;
  final String tipo; // admin | operador | visualizador
  final String? email;
  final List<String> filiaisAcesso;

  Usuario({
    this.idUsuario,
    required this.nome,
    required this.login,
    required this.tipo,
    this.email,
    this.filiaisAcesso = const ['Matriz', 'Viana'],
  });

  factory Usuario.fromJson(Map<String, dynamic> j) => Usuario(
        idUsuario: _asId(j['id_usuario'] ?? j['id_user'] ?? j['id']),
        nome: _asString(j['nome']) ?? '',
        login: _asString(j['login']) ?? '',
        tipo: _asString(j['tipo']) ?? 'operador',
        email: _asString(j['email']),
        filiaisAcesso: _asStringList(j['filiais_acesso']),
      );

  Map<String, dynamic> toJson({String? senha}) => {
        if (idUsuario != null) 'id_user': idUsuario,
        'nome': nome,
        'login': login,
        'tipo': tipo,
        if (email != null) 'email': email,
        'filiais_acesso': filiaisAcesso,
        if (senha != null && senha.isNotEmpty) 'password': senha,
      };
}

class EntradaNota {
  final String? idFinanceiro;
  final String data;
  final String? dataHora;
  final String? numeroNotaFiscal;
  final String? tipo;
  final double? quantidade;
  final double? valorLitro;
  final double? valor;
  final double? custoTransporteLitro;
  final double? custoTransporteTotal;
  final double? valorCompraFinal;
  final String? responsavel;
  final String? fotoNota;
  final String? local;
  final String? notaVerificacaoStatus;
  final String? notaVerificacaoMensagem;
  final String? notaVerificacaoTipo;
  final double? notaVerificacaoConfianca;
  final String? notaVerificadaEm;

  EntradaNota({
    this.idFinanceiro,
    required this.data,
    this.dataHora,
    this.numeroNotaFiscal,
    this.tipo,
    this.quantidade,
    this.valorLitro,
    this.valor,
    this.custoTransporteLitro,
    this.custoTransporteTotal,
    this.valorCompraFinal,
    this.responsavel,
    this.fotoNota,
    this.local,
    this.notaVerificacaoStatus,
    this.notaVerificacaoMensagem,
    this.notaVerificacaoTipo,
    this.notaVerificacaoConfianca,
    this.notaVerificadaEm,
  });

  factory EntradaNota.fromJson(Map<String, dynamic> j) => EntradaNota(
        idFinanceiro: _asString(j['id_financeiro']),
        data: _asString(j['data']) ?? '',
        dataHora: _asString(j['data_hora']),
        numeroNotaFiscal: _asString(j['numero_nota_fiscal']),
        tipo: _asString(j['tipo']),
        quantidade: _asDouble(j['quantidade']),
        valorLitro: _asDouble(j['valor_litro']),
        valor: _asDouble(j['valor']),
        custoTransporteLitro: _asDouble(j['custo_transporte_litro']),
        custoTransporteTotal: _asDouble(j['custo_transporte_total']),
        valorCompraFinal: _asDouble(j['valor_compra_final']),
        responsavel: _asString(j['responsavel']),
        fotoNota: _asString(j['foto_nota']),
        local: _asString(j['local']),
        notaVerificacaoStatus: _asString(j['nota_verificacao_status']),
        notaVerificacaoMensagem: _asString(j['nota_verificacao_mensagem']),
        notaVerificacaoTipo: _asString(j['nota_verificacao_tipo']),
        notaVerificacaoConfianca: _asDouble(j['nota_verificacao_confianca']),
        notaVerificadaEm: _asString(j['nota_verificada_em']),
      );

  Map<String, dynamic> toJson() => {
        if (idFinanceiro != null) 'id_financeiro': idFinanceiro,
        'data': data,
        if (dataHora != null) 'data_hora': dataHora,
        'numero_nota_fiscal': numeroNotaFiscal,
        'tipo': tipo,
        'quantidade': quantidade,
        'valor_litro': valorLitro,
        'valor': valor,
        if (custoTransporteLitro != null)
          'custo_transporte_litro': custoTransporteLitro,
        if (custoTransporteTotal != null)
          'custo_transporte_total': custoTransporteTotal,
        if (valorCompraFinal != null) 'valor_compra_final': valorCompraFinal,
        'responsavel': responsavel,
        'foto_nota': fotoNota,
        if (local != null) 'local': local,
        if (notaVerificacaoStatus != null)
          'nota_verificacao_status': notaVerificacaoStatus,
        if (notaVerificacaoMensagem != null)
          'nota_verificacao_mensagem': notaVerificacaoMensagem,
        if (notaVerificacaoTipo != null)
          'nota_verificacao_tipo': notaVerificacaoTipo,
        if (notaVerificacaoConfianca != null)
          'nota_verificacao_confianca': notaVerificacaoConfianca,
        if (notaVerificadaEm != null) 'nota_verificada_em': notaVerificadaEm,
      };
}
