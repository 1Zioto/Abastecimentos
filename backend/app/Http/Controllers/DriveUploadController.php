<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class DriveUploadController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'file' => 'required|file|max:20480',
        ]);

        try {
            $uploaded = $data['file'];

            $cloudinaryUrl = (string) env('CLOUDINARY_URL', '');
            if ($cloudinaryUrl !== '') {
                $uploadedFile = $this->uploadToCloudinary($uploaded, $cloudinaryUrl);

                return new \Illuminate\Http\JsonResponse([
                    'message' => 'Arquivo enviado para o Cloudinary.',
                    'file' => $uploadedFile,
                ], 201);
            }

            $folderId = (string) env('GOOGLE_DRIVE_FOLDER_ID', '');
            if ($folderId === '') {
                return new \Illuminate\Http\JsonResponse([
                    'message' => 'Configure CLOUDINARY_URL ou GOOGLE_DRIVE_FOLDER_ID.',
                ], 500);
            }

            $accessToken = $this->fetchAccessToken();
            $extension = $uploaded->getClientOriginalExtension();
            $targetName = Str::uuid()->toString() . ($extension ? '.' . strtolower($extension) : '');
            $mimeType = $uploaded->getMimeType() ?: 'application/octet-stream';
            $bytes = file_get_contents($uploaded->getRealPath());

            $metadata = [
                'name' => $targetName,
                'parents' => [$folderId],
            ];

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

            $uploadResponse = Http::withToken($accessToken)
                ->connectTimeout(10)
                ->timeout(25)
                ->withHeaders([
                    'Content-Type' => "multipart/related; boundary={$boundary}",
                ])
                ->withBody($multipartBody, "multipart/related; boundary={$boundary}")
                ->post('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,webContentLink');

            if (!$uploadResponse->successful()) {
                return new \Illuminate\Http\JsonResponse([
                    'message' => 'Falha ao enviar arquivo para o Google Drive.',
                    'error' => $uploadResponse->body(),
                ], 500);
            }

            $file = $uploadResponse->json() ?? [];
            $fileId = $file['id'] ?? null;

            if ($fileId) {
                Http::withToken($accessToken)
                    ->connectTimeout(10)
                    ->timeout(20)
                    ->post("https://www.googleapis.com/drive/v3/files/{$fileId}/permissions", [
                        'role' => 'reader',
                        'type' => 'anyone',
                    ]);
            }

            return new \Illuminate\Http\JsonResponse([
                'message' => 'Arquivo enviado para o Google Drive.',
                'file' => [
                    'id' => $fileId,
                    'name' => $file['name'] ?? $targetName,
                    'mimeType' => $file['mimeType'] ?? $mimeType,
                    'size' => (int) ($file['size'] ?? strlen($bytes)),
                    'webViewLink' => $file['webViewLink'] ?? null,
                    'webContentLink' => $file['webContentLink'] ?? null,
                    'downloadUrl' => $fileId ? 'https://drive.google.com/uc?id=' . $fileId : null,
                ],
            ], 201);
        } catch (\Throwable $e) {
            return new \Illuminate\Http\JsonResponse([
                'message' => 'Falha ao enviar arquivo para o Google Drive.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    private function uploadToCloudinary($uploaded, string $cloudinaryUrl): array
    {
        $parsed = parse_url($cloudinaryUrl);
        $cloudName = $parsed['host'] ?? '';
        $user = isset($parsed['user']) ? urldecode($parsed['user']) : '';
        $pass = isset($parsed['pass']) ? urldecode($parsed['pass']) : '';

        if ($cloudName === '' || $user === '' || $pass === '') {
            throw new \RuntimeException('CLOUDINARY_URL inválido.');
        }

        $timestamp = time();
        $publicId = (string) Str::uuid();
        $folder = trim((string) env('CLOUDINARY_FOLDER', 'abastecimentos'));

        $signatureData = [
            'public_id' => $publicId,
            'timestamp' => (string) $timestamp,
        ];
        if ($folder !== '') {
            $signatureData['folder'] = $folder;
        }

        ksort($signatureData);
        $toSign = collect($signatureData)
            ->map(fn ($value, $key) => $key . '=' . $value)
            ->implode('&');
        $signature = sha1($toSign . $pass);

        $uploadUrl = "https://api.cloudinary.com/v1_1/{$cloudName}/auto/upload";
        $fileBytes = file_get_contents($uploaded->getRealPath());
        if ($fileBytes === false) {
            throw new \RuntimeException('Não foi possível ler o arquivo para upload.');
        }

        $payload = [
            'api_key' => $user,
            'timestamp' => $timestamp,
            'signature' => $signature,
            'public_id' => $publicId,
        ];
        if ($folder !== '') {
            $payload['folder'] = $folder;
        }

        $response = Http::connectTimeout(10)
            ->timeout(30)
            ->attach('file', $fileBytes, $uploaded->getClientOriginalName())
            ->post($uploadUrl, $payload);

        if (!$response->successful()) {
            throw new \RuntimeException('Falha no Cloudinary: ' . $response->body());
        }

        $json = $response->json() ?? [];
        $url = $json['secure_url'] ?? ($json['url'] ?? null);

        return [
            'id' => $json['public_id'] ?? null,
            'name' => $uploaded->getClientOriginalName(),
            'mimeType' => $uploaded->getMimeType() ?: 'application/octet-stream',
            'size' => (int) ($json['bytes'] ?? $uploaded->getSize() ?? 0),
            'webViewLink' => $url,
            'webContentLink' => $url,
            'downloadUrl' => $url,
        ];
    }

    private function resolveServiceAccountCredentials(): array
    {
        $jsonEnv = (string) env('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON', '');
        if ($jsonEnv !== '') {
            return $this->decodeCredentialJson($jsonEnv);
        }

        $credentialPath = (string) env('GOOGLE_APPLICATION_CREDENTIALS', '');
        if ($credentialPath !== '' && is_file($credentialPath)) {
            $content = file_get_contents($credentialPath);
            if ($content === false) {
                throw new \RuntimeException('Não foi possível ler GOOGLE_APPLICATION_CREDENTIALS.');
            }
            return $this->decodeCredentialJson($content);
        }

        throw new \RuntimeException('Credenciais de service account não configuradas.');
    }

    private function decodeCredentialJson(string $raw): array
    {
        $trimmed = trim($raw);

        if (
            (str_starts_with($trimmed, '"') && str_ends_with($trimmed, '"')) ||
            (str_starts_with($trimmed, "'") && str_ends_with($trimmed, "'"))
        ) {
            $trimmed = substr($trimmed, 1, -1);
        }

        if (!str_starts_with($trimmed, '{')) {
            $decoded = base64_decode($trimmed, true);
            if ($decoded !== false) {
                $trimmed = trim($decoded);
            }
        }

        $json = json_decode($trimmed, true);
        if (!is_array($json)) {
            throw new \RuntimeException('Credenciais do Google Drive inválidas.');
        }

        if (empty($json['client_email']) || empty($json['private_key'])) {
            throw new \RuntimeException('Credenciais incompletas (client_email/private_key).');
        }

        $json['private_key'] = $this->normalizePrivateKey((string) $json['private_key']);

        return $json;
    }

    private function normalizePrivateKey(string $privateKey): string
    {
        $key = trim($privateKey);
        $key = str_replace(["\\n", "\\r"], ["\n", "\r"], $key);

        if (!str_contains($key, "\n") && str_contains($key, '-----BEGIN')) {
            $key = preg_replace('/\s+/', "\n", $key) ?? $key;
            $key = str_replace("\nPRIVATE\nKEY-----", " PRIVATE KEY-----", $key);
            $key = str_replace("-----END\nPRIVATE\nKEY-----", "-----END PRIVATE KEY-----", $key);
        }

        return $key;
    }

    private function fetchAccessToken(): string
    {
        $serviceAccountJson = (string) env('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON', '');
        if ($serviceAccountJson !== '') {
            $credentials = $this->resolveServiceAccountCredentials();
            return $this->fetchAccessTokenFromServiceAccount($credentials);
        }

        $clientId = (string) env('GOOGLE_DRIVE_CLIENT_ID', '');
        $clientSecret = (string) env('GOOGLE_DRIVE_CLIENT_SECRET', '');
        $refreshToken = (string) env('GOOGLE_DRIVE_REFRESH_TOKEN', '');

        if ($clientId !== '' && $clientSecret !== '' && $refreshToken !== '') {
            return $this->fetchAccessTokenFromRefreshToken($clientId, $clientSecret, $refreshToken);
        }

        throw new \RuntimeException(
            'Credenciais do Google Drive não configuradas. Use GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON ou GOOGLE_DRIVE_CLIENT_ID/GOOGLE_DRIVE_CLIENT_SECRET/GOOGLE_DRIVE_REFRESH_TOKEN.'
        );
    }

    private function fetchAccessTokenFromServiceAccount(array $credentials): string
    {
        $clientEmail = $credentials['client_email'];
        $privateKey = $credentials['private_key'];
        $tokenUri = $credentials['token_uri'] ?? 'https://oauth2.googleapis.com/token';
        $scope = 'https://www.googleapis.com/auth/drive.file';

        $now = time();
        $payload = [
            'iss' => $clientEmail,
            'scope' => $scope,
            'aud' => $tokenUri,
            'exp' => $now + 3600,
            'iat' => $now,
        ];

        $jwt = $this->buildJwt($payload, $privateKey);

        $response = Http::asForm()
            ->connectTimeout(10)
            ->timeout(20)
            ->post($tokenUri, [
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $jwt,
        ]);

        if (!$response->successful()) {
            throw new \RuntimeException('Falha ao obter token do Google: ' . $response->body());
        }

        $accessToken = $response->json('access_token');
        if (!$accessToken) {
            throw new \RuntimeException('Token de acesso do Google não retornado.');
        }

        return $accessToken;
    }

    private function fetchAccessTokenFromRefreshToken(string $clientId, string $clientSecret, string $refreshToken): string
    {
        $response = Http::asForm()
            ->connectTimeout(10)
            ->timeout(20)
            ->post('https://oauth2.googleapis.com/token', [
                'client_id' => $clientId,
                'client_secret' => $clientSecret,
                'refresh_token' => $refreshToken,
                'grant_type' => 'refresh_token',
            ]);

        if (!$response->successful()) {
            throw new \RuntimeException('Falha ao obter token via refresh_token: ' . $response->body());
        }

        $accessToken = $response->json('access_token');
        if (!$accessToken) {
            throw new \RuntimeException('Token de acesso OAuth não retornado.');
        }

        return $accessToken;
    }

    private function buildJwt(array $payload, string $privateKey): string
    {
        $header = ['alg' => 'RS256', 'typ' => 'JWT'];

        $headerEncoded = $this->base64UrlEncode(json_encode($header, JSON_UNESCAPED_SLASHES));
        $payloadEncoded = $this->base64UrlEncode(json_encode($payload, JSON_UNESCAPED_SLASHES));
        $unsigned = $headerEncoded . '.' . $payloadEncoded;

        $signature = '';
        $ok = openssl_sign($unsigned, $signature, $privateKey, OPENSSL_ALGO_SHA256);
        if (!$ok) {
            throw new \RuntimeException('Falha ao assinar JWT com private_key: ' . (openssl_error_string() ?: 'erro desconhecido'));
        }

        return $unsigned . '.' . $this->base64UrlEncode($signature);
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
