<?php

namespace App\Http\Controllers;

use App\Models\ValoresCombustivel;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class ValoresCombustivelController extends Controller
{
    private function garantirColunaLocal(): void
    {
        $this->garantirColunasAuditoria('valores_combustivel');
        if (!$this->tabelaTemColuna('valores_combustivel', 'local')) {
            DB::statement("ALTER TABLE valores_combustivel ADD COLUMN IF NOT EXISTS local VARCHAR(40) NULL");
        }
        DB::statement("UPDATE valores_combustivel SET local = 'Viana' WHERE local IS NULL OR local = ''");
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

    public function index(Request $request)
    {
        $this->garantirColunaLocal();
        $query = ValoresCombustivel::query();
        $this->aplicarFiltroSyncToken($query, $request, 'valores_combustivel');
        if ($request->filled('tipo_combustivel')) $query->where('tipo_combustivel', $request->tipo_combustivel);
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
        if ($this->suportaSyncIncremental($request, 'valores_combustivel')) {
            return new \Illuminate\Http\JsonResponse(
                $query->orderBy('sync_token_at')->orderBy('id_valor')->paginate($request->get('per_page', 30))
            );
        }
        return new \Illuminate\Http\JsonResponse($query->orderBy('local')->orderByDesc('data')->paginate($request->get('per_page', 30)));
    }

    public function store(Request $request)
    {
        $this->garantirColunaLocal();
        if ($adminResponse = $this->ensureAdmin()) {
            return $adminResponse;
        }

        $data = $request->validate([
            'tipo_combustivel' => 'required|string',
            'valor'            => 'required|numeric|min:0',
            'local'            => 'nullable|string|in:Matriz,Viana',
        ]);
        $data['local'] = $this->normalizarLocal($data['local'] ?? null);
        $this->validarAcessoFilial($data['local']);
        $currentUser = auth('api')->user();
        $data['responsavel'] = $currentUser?->nome ?: $currentUser?->login ?: 'Sistema';
        $existing = ValoresCombustivel::query()
            ->where('tipo_combustivel', $data['tipo_combustivel'])
            ->where('local', $data['local'])
            ->where('valor', $data['valor'])
            ->where('data', '>=', now()->subMinutes(10))
            ->latest('data')
            ->first();
        if ($existing) {
            return new \Illuminate\Http\JsonResponse($existing);
        }
        $data['data'] = now();
        return new \Illuminate\Http\JsonResponse(ValoresCombustivel::create($data), 201);
    }

    public function show(string $id)
    {
        $this->garantirColunaLocal();
        $valor = ValoresCombustivel::findOrFail($id);
        $this->validarAcessoFilial($this->normalizarLocal($valor->local));
        return new \Illuminate\Http\JsonResponse($valor);
    }

    public function update(Request $request, string $id)
    {
        return new JsonResponse([
            'message' => 'Preço de combustível já salvo não pode ser alterado. Cadastre um novo preço.'
        ], 405);
    }

    public function destroy(string $id)
    {
        return new JsonResponse([
            'message' => 'Preço de combustível já salvo não pode ser excluído.'
        ], 405);
    }

    public function valorAtual(Request $request, string $tipo)
    {
        $this->garantirColunaLocal();
        $local = $this->normalizarLocal($request->query('local'));
        $this->validarAcessoFilial($local);
        $valor = ValoresCombustivel::where('tipo_combustivel', $tipo)
            ->whereRaw('LOWER(local) = LOWER(?)', [$local])
            ->orderByDesc('data')
            ->when(
                $this->tabelaTemColuna('valores_combustivel', 'sync_token_at'),
                fn ($q) => $q->orderByDesc('sync_token_at')
            )
            ->orderByDesc('id_valor')
            ->first();
        return new \Illuminate\Http\JsonResponse($valor);
    }

    private function ensureAdmin(): ?JsonResponse
    {
        $currentUser = auth('api')->user();
        if (!$currentUser || $currentUser->tipo !== 'admin') {
            return new JsonResponse(['message' => 'Somente administradores podem alterar combustível'], 403);
        }

        return null;
    }
}
