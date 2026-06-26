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
        throw new \Illuminate\Auth\AuthenticationException(
            'Não autenticado.',
            $guards,
            $this->redirectTo($request)
        );
    }
}
