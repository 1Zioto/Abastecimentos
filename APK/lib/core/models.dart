/// Modelos espelhando as entidades do backend Laravel.
/// Todos suportam fromJson / toJson para trafegar na API.

int? _asInt(dynamic v) {
  if (v == null) return null;
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString());
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

class Proprietario {
  final int? idProprietario;
  final String nome;
  final String status; // ativo | bloqueado | inativo
  final String? responsavel;
  final String? celular;
  final String? observacao;
  final String? dataRegistro;

  Proprietario({
    this.idProprietario,
    required this.nome,
    this.status = 'ativo',
    this.responsavel,
    this.celular,
    this.observacao,
    this.dataRegistro,
  });

  factory Proprietario.fromJson(Map<String, dynamic> j) => Proprietario(
        idProprietario: _asInt(j['id_proprietario']),
        nome: _asString(j['nome']) ?? '',
        status: _asString(j['status']) ?? 'ativo',
        responsavel: _asString(j['responsavel']),
        celular: _asString(j['celular']),
        observacao: _asString(j['observacao']),
        dataRegistro: _asString(j['data_registro']),
      );

  Map<String, dynamic> toJson() => {
        if (idProprietario != null) 'id_proprietario': idProprietario,
        'nome': nome,
        'status': status,
        'responsavel': responsavel,
        'celular': celular,
        'observacao': observacao,
      };
}

class Veiculo {
  final int? idVeiculo;
  final String placa;
  final String? marca;
  final String? modelo;
  final int? ano;
  final String? tipoCombustivel;
  final String? numeroChassi;
  final int? idProprietario;
  final double? odometro;
  final String? renavam;
  final String? cor;
  final String? foto;

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
    this.proprietarioNome,
  });

  factory Veiculo.fromJson(Map<String, dynamic> j) => Veiculo(
        idVeiculo: _asInt(j['id_veiculo']),
        placa: _asString(j['placa']) ?? '',
        marca: _asString(j['marca']),
        modelo: _asString(j['modelo']),
        ano: _asInt(j['ano']),
        tipoCombustivel: _asString(j['tipo_combustivel']),
        numeroChassi: _asString(j['numero_chassi']),
        idProprietario: _asInt(j['id_proprietario']),
        odometro: _asDouble(j['odometro']),
        renavam: _asString(j['renavam']),
        cor: _asString(j['cor']),
        foto: _asString(j['foto']),
        proprietarioNome: _asString(
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
      };

  String get resumo {
    final parts = <String>[placa];
    if (modelo != null && modelo!.isNotEmpty) parts.add(modelo!);
    else if (marca != null && marca!.isNotEmpty) parts.add(marca!);
    return parts.join(' - ');
  }
}

class Motorista {
  final int? idMotorista;
  final String nome;
  final int? idProprietario;
  final String? documento;
  final String? celular;
  final String? proprietarioNome;

  Motorista({
    this.idMotorista,
    required this.nome,
    this.idProprietario,
    this.documento,
    this.celular,
    this.proprietarioNome,
  });

  factory Motorista.fromJson(Map<String, dynamic> j) => Motorista(
        idMotorista: _asInt(j['id_motorista']),
        nome: _asString(j['nome']) ?? '',
        idProprietario: _asInt(j['id_proprietario']),
        documento: _asString(j['documento']),
        celular: _asString(j['celular']),
        proprietarioNome: _asString(
            (j['proprietario'] is Map) ? j['proprietario']['nome'] : null),
      );

  Map<String, dynamic> toJson() => {
        if (idMotorista != null) 'id_motorista': idMotorista,
        'nome': nome,
        'id_proprietario': idProprietario,
        'documento': documento,
        'celular': celular,
      };
}

class ValorCombustivel {
  final int? idValor;
  final String tipoCombustivel;
  final double valor;
  final String data; // yyyy-MM-dd
  final String? responsavel;

  ValorCombustivel({
    this.idValor,
    required this.tipoCombustivel,
    required this.valor,
    required this.data,
    this.responsavel,
  });

