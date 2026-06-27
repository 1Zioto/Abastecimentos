<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\UnauthorizedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        apiPrefix: '',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->api(prepend: [
            \Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful::class,
        ]);

        $middleware->alias([
            'auth' => \App\Http\Middleware\Authenticate::class,
            'admin' => \App\Http\Middleware\EnsureAdmin::class,
            'admin_or_operador' => \App\Http\Middleware\EnsureAdminOrOperador::class,
            'api_key' => \App\Http\Middleware\EnsureApiKey::class,
        ]);

        // CORS
        $middleware->append(\Illuminate\Http\Middleware\HandleCors::class);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->shouldRenderJsonWhen(function (Request $request, \Throwable $e) {
            return $request->is('api/*') || $request->expectsJson() || $request->path() === 'up';
        });

        $exceptions->render(function (\Illuminate\Auth\AuthenticationException $e, $request) {
            return new \Illuminate\Http\JsonResponse(['message' => 'Não autenticado.'], 401);
        });

        $exceptions->render(function (\Tymon\JWTAuth\Exceptions\TokenExpiredException $e, $request) {
            return new \Illuminate\Http\JsonResponse(['message' => 'Token expirado.'], 401);
        });

        $exceptions->render(function (\Tymon\JWTAuth\Exceptions\TokenInvalidException $e, $request) {
            return new \Illuminate\Http\JsonResponse(['message' => 'Token inválido.'], 401);
        });

        $exceptions->render(function (\Tymon\JWTAuth\Exceptions\UserNotDefinedException $e, $request) {
            return new \Illuminate\Http\JsonResponse(['message' => 'Usuário da sessão não encontrado. Faça login novamente.'], 401);
        });

        $exceptions->render(function (\Tymon\JWTAuth\Exceptions\JWTException $e, $request) {
            return new \Illuminate\Http\JsonResponse(['message' => 'Não autenticado.'], 401);
        });

        $exceptions->render(function (UnauthorizedHttpException $e, $request) {
            return new \Illuminate\Http\JsonResponse(['message' => 'Não autenticado. Faça login novamente.'], 401);
        });

        $exceptions->render(function (\Illuminate\Validation\ValidationException $e, $request) {
            if ($request->expectsJson() || $request->is('api/*')) {
                return new \Illuminate\Http\JsonResponse([
                    'message' => 'Dados inválidos.',
                    'errors'  => $e->errors(),
                ], 422);
            }
        });

        $exceptions->render(function (\Illuminate\Database\Eloquent\ModelNotFoundException $e, $request) {
            if ($request->expectsJson() || $request->is('api/*')) {
                return new \Illuminate\Http\JsonResponse(['message' => 'Registro não encontrado.'], 404);
            }
        });

        $exceptions->render(function (\Throwable $e, $request) {
            if ($request->expectsJson() || $request->is('api/*') || $request->path() === 'up') {
                $status = $e instanceof HttpExceptionInterface ? $e->getStatusCode() : 500;
                $sensitive = ['password', 'senha', 'token', 'access_token', 'refresh_token'];
                $input = $request->all();
                array_walk_recursive($input, function (&$value, $key) use ($sensitive) {
                    if (in_array(Str::lower((string) $key), $sensitive, true)) {
                        $value = '***';
                    }
                });

                $logPayload = [
                    'status' => $status,
                    'method' => $request->method(),
                    'path' => '/'.$request->path(),
                    'query' => $request->query(),
                    'input' => $input,
                    'message' => $e->getMessage(),
                    'exception' => get_class($e),
                    'file' => $e->getFile(),
                    'line' => $e->getLine(),
                    'trace' => $status >= 500 ? $e->getTraceAsString() : null,
                ];
                error_log('[api-exception] '.json_encode($logPayload, JSON_UNESCAPED_UNICODE));

                return new \Illuminate\Http\JsonResponse([
                    'message' => $status === 500 ? 'Erro interno do servidor.' : ($e->getMessage() ?: 'Erro na requisição.'),
                ], $status);
            }
        });
    })->create();
