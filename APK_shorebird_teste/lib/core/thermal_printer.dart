import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'date_utils.dart';
import 'models.dart';

class ThermalPrinterDevice {
  final String name;
  final String address;

  const ThermalPrinterDevice({
    required this.name,
    required this.address,
  });

  factory ThermalPrinterDevice.fromMap(Map<dynamic, dynamic> map) {
    return ThermalPrinterDevice(
      name: map['name']?.toString() ?? 'Dispositivo Bluetooth',
      address: map['address']?.toString() ?? '',
    );
  }

  String get label => '$name\n$address';
}

class ThermalPrinterSelection {
  final String name;
  final String address;

  const ThermalPrinterSelection({
    required this.name,
    required this.address,
  });

  bool get isValid => address.trim().isNotEmpty;
}

class ThermalPrinterService {
  ThermalPrinterService._();

  static final instance = ThermalPrinterService._();

  static const _channel =
      MethodChannel('com.vipe.abastecimento/thermal_printer');
  static const _nameKey = 'thermal_printer_name';
  static const _addressKey = 'thermal_printer_address';
  static const _autoPrintAbastecimentoKey = 'thermal_auto_print_abastecimento';

  Future<List<ThermalPrinterDevice>> listPairedDevices() async {
    final raw = await _channel.invokeMethod<List<dynamic>>('listPairedDevices');
    return (raw ?? const [])
        .whereType<Map<dynamic, dynamic>>()
        .map(ThermalPrinterDevice.fromMap)
        .where((device) => device.address.trim().isNotEmpty)
        .toList();
  }

  Future<ThermalPrinterSelection?> selectedPrinter() async {
    final prefs = await SharedPreferences.getInstance();
    final address = prefs.getString(_addressKey)?.trim();
    if (address == null || address.isEmpty) return null;
    return ThermalPrinterSelection(
      name: prefs.getString(_nameKey) ?? 'Impressora Bluetooth',
      address: address,
    );
  }

  Future<void> saveSelectedPrinter(ThermalPrinterDevice device) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_nameKey, device.name);
    await prefs.setString(_addressKey, device.address);
  }

  Future<void> clearSelectedPrinter() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_nameKey);
    await prefs.remove(_addressKey);
  }

  Future<bool> autoPrintAbastecimentoEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_autoPrintAbastecimentoKey) ?? false;
  }

  Future<void> saveAutoPrintAbastecimentoEnabled(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_autoPrintAbastecimentoKey, enabled);
  }

  Future<void> printText(
    String text, {
    ThermalPrinterSelection? printer,
    bool cutPaper = false,
  }) async {
    final selected = printer ?? await selectedPrinter();
    if (selected == null || !selected.isValid) {
      throw const ThermalPrinterException(
        'Selecione a impressora térmica nas configurações.',
      );
    }
    await _channel.invokeMethod<bool>('printText', {
      'address': selected.address,
      'text': _normalizeText(text),
      'cutPaper': cutPaper,
    });
  }

  Future<void> printTest() async {
    final selected = await selectedPrinter();
    final now = DateTime.now();
    await printText(
      [
        _center('TESTE DE IMPRESSAO', width: 32),
        '',
        'Impressora: ${selected?.name ?? '-'}',
        'Data: ${_two(now.day)}/${_two(now.month)}/${now.year}',
        'Hora: ${_two(now.hour)}:${_two(now.minute)}:${_two(now.second)}',
        '',
        _center('Configuracao OK', width: 32),
      ].join('\n'),
    );
  }

  Future<void> printAbastecimento(Abastecimento item) async {
    final total =
        item.valorTotal ?? ((item.valorPorLitro ?? 0) * item.quantidadeLitros);
    await printText(formatAbastecimento(item, total: total));
  }

  String formatAbastecimento(Abastecimento item, {required double total}) {
    final dateTime = _formatDateTime(item.dataHora ?? item.data);
    final odometro = item.odometro == null
        ? '-'
        : AppDates.number(item.odometro!, digits: 0);
    final lines = <String>[
      _receiptStart,
      _center('COMPROVANTE ABASTECIMENTO', width: 32),
      '-' * 32,
      'DATA/HORA: $dateTime',
      'EMPRESA: ${_clip(item.proprietarioNome ?? '-', 23)}',
      'MOTORISTA: ${_clip(item.motoristaNome ?? '-', 20)}',
      'PLACA: ${item.veiculoPlaca ?? '-'}',
      'KM: $odometro',
      'COMBUSTIVEL: ${_clip(item.tipoCombustivel ?? '-', 18)}',
      'LITROS: ${_number(item.quantidadeLitros, digits: 2)}',
      if (item.valorPorLitro != null)
        'VALOR/LITRO: ${_money(item.valorPorLitro!)}',
      'VALOR TOTAL: ${_money(total)}',
      '-' * 32,
      _receiptEnd,
    ];
    return lines.join('\n');
  }

  static const _receiptStart = '\x1BE\x01\x1B!\x18';
  static const _receiptEnd = '\x1B!\x00\x1BE\x00';

  static String _normalizeText(String text) {
    const replacements = {
      'á': 'a',
      'à': 'a',
      'ã': 'a',
      'â': 'a',
      'ä': 'a',
      'é': 'e',
      'ê': 'e',
      'í': 'i',
      'ó': 'o',
      'ô': 'o',
      'õ': 'o',
      'ú': 'u',
      'ç': 'c',
      'Á': 'A',
      'À': 'A',
      'Ã': 'A',
      'Â': 'A',
      'Ä': 'A',
      'É': 'E',
      'Ê': 'E',
      'Í': 'I',
      'Ó': 'O',
      'Ô': 'O',
      'Õ': 'O',
      'Ú': 'U',
      'Ç': 'C',
    };
    var out = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    replacements.forEach((from, to) => out = out.replaceAll(from, to));
    return out;
  }

  static String _formatDateTime(String? value) {
    if (value == null || value.trim().isEmpty) return '-';
    try {
      final parsed = DateTime.parse(value);
      final d = parsed.isUtc ? parsed.toLocal() : parsed;
      return '${_two(d.day)}/${_two(d.month)}/${d.year} '
          '${_two(d.hour)}:${_two(d.minute)}:${_two(d.second)}';
    } catch (_) {
      return value;
    }
  }

  static String _money(double value) {
    return 'R\$ ${value.toStringAsFixed(2).replaceAll('.', ',')}';
  }

  static String _number(double value, {required int digits}) {
    return value.toStringAsFixed(digits).replaceAll('.', ',');
  }

  static String _center(String value, {required int width}) {
    if (value.length >= width) return value;
    final left = ((width - value.length) / 2).floor();
    return '${' ' * left}$value';
  }

  static String _clip(String value, int max) {
    if (value.length <= max) return value;
    return value.substring(0, max);
  }

  static String _two(int value) => value.toString().padLeft(2, '0');
}

class ThermalPrinterException implements Exception {
  final String message;
  const ThermalPrinterException(this.message);

  @override
  String toString() => message;
}
