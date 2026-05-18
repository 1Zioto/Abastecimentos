<?php
// =============================================
// ProprietarioController.php
// =============================================
namespace App\Http\Controllers;

use App\Models\Proprietario;
use Illuminate\Http\Request;

class ProprietarioController extends Controller
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
        $query = Proprietario::query();
        $this->aplicarFiltroFilial($query, $request);
        if ($request->filled('search')) {
            $query->where('nome', 'ilike', '%'.$request->search.'%');
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        return new \Illuminate\Http\JsonResponse($query->orderBy('nome')->paginate($request->get('per_page', 50)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nome'        => 'required|string|max:255',
            'status'      => 'nullable|string',
            'responsavel' => 'nullable|string',
            'celular'     => 'nullable|string',
            'observacao'  => 'nullable|string',
            'local'       => 'nullable|string|in:Matriz,Viana',
        ]);
        $data['local'] = trim((string) ($data['local'] ?? '')) ?: ($this->filiaisPermitidas()[0] ?? 'Matriz');
        $this->validarAcessoFilial($data['local']);
        $existing = Proprietario::query()
            ->whereRaw('LOWER(nome) = LOWER(?)', [trim((string) $data['nome'])])
            ->whereRaw('LOWER(local) = LOWER(?)', [$data['local']])
            ->first();
        if ($existing) {
            return new \Illuminate\Http\JsonResponse($existing);
        }
        $data['data_registro'] = now();
        return new \Illuminate\Http\JsonResponse(Proprietario::create($data), 201);
    }

    public function show(string $id)
    {
        $proprietario = Proprietario::with(['veiculos','motoristas'])->findOrFail($id);
        $this->validarAcessoFilial((string) $proprietario->local);
        return new \Illuminate\Http\JsonResponse($proprietario);
    }

    public function update(Request $request, string $id)
    {
        $proprietario = Proprietario::findOrFail($id);
        $this->validarAcessoFilial((string) $proprietario->local);
        $data = $request->validate([
            'nome'        => 'sometimes|string|max:255',
            'status'      => 'nullable|string',
            'responsavel' => 'nullable|string',
            'celular'     => 'nullable|string',
            'observacao'  => 'nullable|string',
            'local'       => 'nullable|string|in:Matriz,Viana',
        ]);
        if (array_key_exists('local', $data)) {
            $data['local'] = trim((string) ($data['local'] ?? '')) ?: $proprietario->local;
            $this->validarAcessoFilial($data['local']);
        }
        $proprietario->update($data);
        return new \Illuminate\Http\JsonResponse($proprietario->fresh());
    }

    public function bloquear(Request $request, string $id)
    {
        $data = $request->validate([
            'observacao' => 'nullable|string',
        ]);

        $proprietario = Proprietario::findOrFail($id);
        $this->validarAcessoFilial((string) $proprietario->local);
        $proprietario->update([
            'status' => 'Bloqueado',
            'observacao' => $data['observacao'] ?? $proprietario->observacao,
        ]);

        return new \Illuminate\Http\JsonResponse($proprietario->fresh());
    }

    public function desbloquear(string $id)
    {
        $proprietario = Proprietario::findOrFail($id);
        $this->validarAcessoFilial((string) $proprietario->local);
        $proprietario->update(['status' => 'Ativo']);

        return new \Illuminate\Http\JsonResponse($proprietario->fresh());
    }

    public function destroy(string $id)
    {
        $proprietario = Proprietario::findOrFail($id);
        $this->validarAcessoFilial((string) $proprietario->local);
        $proprietario->delete();
        return new \Illuminate\Http\JsonResponse(['message' => 'Proprietário excluído']);
    }
}
