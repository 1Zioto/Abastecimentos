<?php

namespace App\Services;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class GoogleDriveService
{
    private const SCOPE = 'https://www.googleapis.com/auth/drive.file';

    public function authUrl(): string
    {
        $config = $this->oauthConfig();
        return 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
            'client_id' => $config['client_id'],
            'redirect_uri' => $config['redirect_uri'],
            'response_type' => 'code',
            'scope' => self::SCOPE,
            'access_type' => 'offline',
            'prompt' => 'consent',
            'include_granted_scopes' => 'true',
        ], '', '&', PHP_QUERY_RFC3986);
    }

    public function exchangeCodeForRefreshToken(string $code): array
    {
        $config = $this->oauthConfig();
        $response = $this->newRequest()
            ->asForm()
            ->timeout(25)
            ->post('https://oauth2.googleapis.com/token', [
                'client_id' => $config['client_id'],
                'client_secret' => $config['client_secret'],
                'redirect_uri' => $config['redirect_uri'],
                'code' => $code,
                'grant_type' => 'authorization_code',
            ]);

        $token = $response->json() ?? [];

        if (!$response->successful() || isset($token['error'])) {
            throw new \RuntimeException('Falha ao autorizar Google Drive: ' . ($token['error_description'] ?? $token['error']));
        }

        $refreshToken = $token['refresh_token'] ?? null;
        if (!$refreshToken) {
            $refreshToken = $this->refreshToken();
        }

        if (!$refreshToken) {
            throw new \RuntimeException('O Google não retornou refresh_token. Revogue o acesso do app na conta Google e autorize novamente com prompt=consent.');
        }

        $this->saveRefreshToken($refreshToken);

        return [
            'ok' => true,
            'scope' => self::SCOPE,
            'expires_in' => $token['expires_in'] ?? null,
        ];
    }

    public function uploadComprovante(string $caminhoArquivo, string $nomeArquivo, string $mimeType): array
    {
        if (!is_file($caminhoArquivo)) {
            throw new \InvalidArgumentException('Arquivo inexistente para upload no Google Drive.');
        }

        $mimeType = $this->normalizeMimeType($mimeType, $caminhoArquivo);
        if (!in_array($mimeType, ['image/jpeg', 'image/png', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/svg+xml'], true)) {
            throw new \InvalidArgumentException('Formato não suportado. Use JPG, PNG, PDF, DOCX ou SVG.');
        }

        $accessToken = $this->accessToken();
        $folderId = $this->folderId($accessToken);
        $safeName = $this->safeFileName($nomeArquivo, $mimeType);
        $metadata = [
            'name' => $safeName,
            'parents' => [$folderId],
        ];

        $bytes = file_get_contents($caminhoArquivo);
        if ($bytes === false) {
            throw new \RuntimeException('Não foi possível ler o arquivo para upload no Google Drive.');
        }

        $boundary = 'drive-upload-' . Str::random(24);
        $eol = "\r\n";
        $multipartBody =
            "--{$boundary}{$eol}" .
            "Content-Type: application/json; charset=UTF-8{$eol}{$eol}" .
            json_encode($metadata, JSON_UNESCAPED_UNICODE) . "{$eol}" .
            "--{$boundary}{$eol}" .
            "Content-Type: {$mimeType}{$eol}{$eol}" .
            $bytes . "{$eol}" .
            "--{$boundary}--";

        $response = $this->newRequest()
            ->withToken($accessToken)
            ->timeout(35)
            ->withHeaders(['Content-Type' => "multipart/related; boundary={$boundary}"])
            ->withBody($multipartBody, "multipart/related; boundary={$boundary}")
            ->post('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,webContentLink');

        if (!$response->successful()) {
            $status = $response->status();
            if ($status === 401) {
                throw new \RuntimeException('Token do Google expirado ou inválido. Autorize o Google Drive novamente.');
            }
            if ($status === 403) {
                throw new \RuntimeException('Sem permissão para enviar arquivo para a pasta do Google Drive configurada.');
            }
            throw new \RuntimeException('Erro da API do Google Drive: ' . $response->body());
        }

        $file = $response->json() ?? [];
        $fileId = $file['id'] ?? null;

        if ($fileId && (bool) config('google_drive.share_public', true)) {
            $this->newRequest()
                ->withToken($accessToken)
                ->timeout(20)
                ->post("https://www.googleapis.com/drive/v3/files/{$fileId}/permissions", [
                    'role' => 'reader',
                    'type' => 'anyone',
                ]);
        }

        return [
            'file_id' => $fileId,
            'id' => $fileId,
            'name' => $file['name'] ?? $safeName,
            'nome' => $file['name'] ?? $safeName,
            'mimeType' => $file['mimeType'] ?? $mimeType,
            'webViewLink' => $file['webViewLink'] ?? null,
            'webContentLink' => $file['webContentLink'] ?? null,
            'downloadUrl' => $fileId ? 'https://drive.google.com/uc?export=view&id=' . $fileId : null,
        ];
    }

    public function resolveProprietarioFolder(string $proprietarioName, string $category): string
    {
        $proprietarioName = trim($proprietarioName) ?: 'Desconhecido';
        
        $cacheKey = "drive_folder_v3_" . md5($category . "_" . $proprietarioName);
        return \Illuminate\Support\Facades\Cache::remember($cacheKey, 86400, function () use ($proprietarioName, $category) {
            $categoryFolderId = $this->findOrCreateFolder($category, 'root');
            return $this->findOrCreateFolder($proprietarioName, $categoryFolderId);
        });
    }

    public function findOrCreateFolder(string $name, string $parentId): string
    {
        $accessToken = $this->accessToken();
        $query = "mimeType='application/vnd.google-apps.folder' and '{$parentId}' in parents and name='" . str_replace("'", "\\'", $name) . "' and trashed=false";

        $response = $this->newRequest()
            ->withToken($accessToken)
            ->timeout(20)
            ->get('https://www.googleapis.com/drive/v3/files', [
                'q' => $query,
                'spaces' => 'drive',
                'fields' => 'files(id, name)'
            ]);

        if ($response->successful() && !empty($response->json('files'))) {
            return $response->json('files')[0]['id'];
        }

        // Criar a pasta se não existir
        $metadata = [
            'name' => $name,
            'mimeType' => 'application/vnd.google-apps.folder',
            'parents' => [$parentId]
        ];

        $createResponse = $this->newRequest()
            ->withToken($accessToken)
            ->timeout(20)
            ->post('https://www.googleapis.com/drive/v3/files', $metadata);

        if (!$createResponse->successful()) {
            throw new \RuntimeException('Falha ao criar pasta no Google Drive: ' . $createResponse->body());
        }

        return $createResponse->json('id');
    }

    public function moveFile(string $fileId, string $newParentId): void
    {
        $accessToken = $this->accessToken();
        
        // Primeiro, pega os pais atuais do arquivo
        $getResponse = $this->newRequest()
            ->withToken($accessToken)
            ->timeout(20)
            ->get("https://www.googleapis.com/drive/v3/files/{$fileId}", [
                'fields' => 'parents'
            ]);

        if (!$getResponse->successful()) {
            throw new \RuntimeException('Falha ao buscar metadados do arquivo para mover: ' . $getResponse->body());
        }

        $parents = $getResponse->json('parents') ?? [];
        $previousParents = implode(',', $parents);

        // Atualiza movendo para a nova pasta
        $updateResponse = $this->newRequest()
            ->withToken($accessToken)
            ->timeout(20)
            ->patch("https://www.googleapis.com/drive/v3/files/{$fileId}?addParents={$newParentId}&removeParents={$previousParents}");

        if (!$updateResponse->successful()) {
            throw new \RuntimeException('Falha ao mover arquivo no Google Drive: ' . $updateResponse->body());
        }
    }

    public function extractFileId(string $url): ?string
    {
        if (str_contains($url, 'drive.google.com/uc?id=')) {
            $parts = parse_url($url);
            if (isset($parts['query'])) {
                parse_str($parts['query'], $query);
                return $query['id'] ?? null;
            }
        }
        return null;
    }

    public function accessToken(): string
    {
        $refreshToken = $this->refreshToken();
        if (!$refreshToken) {
            throw new \RuntimeException('Refresh token do Google Drive ausente. Acesse /google-drive/auth para autorizar.');
        }

        $config = $this->oauthConfig();
        $response = $this->newRequest()
            ->asForm()
            ->timeout(25)
            ->post('https://oauth2.googleapis.com/token', [
                'client_id' => $config['client_id'],
                'client_secret' => $config['client_secret'],
                'refresh_token' => $refreshToken,
                'grant_type' => 'refresh_token',
            ]);

        $token = $response->json() ?? [];

        if (!$response->successful() || isset($token['error'])) {
            throw new \RuntimeException('Falha ao renovar token do Google Drive: ' . ($token['error_description'] ?? $token['error']));
        }

        $accessToken = $token['access_token'] ?? null;
        if (!$accessToken) {
            throw new \RuntimeException('Token de acesso do Google Drive não retornado.');
        }

        return $accessToken;
    }

    private function folderId(string $accessToken): string
    {
        $configured = trim((string) config('google_drive.folder_id'));
        if ($configured !== '') {
            return $configured;
        }

        $saved = $this->secretFromDatabase('google_drive_folder_id');
        if ($saved) {
            return $saved;
        }

        $folderName = trim((string) config('google_drive.folder_name')) ?: 'Notas de Entrada - Abastecimento Vipe';
        $response = $this->newRequest()
            ->withToken($accessToken)
            ->timeout(25)
            ->post('https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,webViewLink', [
                'name' => $folderName,
                'mimeType' => 'application/vnd.google-apps.folder',
            ]);

        if (!$response->successful()) {
            $status = $response->status();
            if ($status === 401) {
                throw new \RuntimeException('Token do Google expirado ou inválido. Autorize o Google Drive novamente.');
            }
            if ($status === 403) {
                throw new \RuntimeException('Sem permissão para criar pasta no Google Drive da conta autorizada.');
            }
            throw new \RuntimeException('Erro ao criar pasta no Google Drive: ' . $response->body());
        }

        $folderId = trim((string) ($response->json('id') ?? ''));
        if ($folderId === '') {
            throw new \RuntimeException('Google Drive não retornou ID da pasta criada.');
        }

        $this->saveSecretToDatabase('google_drive_folder_id', $folderId);
        return $folderId;
    }

    private function oauthConfig(): array
    {
        $clientId = trim((string) config('google_drive.client_id'));
        $clientSecret = trim((string) config('google_drive.client_secret'));
        $redirectUri = trim((string) config('google_drive.redirect_uri'));

        if ($clientId !== '' && $clientSecret !== '' && $redirectUri !== '') {
            return [
                'client_id' => $clientId,
                'client_secret' => $clientSecret,
                'redirect_uri' => $redirectUri,
            ];
        }

        $json = $this->loadOAuthCredentialJson();
        $web = $json['web'] ?? $json['installed'] ?? [];

        $clientId = $clientId ?: (string) ($web['client_id'] ?? '');
        $clientSecret = $clientSecret ?: (string) ($web['client_secret'] ?? '');
        $redirectUri = $redirectUri ?: (string) (($web['redirect_uris'][0] ?? null) ?: '');

        if ($clientId === '' || $clientSecret === '') {
            throw new \RuntimeException('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET não configurados.');
        }
        if ($redirectUri === '') {
            throw new \RuntimeException('GOOGLE_REDIRECT_URI não configurado.');
        }

        return [
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri' => $redirectUri,
        ];
    }

    private function loadOAuthCredentialJson(): array
    {
        $path = trim((string) config('google_drive.oauth_credentials_path'));
        if ($path === '') {
            $candidates = glob(base_path('../credenciais/client_secret_*.json')) ?: [];
            $path = (string) ($candidates[0] ?? '');
        }

        if ($path === '' || !is_file($path)) {
            return [];
        }

        $json = json_decode((string) file_get_contents($path), true);
        return is_array($json) ? $json : [];
    }

    private function refreshToken(): ?string
    {
        $envToken = trim((string) config('google_drive.refresh_token'));
        if ($envToken !== '') {
            return $envToken;
        }

        $dbToken = $this->refreshTokenFromDatabase();
        if ($dbToken) {
            return $dbToken;
        }

        $path = (string) config('google_drive.token_file');
        if (!is_file($path)) {
            return null;
        }

        try {
            return Crypt::decryptString((string) file_get_contents($path));
        } catch (\Throwable) {
            return null;
        }
    }

    private function saveRefreshToken(string $refreshToken): void
    {
        $this->saveRefreshTokenToDatabase($refreshToken);

        try {
            $path = (string) config('google_drive.token_file');
            File::ensureDirectoryExists(dirname($path), 0700);
            file_put_contents($path, Crypt::encryptString($refreshToken), LOCK_EX);
        } catch (\Throwable $e) {
            // Em ambientes como a Vercel, o filesystem é read-only.
            // Ignoramos a falha pois o token já foi salvo de forma persistente no banco de dados.
            error_log('[GoogleDriveService] Não foi possível salvar o refresh token em arquivo local (esperado na Vercel): ' . $e->getMessage());
        }
    }

    private function refreshTokenFromDatabase(): ?string
    {
        try {
            $this->ensureSecretsTable();
            return $this->secretFromDatabase('google_drive_refresh_token');
        } catch (\Throwable) {
            return null;
        }
    }

    private function saveRefreshTokenToDatabase(string $refreshToken): void
    {
        $this->ensureSecretsTable();
        $this->saveSecretToDatabase('google_drive_refresh_token', $refreshToken);
    }

    private function ensureSecretsTable(): void
    {
        DB::statement('CREATE TABLE IF NOT EXISTS app_secrets (
            secret_key VARCHAR(120) PRIMARY KEY,
            secret_value TEXT NOT NULL,
            updated_at TIMESTAMP NULL
        )');
    }

    private function secretFromDatabase(string $key): ?string
    {
        $this->ensureSecretsTable();
        $encrypted = DB::table('app_secrets')
            ->where('secret_key', $key)
            ->value('secret_value');

        return $encrypted ? Crypt::decryptString((string) $encrypted) : null;
    }

    private function saveSecretToDatabase(string $key, string $value): void
    {
        $this->ensureSecretsTable();
        DB::table('app_secrets')->updateOrInsert(
            ['secret_key' => $key],
            [
                'secret_value' => Crypt::encryptString($value),
                'updated_at' => now(),
            ]
        );
    }

    private function normalizeMimeType(string $mimeType, string $path): string
    {
        $mimeType = trim($mimeType) ?: (mime_content_type($path) ?: 'application/octet-stream');
        if ($mimeType === 'image/jpg') {
            return 'image/jpeg';
        }
        return $mimeType;
    }

    private function safeFileName(string $name, string $mimeType): string
    {
        $name = trim($name) ?: 'comprovante';
        $name = preg_replace('/[^\pL\pN._ -]+/u', '-', $name) ?: 'comprovante';
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if ($extension === '') {
            $name .= match ($mimeType) {
                'image/jpeg' => '.jpg',
                'image/png' => '.png',
                'application/pdf' => '.pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => '.docx',
                'image/svg+xml' => '.svg',
                default => '',
            };
        }
        return Str::limit($name, 180, '');
    }

    private function newRequest(): \Illuminate\Http\Client\PendingRequest
    {
        $request = Http::connectTimeout(10);
        if (PHP_OS_FAMILY === 'Windows') {
            $request = $request->withoutVerifying();
        }
        return $request;
    }
}
