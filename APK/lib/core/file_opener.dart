import 'dart:io';

import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import 'api_client.dart';

String _safeFileName(String name) {
  return name
      .replaceAll(RegExp(r'[\\/:*?"<>|]+'), '_')
      .replaceAll(RegExp(r'\s+'), '_');
}

Future<File> downloadAuthenticatedFile({
  required ApiClient api,
  required String path,
  required String filename,
  Map<String, dynamic>? query,
}) async {
  final bytes = await api.getBytes(path, query: query);
  final dir = await getTemporaryDirectory();
  final file = File('${dir.path}/${_safeFileName(filename)}');
  await file.writeAsBytes(bytes, flush: true);
  return file;
}

Future<void> openDownloadedFile(File file) async {
  final result = await OpenFilex.open(file.path);
  if (result.type != ResultType.done) {
    throw Exception(result.message);
  }
}
