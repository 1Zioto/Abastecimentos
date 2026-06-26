<?php

namespace App\Http\Controllers;

use App\Models\Usuario;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UsuarioController extends Controller
{
    private function normalizarCampoSenha(Request $request): void
    {
        if (!$request->filled('password') && $request->filled('senha')) {
            $request->merge(['password' => $request->input('senha')]);
        }
    }

    private function serializeUsuario(Usuario $usuario): array
    {
        $data = $usuario->toArray();
        $data['filiais_acesso'] = $usuario->filiaisAcesso();
        return $data;
    }

    public function index(Request $request)
    {
        $this->garantirColunasAuditoria('usuarios');
        $query = Usuario::query();
        $this->aplicarFiltroAtivos($query, 'usuarios', $request);
        $this->aplicarFiltroSyncToken($query, $request, 'usuarios');
        if ($request->filled('search')) {
            $query->where(fn($q) => $q->where('nome','ilike','%'.$request->search.'%')
                ->orWhere('login','ilike','%'.$request->search.'%'));
        }
        if ($request->filled('tipo')) $query->where('tipo', $request->tipo);
        if ($this->suportaSyncIncremental($request, 'usuarios')) {
            $page = $query->orderBy('sync_token_at')->orderBy('id_user')->paginate($request->get('per_page', 50));
        } else {
            $page = $query->orderBy('nome')->paginate($request->get('per_page', 50));
        }
        $page->getCollection()->transform(fn (Usuario $usuario) => $this->serializeUsuario($usuario));
        return new \Illuminate\Http\JsonResponse($page);
    }

    public function store(Request $request)
    {
        $this->normalizarCampoSenha($request);

        $data = $request->validate([
            'nome'     => 'required|string|max:255',
            'login'    => 'required|string',
            'password' => 'required|string|min:6',
            'tipo'     => 'required|string|in:admin,operador,visualizador',
            'filiais_acesso' => 'nullable|array|min:1',
            'filiais_acesso.*' => 'string|in:Matriz,Viana',
        ]);
        $existing = Usuario::query()
            ->whereRaw('LOWER(login) = LOWER(?)', [trim((string) $data['login'])])
            ->first();
        if ($existing) {
            return new \Illuminate\Http\JsonResponse($this->serializeUsuario($existing));
        }
        $data['password'] = Hash::make($data['password']);
        $data['filiais_acesso'] = Usuario::normalizarFiliais($data['filiais_acesso'] ?? null);
        return new \Illuminate\Http\JsonResponse($this->serializeUsuario(Usuario::create($data)), 201);
    }

    public function show(string $id)
    {
        return new \Illuminate\Http\JsonResponse($this->serializeUsuario(Usuario::findOrFail($id)));
    }

    public function update(Request $request, string $id)
    {
        $usuario = Usuario::findOrFail($id);
        $this->normalizarCampoSenha($request);

        $data = $request->validate([
            'nome'     => 'sometimes|string|max:255',
            'login'    => 'sometimes|string|unique:usuarios,login,'.$id.',id_user',
            'password' => 'nullable|string|min:6',
            'tipo'     => 'sometimes|string|in:admin,operador,visualizador',
            'filiais_acesso' => 'nullable|array|min:1',
            'filiais_acesso.*' => 'string|in:Matriz,Viana',
        ]);
        if (!empty($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }
        if (array_key_exists('filiais_acesso', $data)) {
            $data['filiais_acesso'] = Usuario::normalizarFiliais($data['filiais_acesso']);
        }
        $auditoria = $data;
        if (array_key_exists('password', $auditoria)) {
            $auditoria['password'] = '[senha alterada]';
        }
        $this->registrarAlteracoes($usuario, $auditoria);
        $usuario->update($data);
        return new \Illuminate\Http\JsonResponse($this->serializeUsuario($usuario->fresh()));
    }

    public function destroy(string $id)
    {
        $currentUser = auth()->user();
        if ($currentUser && $currentUser->id_user === $id) {
            return new \Illuminate\Http\JsonResponse(['message' => 'Não é possível excluir o próprio usuário'], 422);
        }
        return $this->inativarRegistro(Usuario::findOrFail($id), 'Usuário inativado');
    }

    public function restore(string $id)
    {
        return $this->restaurarRegistro(Usuario::findOrFail($id), 'Usuário restaurado');
    }
}
