<?php

namespace App\Http\Controllers;

use App\Models\ValoresCombustivel;
use Illuminate\Http\Request;

class ValoresCombustivelController extends Controller
{
    public function index(Request $request)
    {
        $query = ValoresCombustivel::query();
        if ($request->filled('tipo_combustivel')) $query->where('tipo_combustivel', $request->tipo_combustivel);
        return response()->json($query->orderByDesc('data')->paginate($request->get('per_page', 30)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'tipo_combustivel' => 'required|string',
            'valor'            => 'required|numeric|min:0',
            'responsavel'      => 'nullable|string',
        ]);
        $data['data'] = now();
        return response()->json(ValoresCombustivel::create($data), 201);
    }

    public function show(string $id)
    {
        return response()->json(ValoresCombustivel::findOrFail($id));
    }

    public function update(Request $request, string $id)
    {
        $registro = ValoresCombustivel::findOrFail($id);
        $registro->update($request->validate([
            'tipo_combustivel' => 'sometimes|string',
            'valor'            => 'sometimes|numeric|min:0',
            'responsavel'      => 'nullable|string',
        ]));
        return response()->json($registro->fresh());
    }

    public function destroy(string $id)
    {
        ValoresCombustivel::findOrFail($id)->delete();
        return response()->json(['message' => 'Registro excluído']);
    }

    public function valorAtual(string $tipo)
    {
        $valor = ValoresCombustivel::where('tipo_combustivel', $tipo)
            ->orderByDesc('data')
            ->first();
        return response()->json($valor);
    }
}
