<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (!$user || ($user->tipo ?? null) !== 'admin') {
            return new \Illuminate\Http\JsonResponse([
                'message' => 'Somente administradores podem criar, editar ou excluir registros.',
            ], 403);
        }

        return $next($request);
    }
}

