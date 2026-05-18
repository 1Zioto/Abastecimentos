<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAdminOrOperador
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $tipo = $user->tipo ?? null;
        if (!$user || !in_array($tipo, ['admin', 'operador'], true)) {
            return new \Illuminate\Http\JsonResponse([
                'message' => 'Somente administradores e operadores podem criar registros.',
            ], 403);
        }

        return $next($request);
    }
}

