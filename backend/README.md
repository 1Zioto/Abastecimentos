# Backend - Google Drive para notas de entrada

Esta integração envia anexos de notas de entrada para uma pasta do Google Drive usando OAuth 2.0 Web Server Flow. Não usa Service Account nem chave JSON de Service Account.

## 1. Credenciais OAuth no Google Cloud

1. Acesse Google Cloud Console.
2. Ative a API Google Drive.
3. Crie uma credencial do tipo OAuth Client ID.
4. Escolha o tipo Web application.
5. Cadastre a redirect URI do backend:

```text
https://seu-backend.vercel.app/google-drive/callback
```

Para teste local, use a URL local real do backend, por exemplo:

```text
http://127.0.0.1:8000/google-drive/callback
```

## 2. Variáveis de ambiente

Configure no backend:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://seu-backend.vercel.app/google-drive/callback
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_DRIVE_FOLDER_NAME="Notas de Entrada - Abastecimento Vipe"
GOOGLE_REFRESH_TOKEN=
GOOGLE_DRIVE_SHARE_PUBLIC=true
```

Também é aceito apontar para o JSON OAuth baixado do Google Cloud:

```env
GOOGLE_OAUTH_CREDENTIALS_PATH=/caminho/seguro/client_secret_xxx.json
```

O arquivo JSON deve ficar somente no backend/servidor. Não coloque esse arquivo no frontend.

## 3. Obter o primeiro refresh token

Depois de configurar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` e `GOOGLE_DRIVE_FOLDER_ID`, abra no navegador:

```text
https://seu-backend.vercel.app/google-drive/auth
```

Autorize a conta Google que terá acesso à pasta. O backend salva o refresh token criptografado no banco, na tabela `app_secrets`, e também tenta manter uma cópia local em:

```text
storage/app/private/google_drive_refresh_token.enc
```

Em produção, você também pode informar o refresh token diretamente como variável de ambiente `GOOGLE_REFRESH_TOKEN`. Quando essa variável existir, ela tem prioridade sobre o token salvo no banco.

## 4. Pasta do Drive

Se `GOOGLE_DRIVE_FOLDER_ID` ficar vazio, o backend cria automaticamente uma pasta chamada `Notas de Entrada - Abastecimento Vipe` no Drive da conta autorizada e salva o ID no banco.

Se quiser usar uma pasta já existente, abra a pasta no Google Drive. A URL será parecida com:

```text
https://drive.google.com/drive/folders/PASTA_ID_AQUI
```

Copie o trecho depois de `/folders/` e coloque em:

```env
GOOGLE_DRIVE_FOLDER_ID=PASTA_ID_AQUI
```

## 5. Teste de upload

Faça login no sistema e envie uma imagem/PDF na tela Entrada de Notas. O frontend envia:

```text
POST /uploads/drive
file=<arquivo>
destino=entrada-notas
```

O backend retorna:

```json
{
  "file": {
    "file_id": "...",
    "name": "nota.pdf",
    "mimeType": "application/pdf",
    "webViewLink": "...",
    "webContentLink": "..."
  }
}
```

Uploads de outros módulos continuam usando o mecanismo antigo quando Cloudinary estiver configurado.