  factory ValorCombustivel.fromJson(Map<String, dynamic> j) =>
      ValorCombustivel(
        idValor: _asInt(j['id_valor']),
        tipoCombustivel: _asString(j['tipo_combustivel']) ?? '',
        valor: _asDouble(j['valor']) ?? 0,
        data: _asString(j['data']) ?? '',
        responsavel: _asString(j['responsavel']),
      );

  Map<String, dynamic> toJson() => {
        if (idValor != null) 'id_valor': idValor,
        'tipo_combustivel': tipoCombustivel,
        'valor': valor,
        'data': data,
        'responsavel': responsavel,
      };
}

class Abastecimento {
  final String? idAbastecimento;
  final String data;
  final String? dataHora;
  final int? idVeiculo;
  final int? idProprietario;
  final int? idMotorista;
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
        idVeiculo: _asInt(j['id_veiculo']),
        idProprietario: _asInt(j['id_proprietario']),
        idMotorista: _asInt(j['id_motorista']),
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
        baixaAbastecimento: _asBool(j['baixa_abastecimento']) ?? false,
        dataBaixa: _asString(j['data_baixa']),
        veiculoPlaca: _asString(
            (j['veiculo'] is Map) ? j['veiculo']['placa'] : null),
        proprietarioNome: _asString(
            (j['proprietario'] is Map) ? j['proprietario']['nome'] : null),
        motoristaNome: _asString(
            (j['motorista'] is Map) ? j['motorista']['nome'] : null),
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
        'baixa_abastecimento': baixaAbastecimento,
        if (dataBaixa != null) 'data_baixa': dataBaixa,
      };
}

class Usuario {
  final int? idUsuario;
  final String nome;
  final String login;
  final String tipo; // admin | operador | visualizador
  final String? email;

  Usuario({
    this.idUsuario,
    required this.nome,
    required this.login,
    required this.tipo,
    this.email,
  });

  factory Usuario.fromJson(Map<String, dynamic> j) => Usuario(
        idUsuario: _asInt(j['id_usuario'] ?? j['id']),
        nome: _asString(j['nome']) ?? '',
        login: _asString(j['login']) ?? '',
        tipo: _asString(j['tipo']) ?? 'operador',
        email: _asString(j['email']),
      );

  Map<String, dynamic> toJson({String? senha}) => {
        if (idUsuario != null) 'id_usuario': idUsuario,
        'nome': nome,
        'login': login,
        'tipo': tipo,
        if (email != null) 'email': email,
        if (senha != null && senha.isNotEmpty) 'senha': senha,
      };
}

class EntradaNota {
  final int? idFinanceiro;
  final String data;
  final String? numeroNotaFiscal;
  final String? tipo;
  final double? quantidade;
  final double? valorLitro;
  final double? valor;
  final String? responsavel;
  final String? fotoNota;

  EntradaNota({
    this.idFinanceiro,
    required this.data,
    this.numeroNotaFiscal,
    this.tipo,
    this.quantidade,
    this.valorLitro,
    this.valor,
    this.responsavel,
    this.fotoNota,
  });

  factory EntradaNota.fromJson(Map<String, dynamic> j) => EntradaNota(
        idFinanceiro: _asInt(j['id_financeiro']),
        data: _asString(j['data']) ?? '',
        numeroNotaFiscal: _asString(j['numero_nota_fiscal']),
        tipo: _asString(j['tipo']),
        quantidade: _asDouble(j['quantidade']),
        valorLitro: _asDouble(j['valor_litro']),
        valor: _asDouble(j['valor']),
        responsavel: _asString(j['responsavel']),
        fotoNota: _asString(j['foto_nota']),
      );

  Map<String, dynamic> toJson() => {
        if (idFinanceiro != null) 'id_financeiro': idFinanceiro,
        'data': data,
        'numero_nota_fiscal': numeroNotaFiscal,
        'tipo': tipo,
        'quantidade': quantidade,
        'valor_litro': valorLitro,
        'valor': valor,
        'responsavel': responsavel,
        'foto_nota': fotoNota,
      };
}
