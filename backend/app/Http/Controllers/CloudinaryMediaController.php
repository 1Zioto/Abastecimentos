<?php

namespace App\Http\Controllers;

use App\Services\CloudinaryManager;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CloudinaryMediaController extends Controller
{
    public function __construct(private CloudinaryManager $manager)
    {
    }

    public function show(Request $request): Response
    {
        $data = $request->validate([
            'url' => ['required', 'url', 'max:4096'],
            'download' => ['nullable', 'boolean'],
        ]);

        try {
            $file = $this->manager->download($data['url']);
            $filename = preg_replace('/[^A-Za-z0-9._-]/', '_', $file['filename']) ?: 'arquivo';
            $disposition = $request->boolean('download') ? 'attachment' : 'inline';

            return response($file['body'], 200, [
                'Content-Type' => $file['contentType'],
                'Content-Length' => (string) $file['bytes'],
                'Content-Disposition' => $disposition . '; filename="' . $filename . '"',
                'Cache-Control' => 'private, max-age=300',
                'X-Content-Type-Options' => 'nosniff',
            ]);
        } catch (\InvalidArgumentException $e) {
            return response(['message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            report($e);
            return response(['message' => 'Não foi possível acessar o arquivo armazenado.'], 502);
        }
    }
}
