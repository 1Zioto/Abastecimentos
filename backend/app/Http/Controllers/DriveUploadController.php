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

        $folderId = (string) env('GOOGLE_DRIVE_FOLDER_ID', '');
        if ($folderId === '') {
            return new \Illuminate\Http\JsonResponse([
                'message' => 'GOOGLE_DRIVE_FOLDER_ID não configurado.',
            ], 500);
        }

        try {
            $credentials = $this->resolveCredentials();
            $accessToken = $this->fetchAccessToken($credentials);

            $uploaded = $data['file'];
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

    private function resolveCredentials(): array
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

        throw new \RuntimeException('Credenciais do Google Drive não configuradas.');
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

    private function fetchAccessToken(array $credentials): string
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
