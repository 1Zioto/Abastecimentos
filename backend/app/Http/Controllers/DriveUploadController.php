<?php

namespace App\Http\Controllers;

use App\Services\GoogleDriveService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class DriveUploadController extends Controller
{
    public function store(Request $request, GoogleDriveService $googleDrive): JsonResponse
    {
        $data = $request->validate([
            'file' => 'required|file|max:20480',
            'destino' => 'nullable|string|max:80',
        ]);

        try {
            $uploaded = $data['file'];
            $destino = trim((string) ($data['destino'] ?? ''));
            $nomePadrao = $destino !== '' ? $destino : 'comprovante';

            // Todos os uploads vão para o Google Drive configurado.
            $file = $googleDrive->uploadComprovante(
                $uploaded->getRealPath(),
                $uploaded->getClientOriginalName() ?: $nomePadrao,
                $uploaded->getMimeType() ?: 'application/octet-stream'
            );

            return new JsonResponse([
                'message' => 'Arquivo enviado para o Google Drive.',
                'file' => $file,
            ], 201);
        } catch (\Throwable $e) {
            error_log('[upload-drive] ' . json_encode([
                'destino' => $data['destino'] ?? null,
                'message' => $e->getMessage(),
                'exception' => get_class($e),
            ], JSON_UNESCAPED_UNICODE));

            return new JsonResponse([
                'message' => $e->getMessage() ?: 'Falha ao enviar arquivo.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Abre uma sessão de upload resumível no Drive e devolve só a URI.
     * O cliente manda os bytes direto para o Google — nada de imagem passa
     * por este backend (nem pela cota de transferência da Vercel).
     */
    public function criarSessao(Request $request, GoogleDriveService $googleDrive): JsonResponse
    {
        $data = $request->validate([
            'filename' => 'required|string|max:255',
            'mimeType' => 'required|string|max:120',
            'size' => 'nullable|integer|min:1|max:20971520',
        ]);

        try {
            $sessao = $googleDrive->criarSessaoUpload(
                $data['filename'],
                $data['mimeType'],
                isset($data['size']) ? (int) $data['size'] : null,
                $request->header('Origin')
            );

            return new JsonResponse($sessao, 201);
        } catch (\InvalidArgumentException $e) {
            return new JsonResponse(['message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Erro DriveUploadController@criarSessao: ' . $e->getMessage(), ['exception' => $e]);
            return new JsonResponse(['message' => $e->getMessage() ?: 'Falha ao abrir sessão de upload.'], 500);
        }
    }

    /**
     * Aplica a permissão pública e devolve os links do arquivo que o cliente
     * acabou de enviar direto para o Drive.
     */
    public function finalizarSessao(Request $request, GoogleDriveService $googleDrive): JsonResponse
    {
        $data = $request->validate([
            'fileId' => 'required|string|max:120',
        ]);

        try {
            $file = $googleDrive->finalizarUpload($data['fileId']);
            $mimeType = (string) ($file['mimeType'] ?? '');

            // `file` atende app Flutter e frontend; os campos soltos mantêm o
            // mesmo contrato que o bot já consome de upload-drive-base64.
            return new JsonResponse([
                'message' => 'Arquivo enviado para o Google Drive.',
                'file' => $file,
                'url' => $file['downloadUrl'],
                'previewUrl' => $file['downloadUrl'],
                'public_id' => $file['file_id'],
                'resource_type' => str_starts_with($mimeType, 'image/') ? 'image' : 'raw',
                'format' => explode('/', $mimeType)[1] ?? '',
            ], 201);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Erro DriveUploadController@finalizarSessao: ' . $e->getMessage(), ['exception' => $e]);
            return new JsonResponse(['message' => $e->getMessage() ?: 'Falha ao finalizar upload.'], 500);
        }
    }

    private function temCloudinaryConfigurado(): bool
    {
        return trim((string) env('CLOUDINARY_URL', '')) !== ''
            || trim((string) env('CLOUDINARY_URLS', '')) !== ''
            || trim((string) env('CLOUDINARY_URL_2', '')) !== '';
    }

    public function storeBase64(Request $request)
    {
        $data = $request->validate([
            'filename' => 'required|string',
            'mimeType' => 'required|string',
            'base64Data' => 'required|string',
        ]);

        try {
            $driveService = app(\App\Services\GoogleDriveService::class);
            $accessToken = $driveService->accessToken();
            $folderId = (string) env('GOOGLE_DRIVE_BAIXAS_FOLDER_ID', '');
            if (!$folderId) {
                $folderId = $driveService->folderId($accessToken);
            }
            if (!$folderId) {
                return response()->json(['message' => 'Pasta do Google Drive não configurada.'], 500);
            }

            $bytes = base64_decode($data['base64Data']);
            if ($bytes === false) {
                return response()->json(['message' => 'Falha ao decodificar base64.'], 400);
            }

            $targetName = $data['filename'];
            $mimeType = $data['mimeType'];

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
                return response()->json([
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

            // Mapeando a resposta para o formato esperado pelo Bot
            $isPdf = str_contains(strtolower($mimeType), 'pdf');
            $extParam = $isPdf ? '&ext=.pdf' : '';
            $downloadUrl = $fileId ? 'https://drive.google.com/uc?id=' . $fileId . $extParam : null;
            return response()->json([
                'message' => 'Arquivo enviado para o Google Drive.',
                'url' => $downloadUrl,
                'previewUrl' => $downloadUrl,
                'public_id' => $fileId,
                'resource_type' => str_starts_with($mimeType, 'image/') ? 'image' : 'raw',
                'format' => explode('/', $mimeType)[1] ?? '',
            ], 201);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Erro DriveUploadController@storeBase64: ' . $e->getMessage(), ['exception' => $e]);
            return response()->json([
                'message' => 'Falha interna ao enviar arquivo para o Google Drive.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function showImage(Request $request)
    {
        $id = $request->query('id');
        if (!$id) {
            return response('ID não informado', 400);
        }

        try {
            $driveService = app(\App\Services\GoogleDriveService::class);
            // We use reflection to access the private accessToken method for the proxy, 
            // or we can just make accessToken public in GoogleDriveService
            // Let's just make it public in GoogleDriveService! But wait, I'll just change the controller to call it correctly.
            // Wait, we need an access token! Let's just use GoogleDriveService directly.
            // Oh, I can just copy the oauth logic from GoogleDriveService or just change GoogleDriveService to make accessToken public.
            // Let's make accessToken public in GoogleDriveService and use it here.
            $accessToken = $driveService->accessToken();

            $request = Http::withToken($accessToken);
            if (PHP_OS_FAMILY === 'Windows') {
                $request = $request->withoutVerifying();
            }

            $response = $request->get("https://www.googleapis.com/drive/v3/files/{$id}?alt=media");

            if (!$response->successful()) {
                return response('Imagem não encontrada: ' . $response->body(), 404);
            }

            $contentType = $response->header('Content-Type');
            if (!$contentType || str_contains($contentType, 'application/json')) {
                $contentType = 'image/jpeg';
            }

            // s-maxage instrui a CDN da Vercel a cachear na borda: nas visitas
            // seguintes a imagem sai direto do edge, sem acionar o PHP nem o
            // Google Drive. O conteúdo de um fileId do Drive é imutável.
            return response($response->body(), 200)
                ->header('Content-Type', $contentType)
                ->header('Cache-Control', 'public, max-age=864000, s-maxage=2592000, immutable');
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Erro DriveUploadController@showImage: ' . $e->getMessage(), ['exception' => $e]);
            return response('Erro ao buscar imagem: ' . $e->getMessage() . ' at ' . $e->getFile() . ':' . $e->getLine(), 500);
        }
    }

    public function showThumb(Request $request)
    {
        $id = $request->query('id');
        if (!$id) {
            return response('ID não informado', 400);
        }

        try {
            $driveService = app(\App\Services\GoogleDriveService::class);
            $accessToken = $driveService->accessToken();

            $request = Http::withToken($accessToken);
            if (PHP_OS_FAMILY === 'Windows') {
                $request = $request->withoutVerifying();
            }

            $response = $request->get("https://www.googleapis.com/drive/v3/files/{$id}?fields=thumbnailLink");

            if (!$response->successful()) {
                return response('Arquivo não encontrado', 404);
            }

            $data = $response->json();
            $thumbnailLink = $data['thumbnailLink'] ?? null;

            if (!$thumbnailLink) {
                return response('Miniatura não disponível', 404);
            }

            $thumbRequest = Http::withToken($accessToken);
            if (PHP_OS_FAMILY === 'Windows') {
                $thumbRequest = $thumbRequest->withoutVerifying();
            }
            $thumbResponse = $thumbRequest->get($thumbnailLink);
            if (!$thumbResponse->successful()) {
                // If it fails, fallback to redirecting to the thumbnail link directly, 
                // sometimes Google lh3 links work directly in the browser even if backend fetch fails
                return redirect($thumbnailLink);
            }

            return response($thumbResponse->body(), 200)
                ->header('Content-Type', 'image/jpeg')
                ->header('Cache-Control', 'public, max-age=864000, s-maxage=2592000, immutable');
        } catch (\Throwable $e) {
            return response('Erro ao buscar miniatura: ' . $e->getMessage(), 500);
        }
    }

}
