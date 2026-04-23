<?php

namespace App\Http\Middleware;

use Illuminate\Auth\Middleware\Authenticate as Middleware;

class Authenticate extends Middleware
{
    protected function redirectTo($request): ?string
    {
        return $request->expectsJson() ? null : null;
    }

    protected function unauthenticated($request, array $guards)
    {
        abort(response()->json(['message' => 'Não autenticado.'], 401));
    }
}
