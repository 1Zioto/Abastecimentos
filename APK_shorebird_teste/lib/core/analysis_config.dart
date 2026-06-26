import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';

class AnalysisConfig {
  static const analysisEngineKey = 'abastecimento_analysis_engine';
  static const aiOrientationKey = 'abastecimento_ai_orientation';
  static const notaFiscalPromptKey = 'nota_fiscal_ai_prompt';
  static const defaultAiOrientation = r'''
Se nada for encontrado, tente encontrar na imagem a quantidade em litros.
Primeiro classifique a imagem: bomba/medidor mecanico, recibo/papel, odometro ou outro.
Regra geral: compare apenas dados visiveis e legiveis. Nao invente placa, preco por litro, valor total ou odometro ausentes.
Se for bomba/medidor, compare principalmente litros/volume. Em bombas antigas, "TOTAL" pode indicar volume totalizado, nao valor em reais. Considere imagem girada, cortada, empoeirada ou com visor lateral. Leia os digitos mesmo tortos. Se o visor mostrar numero sem virgula compativel com 1 decimal implicito, normalize. Ex.: 6132 = 613,2 L.
Se for recibo/papel, compare LT/litros, R$/valor total, placa e odometro somente quando legiveis. Compare preco unitario apenas se ele aparecer explicitamente.
Se um recibo/papel estiver anexado no campo da bomba, nao marque erro por isso; use os campos legiveis para validar o abastecimento.
''';
  static const defaultNotaFiscalPrompt = r'''
Classifique a imagem enviada no campo de nota fiscal.
Ela deve parecer uma nota fiscal, DANFE, comprovante fiscal, documento de entrada de combustível ou imagem legível de documento fiscal.
Considere fotos giradas, cortadas, com sombra ou baixa qualidade, desde que exista estrutura de documento fiscal ou dados fiscais legíveis.
Retorne como válida se houver indícios claros de documento fiscal: número da nota, emitente/destinatário, chave de acesso, DANFE, NF-e, valores, data, produtos ou quantidade.
Retorne como suspeita se a imagem for tela preta, foto sem documento, bomba de combustível, odômetro, recibo manuscrito simples, selfie, paisagem, imagem vazia ou qualquer arquivo que não pareça nota/documento fiscal.
Não exija que todos os campos estejam legíveis; o objetivo principal é validar se a imagem parece uma nota fiscal ou documento fiscal de entrada.
''';

  final bool useAi;
  final String orientation;
  final String notaFiscalPrompt;

  const AnalysisConfig({
    required this.useAi,
    required this.orientation,
    required this.notaFiscalPrompt,
  });

  static Future<AnalysisConfig> loadLocal() async {
    final prefs = await SharedPreferences.getInstance();
    final engine = prefs.getString(analysisEngineKey) ?? 'ai';
    final orientation = prefs.getString(aiOrientationKey);
    final notaFiscalPrompt = prefs.getString(notaFiscalPromptKey);
    return AnalysisConfig(
      useAi: engine != 'ocr',
      orientation: _normalOrientation(orientation),
      notaFiscalPrompt: _normalNotaFiscalPrompt(notaFiscalPrompt),
    );
  }

  static Future<AnalysisConfig> loadRemote(ApiClient api) async {
    try {
      final resp = await api.get('/configuracoes/abastecimento-analise');
      if (resp is Map) {
        return _fromRemote(resp);
      }
    } catch (_) {
      // Sem internet/API: segue com a ultima configuracao conhecida.
    }
    return loadLocal();
  }

  static Future<AnalysisConfig> saveRemote(
    ApiClient api, {
    required bool useAi,
    required String orientation,
    required String notaFiscalPrompt,
  }) async {
    final resp = await api.put('/configuracoes/abastecimento-analise', {
      'analysis_engine': useAi ? 'ai' : 'ocr',
      'ai_orientation': _normalOrientation(orientation),
      'nota_fiscal_ai_prompt': _normalNotaFiscalPrompt(notaFiscalPrompt),
    });
    if (resp is Map) {
      return _fromRemote(resp);
    }
    final config = AnalysisConfig(
      useAi: useAi,
      orientation: _normalOrientation(orientation),
      notaFiscalPrompt: _normalNotaFiscalPrompt(notaFiscalPrompt),
    );
    await config.persist();
    return config;
  }

  Future<void> persist() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(analysisEngineKey, useAi ? 'ai' : 'ocr');
    await prefs.setString(aiOrientationKey, _normalOrientation(orientation));
    await prefs.setString(
        notaFiscalPromptKey, _normalNotaFiscalPrompt(notaFiscalPrompt));
  }

  static Future<AnalysisConfig> _fromRemote(Map<dynamic, dynamic> resp) async {
    final engine = (resp['analysis_engine'] ?? '').toString();
    final orientation = (resp['ai_orientation'] ?? '').toString();
    final notaFiscalPrompt = (resp['nota_fiscal_ai_prompt'] ?? '').toString();
    final config = AnalysisConfig(
      useAi: engine != 'ocr',
      orientation: _normalOrientation(orientation),
      notaFiscalPrompt: _normalNotaFiscalPrompt(notaFiscalPrompt),
    );
    await config.persist();
    return config;
  }

  static String _normalOrientation(String? value) {
    final text = value?.trim();
    return text == null || text.isEmpty ? defaultAiOrientation.trim() : text;
  }

  static String _normalNotaFiscalPrompt(String? value) {
    final text = value?.trim();
    return text == null || text.isEmpty ? defaultNotaFiscalPrompt.trim() : text;
  }
}
