import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';

/// Regra global de cálculo para novos abastecimentos.
///
/// A data de vigência evita que um registro histórico seja recalculado com
/// um critério diferente do que era aplicado quando ele foi lançado.
class CentavosConfig {
  static const configurarCentavosKey = 'abastecimento_configurar_centavos';
  static const dataInicioKey = 'abastecimento_centavos_data_inicio';
  static const defaultDataInicio = '2026-10-23';

  final bool configurarCentavos;
  final String dataInicio;

  const CentavosConfig({
    required this.configurarCentavos,
    required this.dataInicio,
  });

  bool aplicaNaData(String data) {
    final dataLancamento = DateTime.tryParse(data);
    final inicio = DateTime.tryParse(dataInicio);
    if (!configurarCentavos || dataLancamento == null || inicio == null) {
      return false;
    }

    final diaLancamento = DateTime(
      dataLancamento.year,
      dataLancamento.month,
      dataLancamento.day,
    );
    final diaInicio = DateTime(inicio.year, inicio.month, inicio.day);
    return !diaLancamento.isBefore(diaInicio);
  }

  static Future<CentavosConfig> loadLocal() async {
    final prefs = await SharedPreferences.getInstance();
    return CentavosConfig(
      configurarCentavos: prefs.getBool(configurarCentavosKey) ?? true,
      dataInicio: prefs.getString(dataInicioKey) ?? defaultDataInicio,
    );
  }

  static Future<CentavosConfig> loadRemote(ApiClient api) async {
    try {
      final response = await api.get('/configuracoes/centavos');
      if (response is Map) {
        return _fromRemote(response);
      }
    } catch (_) {
      // Sem conexão: usa a última configuração recebida. O backend continua
      // sendo a fonte de verdade quando o lançamento for sincronizado.
    }
    return loadLocal();
  }

  static Future<CentavosConfig> saveRemote(
    ApiClient api, {
    required bool configurarCentavos,
  }) async {
    final response = await api.put('/configuracoes/centavos', {
      'configurar_centavos': configurarCentavos,
    });
    if (response is Map) {
      return _fromRemote(response);
    }

    final config = CentavosConfig(
      configurarCentavos: configurarCentavos,
      dataInicio: defaultDataInicio,
    );
    await config.persist();
    return config;
  }

  Future<void> persist() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(configurarCentavosKey, configurarCentavos);
    await prefs.setString(dataInicioKey, dataInicio);
  }

  static Future<CentavosConfig> _fromRemote(Map<dynamic, dynamic> response) async {
    final raw = response['configurar_centavos'];
    final config = CentavosConfig(
      configurarCentavos: raw is bool
          ? raw
          : !(raw?.toString().toLowerCase() == 'false' || raw?.toString() == '0'),
      dataInicio: response['data_inicio']?.toString() ?? defaultDataInicio,
    );
    await config.persist();
    return config;
  }
}
