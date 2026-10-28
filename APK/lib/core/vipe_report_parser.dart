import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:xml/xml.dart';

/// Lê o relatório XLSX do Terno sem depender do Excel instalado.
///
/// A função é de nível superior para poder ser executada em um isolate por
/// meio de [compute], sem travar a interface durante a importação.
Map<String, dynamic> parseVipeReportBytes(Uint8List bytes) {
  final archive = ZipDecoder().decodeBytes(bytes, verify: true);
  final files = <String, ArchiveFile>{
    for (final file in archive.files) file.name.replaceAll('\\', '/'): file,
  };

  final sharedStrings = _readSharedStrings(files['xl/sharedStrings.xml']);
  final worksheetNames = files.keys
      .where(
          (name) => name.startsWith('xl/worksheets/') && name.endsWith('.xml'))
      .toList()
    ..sort();

  if (worksheetNames.isEmpty) {
    throw const FormatException(
      'O arquivo não contém uma planilha XLSX válida.',
    );
  }

  for (final name in worksheetNames) {
    final rows = _readWorksheet(files[name]!, sharedStrings);
    final parsed = _parseReportRows(rows);
    if (parsed != null) return parsed;
  }

  throw const FormatException(
    'Não encontrei as colunas de placa, data e valor/quantidade. '
    'Selecione o relatório de despesas com combustíveis.',
  );
}

List<String> _readSharedStrings(ArchiveFile? file) {
  if (file == null) return const [];
  final document = XmlDocument.parse(utf8.decode(file.content));
  return document.descendants
      .whereType<XmlElement>()
      .where((element) => element.name.local == 'si')
      .map((element) => element.descendants
          .whereType<XmlElement>()
          .where((child) => child.name.local == 't')
          .map((child) => child.innerText)
          .join())
      .toList();
}

List<List<dynamic>> _readWorksheet(
  ArchiveFile file,
  List<String> sharedStrings,
) {
  final document = XmlDocument.parse(utf8.decode(file.content));
  final result = <List<dynamic>>[];

  for (final row in document.descendants
      .whereType<XmlElement>()
      .where((element) => element.name.local == 'row')) {
    final values = <int, dynamic>{};
    var fallbackColumn = 0;

    for (final cell in row.children
        .whereType<XmlElement>()
        .where((element) => element.name.local == 'c')) {
      final reference = cell.getAttribute('r') ?? '';
      final column = _columnIndex(reference) ?? fallbackColumn;
      fallbackColumn = column + 1;
      values[column] = _cellValue(cell, sharedStrings);
    }

    if (values.isEmpty) {
      result.add(const []);
      continue;
    }

    final lastColumn = values.keys.reduce((a, b) => a > b ? a : b);
    result.add(List<dynamic>.generate(
      lastColumn + 1,
      (index) => values[index],
      growable: false,
    ));
  }

  return result;
}

dynamic _cellValue(XmlElement cell, List<String> sharedStrings) {
  final type = cell.getAttribute('t');
  if (type == 'inlineStr') {
    return cell.descendants
        .whereType<XmlElement>()
        .where((element) => element.name.local == 't')
        .map((element) => element.innerText)
        .join();
  }

  final valueElements = cell.descendants
      .whereType<XmlElement>()
      .where((element) => element.name.local == 'v');
  if (valueElements.isEmpty) return null;

  final raw = valueElements.first.innerText.trim();
  if (type == 's') {
    final index = int.tryParse(raw);
    return index != null && index >= 0 && index < sharedStrings.length
        ? sharedStrings[index]
        : raw;
  }
  if (type == 'b') return raw == '1';
  if (type == 'str' || type == 'd' || type == 'e') return raw;
  return num.tryParse(raw) ?? raw;
}

int? _columnIndex(String reference) {
  final match = RegExp(r'^([A-Za-z]+)').firstMatch(reference);
  if (match == null) return null;
  var result = 0;
  for (final code in match.group(1)!.toUpperCase().codeUnits) {
    result = result * 26 + code - 64;
  }
  return result - 1;
}

Map<String, dynamic>? _parseReportRows(List<List<dynamic>> rows) {
  if (rows.isEmpty) return null;

  var headerRowIndex = -1;
  Map<String, int>? columns;
  final limit = rows.length < 25 ? rows.length : 25;

  for (var index = 0; index < limit; index++) {
    final detected = _detectColumns(rows[index]);
    if (detected.containsKey('placa') &&
        detected.containsKey('data') &&
        (detected.containsKey('valor_total') ||
            detected.containsKey('quantidade_litros'))) {
      headerRowIndex = index;
      columns = detected;
      break;
    }
  }

  if (headerRowIndex < 0 || columns == null) return null;

  final items = <Map<String, dynamic>>[];
  var ignored = headerRowIndex;

  for (var index = headerRowIndex + 1; index < rows.length; index++) {
    final row = rows[index];
    final plate = _normalizePlate(_at(row, columns['placa']));
    final date = parseVipeReportDate(_at(row, columns['data']));
    final total = parseVipeReportDecimal(_at(row, columns['valor_total']));
    final quantity =
        parseVipeReportDecimal(_at(row, columns['quantidade_litros']));
    final item = _text(_at(row, columns['item']));
    final description = _text(_at(row, columns['descricao']));

    if (plate.isEmpty || date == null || (total == null && quantity == null)) {
      ignored++;
      continue;
    }

    if (!_isFuelRow(item, description)) {
      ignored++;
      continue;
    }

    var document = _text(_at(row, columns['documento']));
    if (document.isEmpty || document == '-') {
      document = row.map(_text).firstWhere(
            (value) =>
                RegExp(r'^DES[-\s]?\d+', caseSensitive: false).hasMatch(value),
            orElse: () => '',
          );
    }

    items.add({
      'linha': index + 1,
      'placa': plate,
      'data': date,
      if (total != null) 'valor_total': total,
      if (quantity != null) 'quantidade_litros': quantity,
      if (document.isNotEmpty && document != '-') 'documento': document,
      if (item.isNotEmpty) 'item': item,
      if (description.isNotEmpty) 'descricao': description,
    });
  }

  if (items.isEmpty) {
    throw const FormatException(
      'A planilha foi reconhecida, mas não há despesas com placa, data '
      'e valor/quantidade para conferir.',
    );
  }

  return {
    'itens': items,
    'linhas_ignoradas': ignored,
    'cabecalhos': {
      for (final entry in columns.entries)
        entry.key: _text(_at(rows[headerRowIndex], entry.value)),
    },
    'possui_quantidade':
        items.any((item) => item.containsKey('quantidade_litros')),
    'possui_valor': items.any((item) => item.containsKey('valor_total')),
  };
}

