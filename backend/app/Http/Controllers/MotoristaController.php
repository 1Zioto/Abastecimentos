<?php

namespace App\Http\Controllers;

use App\Models\Motorista;
use Illuminate\Http\Request;

class MotoristaController extends Controller
{
    private function filiaisPermitidas(): array
    {
        $user = auth()->user();
        if (!$user) {
            abort(401, 'Não autenticado.');
        }
        return method_exists($user, 'filiaisAcesso') ? $user->filiaisAcesso() : ['Matriz', 'Viana'];
    }

    private function aplicarFiltroFilial($query, Request $request)
    {
        return $this->aplicarFiltroLocalPermitido(
            $query,
            'motoristas',
            $this->filiaisPermitidas(),
            $request->query('local')
        );
    }

    private function validarAcessoFilial(string $local): void
    {
        if (!in_array($local, $this->filiaisPermitidas(), true)) {
            abort(403, 'Usuário sem acesso a esta filial.');
        }
    }

    public function index(Request $request)
    {
        $this->garantirColunasAuditoria('motoristas');
        $query = Motorista::with('proprietario');
        $this->aplicarFiltroFilial($query, $request);
        $this->aplicarFiltroAtivos($query, 'motoristas', $request);
        $this->aplicarFiltroSyncToken($query, $request, 'motoristas');
        if ($request->filled('id_proprietario')) $query->where('id_proprietario', $request->id_proprietario);
        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $q->where('nome','ilike','%'.$request->search.'%')
                    ->orWhere('documento','ilike','%'.$request->search.'%');
                if ($this->tabelaTemColuna('motoristas', 'apelido')) {
                    $q->orWhere('apelido','ilike','%'.$request->search.'%');
                }
            });
        }
        if ($this->suportaSyncIncremental($request, 'motoristas')) {
            return new \Illuminate\Http\JsonResponse(
                $query->orderBy('sync_token_at')->orderBy('id_motorista')->paginate($request->get('per_page', 50))
            );
        }
        return new \Illuminate\Http\JsonResponse($query->orderBy('nome')->paginate($request->get('per_page', 50)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nome'            => 'required|string|max:255',
            'apelido'         => 'nullable|string|max:255',
            'id_proprietario' => 'required|exists:proprietarios,id_proprietario',
            'documento'       => 'nullable|string',
            'celular'         => 'nullable|string',
            'local'           => 'nullable|string|in:Matriz,Viana',
        ]);
        if (!$this->tabelaTemColuna('motoristas', 'apelido')) {
            unset($data['apelido']);
        }
        $localProprietario = \App\Models\Proprietario::query()
            ->where('id_proprietario', $data['id_proprietario'])
            ->when(!$this->tabelaTemColuna('proprietarios', 'local'), fn ($q) => $q->whereRaw('1 = 0'))
            ->value('local');
        $data['local'] = $localProprietario ?: (trim((string) ($data['local'] ?? '')) ?: ($this->filiaisPermitidas()[0] ?? 'Matriz'));
        $this->validarAcessoFilial($data['local']);
        $existing = Motorista::query()
            ->where('id_proprietario', $data['id_proprietario'])
            ->when(
                $this->tabelaTemColuna('motoristas', 'local'),
                fn ($q) => $q->whereRaw('LOWER(local) = LOWER(?)', [$data['local']])
            )
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
            'apelido'         => 'nullable|string|max:255',
            'id_proprietario' => 'sometimes|exists:proprietarios,id_proprietario',
            'documento'       => 'nullable|string',
            'celular'         => 'nullable|string',
            'local'           => 'nullable|string|in:Matriz,Viana',
        ]);
        if (!$this->tabelaTemColuna('motoristas', 'apelido')) {
            unset($data['apelido']);
        }
        if (array_key_exists('id_proprietario', $data)) {
            $localProprietario = \App\Models\Proprietario::query()
                ->where('id_proprietario', $data['id_proprietario'])
                ->when(!$this->tabelaTemColuna('proprietarios', 'local'), fn ($q) => $q->whereRaw('1 = 0'))
                ->value('local');
            $data['local'] = $localProprietario ?: ($data['local'] ?? $motorista->local);
        }
        if (array_key_exists('local', $data)) {
            $data['local'] = trim((string) ($data['local'] ?? '')) ?: $motorista->local;
            $this->validarAcessoFilial($data['local']);
        }
        $this->registrarAlteracoes($motorista, $data);
        $motorista->update($data);
        return new \Illuminate\Http\JsonResponse($motorista->fresh());
    }

    public function destroy(string $id)
    {
        $motorista = Motorista::findOrFail($id);
        $this->validarAcessoFilial((string) $motorista->local);
        return $this->inativarRegistro($motorista, 'Motorista inativado');
    }

    public function restore(string $id)
    {
        $motorista = Motorista::findOrFail($id);
        $this->validarAcessoFilial((string) $motorista->local);
        return $this->restaurarRegistro($motorista, 'Motorista restaurado');
    }

    public function byProprietario(string $id)
    {
        return new \Illuminate\Http\JsonResponse(
            Motorista::query()
                ->select([
                    'id_motorista',
                    'nome',
                    ...( $this->tabelaTemColuna('motoristas', 'apelido') ? ['apelido'] : [] ),
                    'id_proprietario',
                    'documento',
                    'celular',
                    ...( $this->tabelaTemColuna('motoristas', 'local') ? ['local'] : [] ),
                ])
                ->where('id_proprietario', $id)
                ->when(
                    $this->tabelaTemColuna('motoristas', 'local'),
                    fn ($q) => $q->whereIn('local', $this->filiaisPermitidas())
                )
                ->when(
                    $this->tabelaTemColuna('motoristas', 'deleted_at'),
                    fn ($q) => $q->whereNull('deleted_at')
                )
                ->when(
                    $this->tabelaTemColuna('motoristas', 'status'),
                    fn ($q) => $q->where(fn ($qq) => $qq->whereNull('status')->orWhereRaw('LOWER(status) <> ?', ['inativo']))
                )
                ->orderBy('nome')
                ->get()
        );
    }
}
