<?php

namespace App\Http\Controllers;

use App\Models\BaixaAbastecimento;
use App\Models\Abastecimento;
use App\Models\Proprietario;
use App\Support\RecebedorBaixa;
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

        return $query->whereRaw('baixa_abastecimento IS NOT TRUE');
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
        $update = [
            'baixa_abastecimento' => $this->sqlBoolean(true),
            'data_baixa'   => $data['data_baixa'] ?? now(),
            'tipo_despesa' => $data['tipo_despesa'] ?? null,
            'descricao'    => $data['descricao'] ?? null,
            'valor'        => $data['valor'] ?? null,
            'placa1'       => $data['placa1'] ?? null,
            'recebedor'    => RecebedorBaixa::normalizar($data['recebedor'] ?? null),
            'observacao'   => $data['observacao'] ?? null,
            'anexo'        => $data['anexo'] ?? null,
            'sync_token_at' => now(),
        ];

        if ($this->tabelaTemColuna('abastecimentos', 'valor_recebedor1')) {
            $update['valor_recebedor1'] = $data['valor_recebedor1'] ?? null;
            $update['recebedor2']       = $data['recebedor2'] ?? null;
            $update['valor_recebedor2'] = $data['valor_recebedor2'] ?? null;
        }

        if ($this->tabelaTemColuna('abastecimentos', 'abono_desconto')) {
            $update['abono_desconto'] = $data['abono_desconto'] ?? null;
        }

        return $update;
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

    /**
     * Versão em lote do upsertBaixa: em vez de SELECT + INSERT/UPDATE por
     * abastecimento (2 round-trips × N itens no banco remoto), resolve tudo
     * em até 3 queries — busca dos existentes, um UPDATE whereIn e um bulk
     * INSERT. O payload é idêntico para todos os itens do lote.
     */
    private function upsertBaixasEmLote(array $idsAbastecimentos, array $data): void
    {
        if (empty($idsAbastecimentos)) {
            return;
        }

        $payloadComum = [
            'data_hora'        => now(),
            'usuario'          => auth()->user()?->nome ?? 'sistema',
            'forma_pagamento'  => $data['forma_pagamento'] ?? '',
            'data_pagamento'   => $data['data_pagamento'] ?? now(),
            'nota_entrada'     => $data['nota_entrada'] ?? '',
            'sync_token_at'    => now(),
        ];

        foreach (['deleted_at', 'deleted_by', 'deleted_by_id', 'status'] as $column) {
            if ($this->tabelaTemColuna('baixa_abastecimento', $column)) {
                $payloadComum[$column] = null;
            }
        }

        $existentes = DB::table('baixa_abastecimento')
            ->whereIn('id_abastecimento', $idsAbastecimentos)
            ->pluck('id_baixa', 'id_abastecimento');

        if ($existentes->isNotEmpty()) {
            DB::table('baixa_abastecimento')
                ->whereIn('id_baixa', $existentes->values()->all())
                ->update($payloadComum);
        }

        $novos = [];
        foreach ($idsAbastecimentos as $id) {
            if ($existentes->has($id)) {
                continue;
            }
            $novos[] = array_merge($payloadComum, [
                'id_baixa'         => (string) Str::uuid(),
                'id_abastecimento' => $id,
            ]);
        }
        if (!empty($novos)) {
            DB::table('baixa_abastecimento')->insert($novos);
        }
    }

    private static bool $recebedoresNormalizados = false;

    private function normalizarRecebedoresExistentes(): void
    {
        // Normalização de dados legados: precisa rodar no máximo uma vez por
        // processo, não a cada página listada (o frontend pagina a tabela
        // inteira — isso repetia um scan DISTINCT + UPDATEs várias vezes
        // por carregamento da tela Baixas).
        if (self::$recebedoresNormalizados) {
            return;
        }
        self::$recebedoresNormalizados = true;

        if (!$this->tabelaTemColuna('abastecimentos', 'recebedor')) {
            return;
        }

        try {
            $valores = DB::table('abastecimentos')
                ->select('recebedor')
                ->whereNotNull('recebedor')
                ->whereRaw("TRIM(COALESCE(recebedor, '')) <> ''")
                ->distinct()
                ->pluck('recebedor');

            foreach ($valores as $valor) {
                $normalizado = RecebedorBaixa::normalizar($valor);
                if ($normalizado === $valor) {
                    continue;
                }

                DB::table('abastecimentos')
                    ->where('recebedor', $valor)
                    ->update([
                        'recebedor' => $normalizado,
                        'sync_token_at' => now(),
                    ]);
            }
        } catch (\Throwable) {
            // Normalização de legado não pode bloquear a listagem de baixas.
        }
    }

    public function index(Request $request)
    {
        $this->garantirColunasAuditoria('baixa_abastecimento');
        $this->normalizarRecebedoresExistentes();
        $query = BaixaAbastecimento::with(['abastecimento.veiculo','abastecimento.proprietario']);
        $this->aplicarFiltroAtivos($query, 'baixa_abastecimento', $request);
        $permitidas = $this->filiaisPermitidas();
        if ($this->tabelaTemColuna('abastecimentos', 'local')) {
            $query->whereHas('abastecimento', fn ($q) => $q->whereIn('local', $permitidas));
        }
        $this->aplicarFiltroSyncToken($query, $request, 'baixa_abastecimento');

        // Filtro de período sobre a data da baixa (bounds diretos em data_hora
        // para aproveitar o índice, em vez de whereDate que aplica função).
        $dataInicio = (string) $request->query('data_inicio', '');
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $dataInicio)) {
            $query->where('data_hora', '>=', $dataInicio . ' 00:00:00');
        }
        $dataFim = (string) $request->query('data_fim', '');
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $dataFim)) {
            $query->where('data_hora', '<=', $dataFim . ' 23:59:59.999999');
        }

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
        $data['recebedor'] = RecebedorBaixa::normalizar($data['recebedor'] ?? null);
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
            'recebedor2'       => 'nullable|string',
            'valor_recebedor1' => 'nullable|numeric|min:0',
            'valor_recebedor2' => 'nullable|numeric|min:0',
            'abono_desconto'   => 'nullable|numeric|min:0',
            'valor_recebido'   => 'nullable|numeric|min:0',
            'credito_usado'    => 'nullable|numeric|min:0',
            'observacao'       => 'nullable|string',
            'anexo'            => 'nullable|string',
            'anexos'           => 'nullable|array|max:4',
            'anexos.*'         => 'nullable|string',
        ]);

        $this->garantirColunasRateioRecebedor();

        $data['data_pagamento'] = $this->emptyToNull($data['data_pagamento'] ?? null);
        $data['data_baixa'] = $this->emptyToNull($data['data_baixa'] ?? null);
        $data['tipo_despesa'] = $this->emptyToNull($data['tipo_despesa'] ?? null) ?? 'Combustível';
        $data['descricao'] = $this->emptyToNull($data['descricao'] ?? null);
        $data['recebedor'] = RecebedorBaixa::normalizar($data['recebedor'] ?? null);
        $data['recebedor2'] = $this->emptyToNull($data['recebedor2'] ?? null);
        $data['valor_recebedor1'] = $this->emptyToNull($data['valor_recebedor1'] ?? null);
        $data['valor_recebedor2'] = $this->emptyToNull($data['valor_recebedor2'] ?? null);
        $data['abono_desconto'] = $this->emptyToNull($data['abono_desconto'] ?? null);
        $data['observacao'] = $this->emptyToNull($data['observacao'] ?? null);
        $data['anexo'] = $this->normalizarAnexos($data);
        $data['valor'] = $this->emptyToNull($data['valor'] ?? null);
        $data['nota_entrada'] = $this->emptyToNull($data['nota_entrada'] ?? null) ?? ('lote:' . (string) Str::uuid());

        $this->validarMesmoProprietario($data['ids']);
        $this->validarMesmaFilialBaixa($data['ids']);

        $errors = [];
        $success = 0;

        // Validação de acesso às filiais em UMA query (antes era um EXISTS
        // por id): busca os ids realmente acessíveis e aponta os demais.
        $permitidas = $this->filiaisPermitidas();
        $idsPermitidos = Abastecimento::query()
            ->whereIn('id_abastecimento', $data['ids'])
            ->when(
                $this->tabelaTemColuna('abastecimentos', 'local'),
                fn ($q) => $q->whereIn('local', $permitidas)
            )
            ->pluck('id_abastecimento')
            ->map(fn ($id) => (string) $id)
            ->all();

        foreach (array_map('strval', $data['ids']) as $id) {
            if (!in_array($id, $idsPermitidos, true)) {
                $errors[] = [
                    'id_abastecimento' => $id,
                    'message' => 'Usuário sem acesso à filial deste abastecimento.',
                ];
            }
        }

        if (!empty($idsPermitidos)) {
            DB::beginTransaction();
            try {
                $this->upsertBaixasEmLote($idsPermitidos, $data);
                Abastecimento::whereIn('id_abastecimento', $idsPermitidos)
                    ->update($this->buildAbastecimentoBaixaUpdate($data));

                // Crédito do proprietário: excedente vira crédito; saldo pode ser
                // usado para cobrir parte do total. Roda dentro da transação para
                // que qualquer inconsistência reverta a baixa inteira.
                $proprietarioId = (string) Abastecimento::whereIn('id_abastecimento', $idsPermitidos)->value('id_proprietario');
                if ($proprietarioId !== '') {
                    $totalBaixa = round((float) Abastecimento::whereIn('id_abastecimento', $idsPermitidos)->sum('valor_total'), 2);
                    CreditoProprietarioController::aplicarNaBaixa(
                        $proprietarioId,
                        $totalBaixa,
                        $data['valor_recebido'] ?? null,
                        $data['credito_usado'] ?? null,
                        (float) ($data['abono_desconto'] ?? 0),
                        'baixa_manual',
                        $data['nota_entrada'],
                        auth()->user()
                    );
                }

                DB::commit();
                $success = count($idsPermitidos);
            } catch (\Throwable $e) {
                DB::rollBack();
                foreach ($idsPermitidos as $id) {
                    $errors[] = [
                        'id_abastecimento' => $id,
                        'message' => $e->getMessage(),
                    ];
                }
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
                    fn ($q) => $q->whereRaw('baixa_abastecimento IS TRUE')
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
        $data['recebedor'] = RecebedorBaixa::normalizar($data['recebedor'] ?? null);
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
        try {
            $baixa = BaixaAbastecimento::findOrFail($id);
            $this->validarAcessoAbastecimento($baixa->id_abastecimento);

            // Campos da própria baixa.
            $data = $request->only(['forma_pagamento', 'data_pagamento', 'nota_entrada', 'data_hora', 'usuario']);
            if (!empty($data)) {
                $this->registrarAlteracoes($baixa, $data);
                $baixa->update($data);
            }

            // Campos espelhados no abastecimento (recebedor, observação, etc.).
            $abastUpdate = [];
            foreach (['recebedor', 'observacao', 'descricao', 'tipo_despesa', 'data_baixa'] as $campo) {
                if ($request->has($campo) && $this->tabelaTemColuna('abastecimentos', $campo)) {
                    $abastUpdate[$campo] = $campo === 'recebedor'
                        ? RecebedorBaixa::normalizar($request->input($campo))
                        : $request->input($campo);
                }
            }
            if (!empty($abastUpdate)) {
                $abastUpdate['sync_token_at'] = now();
                Abastecimento::where('id_abastecimento', $baixa->id_abastecimento)->update($abastUpdate);
            }

            return new \Illuminate\Http\JsonResponse($baixa->fresh(['abastecimento']));
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return new \Illuminate\Http\JsonResponse(['message' => 'Registro de baixa não encontrado.'], 404);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return new \Illuminate\Http\JsonResponse([
                'message' => 'Erro de validação.',
                'errors' => $e->errors()
            ], 422);
        } catch (\Throwable $e) {
            return new \Illuminate\Http\JsonResponse([
                'message' => 'Erro interno ao atualizar baixa: ' . $e->getMessage()
            ], 500);
        }
    }

    public function destroy(string $id)
    {
        $baixa = BaixaAbastecimento::findOrFail($id);
        $this->validarAcessoAbastecimento($baixa->id_abastecimento);
        $nota = $baixa->nota_entrada;

        $ehNotaComprovante = $nota && is_string($nota) && str_starts_with($nota, 'comprovantes:');

        // Abastecimentos a reverter. Numa baixa por comprovante um mesmo lote
        // (nota "comprovantes:...") cobre VÁRIOS abastecimentos; excluir a baixa
        // tem de devolver TODOS eles para Pendente — antes só o abastecimento
        // desta linha voltava e os irmãos ficavam baixados sem baixa ativa
        // (estado órfão, some do relatório e não volta como pendente).
        $idsReverter = $ehNotaComprovante
            ? DB::table('baixa_abastecimento')->where('nota_entrada', $nota)->pluck('id_abastecimento')->all()
            : [$baixa->id_abastecimento];
        $idsReverter = array_values(array_unique(array_filter($idsReverter)));

        // Reverter os abastecimentos para não baixado
        Abastecimento::whereIn('id_abastecimento', $idsReverter)->update([
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

        // Se a baixa veio da tela "Baixa por Comprovante" (nota "comprovantes:..."),
        // devolve os comprovantes vinculados para lá (status pendente), em vez de
        // deixá-los presos como "aplicado", e inativa TODAS as linhas da baixa do
        // lote (não só a clicada) para não deixar irmãos órfãos.
        if ($ehNotaComprovante) {
            $this->reabrirComprovantesDaNota($nota);
            BaixaAbastecimento::where('nota_entrada', $nota)
                ->where('id_baixa', '<>', $baixa->id_baixa)
                ->get()
                ->each(fn ($outra) => $this->inativarRegistro($outra));
        }

        // Reverte também os movimentos de crédito gerados/usados nesta baixa.
        CreditoProprietarioController::removerPorNota($nota);

        return $this->inativarRegistro($baixa, 'Baixa inativada e abastecimento retornou para Pendente');
    }

    /**
     * Devolve os comprovantes de pagamento de uma nota para a tela "Baixa por
     * Comprovante" (status pendente), liberando-os para um novo lançamento.
     */
    private function reabrirComprovantesDaNota(string $nota): void
    {
        try {
            if (!DB::getSchemaBuilder()->hasTable('comprovantes_pagamento')) {
                return;
            }
            DB::table('comprovantes_pagamento')
                ->where('nota_entrada', $nota)
                ->whereNotNull('proprietario_id')
                ->update(['status' => 'aguardando_confirmacao', 'nota_entrada' => null, 'updated_at' => now()]);
            DB::table('comprovantes_pagamento')
                ->where('nota_entrada', $nota)
                ->whereNull('proprietario_id')
                ->update(['status' => 'aguardando_proprietario', 'nota_entrada' => null, 'updated_at' => now()]);
        } catch (\Throwable $e) {
            // Não bloqueia a exclusão da baixa se a reabertura falhar.
        }
    }

    /**
     * Remove UM comprovante (por URL) de uma baixa: devolve o comprovante para a
     * tela "Baixa por Comprovante" (pendente) e tira a URL do anexo dos
     * abastecimentos. Se era o último comprovante, reverte a baixa inteira.
     */
    public function removerComprovante(Request $request, string $id)
    {
        $user = auth()->user();
        if (!$user || ($user->tipo ?? null) !== 'admin') {
            return new \Illuminate\Http\JsonResponse(['message' => 'Apenas administradores podem remover comprovantes de uma baixa.'], 403);
        }

        $baixa = BaixaAbastecimento::findOrFail($id);
        $this->validarAcessoAbastecimento($baixa->id_abastecimento);

        $url = trim((string) $request->input('url', ''));
        if ($url === '') {
            return new \Illuminate\Http\JsonResponse(['message' => 'URL do comprovante é obrigatória.'], 422);
        }

        $nota = $baixa->nota_entrada;
        if (!$nota || !is_string($nota) || !str_starts_with($nota, 'comprovantes:')) {
            return new \Illuminate\Http\JsonResponse(['message' => 'Esta baixa não possui comprovantes vinculados para remover.'], 422);
        }

        $temTabela = false;
        try { $temTabela = DB::getSchemaBuilder()->hasTable('comprovantes_pagamento'); } catch (\Throwable $e) {}

        // Libera o comprovante correspondente (volta para "Baixa por Comprovante").
        // Marcado como "isolado" para não se misturar com outro grupo pendente
        // do mesmo proprietário: aparece sozinho em uma caixinha separada.
        if ($temTabela) {
            try { DB::statement('ALTER TABLE comprovantes_pagamento ADD COLUMN IF NOT EXISTS isolado BOOLEAN NOT NULL DEFAULT FALSE'); } catch (\Throwable $e) {}

            $comp = DB::table('comprovantes_pagamento')
                ->where('nota_entrada', $nota)
                ->where('arquivo_url', $url)
                ->first();
            if ($comp) {
                DB::table('comprovantes_pagamento')->where('id', $comp->id)->update([
                    'status'       => $comp->proprietario_id ? 'aguardando_confirmacao' : 'aguardando_proprietario',
                    'nota_entrada' => null,
                    'isolado'      => DB::raw('true'),
                    'updated_at'   => now(),
                ]);
            }
        }

        // Tira a URL do anexo de todos os abastecimentos do lote.
        $idsAbast = DB::table('baixa_abastecimento')->where('nota_entrada', $nota)->pluck('id_abastecimento')->all();
        foreach ($idsAbast as $idAbast) {
            $ab = Abastecimento::where('id_abastecimento', $idAbast)->first();
            if ($ab) {
                $ab->update(['anexo' => $this->removerUrlDeAnexo($ab->anexo, $url), 'sync_token_at' => now()]);
            }
        }

        // Se não restou nenhum comprovante na nota, reverte a baixa inteira.
        $restantes = $temTabela
            ? DB::table('comprovantes_pagamento')->where('nota_entrada', $nota)->count()
            : 0;

        $baixaRevertida = false;
        if ($restantes === 0 && !empty($idsAbast)) {
            Abastecimento::whereIn('id_abastecimento', $idsAbast)->update([
                'baixa_abastecimento' => $this->sqlBoolean(false),
                'data_baixa'   => null,
                'tipo_despesa' => null,
                'descricao'    => null,
                'valor'        => null,
                'placa1'       => null,
                'recebedor'    => null,
                'observacao'   => null,
                'anexo'        => null,
                'sync_token_at' => now(),
            ]);
            DB::table('baixa_abastecimento')->where('nota_entrada', $nota)->delete();
            $baixaRevertida = true;
        }

        $autor = auth()->user()?->nome ?? auth()->user()?->login ?? 'Administrador';
        \App\Services\NotificacaoCriticaService::aoMovimentarComprovanteOuBaixa(
            $baixaRevertida ? 'baixa_excluida_estornada' : 'comprovante_credito_alterado_excluido',
            $baixaRevertida
                ? "Baixa Revertida (" . count($idsAbast) . " abastecimento(s))"
                : "Comprovante Removido de Baixa",
            "Comprovante removido da baixa #{$id} por {$autor}."
                . ($baixaRevertida ? ' Todos os ' . count($idsAbast) . ' abastecimento(s) do lote voltaram para Pendente.' : ''),
            'baixa_abastecimento',
            $id,
            'Geral',
            [
                'id_baixa'        => $id,
                'baixa_revertida' => $baixaRevertida,
                'abastecimentos'  => $idsAbast,
            ]
        );

        return new \Illuminate\Http\JsonResponse([
            'message' => $baixaRevertida
                ? 'Comprovante removido. Era o último: a baixa foi revertida e os abastecimentos voltaram para Pendente.'
                : 'Comprovante removido da baixa e devolvido para "Baixa por Comprovante".',
            'baixa_revertida'      => $baixaRevertida,
            'comprovantes_restantes' => $restantes,
        ]);
    }

    private function removerUrlDeAnexo($anexo, string $url): ?string
    {
        if (!$anexo) return null;
        $s = trim((string) $anexo);
        $lista = [];
        if (str_starts_with($s, '[')) {
            $dec = json_decode($s, true);
            if (is_array($dec)) $lista = $dec;
        } elseif ($s !== '') {
            $lista = [$s];
        }
        $lista = array_values(array_filter($lista, fn ($u) => trim((string) $u) !== $url));
        if (empty($lista)) return null;
        return count($lista) === 1
            ? $lista[0]
            : json_encode($lista, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
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
