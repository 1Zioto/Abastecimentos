<?php

namespace App\Http\Controllers;

use App\Models\BaixaAbastecimento;
use App\Models\Abastecimento;
use App\Models\Proprietario;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class BaixaAbastecimentoController extends Controller
{
    private function filiaisPermitidas(): array
    {
        $user = auth()->user();
        if (!$user) {
            abort(401, 'Não autenticado.');
        }
        return method_exists($user, 'filiaisAcesso') ? $user->filiaisAcesso() : ['Matriz', 'Viana'];
    }

    private function validarAcessoAbastecimento(string $idAbastecimento): void
    {
        $permitidas = $this->filiaisPermitidas();
        $temAcesso = Abastecimento::query()
            ->where('id_abastecimento', $idAbastecimento)
            ->when(
                $this->tabelaTemColuna('abastecimentos', 'local'),
                fn ($q) => $q->whereIn('local', $permitidas)
            )
            ->exists();

        if (!$temAcesso) {
            abort(403, 'Usuário sem acesso à filial deste abastecimento.');
        }
    }

    private function validarMesmoProprietario(array $ids): void
    {
        $proprietarios = Abastecimento::query()
            ->whereIn('id_abastecimento', $ids)
            ->pluck('id_proprietario')
            ->map(fn ($id) => (string) $id)
            ->unique()
            ->values();

        if ($proprietarios->count() > 1) {
            abort(422, 'Não é permitido dar baixa em abastecimentos de proprietários diferentes na mesma baixa.');
        }
    }

    private function emptyToNull($value)
    {
        if ($value === null) return null;
        if (is_string($value) && trim($value) === '') return null;
        return $value;
    }

    private function sqlBoolean(bool $value)
    {
        return DB::raw($value ? 'true' : 'false');
    }

    private function aplicarFiltroPendenteBaixa($query)
    {
        if (!$this->tabelaTemColuna('abastecimentos', 'baixa_abastecimento')) {
            return $query->whereRaw("LOWER(COALESCE(status, '')) <> 'pago'");
        }

        return $query->whereRaw('COALESCE(baixa_abastecimento, false) = false');
    }

    private function normalizarLocalBaixa(string $local): string
    {
        $local = trim($local);
        if ($local === '') {
            abort(422, 'Informe a filial da baixa.');
        }

        foreach ($this->filiaisPermitidas() as $permitida) {
            if (mb_strtolower($permitida) === mb_strtolower($local)) {
                return $permitida;
            }
        }

        abort(403, 'Usuário sem acesso à filial informada.');
    }

    private function localizarProprietarioBaixa(array $data, string $local, Request $request): Proprietario
    {
        $query = Proprietario::query();
        $this->aplicarFiltroAtivos($query, 'proprietarios', $request);

        if ($this->tabelaTemColuna('proprietarios', 'local')) {
            $query->whereRaw('LOWER(local) = LOWER(?)', [$local]);
        }

        if (!empty($data['id_proprietario'])) {
            $proprietario = (clone $query)
                ->where('id_proprietario', $data['id_proprietario'])
                ->first();

            if (!$proprietario) {
                abort(422, 'Proprietário não encontrado na filial informada.');
            }

            return $proprietario;
        }

        $nome = trim((string) ($data['nome_proprietario'] ?? ''));
        if ($nome === '') {
            abort(422, 'Informe id_proprietario ou nome_proprietario.');
        }

        $matches = (clone $query)
            ->whereRaw('LOWER(nome) = LOWER(?)', [$nome])
            ->orderBy('nome')
            ->limit(2)
            ->get();

        if ($matches->isEmpty()) {
            abort(422, 'Proprietário não encontrado na filial informada.');
        }

        if ($matches->count() > 1) {
            abort(422, 'Há mais de um proprietário com esse nome. Envie id_proprietario para evitar baixa incorreta.');
        }

        return $matches->first();
    }

    private function idempotencyMarker(?string $key): ?string
    {
        $key = trim((string) $key);
        if ($key === '') {
            return null;
        }

        $key = preg_replace('/[^A-Za-z0-9_.:-]/', '-', $key);
        return '[baixa_auto:' . substr($key, 0, 120) . ']';
    }

    private function abastecimentoBaixaPayload(Abastecimento $abastecimento): array
    {
        return [
            'id_abastecimento' => $abastecimento->id_abastecimento,
            'data' => optional($abastecimento->data)->format('Y-m-d'),
            'data_hora' => optional($abastecimento->data_hora)->toIso8601String(),
            'id_veiculo' => $abastecimento->id_veiculo,
            'placa' => $abastecimento->veiculo?->placa,
            'id_motorista' => $abastecimento->id_motorista,
            'motorista' => $abastecimento->nome_motorista,
            'quantidade_litros' => round((float) $abastecimento->quantidade_litros, 2),
            'valor_total' => round((float) $abastecimento->valor_total, 2),
        ];
    }

    private function selecionarAbastecimentosAutomaticos(
        Proprietario $proprietario,
        string $local,
        float $valorPago,
        Request $request,
        bool $lock = false
    ): array {
        $query = Abastecimento::query()
            ->with('veiculo:id_veiculo,placa')
            ->where('id_proprietario', $proprietario->id_proprietario);

        $this->aplicarFiltroAtivos($query, 'abastecimentos', $request);
        $this->aplicarFiltroPendenteBaixa($query);

        if ($this->tabelaTemColuna('abastecimentos', 'local')) {
            $query->whereRaw('LOWER(abastecimentos.local) = LOWER(?)', [$local]);
        }

        if ($lock) {
            $query->lockForUpdate();
        }

        $pendentes = $query
            ->orderBy('data')
            ->orderBy('data_hora')
            ->orderBy('id_abastecimento')
            ->get();

        $selecionados = collect();
        $total = 0.0;

        foreach ($pendentes as $abastecimento) {
            $valorAbastecimento = round((float) $abastecimento->valor_total, 2);
            if ($valorAbastecimento <= 0) {
                continue;
            }

            $selecionados->push($abastecimento);
            $total = round($total + $valorAbastecimento, 2);

            if ($total >= $valorPago) {
                break;
            }
        }

        return [
            'abastecimentos' => $selecionados,
            'valor_selecionado' => round($total, 2),
            'diferenca' => round($total - $valorPago, 2),
            'total_pendente' => round($pendentes->sum(fn ($item) => (float) $item->valor_total), 2),
        ];
    }

    private function respostaBaixaAutomatica(
        string $message,
        Proprietario $proprietario,
        string $local,
        float $valorPago,
        array $selecao,
        bool $dryRun,
        ?string $idempotencyKey = null
    ): array {
        return [
            'message' => $message,
            'dry_run' => $dryRun,
            'idempotency_key' => $idempotencyKey,
            'proprietario' => [
                'id_proprietario' => $proprietario->id_proprietario,
                'nome' => $proprietario->nome,
            ],
            'local' => $local,
            'valor_pago' => round($valorPago, 2),
            'valor_baixado' => round((float) $selecao['valor_selecionado'], 2),
            'diferenca' => round((float) $selecao['diferenca'], 2),
            'total_pendente' => round((float) ($selecao['total_pendente'] ?? 0), 2),
            'quantidade_abastecimentos' => $selecao['abastecimentos']->count(),
            'ids' => $selecao['abastecimentos']->pluck('id_abastecimento')->values(),
            'abastecimentos' => $selecao['abastecimentos']
                ->map(fn (Abastecimento $abastecimento) => $this->abastecimentoBaixaPayload($abastecimento))
                ->values(),
        ];
    }

    private function normalizarAnexos(array $data): ?string
    {
        $anexos = [];
        foreach (($data['anexos'] ?? []) as $url) {
            $url = trim((string) $url);
            if ($url !== '') {
                $anexos[] = $url;
            }
        }

        $anexoUnico = $this->emptyToNull($data['anexo'] ?? null);
        if ($anexoUnico && empty($anexos)) {
            $anexos[] = (string) $anexoUnico;
        }

        $anexos = array_values(array_unique(array_slice($anexos, 0, 4)));
        if (empty($anexos)) {
            return null;
        }

        return count($anexos) === 1
            ? $anexos[0]
            : json_encode($anexos, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    private function buildAbastecimentoBaixaUpdate(array $data): array
    {
        return [
            'baixa_abastecimento' => $this->sqlBoolean(true),
            'data_baixa'   => $data['data_baixa'] ?? now(),
            'tipo_despesa' => $data['tipo_despesa'] ?? null,
            'descricao'    => $data['descricao'] ?? null,
            'valor'        => $data['valor'] ?? null,
            'placa1'       => $data['placa1'] ?? null,
            'recebedor'    => $data['recebedor'] ?? null,
            'observacao'   => $data['observacao'] ?? null,
            'anexo'        => $data['anexo'] ?? null,
            'sync_token_at' => now(),
        ];
    }

    private function upsertBaixa(string $idAbastecimento, array $data): void
    {
        $existingId = DB::table('baixa_abastecimento')
            ->where('id_abastecimento', $idAbastecimento)
            ->value('id_baixa');

        $payload = [
            'id_abastecimento' => $idAbastecimento,
            'data_hora'        => now(),
            'usuario'          => auth()->user()?->nome ?? 'sistema',
            'forma_pagamento'  => $data['forma_pagamento'] ?? '',
            'data_pagamento'   => $data['data_pagamento'] ?? now(),
            'nota_entrada'     => $data['nota_entrada'] ?? '',
            'sync_token_at'     => now(),
        ];

        foreach (['deleted_at', 'deleted_by', 'deleted_by_id', 'status'] as $column) {
            if ($this->tabelaTemColuna('baixa_abastecimento', $column)) {
                $payload[$column] = null;
            }
        }

        if ($existingId) {
            DB::table('baixa_abastecimento')
                ->where('id_baixa', $existingId)
                ->update($payload);
            return;
        }

        $payload['id_baixa'] = (string) Str::uuid();
        DB::table('baixa_abastecimento')->insert($payload);
    }

    public function index(Request $request)
    {
        $this->garantirColunasAuditoria('baixa_abastecimento');
        $query = BaixaAbastecimento::with(['abastecimento.veiculo','abastecimento.proprietario']);
        $this->aplicarFiltroAtivos($query, 'baixa_abastecimento', $request);
        $permitidas = $this->filiaisPermitidas();
        if ($this->tabelaTemColuna('abastecimentos', 'local')) {
            $query->whereHas('abastecimento', fn ($q) => $q->whereIn('local', $permitidas));
        }
        $this->aplicarFiltroSyncToken($query, $request, 'baixa_abastecimento');

        if ($request->filled('id_abastecimento')) {
            $query->where('id_abastecimento', $request->id_abastecimento);
        }
        if ($request->filled('id_proprietario')) {
            $query->whereHas('abastecimento', fn ($q) => $q->where('id_proprietario', $request->id_proprietario));
        }
        if ($request->filled('id_veiculo')) {
            $query->whereHas('abastecimento', fn ($q) => $q->where('id_veiculo', $request->id_veiculo));
        }
        if ($request->filled('id_motorista')) {
            $query->whereHas('abastecimento', fn ($q) => $q->where('id_motorista', $request->id_motorista));
        }
        if ($request->filled('local') && $this->tabelaTemColuna('abastecimentos', 'local')) {
            $local = trim((string) $request->local);
            $query->whereHas('abastecimento', function ($q) use ($request) {
                $q->whereRaw('LOWER(local) = LOWER(?)', [$request->local]);
            });
            if (!in_array($local, $permitidas, true)) {
                $query->whereRaw('1 = 0');
            }
        }

        if ($this->suportaSyncIncremental($request, 'baixa_abastecimento')) {
            return new \Illuminate\Http\JsonResponse(
                $query->orderBy('sync_token_at')->orderBy('id_baixa')->paginate($request->get('per_page', 20))
            );
        }
        return new \Illuminate\Http\JsonResponse($query->orderByDesc('data_hora')->paginate($request->get('per_page', 20)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'id_abastecimento' => 'required|exists:abastecimentos,id_abastecimento',
            'forma_pagamento'  => 'nullable|string',
            'data_pagamento'   => 'nullable|date',
            'nota_entrada'     => 'nullable|string',
            // Campos da baixa salvos no abastecimento
            'data_baixa'       => 'nullable|date',
            'tipo_despesa'     => 'nullable|string',
            'descricao'        => 'nullable|string',
            'valor'            => 'nullable|numeric',
            'placa1'           => 'nullable|string',
            'recebedor'        => 'nullable|string',
            'observacao'       => 'nullable|string',
            'anexo'            => 'nullable|string',
            'anexos'           => 'nullable|array|max:4',
            'anexos.*'         => 'nullable|string',
        ]);

        $data['data_pagamento'] = $this->emptyToNull($data['data_pagamento'] ?? null);
        $data['data_baixa'] = $this->emptyToNull($data['data_baixa'] ?? null);
        $data['recebedor'] = $this->emptyToNull($data['recebedor'] ?? null);
        $data['observacao'] = $this->emptyToNull($data['observacao'] ?? null);
        $data['anexo'] = $this->normalizarAnexos($data);
        $data['descricao'] = $this->emptyToNull($data['descricao'] ?? null);
        $data['tipo_despesa'] = $this->emptyToNull($data['tipo_despesa'] ?? null) ?? 'Combustível';
        $this->validarAcessoAbastecimento($data['id_abastecimento']);

        DB::beginTransaction();
        try {
            $this->upsertBaixa($data['id_abastecimento'], $data);
            $baixa = BaixaAbastecimento::where('id_abastecimento', $data['id_abastecimento'])->latest('data_hora')->first();

            // Atualizar o abastecimento com os dados de baixa
            Abastecimento::where('id_abastecimento', $data['id_abastecimento'])
                ->update($this->buildAbastecimentoBaixaUpdate($data));

            DB::commit();
            return new \Illuminate\Http\JsonResponse($baixa->load('abastecimento'), 201);
        } catch (\Exception $e) {
            DB::rollBack();
            return new \Illuminate\Http\JsonResponse(['message' => 'Erro ao registrar baixa: ' . $e->getMessage()], 500);
        }
    }

    public function storeLote(Request $request)
    {
        $data = $request->validate([
            'ids'              => 'required|array|min:1',
            'ids.*'            => 'exists:abastecimentos,id_abastecimento',
            'forma_pagamento'  => 'nullable|string',
            'data_pagamento'   => 'nullable|date',
            'nota_entrada'     => 'nullable|string',
            'data_baixa'       => 'nullable|date',
            'tipo_despesa'     => 'nullable|string',
            'descricao'        => 'nullable|string',
            'valor'            => 'nullable|numeric',
            'recebedor'        => 'nullable|string',
            'observacao'       => 'nullable|string',
            'anexo'            => 'nullable|string',
            'anexos'           => 'nullable|array|max:4',
            'anexos.*'         => 'nullable|string',
        ]);

        $data['data_pagamento'] = $this->emptyToNull($data['data_pagamento'] ?? null);
        $data['data_baixa'] = $this->emptyToNull($data['data_baixa'] ?? null);
        $data['tipo_despesa'] = $this->emptyToNull($data['tipo_despesa'] ?? null) ?? 'Combustível';
        $data['descricao'] = $this->emptyToNull($data['descricao'] ?? null);
        $data['recebedor'] = $this->emptyToNull($data['recebedor'] ?? null);
        $data['observacao'] = $this->emptyToNull($data['observacao'] ?? null);
        $data['anexo'] = $this->normalizarAnexos($data);
        $data['valor'] = $this->emptyToNull($data['valor'] ?? null);
        $data['nota_entrada'] = $this->emptyToNull($data['nota_entrada'] ?? null) ?? ('lote:' . (string) Str::uuid());

        $this->validarMesmoProprietario($data['ids']);

        $errors = [];
        $success = 0;

        foreach ($data['ids'] as $idAbastecimento) {
            try {
                $this->validarAcessoAbastecimento($idAbastecimento);
                $this->upsertBaixa($idAbastecimento, $data);
                Abastecimento::where('id_abastecimento', $idAbastecimento)
                    ->update($this->buildAbastecimentoBaixaUpdate($data));
                $success++;
            } catch (\Throwable $e) {
                $errors[] = [
                    'id_abastecimento' => $idAbastecimento,
                    'message' => $e->getMessage(),
                ];
            }
        }

        if (!empty($errors)) {
            return new \Illuminate\Http\JsonResponse([
                'message' => 'Erro ao registrar parte das baixas.',
                'success' => $success,
                'errors' => $errors,
            ], 500);
        }

        return new \Illuminate\Http\JsonResponse(['message' => $success . ' baixas registradas com sucesso']);
    }

    public function storeAutomatica(Request $request)
    {
        $data = $request->validate([
            'local'             => 'required|string',
            'id_proprietario'   => 'nullable|string',
            'nome_proprietario' => 'nullable|string',
            'valor_pago'        => 'required|numeric|min:0.01',
            'data_pagamento'    => 'nullable|date',
            'data_baixa'        => 'nullable|date',
            'forma_pagamento'   => 'nullable|string',
            'nota_entrada'      => 'nullable|string',
            'tipo_despesa'      => 'nullable|string',
            'descricao'         => 'nullable|string',
            'recebedor'         => 'nullable|string',
            'observacao'        => 'nullable|string',
            'anexo'             => 'nullable|string',
            'anexos'            => 'nullable|array|max:4',
            'anexos.*'          => 'nullable|string',
            'tolerancia'        => 'nullable|numeric|min:0|max:10',
            'dry_run'           => 'nullable|boolean',
            'idempotency_key'   => 'nullable|string|max:160',
        ]);

        if (empty($data['id_proprietario']) && empty($data['nome_proprietario'])) {
            return new \Illuminate\Http\JsonResponse([
                'message' => 'Informe id_proprietario ou nome_proprietario.',
            ], 422);
        }

        $local = $this->normalizarLocalBaixa($data['local']);
        $proprietario = $this->localizarProprietarioBaixa($data, $local, $request);
        $valorPago = round((float) $data['valor_pago'], 2);
        $tolerancia = round((float) ($data['tolerancia'] ?? 0.01), 2);
        $dryRun = $request->boolean('dry_run');
        $idempotencyKey = $this->emptyToNull($data['idempotency_key'] ?? null);
        $marker = $this->idempotencyMarker($idempotencyKey);

        if ($marker && !$dryRun) {
            $jaProcessados = Abastecimento::query()
                ->where('id_proprietario', $proprietario->id_proprietario)
                ->when(
                    $this->tabelaTemColuna('abastecimentos', 'local'),
                    fn ($q) => $q->whereRaw('LOWER(local) = LOWER(?)', [$local])
                )
                ->where('observacao', 'like', '%' . $marker . '%')
                ->when(
                    $this->tabelaTemColuna('abastecimentos', 'baixa_abastecimento'),
                    fn ($q) => $q->whereRaw('COALESCE(baixa_abastecimento, false) = true')
                )
                ->orderBy('data')
                ->orderBy('data_hora')
                ->get();

            if ($jaProcessados->isNotEmpty()) {
                $selecaoExistente = [
                    'abastecimentos' => $jaProcessados,
                    'valor_selecionado' => round($jaProcessados->sum(fn ($item) => (float) $item->valor_total), 2),
                    'diferenca' => round($jaProcessados->sum(fn ($item) => (float) $item->valor_total) - $valorPago, 2),
                    'total_pendente' => 0,
                ];

                return new \Illuminate\Http\JsonResponse(
                    $this->respostaBaixaAutomatica(
                        'Baixa automática já processada para esta idempotency_key.',
                        $proprietario,
                        $local,
                        $valorPago,
                        $selecaoExistente,
                        false,
                        $idempotencyKey
                    )
                );
            }
        }

        $selecao = $this->selecionarAbastecimentosAutomaticos($proprietario, $local, $valorPago, $request);

        if ($selecao['abastecimentos']->isEmpty()) {
            return new \Illuminate\Http\JsonResponse([
                'message' => 'Não há abastecimentos pendentes para este proprietário na filial informada.',
                'proprietario' => [
                    'id_proprietario' => $proprietario->id_proprietario,
                    'nome' => $proprietario->nome,
                ],
                'local' => $local,
                'valor_pago' => $valorPago,
                'total_pendente' => $selecao['total_pendente'],
            ], 422);
        }

        if (abs((float) $selecao['diferenca']) > $tolerancia) {
            return new \Illuminate\Http\JsonResponse(
                $this->respostaBaixaAutomatica(
                    'O valor informado não fecha com os abastecimentos pendentes mais antigos. A baixa não foi gravada.',
                    $proprietario,
                    $local,
                    $valorPago,
                    $selecao,
                    true,
                    $idempotencyKey
                ) + ['tolerancia' => $tolerancia],
                422
            );
        }

        if ($dryRun) {
            return new \Illuminate\Http\JsonResponse(
                $this->respostaBaixaAutomatica(
                    'Simulação da baixa automática realizada. Nenhum registro foi alterado.',
                    $proprietario,
                    $local,
                    $valorPago,
                    $selecao,
                    true,
                    $idempotencyKey
                )
            );
        }

        $data['data_pagamento'] = $this->emptyToNull($data['data_pagamento'] ?? null) ?? now();
        $data['data_baixa'] = $this->emptyToNull($data['data_baixa'] ?? null) ?? now();
        $data['tipo_despesa'] = $this->emptyToNull($data['tipo_despesa'] ?? null) ?? 'Combustível';
        $data['descricao'] = $this->emptyToNull($data['descricao'] ?? null);
        $data['recebedor'] = $this->emptyToNull($data['recebedor'] ?? null);
        $data['observacao'] = $this->emptyToNull($data['observacao'] ?? null);
        $data['nota_entrada'] = $this->emptyToNull($data['nota_entrada'] ?? null)
            ?? ($idempotencyKey ? ('auto:' . $idempotencyKey) : ('auto:' . (string) Str::uuid()));
        if ($marker) {
            $data['observacao'] = trim(($data['observacao'] ? $data['observacao'] . ' ' : '') . $marker);
        }
        $data['anexo'] = $this->normalizarAnexos($data);

        try {
            $gravada = DB::transaction(function () use ($proprietario, $local, $valorPago, $request, $tolerancia, $data) {
                $selecaoTravada = $this->selecionarAbastecimentosAutomaticos(
                    $proprietario,
                    $local,
                    $valorPago,
                    $request,
                    true
                );

                if ($selecaoTravada['abastecimentos']->isEmpty() || abs((float) $selecaoTravada['diferenca']) > $tolerancia) {
                    throw new \RuntimeException('Os abastecimentos pendentes mudaram durante a baixa. Faça uma nova simulação.');
                }

                foreach ($selecaoTravada['abastecimentos'] as $abastecimento) {
                    $dadosAbastecimento = $data;
                    $dadosAbastecimento['valor'] = round((float) $abastecimento->valor_total, 2);

                    $this->upsertBaixa($abastecimento->id_abastecimento, $dadosAbastecimento);
                    Abastecimento::where('id_abastecimento', $abastecimento->id_abastecimento)
                        ->update($this->buildAbastecimentoBaixaUpdate($dadosAbastecimento));
                }

                return $selecaoTravada;
            });
        } catch (\Throwable $e) {
            return new \Illuminate\Http\JsonResponse([
                'message' => 'Erro ao registrar baixa automática: ' . $e->getMessage(),
            ], 500);
        }

        return new \Illuminate\Http\JsonResponse(
            $this->respostaBaixaAutomatica(
                'Baixa automática registrada com sucesso.',
                $proprietario,
                $local,
                $valorPago,
                $gravada,
                false,
                $idempotencyKey
            ),
            201
        );
    }

    public function show(string $id)
    {
        $baixa = BaixaAbastecimento::with('abastecimento.veiculo')->findOrFail($id);
        $this->validarAcessoAbastecimento($baixa->id_abastecimento);
        return new \Illuminate\Http\JsonResponse($baixa);
    }

    public function update(Request $request, string $id)
    {
        $baixa = BaixaAbastecimento::findOrFail($id);
        $this->validarAcessoAbastecimento($baixa->id_abastecimento);
        $data = $request->only(['forma_pagamento','data_pagamento','nota_entrada']);
        $this->registrarAlteracoes($baixa, $data);
        $baixa->update($data);
        return new \Illuminate\Http\JsonResponse($baixa->fresh());
    }

    public function destroy(string $id)
    {
        $baixa = BaixaAbastecimento::findOrFail($id);
        $this->validarAcessoAbastecimento($baixa->id_abastecimento);
        // Reverter o abastecimento para não baixado
        Abastecimento::where('id_abastecimento', $baixa->id_abastecimento)->update([
            'baixa_abastecimento' => $this->sqlBoolean(false),
            'data_baixa' => null,
            'tipo_despesa' => null,
            'descricao' => null,
            'valor' => null,
            'placa1' => null,
            'recebedor' => null,
            'observacao' => null,
            'anexo' => null,
            'sync_token_at' => now(),
        ]);
        return $this->inativarRegistro($baixa, 'Baixa inativada e abastecimento retornou para Pendente');
    }

    public function forceDelete(string $id)
    {
        return $this->destroy($id);
    }

    public function restore(string $id)
    {
        $baixa = BaixaAbastecimento::findOrFail($id);
        $this->validarAcessoAbastecimento($baixa->id_abastecimento);
        return $this->restaurarRegistro($baixa, 'Baixa restaurada');
    }
}
