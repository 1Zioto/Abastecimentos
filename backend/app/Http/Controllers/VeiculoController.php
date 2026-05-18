<?php

namespace App\Http\Controllers;

use App\Models\Veiculo;
use Illuminate\Http\Request;

class VeiculoController extends Controller
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
        $query = Veiculo::with('proprietario');
        $this->aplicarFiltroFilial($query, $request);
        if ($request->filled('id_proprietario')) $query->where('id_proprietario', $request->id_proprietario);
        if ($request->filled('placa')) $query->where('placa', 'ilike', '%'.$request->placa.'%');
        if ($request->filled('search')) {
            $query->where(fn($q) => $q->where('placa','ilike','%'.$request->search.'%')
                ->orWhere('modelo','ilike','%'.$request->search.'%')
                ->orWhere('marca','ilike','%'.$request->search.'%'));
        }
        return new \Illuminate\Http\JsonResponse($query->orderBy('placa')->paginate($request->get('per_page', 50)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'placa'           => 'required|string|max:10',
            'marca'           => 'nullable|string',
            'modelo'          => 'nullable|string',
            'ano'             => 'nullable|string',
            'tipo_combustivel'=> 'nullable|string',
            'numero_chassi'   => 'nullable|string',
            'id_proprietario' => 'required|exists:proprietarios,id_proprietario',
            'odometro'        => 'nullable|integer',
            'renavam'         => 'nullable|string',
            'cor'             => 'nullable|string',
            'foto'            => 'nullable|string',
            'local'           => 'nullable|string|in:Matriz,Viana',
        ]);
        $localProprietario = \App\Models\Proprietario::query()
            ->where('id_proprietario', $data['id_proprietario'])
            ->value('local');
        $data['local'] = $localProprietario ?: (trim((string) ($data['local'] ?? '')) ?: ($this->filiaisPermitidas()[0] ?? 'Matriz'));
        $this->validarAcessoFilial($data['local']);
        $existing = Veiculo::query()
            ->whereRaw('LOWER(placa) = LOWER(?)', [trim((string) $data['placa'])])
            ->whereRaw('LOWER(local) = LOWER(?)', [$data['local']])
            ->first();
        if ($existing) {
            return new \Illuminate\Http\JsonResponse($existing);
        }
        return new \Illuminate\Http\JsonResponse(Veiculo::create($data), 201);
    }

    public function show(string $id)
    {
        $veiculo = Veiculo::with('proprietario')->findOrFail($id);
        $this->validarAcessoFilial((string) $veiculo->local);
        return new \Illuminate\Http\JsonResponse($veiculo);
    }

    public function update(Request $request, string $id)
    {
        $veiculo = Veiculo::findOrFail($id);
        $this->validarAcessoFilial((string) $veiculo->local);
        $data = $request->validate([
            'placa'           => 'sometimes|string|max:10',
            'marca'           => 'nullable|string',
            'modelo'          => 'nullable|string',
            'ano'             => 'nullable|string',
            'tipo_combustivel'=> 'nullable|string',
            'numero_chassi'   => 'nullable|string',
            'id_proprietario' => 'sometimes|exists:proprietarios,id_proprietario',
            'odometro'        => 'nullable|integer',
            'renavam'         => 'nullable|string',
            'cor'             => 'nullable|string',
            'foto'            => 'nullable|string',
            'local'           => 'nullable|string|in:Matriz,Viana',
        ]);
        if (array_key_exists('id_proprietario', $data)) {
            $localProprietario = \App\Models\Proprietario::query()
                ->where('id_proprietario', $data['id_proprietario'])
                ->value('local');
            $data['local'] = $localProprietario ?: ($data['local'] ?? $veiculo->local);
        }
        if (array_key_exists('local', $data)) {
            $data['local'] = trim((string) ($data['local'] ?? '')) ?: $veiculo->local;
            $this->validarAcessoFilial($data['local']);
        }
        $veiculo->update($data);
        return new \Illuminate\Http\JsonResponse($veiculo->fresh('proprietario'));
    }

    public function destroy(string $id)
    {
        $veiculo = Veiculo::findOrFail($id);
        $this->validarAcessoFilial((string) $veiculo->local);
        $veiculo->delete();
        return new \Illuminate\Http\JsonResponse(['message' => 'Veículo excluído']);
    }

    public function byProprietario(string $id)
    {
        return new \Illuminate\Http\JsonResponse(
            Veiculo::query()
                ->select([
                    'id_veiculo',
                    'placa',
                    'marca',
                    'modelo',
                    'ano',
                    'tipo_combustivel',
                    'numero_chassi',
                    'id_proprietario',
                    'odometro',
                    'renavam',
                    'cor',
                    'local',
                ])
                ->where('id_proprietario', $id)
                ->whereIn('local', $this->filiaisPermitidas())
                ->orderBy('placa')
                ->get()
        );
    }
}
