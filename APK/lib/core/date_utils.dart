import 'package:intl/intl.dart';

/// Formatadores e parsers consistentes com o backend (ISO-8601 / yyyy-MM-dd).
class AppDates {
  static final _dateBr = DateFormat('dd/MM/yyyy');
  static final _dateIso = DateFormat('yyyy-MM-dd');
  static final _dateTimeBr = DateFormat('dd/MM/yyyy HH:mm');
  static final _dateTimeIso = DateFormat("yyyy-MM-dd'T'HH:mm:ss");
  static final _moneyBr = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: 'R\$',
    decimalDigits: 2,
  );
  static final _numberBr = NumberFormat.decimalPattern('pt_BR');

  static String todayIso() => _dateIso.format(DateTime.now());

  static String nowLocalIso() => _dateTimeIso.format(DateTime.now());

  static String formatDateBr(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    try {
      // Aceita "2026-04-24" ou "2026-04-24T10:30:00"
      final d = DateTime.parse(iso);
      return _dateBr.format(d);
    } catch (_) {
      return iso;
    }
  }

  static String formatDateTimeBr(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    try {
      final d = DateTime.parse(iso);
      return _dateTimeBr.format(d);
    } catch (_) {
      return iso;
    }
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
    return NumberFormat.decimalPatternDigits(locale: 'pt_BR', decimalDigits: digits)
        .format(v);
  }

  static String intNumber(num? v) {
    if (v == null) return '0';
    return _numberBr.format(v.round());
  }
}
