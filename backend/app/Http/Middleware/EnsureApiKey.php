<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class EnsureApiKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $key = $request->header('X-Api-Key') ?? $request->query('api_key', '');
        $key = trim((string) $key);

        if ($key === '') {
            return new \Illuminate\Http\JsonResponse(['message' => 'API key obrigatória.'], 401);
        }

        try {
            $this->garantirTabelaApiKeys();
            $hash = hash('sha256', $key);
            $apiKey = DB::table('api_keys')
                ->where('chave_hash', $hash)
                ->where('ativo', true)
                ->first();

            if (!$apiKey) {
                return new \Illuminate\Http\JsonResponse(['message' => 'API key inválida ou revogada.'], 401);
            }

            DB::table('api_keys')
                ->where('id', $apiKey->id)
                ->update(['ultimo_uso_em' => now()]);

            $request->merge(['_api_key_id' => $apiKey->id, '_api_key_nome' => $apiKey->nome]);
        } catch (\Throwable) {
            return new \Illuminate\Http\JsonResponse(['message' => 'API key inválida.'], 401);
        }

        return $next($request);
    }

    private function garantirTabelaApiKeys(): void
    {
        DB::statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS api_keys (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                nome VARCHAR(255) NOT NULL,
                chave_hash VARCHAR(64) NOT NULL UNIQUE,
                chave_preview VARCHAR(20) NOT NULL,
                ativo BOOLEAN NOT NULL DEFAULT TRUE,
                ultimo_uso_em TIMESTAMPTZ NULL,
                usuario_id VARCHAR(120) NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        SQL);
    }
}
