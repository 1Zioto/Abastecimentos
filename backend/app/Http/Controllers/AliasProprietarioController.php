<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AliasProprietarioController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->garantirTabelaAliasProprietarios();

        $query = DB::table('alias_proprietarios')
            ->join('proprietarios', 'alias_proprietarios.proprietario_id', '=', 'proprietarios.id_proprietario')
            ->select(
                'alias_proprietarios.*',
                'proprietarios.nome as proprietario_nome'
            );

        if ($request->filled('busca')) {
            $busca = '%' . strtolower(trim((string) $request->busca)) . '%';
            $query->where(function ($q) use ($busca) {
                $q->whereRaw('LOWER(alias_proprietarios.nome_alias_original) LIKE ?', [$busca])
                    ->orWhereRaw('LOWER(proprietarios.nome) LIKE ?', [$busca]);
            });
        }

        if ($request->filled('proprietario_id')) {
            $query->where('alias_proprietarios.proprietario_id', $request->proprietario_id);
        }

        $result = $query->orderBy('alias_proprietarios.nome_alias_original')->paginate($request->get('per_page', 50));
        return new JsonResponse($result);
    }

    public function store(Request $request): JsonResponse
    {
        $this->garantirTabelaAliasProprietarios();

        $data = $request->validate([
            'nome_alias'      => 'required|string|max:400',
            'proprietario_id' => 'required|exists:proprietarios,id_proprietario',
        ]);

        $nomeNormalizado = $this->normalizarNome($data['nome_alias']);
        if ($nomeNormalizado === '') {
            return new JsonResponse(['message' => 'Nome do alias não pode ser vazio.'], 422);
        }

        $existing = DB::table('alias_proprietarios')->where('nome_alias', $nomeNormalizado)->first();
        if ($existing) {
            DB::table('alias_proprietarios')
                ->where('id', $existing->id)
                ->update([
                    'proprietario_id'    => $data['proprietario_id'],
                    'nome_alias_original' => $data['nome_alias'],
                    'updated_at'         => now(),
                ]);
            return new JsonResponse(
                DB::table('alias_proprietarios')->where('id', $existing->id)->first(),
                200
            );
        }

        $user = auth()->user();
        $id = (string) Str::uuid();
        DB::table('alias_proprietarios')->insert([
            'id'                 => $id,
            'nome_alias'         => $nomeNormalizado,
            'nome_alias_original' => $data['nome_alias'],
            'proprietario_id'    => $data['proprietario_id'],
            'usuario_id'         => $user ? (string) $user->getAuthIdentifier() : null,
            'created_at'         => now(),
            'updated_at'         => now(),
        ]);

        return new JsonResponse(DB::table('alias_proprietarios')->where('id', $id)->first(), 201);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->garantirTabelaAliasProprietarios();
        $deleted = DB::table('alias_proprietarios')->where('id', $id)->delete();
        if (!$deleted) {
            return new JsonResponse(['message' => 'Alias não encontrado.'], 404);
        }
        return new JsonResponse(['message' => 'Alias removido.']);
    }

    public function buscar(Request $request): JsonResponse
    {
        $this->garantirTabelaAliasProprietarios();

        $nome = trim((string) ($request->nome ?? ''));
        if ($nome === '') {
            return new JsonResponse(['alias' => null, 'proprietario' => null]);
        }

        $nomeNorm = $this->normalizarNome($nome);
        $alias = DB::table('alias_proprietarios')
            ->where('nome_alias', $nomeNorm)
            ->first();

        if (!$alias) {
            return new JsonResponse(['alias' => null, 'proprietario' => null]);
        }

        $proprietario = DB::table('proprietarios')
            ->where('id_proprietario', $alias->proprietario_id)
            ->first();

        return new JsonResponse([
            'alias'       => $alias,
            'proprietario' => $proprietario,
        ]);
    }

    public static function normalizarNome(string $nome): string
    {
        $nome = mb_strtolower(trim($nome));
        $nome = preg_replace('/\s+/', ' ', $nome) ?? $nome;
        $nome = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $nome) ?? $nome;
        $nome = preg_replace('/[^a-z0-9 ]/', '', $nome) ?? $nome;
        return trim($nome ?? '');
    }

    public static function garantirTabelaAliasProprietarios(): void
    {
        DB::statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS alias_proprietarios (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                nome_alias TEXT NOT NULL,
                nome_alias_original TEXT NOT NULL,
                proprietario_id VARCHAR(120) NOT NULL,
                usuario_id VARCHAR(120) NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(nome_alias)
            )
        SQL);
        DB::statement('ALTER TABLE alias_proprietarios ALTER COLUMN proprietario_id TYPE VARCHAR(120) USING proprietario_id::text');
    }
}
