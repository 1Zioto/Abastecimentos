import 'package:intl/intl.dart';

/// Formatadores e parsers consistentes com o backend (ISO-8601 / yyyy-MM-dd).
class AppDates {
  static final _dateBr = DateFormat('dd/MM/yyyy');
  static final _dateIso = DateFormat('yyyy-MM-dd');
  static final _timeBr = DateFormat('HH:mm');
  static final _dateTimeBr = DateFormat('dd/MM/yyyy HH:mm');
  static final _dateTimeIso = DateFormat("yyyy-MM-dd'T'HH:mm:ss");
  static final _moneyBr = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: 'R\$',
    decimalDigits: 2,
  );
  static final _numberBr = NumberFormat.decimalPattern('pt_BR');

  static String todayIso() => _dateIso.format(DateTime.now());

  static String currentTimeIso() => _timeBr.format(DateTime.now());

  static String nowLocalIso() => _dateTimeIso.format(DateTime.now());

  static String dateOnly(String? raw) {
    final value = raw?.trim() ?? '';
    if (value.isEmpty) return todayIso();

    final isoMatch = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(value);
    if (isoMatch != null) return isoMatch.group(0)!;

    final brMatch = RegExp(r'^(\d{2})/(\d{2})/(\d{4})').firstMatch(value);
    if (brMatch != null) {
      return '${brMatch.group(3)}-${brMatch.group(2)}-${brMatch.group(1)}';
    }

    final parsed = DateTime.tryParse(value.replaceFirst(' ', 'T'));
    if (parsed != null) {
      final d = parsed.isUtc ? parsed.toLocal() : parsed;
      return _dateIso.format(d);
    }

    return todayIso();
  }

  static String timeOnly(String? raw) {
    final value = raw?.trim() ?? '';
    if (value.isEmpty) return currentTimeIso();

    final matches =
        RegExp(r'(?:^|T|\s)(\d{1,2}):(\d{2})').allMatches(value).toList();
    if (matches.isEmpty) return currentTimeIso();

    final match = matches.last;
    final hour = int.tryParse(match.group(1) ?? '') ?? -1;
    final minute = int.tryParse(match.group(2) ?? '') ?? -1;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return currentTimeIso();
    }

    return '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';
  }

  static String combineDateTime(String dateIso, String timeIso) {
    final date = dateOnly(dateIso);
    final time = '${timeOnly(timeIso)}:00';
    return '${date}T$time';
  }

  static String extractTime(String? iso) {
    if (iso == null || iso.isEmpty) return currentTimeIso();
    try {
      final parsed = DateTime.parse(iso);
      final d = parsed.isUtc ? parsed.toLocal() : parsed;
      return _timeBr.format(d);
    } catch (_) {
      final match = RegExp(r'(\d{2}:\d{2})').firstMatch(iso);
      return match?.group(1) ?? currentTimeIso();
    }
  }

  static String formatDateBr(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    try {
      // Aceita "2026-04-24" ou "2026-04-24T10:30:00"
      final parsed = DateTime.parse(iso);
      final d = parsed.isUtc ? parsed.toLocal() : parsed;
      return _dateBr.format(d);
    } catch (_) {
      return iso;
    }
  }

  static String formatDateTimeBr(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    try {
      final parsed = DateTime.parse(iso);
      final d = parsed.isUtc ? parsed.toLocal() : parsed;
      return _dateTimeBr.format(d);
    } catch (_) {
      return iso;
    }
  }

  static String formatDateTimeOrDateBr(String? dateTimeIso, String? dateIso) {
    final formatted = formatDateTimeBr(dateTimeIso);
    if (formatted.isNotEmpty) return formatted;
    return formatDateBr(dateIso);
  }

  static String? parseBrToIso(String? br) {
    if (br == null || br.isEmpty) return null;
    try {
      final d = _dateBr.parseStrict(br);
      return _dateIso.format(d);
    } catch (_) {
      return null;
    }
  }

  static String money(num? v) {
    if (v == null) return 'R\$ 0,00';
    return _moneyBr.format(v);
  }

  static String number(num? v, {int digits = 2}) {
    if (v == null) return '0';
    return NumberFormat.decimalPatternDigits(
            locale: 'pt_BR', decimalDigits: digits)
        .format(v);
  }

  static String intNumber(num? v) {
    if (v == null) return '0';
    return _numberBr.format(v.round());
  }
}
