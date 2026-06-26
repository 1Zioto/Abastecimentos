<?php

namespace App\Http\Controllers;

use App\Models\Veiculo;
use App\Models\Proprietario;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class VeiculoController extends Controller
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
            'veiculos',
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

    private function normalizarAno(array &$data): void
    {
        if (!array_key_exists('ano', $data) || $data['ano'] === null) {
            return;
        }

        $data['ano'] = trim((string) $data['ano']);
    }

    public function index(Request $request)
    {
        $this->garantirColunasAuditoria('veiculos');
        $query = Veiculo::with('proprietario');
        $this->aplicarFiltroFilial($query, $request);
        $this->aplicarFiltroAtivos($query, 'veiculos', $request);
        $this->aplicarFiltroSyncToken($query, $request, 'veiculos');
        if ($request->filled('id_proprietario')) $query->where('id_proprietario', $request->id_proprietario);
        if ($request->filled('placa')) $query->where('placa', 'ilike', '%'.$request->placa.'%');
        if ($request->filled('search')) {
            $query->where(fn($q) => $q->where('placa','ilike','%'.$request->search.'%')
                ->orWhere('modelo','ilike','%'.$request->search.'%')
                ->orWhere('marca','ilike','%'.$request->search.'%'));
        }
        if ($this->suportaSyncIncremental($request, 'veiculos')) {
            return new \Illuminate\Http\JsonResponse(
                $query->orderBy('sync_token_at')->orderBy('id_veiculo')->paginate($request->get('per_page', 50))
            );
        }
        return new \Illuminate\Http\JsonResponse($query->orderBy('placa')->paginate($request->get('per_page', 50)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'placa'           => 'required|string|max:10',
            'marca'           => 'nullable|string',
            'modelo'          => 'nullable|string',
            'ano'             => 'nullable',
            'tipo_combustivel'=> 'nullable|string',
            'numero_chassi'   => 'nullable|string',
            'id_proprietario' => 'nullable|string',
            'odometro'        => 'nullable|integer',
            'renavam'         => 'nullable|string',
            'cor'             => 'nullable|string',
            'foto'            => 'nullable|string',
            'local'           => 'nullable|string|in:Matriz,Viana',
        ]);
        $this->normalizarAno($data);
        $localInformado = trim((string) ($data['local'] ?? '')) ?: ($this->filiaisPermitidas()[0] ?? 'Matriz');
        $existing = Veiculo::query()
            ->whereRaw('LOWER(placa) = LOWER(?)', [trim((string) $data['placa'])])
            ->when(
                $this->tabelaTemColuna('veiculos', 'local'),
                fn ($q) => $q->whereRaw('LOWER(local) = LOWER(?)', [$localInformado])
            )
            ->first();
        if ($existing) {
            return new \Illuminate\Http\JsonResponse($existing);
        }

        $ownerId = trim((string) ($data['id_proprietario'] ?? ''));
        if ($ownerId === '') {
            return new \Illuminate\Http\JsonResponse([
                'message' => 'Dados inválidos.',
                'errors' => ['id_proprietario' => ['validation.required']],
            ], 422);
        }
        $ownerExists = Validator::make(
            ['id_proprietario' => $ownerId],
            ['id_proprietario' => 'required|exists:proprietarios,id_proprietario']
        );
        if ($ownerExists->fails()) {
            return new \Illuminate\Http\JsonResponse([
                'message' => 'Dados inválidos.',
                'errors' => $ownerExists->errors(),
            ], 422);
        }
        $data['id_proprietario'] = $ownerId;

        $localProprietario = Proprietario::query()
            ->where('id_proprietario', $data['id_proprietario'])
            ->when(!$this->tabelaTemColuna('proprietarios', 'local'), fn ($q) => $q->whereRaw('1 = 0'))
            ->value('local');
        $data['local'] = $localProprietario ?: $localInformado;
        $this->validarAcessoFilial($data['local']);
        $existing = Veiculo::query()
            ->whereRaw('LOWER(placa) = LOWER(?)', [trim((string) $data['placa'])])
            ->when(
                $this->tabelaTemColuna('veiculos', 'local'),
                fn ($q) => $q->whereRaw('LOWER(local) = LOWER(?)', [$data['local']])
            )
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
            'ano'             => 'nullable',
            'tipo_combustivel'=> 'nullable|string',
            'numero_chassi'   => 'nullable|string',
            'id_proprietario' => 'sometimes|exists:proprietarios,id_proprietario',
            'odometro'        => 'nullable|integer',
            'renavam'         => 'nullable|string',
            'cor'             => 'nullable|string',
            'foto'            => 'nullable|string',
            'local'           => 'nullable|string|in:Matriz,Viana',
        ]);
        $this->normalizarAno($data);
        if (array_key_exists('id_proprietario', $data)) {
            $localProprietario = \App\Models\Proprietario::query()
                ->where('id_proprietario', $data['id_proprietario'])
                ->when(!$this->tabelaTemColuna('proprietarios', 'local'), fn ($q) => $q->whereRaw('1 = 0'))
                ->value('local');
            $data['local'] = $localProprietario ?: ($data['local'] ?? $veiculo->local);
        }
        if (array_key_exists('local', $data)) {
            $data['local'] = trim((string) ($data['local'] ?? '')) ?: $veiculo->local;
            $this->validarAcessoFilial($data['local']);
        }
        $this->registrarAlteracoes($veiculo, $data);
        $veiculo->update($data);
        return new \Illuminate\Http\JsonResponse($veiculo->fresh('proprietario'));
    }

    public function transferir(Request $request, string $id)
    {
        $veiculo = Veiculo::findOrFail($id);
        $this->validarAcessoFilial((string) $veiculo->local);

        $data = $request->validate([
            'id_proprietario' => 'required|exists:proprietarios,id_proprietario',
            'data_transferencia' => 'nullable|date',
            'observacao' => 'nullable|string|max:1000',
        ]);

        if ((string) $veiculo->id_proprietario === (string) $data['id_proprietario']) {
            return new \Illuminate\Http\JsonResponse([
                'message' => 'O veículo já está vinculado a este proprietário.',
            ], 422);
        }

        $novoProprietario = Proprietario::query()
            ->where('id_proprietario', $data['id_proprietario'])
            ->firstOrFail();

        $novoLocal = $this->tabelaTemColuna('proprietarios', 'local')
            ? ($novoProprietario->local ?: $veiculo->local)
            : $veiculo->local;
        $this->validarAcessoFilial((string) $novoLocal);

        $alteracoes = [
            'id_proprietario' => $novoProprietario->id_proprietario,
            'local' => $novoLocal,
        ];

        $this->registrarAlteracoes($veiculo, [
            ...$alteracoes,
            '_observacao_transferencia' => trim((string) ($data['observacao'] ?? '')),
            '_data_transferencia' => $data['data_transferencia'] ?? now()->toDateString(),
        ]);

        $veiculo->update($alteracoes);

        return new \Illuminate\Http\JsonResponse([
            'message' => 'Veículo transferido com sucesso. Os abastecimentos antigos foram mantidos no proprietário original.',
            'veiculo' => $veiculo->fresh('proprietario'),
        ]);
    }

    public function destroy(string $id)
    {
        $veiculo = Veiculo::findOrFail($id);
        $this->validarAcessoFilial((string) $veiculo->local);
        return $this->inativarRegistro($veiculo, 'Veículo inativado');
    }

    public function restore(string $id)
    {
        $veiculo = Veiculo::findOrFail($id);
        $this->validarAcessoFilial((string) $veiculo->local);
        return $this->restaurarRegistro($veiculo, 'Veículo restaurado');
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
                    ...( $this->tabelaTemColuna('veiculos', 'local') ? ['local'] : [] ),
                ])
                ->where('id_proprietario', $id)
                ->when(
                    $this->tabelaTemColuna('veiculos', 'local'),
                    fn ($q) => $q->whereIn('local', $this->filiaisPermitidas())
                )
                ->when(
                    $this->tabelaTemColuna('veiculos', 'deleted_at'),
                    fn ($q) => $q->whereNull('deleted_at')
                )
                ->when(
                    $this->tabelaTemColuna('veiculos', 'status'),
                    fn ($q) => $q->where(fn ($qq) => $qq->whereNull('status')->orWhereRaw('LOWER(status) <> ?', ['inativo']))
                )
                ->orderBy('placa')
                ->get()
        );
    }
}
