<?php

namespace App\Http\Controllers;

use App\Models\EntradaNota;
use Illuminate\Http\Request;

class EntradaNotaController extends Controller
{
    private function filiaisPermitidas(): array
    {
        $user = auth()->user();
        return method_exists($user, 'filiaisAcesso') ? $user->filiaisAcesso() : ['Matriz', 'Viana'];
    }

    private function applyLocal($query, ?string $local)
    {
        $permitidas = $this->filiaisPermitidas();
        $query->whereIn('local', $permitidas);

        $local = trim((string) $local);
        if ($local !== '') {
            if (!in_array($local, $permitidas, true)) {
                $query->whereRaw('1 = 0');
                return $query;
            }
            $query->whereRaw('LOWER(local) = LOWER(?)', [$local]);
        }

        return $query;
    }

    private function validarAcessoFilial(string $local): void
    {
        if (!in_array($local, $this->filiaisPermitidas(), true)) {
            abort(403, 'Usuário sem acesso a esta filial.');
        }
    }

    public function index(Request $request)
    {
        $query = $this->applyLocal(EntradaNota::query(), $request->query('local'));
        if ($request->filled('tipo')) $query->where('tipo', $request->tipo);
        if ($request->filled('data_inicio')) $query->whereDate('data', '>=', $request->data_inicio);
        if ($request->filled('data_fim')) $query->whereDate('data', '<=', $request->data_fim);
        return new \Illuminate\Http\JsonResponse($query->orderByDesc('data')->paginate($request->get('per_page', 30)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'data'               => 'required|date',
            'numero_nota_fiscal' => 'nullable|string',
            'valor'              => 'nullable|numeric|min:0',
            'quantidade'         => 'nullable|numeric|min:0',
            'valor_litro'        => 'nullable|numeric|min:0',
            'responsavel'        => 'nullable|string',
            'foto_nota'          => 'nullable|string',
            'tipo'               => 'nullable|string',
            'local'              => 'nullable|string|in:Matriz,Viana',
        ]);
        $data['responsavel'] = auth()->user()?->nome ?? ($data['responsavel'] ?? null);
        $data['local'] = trim((string) ($data['local'] ?? '')) ?: ($this->filiaisPermitidas()[0] ?? 'Matriz');
        $this->validarAcessoFilial($data['local']);
        if (!empty($data['numero_nota_fiscal'])) {
            $existing = EntradaNota::query()
                ->where('numero_nota_fiscal', $data['numero_nota_fiscal'])
                ->whereDate('data', $data['data'])
                ->whereRaw('LOWER(local) = LOWER(?)', [$data['local']])
                ->when($data['tipo'] ?? null, fn ($q, $tipo) => $q->where('tipo', $tipo))
                ->first();
            if ($existing) {
                return new \Illuminate\Http\JsonResponse($existing);
            }
        }
        return new \Illuminate\Http\JsonResponse(EntradaNota::create($data), 201);
    }

    public function show(string $id)
    {
        $nota = EntradaNota::findOrFail($id);
        $this->validarAcessoFilial((string) $nota->local);
        return new \Illuminate\Http\JsonResponse($nota);
    }

    public function update(Request $request, string $id)
    {
        $nota = EntradaNota::findOrFail($id);
        $this->validarAcessoFilial((string) $nota->local);
        $data = $request->validate([
            'data'               => 'sometimes|date',
            'numero_nota_fiscal' => 'nullable|string',
            'valor'              => 'nullable|numeric|min:0',
            'quantidade'         => 'nullable|numeric|min:0',
            'valor_litro'        => 'nullable|numeric|min:0',
            'responsavel'        => 'nullable|string',
            'foto_nota'          => 'nullable|string',
            'tipo'               => 'nullable|string',
            'local'              => 'nullable|string|in:Matriz,Viana',
        ]);
        $data['responsavel'] = auth()->user()?->nome ?? ($data['responsavel'] ?? $nota->responsavel);
        if (array_key_exists('local', $data)) {
            $data['local'] = trim((string) ($data['local'] ?? '')) ?: $nota->local;
            $this->validarAcessoFilial($data['local']);
        }
        $nota->update($data);
        return new \Illuminate\Http\JsonResponse($nota->fresh());
    }

    public function destroy(string $id)
    {
        $nota = EntradaNota::findOrFail($id);
        $this->validarAcessoFilial((string) $nota->local);
        $nota->delete();
        return new \Illuminate\Http\JsonResponse(['message' => 'Nota excluída']);
    }

    public function forceDelete(string $id)
    {
        return $this->destroy($id);
    }
}
