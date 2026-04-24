<?php

namespace App\Http\Controllers;

use App\Models\Veiculo;
use Illuminate\Http\Request;

class VeiculoController extends Controller
{
    public function index(Request $request)
    {
        $query = Veiculo::with('proprietario');
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
        ]);
        return new \Illuminate\Http\JsonResponse(Veiculo::create($data), 201);
    }

    public function show(string $id)
    {
        return new \Illuminate\Http\JsonResponse(Veiculo::with('proprietario')->findOrFail($id));
    }

    public function update(Request $request, string $id)
    {
        $veiculo = Veiculo::findOrFail($id);
        $veiculo->update($request->validate([
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
        ]));
        return new \Illuminate\Http\JsonResponse($veiculo->fresh('proprietario'));
    }

    public function destroy(string $id)
    {
        Veiculo::findOrFail($id)->delete();
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
                ])
                ->where('id_proprietario', $id)
                ->orderBy('placa')
                ->get()
        );
    }
}
