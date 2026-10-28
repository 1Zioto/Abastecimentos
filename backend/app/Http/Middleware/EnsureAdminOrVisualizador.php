<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAdminOrVisualizador
{
    public function handle(Request $request, Closure $next): Response
    {
        $tipo = mb_strtolower(trim((string) ($request->user()?->tipo ?? '')));

        if (!in_array($tipo, ['admin', 'visualizador'], true)) {
            return new JsonResponse([
                'message' => 'A Conferência Vipe está disponível para administradores e visualizadores.',
            ], 403);
        }

        return $next($request);
    }
}
