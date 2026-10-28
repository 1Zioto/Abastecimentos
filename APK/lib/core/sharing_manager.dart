import 'dart:async';
import 'package:flutter/material.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';
import 'app_state.dart';
import '../screens/nova_baixa_comprovante_screen.dart';
import '../main.dart'; // import appNavigatorKey

class SharingManager {
  SharingManager._();
  static final SharingManager instance = SharingManager._();

  StreamSubscription? _intentSub;
  final List<String> _pendingFiles = [];

  void init() {
    try {
      // 1. Listen for shares while app is in memory
      _intentSub = ReceiveSharingIntent.instance.getMediaStream().listen((sharedFiles) {
        final paths = sharedFiles.map((f) => f.path).toList();
        _handleSharedFiles(paths);
      }, onError: (err) {
        debugPrint("SharingManager stream error: $err");
      });

      // 2. Get share that launched the app
      ReceiveSharingIntent.instance.getInitialMedia().then((sharedFiles) {
        if (sharedFiles.isNotEmpty) {
          final paths = sharedFiles.map((f) => f.path).toList();
          _handleSharedFiles(paths);
          ReceiveSharingIntent.instance.reset();
        }
      }).catchError((err) {
        debugPrint("SharingManager initialMedia error: $err");
      });
    } catch (e) {
      debugPrint("SharingManager init error: $e");
    }
  }

  void _handleSharedFiles(List<String> paths) {
    if (paths.isEmpty) return;

    final isAuthenticated = AppState.instance.auth.isAuthenticated;
    if (!isAuthenticated) {
      // Save to pending files so we can process them after login
      _pendingFiles.addAll(paths);
      return;
    }

    _navigateToNovaBaixa(paths);
  }

  /// Chamado após login bem-sucedido para verificar se há arquivos compartilhados pendentes
  void checkPendingFiles() {
    if (_pendingFiles.isNotEmpty && AppState.instance.auth.isAuthenticated) {
      final paths = List<String>.from(_pendingFiles);
      _pendingFiles.clear();
      _navigateToNovaBaixa(paths);
    }
  }

  void _navigateToNovaBaixa(List<String> paths) {
    final nav = appNavigatorKey.currentState;
    if (nav == null) {
      // Se o navigator ainda não estiver pronto, espera um pouco
      Future.delayed(const Duration(milliseconds: 500), () => _navigateToNovaBaixa(paths));
      return;
    }

    nav.push(
      MaterialPageRoute(
        builder: (_) => NovaBaixaComprovanteScreen(initialSharedFiles: paths),
      ),
    );
  }

  void dispose() {
    _intentSub?.cancel();
  }
}
