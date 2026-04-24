# APK — Abastecimento Vipe

Projeto Android criado para empacotar o sistema web como aplicativo Android usando `WebView`.

## O que ele abre

O app carrega a versão publicada:

`https://frontend-eight-smoky-75.vercel.app`

## Como gerar o APK

1. Instale o Android Studio.
2. Abra a pasta `APK` pelo Android Studio.
3. Aguarde o Gradle sincronizar.
4. No menu, acesse:

   `Build > Build Bundle(s) / APK(s) > Build APK(s)`

5. O APK será gerado em:

   `APK/app/build/outputs/apk/debug/app-debug.apk`

## Como gerar versão assinada

Para instalar em celulares fora do modo debug ou publicar:

1. Android Studio:

   `Build > Generate Signed Bundle / APK`

2. Selecione `APK`.
3. Crie ou use uma chave `.jks`.
4. Gere a versão `release`.

## Observações

- O app precisa de internet para funcionar.
- Upload de imagens funciona pelo seletor de arquivos do Android.
- O pacote Android é `com.vipe.abastecimento`.
- O nome exibido é `Abastecimento Vipe`.
