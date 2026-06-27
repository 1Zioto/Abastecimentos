<?php

namespace App\Http\Controllers;

use App\Services\GoogleDriveService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class GoogleDriveOAuthController extends Controller
{
    public function redirect(GoogleDriveService $drive)
    {
        return redirect()->away($drive->authUrl());
    }

    public function callback(Request $request, GoogleDriveService $drive): Response
    {
        if ($request->filled('error')) {
            return response('Google Drive não autorizado: ' . e((string) $request->query('error')), 400);
        }

        $code = trim((string) $request->query('code', ''));
        if ($code === '') {
            return response('Código OAuth ausente.', 422);
        }

        $drive->exchangeCodeForRefreshToken($code);

        return response(
            '<h1>Google Drive autorizado</h1><p>O refresh token foi salvo no backend. Você já pode fechar esta aba e testar o upload das notas de entrada.</p>',
            200,
            ['Content-Type' => 'text/html; charset=UTF-8']
        );
    }
}
