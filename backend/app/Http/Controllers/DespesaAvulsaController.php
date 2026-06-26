<?php

namespace App\Http\Controllers;

use App\Models\DespesaAvulsa;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DespesaAvulsaController extends Controller
{
    private function ensureSchema(): void
    {
        DB::statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS despesas_avulsas (
                id_despesa VARCHAR(120) PRIMARY KEY,
                data DATE NOT NULL,
                data_hora TIMESTAMP NULL,
                descricao VARCHAR(255) NOT NULL,
                categoria VARCHAR(120) NULL,
                valor NUMERIC(12,2) NOT NULL,
                forma_pagamento VARCHAR(80) NULL,
                observacao TEXT NULL,
                responsavel VARCHAR(255) NULL,
                local VARCHAR(40) NOT NULL DEFAULT 'Matriz',
                status VARCHAR(40) NULL,
                deleted_at TIMESTAMP NULL,
                deleted_by VARCHAR(255) NULL,
                deleted_by_id VARCHAR(120) NULL,
                sync_token_at TIMESTAMP NULL
            )
        SQL);

        $this->garantirColunasAuditoria('despesas_avulsas');
        DB::statement("UPDATE despesas_avulsas SET data_hora = data::timestamp WHERE data_hora IS NULL");
        DB::statement("UPDATE despesas_avulsas SET local = 'Matriz' WHERE local IS NULL OR local = ''");
    }

    private function filiaisPermitidas(): array
    {
        $user = auth('api')->user();
        if (!$user) {
            abort(401, 'Não autenticado.');
        }
        return method_exists($user, 'filiaisAcesso') ? $user->filiaisAcesso() : ['Matriz', 'Viana'];
    }

    private function normalizarLocal(?string $local): string
    {
        $local = trim((string) $local);
        if ($local === '') {
            return $this->filiaisPermitidas()[0] ?? 'Matriz';
        }
        return match (mb_strtolower($local)) {
            'garagem', 'garagem cariacica', 'cariacica' => 'Matriz',
            'garagem viana', 'filial viana' => 'Viana',
            default => $local,
        };
    }

    private function validarAcessoFilial(string $local): void
    {
        if (!in_array($local, $this->filiaisPermitidas(), true)) {
            abort(403, 'Usuário sem acesso a esta filial.');
        }
    }

    public function index(Request $request): JsonResponse
    {
        $this->ensureSchema();

        $query = DespesaAvulsa::query();
        $this->aplicarFiltroAtivos($query, 'despesas_avulsas', $request);
        $this->aplicarFiltroSyncToken($query, $request, 'despesas_avulsas');

        $permitidas = $this->filiaisPermitidas();
        $query->whereIn('local', $permitidas);

        if ($request->filled('local')) {
            $local = $this->normalizarLocal($request->query('local'));
            if (!in_array($local, $permitidas, true)) {
                $query->whereRaw('1 = 0');
            } else {
                $query->where('local', $local);
            }
        }

        if ($request->filled('categoria')) {
            $query->where('categoria', $request->query('categoria'));
        }
        if ($request->filled('data_inicio')) {
            $query->whereDate('data', '>=', $request->query('data_inicio'));
        }
        if ($request->filled('data_fim')) {
            $query->whereDate('data', '<=', $request->query('data_fim'));
        }
        if ($request->filled('q')) {
            $term = '%' . mb_strtolower(trim((string) $request->query('q'))) . '%';
            $query->where(function ($q) use ($term) {
                $q->whereRaw('LOWER(descricao) LIKE ?', [$term])
                    ->orWhereRaw('LOWER(COALESCE(observacao, \'\')) LIKE ?', [$term]);
            });
        }

        if ($this->suportaSyncIncremental($request, 'despesas_avulsas')) {
            return new JsonResponse(
                $query->orderBy('sync_token_at')->orderBy('id_despesa')->paginate($request->get('per_page', 50))
            );
        }

        return new JsonResponse(
            $query
                ->orderByRaw('COALESCE(data_hora, data::timestamp) DESC')
                ->orderByDesc('id_despesa')
                ->paginate($request->get('per_page', 50))
        );
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensureSchema();

        $data = $request->validate([
            'data' => 'required|date',
            'data_hora' => 'nullable|date',
            'descricao' => 'required|string|max:255',
            'categoria' => 'nullable|string|max:120',
            'valor' => 'required|numeric|min:0.01',
            'forma_pagamento' => 'nullable|string|max:80',
            'observacao' => 'nullable|string',
            'local' => 'nullable|string|in:Matriz,Viana',
        ]);

        $data['data_hora'] = $data['data_hora'] ?? $data['data'];
        $data['descricao'] = trim((string) $data['descricao']);
        $data['categoria'] = trim((string) ($data['categoria'] ?? '')) ?: null;
        $data['forma_pagamento'] = trim((string) ($data['forma_pagamento'] ?? '')) ?: null;
        $data['observacao'] = trim((string) ($data['observacao'] ?? '')) ?: null;
        $data['local'] = $this->normalizarLocal($data['local'] ?? null);
        $this->validarAcessoFilial($data['local']);

        $user = auth('api')->user();
        $data['responsavel'] = $user?->nome ?? $user?->login ?? 'Sistema';
        $data['status'] = 'Ativo';

        return new JsonResponse(DespesaAvulsa::create($data), 201);
    }

    public function show(string $id): JsonResponse
    {
        $this->ensureSchema();
        $despesa = DespesaAvulsa::findOrFail($id);
        $this->validarAcessoFilial((string) $despesa->local);
        return new JsonResponse($despesa);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $this->ensureSchema();
        $despesa = DespesaAvulsa::findOrFail($id);
        $this->validarAcessoFilial((string) $despesa->local);

        $data = $request->validate([
            'data' => 'sometimes|required|date',
            'data_hora' => 'nullable|date',
            'descricao' => 'sometimes|required|string|max:255',
            'categoria' => 'nullable|string|max:120',
            'valor' => 'sometimes|required|numeric|min:0.01',
            'forma_pagamento' => 'nullable|string|max:80',
            'observacao' => 'nullable|string',
            'local' => 'nullable|string|in:Matriz,Viana',
        ]);

        if (array_key_exists('data', $data) && !array_key_exists('data_hora', $data)) {
            $data['data_hora'] = $data['data'];
        }
        if (array_key_exists('descricao', $data)) {
            $data['descricao'] = trim((string) $data['descricao']);
        }
        foreach (['categoria', 'forma_pagamento', 'observacao'] as $campo) {
            if (array_key_exists($campo, $data)) {
                $data[$campo] = trim((string) ($data[$campo] ?? '')) ?: null;
            }
        }
        if (array_key_exists('local', $data)) {
            $data['local'] = $this->normalizarLocal($data['local']);
            $this->validarAcessoFilial($data['local']);
        }

        $this->registrarAlteracoes($despesa, $data);
        $despesa->update($data);

        return new JsonResponse($despesa->fresh());
    }

    public function destroy(string $id): JsonResponse
    {
        $this->ensureSchema();
        $despesa = DespesaAvulsa::findOrFail($id);
        $this->validarAcessoFilial((string) $despesa->local);
        return $this->inativarRegistro($despesa, 'Despesa avulsa inativada');
    }

    public function restore(string $id): JsonResponse
    {
        $this->ensureSchema();
        $despesa = DespesaAvulsa::findOrFail($id);
        $this->validarAcessoFilial((string) $despesa->local);
        return $this->restaurarRegistro($despesa, 'Despesa avulsa restaurada');
    }
}
