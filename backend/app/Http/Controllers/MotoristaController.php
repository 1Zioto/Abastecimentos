<?php

namespace App\Http\Controllers;

use App\Models\Motorista;
use Illuminate\Http\Request;

class MotoristaController extends Controller
{
    public function index(Request $request)
    {
        $query = Motorista::with('proprietario');
        if ($request->filled('id_proprietario')) $query->where('id_proprietario', $request->id_proprietario);
        if ($request->filled('search')) {
            $query->where(fn($q) => $q->where('nome','ilike','%'.$request->search.'%')
                ->orWhere('documento','ilike','%'.$request->search.'%'));
        }
        return response()->json($query->orderBy('nome')->paginate($request->get('per_page', 50)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nome'            => 'required|string|max:255',
            'id_proprietario' => 'required|exists:proprietarios,id_proprietario',
            'documento'       => 'nullable|string',
            'celular'         => 'nullable|string',
        ]);
        return response()->json(Motorista::create($data), 201);
    }

    public function show(string $id)
    {
        return response()->json(Motorista::with('proprietario')->findOrFail($id));
    }

    public function update(Request $request, string $id)
    {
        $motorista = Motorista::findOrFail($id);
        $motorista->update($request->validate([
            'nome'            => 'sometimes|string|max:255',
            'id_proprietario' => 'sometimes|exists:proprietarios,id_proprietario',
            'documento'       => 'nullable|string',
            'celular'         => 'nullable|string',
        ]));
        return response()->json($motorista->fresh());
    }

    public function destroy(string $id)
    {
        Motorista::findOrFail($id)->delete();
        return response()->json(['message' => 'Motorista excluído']);
    }

    public function byProprietario(string $id)
    {
        return response()->json(Motorista::where('id_proprietario', $id)->orderBy('nome')->get());
    }
}