Map<String, int> _detectColumns(List<dynamic> row) {
  final result = <String, int>{};
  for (var index = 0; index < row.length; index++) {
    final header = _normalizeText(_text(row[index]));
    if (header.isEmpty) continue;

    if (!result.containsKey('placa') &&
        (header == 'placa' ||
            header == 'veiculo' ||
            header.contains('placa veiculo'))) {
      result['placa'] = index;
    } else if (!result.containsKey('data') &&
        (header == 'data' || header.startsWith('data '))) {
      result['data'] = index;
    } else if (!result.containsKey('quantidade_litros') &&
        (header.contains('quantidade') ||
            header.contains('litro') ||
            header == 'volume')) {
      result['quantidade_litros'] = index;
    } else if (!result.containsKey('valor_total') &&
        (header == 'valor' ||
            header == 'total' ||
            header.contains('valor total'))) {
      result['valor_total'] = index;
    } else if (!result.containsKey('documento') &&
        header.contains('documento')) {
      result['documento'] = index;
    } else if (!result.containsKey('descricao') &&
        header.contains('descricao')) {
      result['descricao'] = index;
    } else if (!result.containsKey('item') && header == 'item') {
      result['item'] = index;
    }
  }
  return result;
}

dynamic _at(List<dynamic> row, int? index) {
  if (index == null || index < 0 || index >= row.length) return null;
  return row[index];
}

String _text(dynamic value) => value == null ? '' : '$value'.trim();

String _normalizeText(String value) {
  const accented = 'áàãâäéèêëíìîïóòõôöúùûüçñ';
  const plain = 'aaaaaeeeeiiiiooooouuuucn';
  var normalized = value.toLowerCase().trim();
  for (var index = 0; index < accented.length; index++) {
    normalized = normalized.replaceAll(accented[index], plain[index]);
  }
  return normalized.replaceAll(RegExp(r'\s+'), ' ');
}

String _normalizePlate(dynamic value) =>
    _text(value).toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');

bool _isFuelRow(String item, String description) {
  final text = _normalizeText('$item $description');
  if (text.trim().isEmpty) return true;
  return const [
    'diesel',
    'combust',
    'gasolina',
    'etanol',
    'arla',
    'posto',
  ].any(text.contains);
}

/// Converte números no padrão brasileiro ou numérico do Excel.
double? parseVipeReportDecimal(dynamic value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();

  var raw = _text(value)
      .replaceAll(RegExp(r'[Rr]\$'), '')
      .replaceAll(RegExp(r'\s+'), '');
  if (raw.isEmpty || raw == '-') return null;

  if (raw.contains(',') && raw.contains('.')) {
    raw = raw.replaceAll('.', '').replaceAll(',', '.');
  } else if (raw.contains(',')) {
    raw = raw.replaceAll(',', '.');
  }
  raw = raw.replaceAll(RegExp(r'[^0-9.\-]'), '');
  return double.tryParse(raw);
}

/// Converte datas ISO, brasileiras e números seriais do Excel para yyyy-MM-dd.
String? parseVipeReportDate(dynamic value) {
  if (value == null) return null;

  DateTime? date;
  if (value is num) {
    date = DateTime(1899, 12, 30)
        .add(Duration(milliseconds: (value.toDouble() * 86400000).round()));
  } else {
    final raw = _text(value);
    if (raw.isEmpty || raw == '-') return null;

    final br = RegExp(r'^(\d{1,2})/(\d{1,2})/(\d{4})').firstMatch(raw);
    if (br != null) {
      date = DateTime(
        int.parse(br.group(3)!),
        int.parse(br.group(2)!),
        int.parse(br.group(1)!),
      );
    } else {
      date = DateTime.tryParse(raw);
      if (date == null) {
        final numeric = double.tryParse(raw.replaceAll(',', '.'));
        if (numeric != null) {
          date = DateTime(1899, 12, 30).add(
            Duration(milliseconds: (numeric * 86400000).round()),
          );
        }
      }
    }
  }

  if (date == null) return null;
  return '${date.year.toString().padLeft(4, '0')}-'
      '${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';
}
