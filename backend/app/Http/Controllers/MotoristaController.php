<?php

namespace App\Http\Controllers;

use App\Models\Motorista;
use Illuminate\Http\Request;

class MotoristaController extends Controller
{
    private function filiaisPermitidas(): array
    {
        $user = auth()->user();
        return method_exists($user, 'filiaisAcesso') ? $user->filiaisAcesso() : ['Matriz', 'Viana'];
    }

    private function aplicarFiltroFilial($query, Request $request)
    {
        $permitidas = $this->filiaisPermitidas();
        $query->whereIn('local', $permitidas);

        if ($request->filled('local')) {
            $local = trim((string) $request->local);
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
        $query = Motorista::with('proprietario');
        $this->aplicarFiltroFilial($query, $request);
        if ($request->filled('id_proprietario')) $query->where('id_proprietario', $request->id_proprietario);
        if ($request->filled('search')) {
            $query->where(fn($q) => $q->where('nome','ilike','%'.$request->search.'%')
                ->orWhere('documento','ilike','%'.$request->search.'%'));
        }
        return new \Illuminate\Http\JsonResponse($query->orderBy('nome')->paginate($request->get('per_page', 50)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nome'            => 'required|string|max:255',
            'id_proprietario' => 'required|exists:proprietarios,id_proprietario',
            'documento'       => 'nullable|string',
            'celular'         => 'nullable|string',
            'local'           => 'nullable|string|in:Matriz,Viana',
        ]);
        $localProprietario = \App\Models\Proprietario::query()
            ->where('id_proprietario', $data['id_proprietario'])
            ->value('local');
        $data['local'] = $localProprietario ?: (trim((string) ($data['local'] ?? '')) ?: ($this->filiaisPermitidas()[0] ?? 'Matriz'));
        $this->validarAcessoFilial($data['local']);
        $existing = Motorista::query()
            ->where('id_proprietario', $data['id_proprietario'])
            ->whereRaw('LOWER(local) = LOWER(?)', [$data['local']])
            ->when($data['documento'] ?? null,
                fn ($q, $documento) => $q->where('documento', $documento),
                fn ($q) => $q->whereRaw('LOWER(nome) = LOWER(?)', [trim((string) $data['nome'])])
            )
            ->first();
        if ($existing) {
            return new \Illuminate\Http\JsonResponse($existing);
        }
        return new \Illuminate\Http\JsonResponse(Motorista::create($data), 201);
    }

    public function show(string $id)
    {
        $motorista = Motorista::with('proprietario')->findOrFail($id);
        $this->validarAcessoFilial((string) $motorista->local);
        return new \Illuminate\Http\JsonResponse($motorista);
    }

    public function update(Request $request, string $id)
    {
        $motorista = Motorista::findOrFail($id);
        $this->validarAcessoFilial((string) $motorista->local);
        $data = $request->validate([
            'nome'            => 'sometimes|string|max:255',
            'id_proprietario' => 'sometimes|exists:proprietarios,id_proprietario',
            'documento'       => 'nullable|string',
            'celular'         => 'nullable|string',
            'local'           => 'nullable|string|in:Matriz,Viana',
        ]);
        if (array_key_exists('id_proprietario', $data)) {
            $localProprietario = \App\Models\Proprietario::query()
                ->where('id_proprietario', $data['id_proprietario'])
                ->value('local');
            $data['local'] = $localProprietario ?: ($data['local'] ?? $motorista->local);
        }
        if (array_key_exists('local', $data)) {
            $data['local'] = trim((string) ($data['local'] ?? '')) ?: $motorista->local;
            $this->validarAcessoFilial($data['local']);
        }
        $motorista->update($data);
        return new \Illuminate\Http\JsonResponse($motorista->fresh());
    }

    public function destroy(string $id)
    {
        $motorista = Motorista::findOrFail($id);
        $this->validarAcessoFilial((string) $motorista->local);
        $motorista->delete();
        return new \Illuminate\Http\JsonResponse(['message' => 'Motorista excluído']);
    }

    public function byProprietario(string $id)
    {
        return new \Illuminate\Http\JsonResponse(
            Motorista::query()
                ->select([
                    'id_motorista',
                    'nome',
                    'id_proprietario',
                    'documento',
                    'celular',
                    'local',
                ])
                ->where('id_proprietario', $id)
                ->whereIn('local', $this->filiaisPermitidas())
                ->orderBy('nome')
                ->get()
        );
    }
}
