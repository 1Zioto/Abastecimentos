# Abastecimento Vipe - App Android (Flutter)

Aplicativo Android offline-first para o sistema **Abastecimento Vipe**. Replica todas as funcionalidades da versao web (Angular) e sincroniza com o backend Laravel hospedado na Vercel (`https://backend-seven-gilt-97.vercel.app/api`).

## Modulos

1. **Dashboard** - KPIs do mes e top proprietarios
2. **Abastecimentos** - lista, filtros, formulario completo, baixa individual, cancelamento
3. **Baixa em Lote** - pagamento de varios abastecimentos por proprietario
4. **Entrada de Notas** - informa nota fiscal e data para multiplos registros
5. **Relatorios** - por proprietario com geracao de PDF (via backend)
6. **Precos de Combustivel** - historico + novo valor (imutavel apos cadastro)
7. **Proprietarios** - CRUD com status (ativo/bloqueado/inativo)
8. **Veiculos** - CRUD vinculado a proprietarios + odometro
9. **Motoristas** - CRUD vinculado a proprietarios
10. **Usuarios** - gestao de usuarios (admin apenas)

## Regras de negocio embarcadas no cliente

- `valor_por_litro` e **imutavel** apos cadastrado (historico preservado)
- `odometro` deve ser **crescente** por veiculo
- Baixa em lote marca `baixa_abastecimento`, sem alterar o status da imagem
- Exclusao de proprietario **cascateia** veiculos/motoristas/abastecimentos
- Proprietario `bloqueado` bloqueia novos abastecimentos
- Papeis: `admin`, `operador`, `visualizador` (visualizador so le)

## Arquitetura

- `lib/core/api_client.dart` - cliente HTTP com JWT automatico
- `lib/core/auth_store.dart` - persistencia do token (SharedPreferences)
- `lib/core/local_db.dart` - SQLite (sqflite): cadastros em cache + fila de sincronizacao
- `lib/core/sync_manager.dart` - sincronizacao bidirecional
- `lib/screens/...` - telas por modulo (Material 3)

## Como compilar

Pre-requisitos:
- Flutter SDK 3.19 ou superior (`flutter --version`)
- Android SDK (via Android Studio) com API 35
- JDK 17

Passos:

```bash
cd APK
flutter pub get
flutter build apk --release
```

APK gerado em `build/app/outputs/flutter-apk/app-release.apk`.

Para rodar em um dispositivo conectado:

```bash
flutter run
```

## Login padrao

```
usuario: admin
senha:   admin123
```

## Offline

Ao abrir o app sem internet, o usuario ve os ultimos dados baixados e pode registrar abastecimentos. Novos registros ficam na fila de sincronizacao (`sync_queue`) e sao enviados ao clicar em **Sincronizar** ou ao proximo login online.
