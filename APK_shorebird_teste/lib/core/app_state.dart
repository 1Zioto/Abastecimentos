import 'api_client.dart';
import 'app_error_reporter.dart';
import 'auth_store.dart';
import 'local_db.dart';
import 'sync_manager.dart';

/// Container simples de dependencias (sem provider/riverpod, por leveza).
/// Uma unica instancia vive durante todo o ciclo do app.
class AppState {
  final AuthStore auth;
  final ApiClient api;
  final LocalDb db;
  late final AppErrorReporter errorReporter;
  late final SyncManager sync;

  AppState._(this.auth, this.api, this.db) {
    errorReporter = AppErrorReporter(api);
    sync = SyncManager(api, db, errorReporter: errorReporter);
  }

  static AppState? _instance;
  static AppState get instance => _instance!;

  static Future<AppState> init() async {
    final auth = AuthStore();
    await auth.load();
    final api = ApiClient(auth);
    final db = LocalDb();
    final state = AppState._(auth, api, db);
    _instance = state;
    return state;
  }
}
