<?php

namespace App\Http\Controllers;

use App\Models\Usuario;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UsuarioController extends Controller
{
    public function index(Request $request)
    {
        $query = Usuario::query();
        if ($request->filled('search')) {
            $query->where(fn($q) => $q->where('nome','ilike','%'.$request->search.'%')
                ->orWhere('login','ilike','%'.$request->search.'%'));
        }
        if ($request->filled('tipo')) $query->where('tipo', $request->tipo);
        return response()->json($query->orderBy('nome')->paginate($request->get('per_page', 50)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nome'     => 'required|string|max:255',
            'login'    => 'required|string|unique:usuarios,login',
            'password' => 'required|string|min:6',
            'tipo'     => 'required|string|in:admin,operador,visualizador',
        ]);
        $data['password'] = Hash::make($data['password']);
        return response()->json(Usuario::create($data), 201);
    }

    public function show(string $id)
    {
        return response()->json(Usuario::findOrFail($id));
    }

    public function update(Request $request, string $id)
    {
        $usuario = Usuario::findOrFail($id);
        $data = $request->validate([
            'nome'     => 'sometimes|string|max:255',
            'login'    => 'sometimes|string|unique:usuarios,login,'.$id.',id_user',
            'password' => 'nullable|string|min:6',
            'tipo'     => 'sometimes|string|in:admin,operador,visualizador',
        ]);
        if (!empty($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }
        $usuario->update($data);
        return response()->json($usuario->fresh());
    }

    public function destroy(string $id)
    {
        $currentUser = auth()->user();
        if ($currentUser && $currentUser->id_user === $id) {
            return response()->json(['message' => 'Não é possível excluir o próprio usuário'], 422);
        }
        Usuario::findOrFail($id)->delete();
        return response()->json(['message' => 'Usuário excluído']);
    }
}
