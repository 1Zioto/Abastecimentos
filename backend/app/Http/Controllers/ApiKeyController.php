<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ApiKeyController extends Controller
{
    public function index(): JsonResponse
    {
        $this->garantirTabelaApiKeys();

        $keys = DB::table('api_keys')
            ->orderByDesc('created_at')
            ->get()
            ->map(function ($key) {
                unset($key->chave_hash);
                return $key;
            });

        return new JsonResponse(['data' => $keys]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->garantirTabelaApiKeys();

        $data = $request->validate([
            'nome' => 'required|string|max:255',
        ]);

        $user = auth()->user();
        $chave = 'vipe_' . Str::random(40);
        $hash = hash('sha256', $chave);
        $preview = substr($chave, 0, 12) . '...';

        $id = (string) Str::uuid();
        DB::table('api_keys')->insert([
            'id'           => $id,
            'nome'         => $data['nome'],
            'chave_hash'   => $hash,
            'chave_preview' => $preview,
            'ativo'        => true,
            'usuario_id'   => $user ? (string) $user->getAuthIdentifier() : null,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        $key = DB::table('api_keys')->where('id', $id)->first();
        unset($key->chave_hash);

        return new JsonResponse([
            'message' => 'API key criada. Guarde a chave — ela não será exibida novamente.',
            'api_key' => $key,
            'chave'   => $chave,
        ], 201);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->garantirTabelaApiKeys();

        $updated = DB::table('api_keys')
            ->where('id', $id)
            ->update(['ativo' => false, 'updated_at' => now()]);

        if (!$updated) {
            return new JsonResponse(['message' => 'API key não encontrada.'], 404);
        }

        return new JsonResponse(['message' => 'API key revogada.']);
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
