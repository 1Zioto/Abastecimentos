<?php

namespace App\Http\Controllers;

use App\Models\EntradaNota;
use Illuminate\Http\Request;

class EntradaNotaController extends Controller
{
    public function index(Request $request)
    {
        $query = EntradaNota::query();
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
        ]);
        $data['responsavel'] = auth()->user()?->nome ?? ($data['responsavel'] ?? null);
        return new \Illuminate\Http\JsonResponse(EntradaNota::create($data), 201);
    }

    public function show(string $id)
    {
        return new \Illuminate\Http\JsonResponse(EntradaNota::findOrFail($id));
    }

    public function update(Request $request, string $id)
    {
        $nota = EntradaNota::findOrFail($id);
        $data = $request->validate([
            'data'               => 'sometimes|date',
            'numero_nota_fiscal' => 'nullable|string',
            'valor'              => 'nullable|numeric|min:0',
            'quantidade'         => 'nullable|numeric|min:0',
            'valor_litro'        => 'nullable|numeric|min:0',
            'responsavel'        => 'nullable|string',
            'foto_nota'          => 'nullable|string',
            'tipo'               => 'nullable|string',
        ]);
        $data['responsavel'] = auth()->user()?->nome ?? ($data['responsavel'] ?? $nota->responsavel);
        $nota->update($data);
        return new \Illuminate\Http\JsonResponse($nota->fresh());
    }

    public function destroy(string $id)
    {
        EntradaNota::findOrFail($id)->delete();
        return new \Illuminate\Http\JsonResponse(['message' => 'Nota excluída']);
    }

    public function forceDelete(string $id)
    {
        return $this->destroy($id);
    }
}
