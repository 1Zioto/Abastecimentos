/// Keep invoice numbers as text: leading zeroes are significant.
String validateEntradaNotaNumber(Object? value) {
  final number = value?.toString().trim() ?? '';
  if (!RegExp(r'^[0-9]+$').hasMatch(number)) {
    throw const FormatException(
        'Informe o número da nota usando somente dígitos.');
  }
  return number;
}

void verifyEntradaNotaResponse(Object? response, String expected) {
  if (response is! Map ||
      response['id_financeiro'] == null ||
      response['numero_nota_fiscal']?.toString() != expected) {
    throw const FormatException(
      'O servidor não confirmou o número da nota. Não refaça o lançamento; confira a sincronização.',
    );
  }
}
