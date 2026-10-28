<?php

namespace App\Http\Controllers;

use App\Models\Abastecimento;
use App\Models\BaixaAbastecimento;
use App\Models\EntradaNota;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ConsultaVipeController extends Controller
{
    private const PROPRIETARIO_ID = '1';
    private const PROPRIETARIO_NOME = 'VIPE TRANSPORTES';
    private const LOCAIS = ['Matriz', 'Viana'];
    private const PER_PAGE_PADRAO = 50;
    private const PER_PAGE_MAXIMO = 200;

    public function status(Request $request): JsonResponse
    {
        $porLocal = Abastecimento::query()
            ->where('id_proprietario', self::PROPRIETARIO_ID)
            ->whereNull('deleted_at')
            ->selectRaw("COALESCE(local, 'Sem local') AS local")
            ->selectRaw('COUNT(*) AS total')
            ->selectRaw('COALESCE(SUM(quantidade_litros), 0) AS litros')
            ->selectRaw('COALESCE(SUM(valor_total), 0) AS valor')
            ->selectRaw('COUNT(*) FILTER (WHERE lancado_sofit IS NOT TRUE) AS pendentes_sofit')
            ->groupBy('local')
            ->orderBy('local')
            ->get()
            ->map(fn ($item) => [
                'local' => $item->local,
                'total' => (int) $item->total,
                'litros' => round((float) $item->litros, 2),
                'valor' => round((float) $item->valor, 2),
                'pendentes_lancamento' => (int) $item->pendentes_sofit,
            ])
            ->values();

        return new JsonResponse([
            'api' => [
                'nome' => 'API de Consulta Vipe Transportes',
                'versao' => '1.0',
                'somente_leitura' => true,
                'gerado_em' => now()->toIso8601String(),
            ],
            'escopo' => $this->escopo(),
            'resumo_abastecimentos' => $porLocal,
            'rotas' => [
                'abastecimentos' => '/consulta/v1/abastecimentos',
                'entradas_combustivel' => '/consulta/v1/entradas-combustivel',
                'baixas_comprovantes' => '/consulta/v1/baixas-comprovantes',
                'pendencias_lancamento' => '/consulta/v1/pendencias-lancamento',
                'tanques' => '/consulta/v1/tanques',
            ],
        ]);
    }

    public function abastecimentos(Request $request): JsonResponse
    {
        $filtros = $this->filtrosAbastecimento($request);
        $query = $this->abastecimentosQuery($filtros);
        $resumo = $this->resumoAbastecimentos(clone $query);
        $paginator = $query
            ->orderByDesc('data_hora')
            ->orderByDesc('data')
            ->orderByDesc('created_at')
            ->paginate($this->perPage($request));

        return $this->paginatedResponse(
            $paginator,
            $paginator->getCollection()
                ->map(fn (Abastecimento $item) => $this->serializeAbastecimento($item))
                ->values(),
            $filtros,
            $resumo,
        );
    }

    public function abastecimento(string $id): JsonResponse
    {
        $item = $this->abastecimentosQuery([])
            ->where('id_abastecimento', $id)
            ->firstOrFail();

        return new JsonResponse([
            'data' => $this->serializeAbastecimento($item),
            'escopo' => $this->escopo(),
        ]);
    }

    public function entradasCombustivel(Request $request): JsonResponse
    {
        $filtros = $this->filtrosEntrada($request);
        $query = $this->entradasQuery($filtros);
        $resumoQuery = clone $query;
        $resumo = [
            'registros' => (int) (clone $resumoQuery)->count(),
            'quantidade_litros' => round((float) (clone $resumoQuery)->sum('quantidade'), 2),
            'valor_notas' => round((float) (clone $resumoQuery)->sum('valor'), 2),
            'valor_compra_final' => round((float) (clone $resumoQuery)->sum(
                DB::raw('COALESCE(valor_compra_final, valor, 0)')
            ), 2),
        ];

        $paginator = $query
            ->orderByDesc('data_hora')
            ->orderByDesc('data')
            ->paginate($this->perPage($request));

        return $this->paginatedResponse(
            $paginator,
            $paginator->getCollection()
                ->map(fn (EntradaNota $item) => $this->serializeEntrada($item))
                ->values(),
            $filtros,
            $resumo,
        );
    }

    public function entradaCombustivel(string $id): JsonResponse
    {
        $item = $this->entradasQuery([])
            ->where('id_financeiro', $id)
            ->firstOrFail();

        return new JsonResponse([
            'data' => $this->serializeEntrada($item),
            'escopo' => [
                'locais' => self::LOCAIS,
                'descricao' => 'Entradas físicas de combustível dos tanques.',
            ],
        ]);
    }

    public function baixasComprovantes(Request $request): JsonResponse
    {
        $filtros = $this->filtrosBaixa($request);
        $query = BaixaAbastecimento::query()
            ->with([
                'abastecimento.veiculo:id_veiculo,placa,marca,modelo,ano,id_proprietario,local',
                'abastecimento.motorista:id_motorista,nome,apelido,id_proprietario,local',
            ])
            ->whereNull('baixa_abastecimento.deleted_at')
            ->whereHas('abastecimento', function (Builder $abastecimento) use ($filtros) {
                $abastecimento
                    ->where('id_proprietario', self::PROPRIETARIO_ID)
                    ->whereNull('deleted_at');
                $this->aplicarFiltrosAbastecimentoRelacionado($abastecimento, $filtros);
            });

        if ($filtros['data_inicio'] ?? null) {
            $query->whereDate('data_pagamento', '>=', $filtros['data_inicio']);
        }
        if ($filtros['data_fim'] ?? null) {
            $query->whereDate('data_pagamento', '<=', $filtros['data_fim']);
        }
        if ($filtros['forma_pagamento'] ?? null) {
            $query->whereRaw('LOWER(COALESCE(forma_pagamento, \'\')) = LOWER(?)', [
                $filtros['forma_pagamento'],
            ]);
        }

        $total = (int) (clone $query)->count();
        $paginator = $query
            ->orderByDesc('data_pagamento')
            ->orderByDesc('data_hora')
            ->paginate($this->perPage($request));

        $notas = $paginator->getCollection()
            ->pluck('nota_entrada')
            ->filter()
            ->unique()
            ->values();
        $comprovantes = $this->comprovantesPorNota($notas);

        $data = $paginator->getCollection()->map(function (BaixaAbastecimento $baixa) use ($comprovantes) {
            $abastecimento = $baixa->abastecimento;

            return [
                'id_baixa' => (string) $baixa->id_baixa,
                'data_hora' => $this->dateTime($baixa->data_hora),
                'data_pagamento' => $this->dateTime($baixa->data_pagamento),
                'usuario' => $baixa->usuario,
                'forma_pagamento' => $baixa->forma_pagamento,
                'nota_entrada' => $baixa->nota_entrada,
                'status' => $baixa->status,
                'id_extrato_conciliado' => $baixa->id_extrato_conciliado,
                'sync_token_at' => $this->dateTime($baixa->sync_token_at),
                'abastecimento' => $abastecimento
                    ? $this->serializeAbastecimentoResumido($abastecimento)
                    : null,
                'comprovantes' => $comprovantes->get((string) $baixa->nota_entrada, collect())
                    ->map(fn ($item) => $this->serializeComprovante($item))
                    ->values(),
            ];
        })->values();

        return $this->paginatedResponse(
            $paginator,
            $data,
            $filtros,
            ['registros' => $total],
        );
    }

    public function pendenciasLancamento(Request $request): JsonResponse
    {
        $filtros = $this->filtrosAbastecimento($request);
        $filtros['lancado_sofit'] = false;
        $query = $this->abastecimentosQuery($filtros);
        $resumo = $this->resumoAbastecimentos(clone $query);
        $paginator = $query
            ->orderBy('data_hora')
            ->orderBy('data')
            ->paginate($this->perPage($request));

        $data = $paginator->getCollection()->map(function (Abastecimento $item) {
            $registro = $this->serializeAbastecimento($item);
            $registro['pendencia_lancamento'] = [
                'pendente' => true,
                'destino' => 'Sofit',
                'sofit_status' => $item->getAttribute('sofit_status'),
                'sofit_retorno' => $item->getAttribute('sofit_retorno'),
                'sofit_id' => $item->getAttribute('sofit_id'),
                'sofit_trip_id' => $item->getAttribute('sofit_trip_id'),
            ];

            return $registro;
        })->values();

        return $this->paginatedResponse($paginator, $data, $filtros, $resumo);
    }

    public function tanques(Request $request): JsonResponse
    {
        $request->validate([
            'local' => 'nullable|string|max:40',
            'data_inicio' => 'nullable|date',
            'data_fim' => 'nullable|date',
        ]);

        $local = $this->normalizarLocal($request->query('local'));
        $dataInicio = CarbonImmutable::parse(
            $request->query('data_inicio', now()->startOfMonth()->toDateString())
        )->toDateString();
        $dataFim = CarbonImmutable::parse(
            $request->query('data_fim', now()->toDateString())
        )->toDateString();
        if ($dataInicio > $dataFim) {
            [$dataInicio, $dataFim] = [$dataFim, $dataInicio];
        }

        $locais = collect($local ? [$local] : self::LOCAIS)
            ->map(fn (string $item) => $this->tanqueLocal($item, $dataInicio, $dataFim))
            ->values();

        return new JsonResponse([
            'data' => $locais,
            'periodo' => [
                'data_inicio' => $dataInicio,
                'data_fim' => $dataFim,
            ],
            'observacoes' => [
                'medicao_fisica' => 'Última quantidade informada no controle de encerrante.',
                'saldo_historico_calculado' => 'Entradas menos todos os abastecimentos ativos do local.',
                'consumo_vipe' => 'Saídas exclusivas dos veículos vinculados à VIPE TRANSPORTES.',
            ],
        ]);
    }

    private function abastecimentosQuery(array $filtros): Builder
    {
        $query = Abastecimento::query()
            ->with([
                'veiculo:id_veiculo,placa,marca,modelo,ano,tipo_combustivel,numero_chassi,id_proprietario,odometro,renavam,cor,foto,local,sync_token_at',
                'motorista:id_motorista,nome,apelido,id_proprietario,local,sync_token_at',
                'proprietario:id_proprietario,nome,status,local',
                'baixas' => fn ($baixas) => $baixas
                    ->whereNull('deleted_at')
                    ->orderByDesc('data_hora'),
            ])
            ->where('id_proprietario', self::PROPRIETARIO_ID)
            ->whereNull('deleted_at');

        $this->aplicarFiltrosAbastecimentoRelacionado($query, $filtros);

        if (array_key_exists('lancado_sofit', $filtros)) {
            $filtros['lancado_sofit']
                ? $query->whereRaw('lancado_sofit IS TRUE')
                : $query->whereRaw('lancado_sofit IS NOT TRUE');
        }
        if (array_key_exists('baixa', $filtros)) {
            $filtros['baixa']
                ? $query->whereRaw('baixa_abastecimento IS TRUE')
                : $query->whereRaw('baixa_abastecimento IS NOT TRUE');
        }
        if ($filtros['tipo_combustivel'] ?? null) {
            $query->whereRaw('LOWER(COALESCE(tipo_combustivel, \'\')) LIKE LOWER(?)', [
                '%' . $filtros['tipo_combustivel'] . '%',
            ]);
        }
        if ($filtros['status'] ?? null) {
            $query->whereRaw('LOWER(COALESCE(status, \'\')) = LOWER(?)', [$filtros['status']]);
        }

        return $query;
    }

    private function aplicarFiltrosAbastecimentoRelacionado(Builder $query, array $filtros): void
    {
        if ($filtros['local'] ?? null) {
            $query->whereRaw('LOWER(COALESCE(local, \'\')) = LOWER(?)', [$filtros['local']]);
        }
        if ($filtros['data_inicio'] ?? null) {
            $query->whereDate('data', '>=', $filtros['data_inicio']);
        }
        if ($filtros['data_fim'] ?? null) {
            $query->whereDate('data', '<=', $filtros['data_fim']);
        }
        if ($filtros['placa'] ?? null) {
            $placa = $this->normalizarPlaca($filtros['placa']);
            $query->where(function (Builder $placaQuery) use ($placa) {
                $placaQuery
                    ->whereRaw("UPPER(REGEXP_REPLACE(COALESCE(id_veiculo, ''), '[^A-Z0-9]', '', 'g')) LIKE ?", [
                        '%' . $placa . '%',
                    ])
                    ->orWhereRaw("UPPER(REGEXP_REPLACE(COALESCE(placa1, ''), '[^A-Z0-9]', '', 'g')) LIKE ?", [
                        '%' . $placa . '%',
                    ])
                    ->orWhereHas('veiculo', fn (Builder $veiculo) => $veiculo
                        ->whereRaw("UPPER(REGEXP_REPLACE(COALESCE(placa, ''), '[^A-Z0-9]', '', 'g')) LIKE ?", [
                            '%' . $placa . '%',
                        ]));
            });
        }
    }

    private function entradasQuery(array $filtros): Builder
    {
        $query = EntradaNota::query()->whereNull('deleted_at');
        if ($filtros['local'] ?? null) {
            $query->whereRaw('LOWER(COALESCE(local, \'\')) = LOWER(?)', [$filtros['local']]);
        }
        if ($filtros['data_inicio'] ?? null) {
            $query->whereDate('data', '>=', $filtros['data_inicio']);
        }
        if ($filtros['data_fim'] ?? null) {
            $query->whereDate('data', '<=', $filtros['data_fim']);
        }
        if ($filtros['fornecedor'] ?? null) {
            $query->whereRaw('LOWER(COALESCE(fornecedor, \'\')) LIKE LOWER(?)', [
                '%' . $filtros['fornecedor'] . '%',
            ]);
        }
        if ($filtros['status'] ?? null) {
            $query->whereRaw('LOWER(COALESCE(status, \'\')) = LOWER(?)', [$filtros['status']]);
        }
        if (array_key_exists('paga', $filtros)) {
            $filtros['paga']
                ? $query->whereRaw('paga IS TRUE')
                : $query->whereRaw('paga IS NOT TRUE');
        }

        return $query;
    }

    private function filtrosAbastecimento(Request $request): array
    {
        $request->validate([
            'local' => 'nullable|string|max:40',
            'data_inicio' => 'nullable|date',
            'data_fim' => 'nullable|date',
            'placa' => 'nullable|string|max:20',
            'tipo_combustivel' => 'nullable|string|max:80',
            'status' => 'nullable|string|max:80',
            'lancado_sofit' => 'nullable',
            'baixa' => 'nullable',
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:' . self::PER_PAGE_MAXIMO,
        ]);

        $filtros = array_filter([
            'local' => $this->normalizarLocal($request->query('local')),
            'data_inicio' => $request->query('data_inicio'),
            'data_fim' => $request->query('data_fim'),
            'placa' => trim((string) $request->query('placa', '')),
            'tipo_combustivel' => trim((string) $request->query('tipo_combustivel', '')),
            'status' => trim((string) $request->query('status', '')),
        ], fn ($value) => $value !== null && $value !== '');

        $lancadoSofit = $this->boolFilter($request, 'lancado_sofit');
        if ($lancadoSofit !== null) {
            $filtros['lancado_sofit'] = $lancadoSofit;
        }
        $baixa = $this->boolFilter($request, 'baixa');
        if ($baixa !== null) {
            $filtros['baixa'] = $baixa;
        }

        return $filtros;
    }

    private function filtrosEntrada(Request $request): array
    {
        $request->validate([
            'local' => 'nullable|string|max:40',
            'data_inicio' => 'nullable|date',
            'data_fim' => 'nullable|date',
            'fornecedor' => 'nullable|string|max:255',
            'status' => 'nullable|string|max:80',
            'paga' => 'nullable',
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:' . self::PER_PAGE_MAXIMO,
        ]);

        $filtros = array_filter([
            'local' => $this->normalizarLocal($request->query('local')),
            'data_inicio' => $request->query('data_inicio'),
            'data_fim' => $request->query('data_fim'),
            'fornecedor' => trim((string) $request->query('fornecedor', '')),
            'status' => trim((string) $request->query('status', '')),
        ], fn ($value) => $value !== null && $value !== '');
        $paga = $this->boolFilter($request, 'paga');
        if ($paga !== null) {
            $filtros['paga'] = $paga;
        }

        return $filtros;
    }

    private function filtrosBaixa(Request $request): array
    {
        $request->validate([
            'local' => 'nullable|string|max:40',
            'data_inicio' => 'nullable|date',
            'data_fim' => 'nullable|date',
            'placa' => 'nullable|string|max:20',
            'forma_pagamento' => 'nullable|string|max:80',
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:' . self::PER_PAGE_MAXIMO,
        ]);

        return array_filter([
            'local' => $this->normalizarLocal($request->query('local')),
            'data_inicio' => $request->query('data_inicio'),
            'data_fim' => $request->query('data_fim'),
            'placa' => trim((string) $request->query('placa', '')),
            'forma_pagamento' => trim((string) $request->query('forma_pagamento', '')),
        ], fn ($value) => $value !== null && $value !== '');
    }

    private function resumoAbastecimentos(Builder $query): array
    {
        $row = $query
            ->without(['veiculo', 'motorista', 'proprietario', 'baixas'])
            ->selectRaw('COUNT(*) AS registros')
            ->selectRaw('COALESCE(SUM(quantidade_litros), 0) AS quantidade_litros')
            ->selectRaw('COALESCE(SUM(valor_total), 0) AS valor_total')
            ->first();

        return [
            'registros' => (int) ($row?->registros ?? 0),
            'quantidade_litros' => round((float) ($row?->quantidade_litros ?? 0), 2),
            'valor_total' => round((float) ($row?->valor_total ?? 0), 2),
        ];
    }

    private function serializeAbastecimento(Abastecimento $item): array
    {
        $data = $item->toArray();
        unset($data['deleted_by'], $data['deleted_by_id']);
        foreach ([
            'quantidade_litros',
            'valor_por_litro',
            'valor_total',
            'valor',
            'valor_recebedor1',
            'valor_recebedor2',
            'abono_desconto',
        ] as $field) {
            if (array_key_exists($field, $data) && $data[$field] !== null) {
                $data[$field] = (float) $data[$field];
            }
        }
        foreach (['lancado_sofit', 'selecionado', 'lancado_api', 'baixa_abastecimento'] as $field) {
            if (array_key_exists($field, $data)) {
                $data[$field] = (bool) $data[$field];
            }
        }
        $data['escopo_frota'] = [
            'id_proprietario' => self::PROPRIETARIO_ID,
            'nome' => self::PROPRIETARIO_NOME,
        ];

        return $data;
    }

    private function serializeAbastecimentoResumido(Abastecimento $item): array
    {
        return [
            'id_abastecimento' => (string) $item->id_abastecimento,
            'data' => $this->dateOnly($item->data),
            'data_hora' => $this->dateTime($item->data_hora),
            'local' => $item->local,
            'placa' => $item->veiculo?->placa ?? $item->placa1 ?? $item->id_veiculo,
            'tipo_combustivel' => $item->tipo_combustivel,
            'quantidade_litros' => $this->floatOrNull($item->quantidade_litros),
            'valor_por_litro' => $this->floatOrNull($item->valor_por_litro),
            'valor_total' => $this->floatOrNull($item->valor_total),
            'status' => $item->status,
            'lancado_sofit' => (bool) $item->lancado_sofit,
            'baixa_abastecimento' => (bool) $item->baixa_abastecimento,
            'veiculo' => $item->veiculo?->toArray(),
            'motorista' => $item->motorista?->toArray(),
        ];
    }

    private function serializeEntrada(EntradaNota $item): array
    {
        $data = $item->toArray();
        unset($data['deleted_by'], $data['deleted_by_id']);
        foreach ([
            'valor',
            'quantidade',
            'valor_litro',
            'custo_transporte_litro',
            'custo_transporte_total',
            'valor_compra_final',
            'nota_verificacao_confianca',
        ] as $field) {
            if (array_key_exists($field, $data) && $data[$field] !== null) {
                $data[$field] = (float) $data[$field];
            }
        }
        foreach (['fornecedor_confirmado', 'paga'] as $field) {
            if (array_key_exists($field, $data)) {
                $data[$field] = (bool) $data[$field];
            }
        }

        return $data;
    }

    private function comprovantesPorNota(Collection $notas): Collection
    {
        if ($notas->isEmpty() || !DB::getSchemaBuilder()->hasTable('comprovantes_pagamento')) {
            return collect();
        }

        return DB::table('comprovantes_pagamento')
            ->whereIn('nota_entrada', $notas->all())
            ->orderBy('created_at')
            ->get()
            ->groupBy(fn ($item) => (string) $item->nota_entrada);
    }

    private function serializeComprovante(object $item): array
    {
        return [
            'id' => (string) $item->id,
            'arquivo_url' => $item->arquivo_url,
            'arquivo_tipo' => $item->arquivo_tipo,
            'valor_extraido' => $this->floatOrNull($item->valor_extraido),
            'valor_pago_texto' => $item->valor_pago_texto,
            'valores_comprovantes' => $this->jsonValue($item->valores_comprovantes),
            'data_pagamento_extraida' => $item->data_pagamento_extraida,
            'remetente_extraido' => $item->remetente_extraido,
            'status' => $item->status,
            'confianca_ia' => $this->floatOrNull($item->confianca_ia),
            'identificador_transacao' => $item->identificador_transacao,
            'forma_pagamento' => $item->forma_pagamento,
            'nota_entrada' => $item->nota_entrada,
            'criado_em' => $this->dateTime($item->created_at),
            'atualizado_em' => $this->dateTime($item->updated_at),
        ];
    }

    private function tanqueLocal(string $local, string $dataInicio, string $dataFim): array
    {
        $ultimaMedicao = DB::table('encerrantes_bomba')
            ->whereNull('deleted_at')
            ->whereRaw('LOWER(local) = LOWER(?)', [$local])
            ->orderByDesc('data')
            ->orderByDesc('created_at')
            ->first();

        $entradasHistoricas = (float) DB::table('entrada_notas')
            ->whereNull('deleted_at')
            ->whereRaw('LOWER(local) = LOWER(?)', [$local])
            ->sum('quantidade');
        $saidasHistoricas = (float) DB::table('abastecimentos')
            ->whereNull('deleted_at')
            ->whereRaw('LOWER(local) = LOWER(?)', [$local])
            ->sum('quantidade_litros');
        $saidasVipeHistoricas = (float) DB::table('abastecimentos')
            ->whereNull('deleted_at')
            ->where('id_proprietario', self::PROPRIETARIO_ID)
            ->whereRaw('LOWER(local) = LOWER(?)', [$local])
            ->sum('quantidade_litros');

        $entradasPeriodo = $this->somaPeriodo(
            'entrada_notas',
            'quantidade',
            $local,
            $dataInicio,
            $dataFim,
        );
        $saidasPeriodo = $this->somaPeriodo(
            'abastecimentos',
            'quantidade_litros',
            $local,
            $dataInicio,
            $dataFim,
        );
        $consumoVipePeriodo = $this->somaPeriodo(
            'abastecimentos',
            'quantidade_litros',
            $local,
            $dataInicio,
            $dataFim,
            self::PROPRIETARIO_ID,
        );

        $desdeMedicao = [
            'entradas_litros' => 0.0,
            'saidas_litros' => 0.0,
            'consumo_vipe_litros' => 0.0,
            'estimativa_atual_litros' => null,
        ];
        if ($ultimaMedicao) {
            $dataMedicao = CarbonImmutable::parse($ultimaMedicao->data)->toDateString();
            $entradasDesde = $this->somaDesdeData(
                'entrada_notas',
                'quantidade',
                $local,
                $dataMedicao,
            );
            $saidasDesde = $this->somaDesdeData(
                'abastecimentos',
                'quantidade_litros',
                $local,
                $dataMedicao,
            );
            $consumoVipeDesde = $this->somaDesdeData(
                'abastecimentos',
                'quantidade_litros',
                $local,
                $dataMedicao,
                self::PROPRIETARIO_ID,
            );
            $desdeMedicao = [
                'entradas_litros' => round($entradasDesde, 2),
                'saidas_litros' => round($saidasDesde, 2),
                'consumo_vipe_litros' => round($consumoVipeDesde, 2),
                'estimativa_atual_litros' => round(
                    (float) $ultimaMedicao->quantidade_tanque + $entradasDesde - $saidasDesde,
                    2,
                ),
            ];
        }

        return [
            'local' => $local,
            'ultima_medicao' => $ultimaMedicao ? [
                'id_encerrante' => $ultimaMedicao->id_encerrante,
                'data' => $ultimaMedicao->data,
                'registrado_em' => $this->dateTime($ultimaMedicao->created_at),
                'quantidade_tanque_litros' => round((float) $ultimaMedicao->quantidade_tanque, 2),
                'litros_bomba_encerrante' => round((float) $ultimaMedicao->litros_bomba, 2),
                'foto' => $ultimaMedicao->foto,
                'usuario' => $ultimaMedicao->usuario_nome,
            ] : null,
            'desde_ultima_medicao' => $desdeMedicao,
            'periodo' => [
                'data_inicio' => $dataInicio,
                'data_fim' => $dataFim,
                'entradas_litros' => round($entradasPeriodo, 2),
                'saidas_todos_veiculos_litros' => round($saidasPeriodo, 2),
                'consumo_frota_vipe_litros' => round($consumoVipePeriodo, 2),
                'variacao_estoque_litros' => round($entradasPeriodo - $saidasPeriodo, 2),
            ],
            'historico' => [
                'entradas_litros' => round($entradasHistoricas, 2),
                'saidas_todos_veiculos_litros' => round($saidasHistoricas, 2),
                'consumo_frota_vipe_litros' => round($saidasVipeHistoricas, 2),
                'saldo_historico_calculado_litros' => round(
                    $entradasHistoricas - $saidasHistoricas,
                    2,
                ),
            ],
        ];
    }

    private function somaPeriodo(
        string $table,
        string $column,
        string $local,
        string $dataInicio,
        string $dataFim,
        ?string $proprietarioId = null,
    ): float {
        $query = DB::table($table)
            ->whereNull('deleted_at')
            ->whereRaw('LOWER(local) = LOWER(?)', [$local])
            ->whereDate('data', '>=', $dataInicio)
            ->whereDate('data', '<=', $dataFim);
        if ($proprietarioId !== null) {
            $query->where('id_proprietario', $proprietarioId);
        }

        return (float) $query->sum($column);
    }

    private function somaDesdeData(
        string $table,
        string $column,
        string $local,
        string $dataInicio,
        ?string $proprietarioId = null,
    ): float {
        $query = DB::table($table)
            ->whereNull('deleted_at')
            ->whereRaw('LOWER(local) = LOWER(?)', [$local])
            ->whereDate('data', '>', $dataInicio);
        if ($proprietarioId !== null) {
            $query->where('id_proprietario', $proprietarioId);
        }

        return (float) $query->sum($column);
    }

    private function paginatedResponse(
        LengthAwarePaginator $paginator,
        Collection $data,
        array $filtros,
        array $resumo,
    ): JsonResponse {
        return new JsonResponse([
            'data' => $data,
            'meta' => [
                'pagina_atual' => $paginator->currentPage(),
                'por_pagina' => $paginator->perPage(),
                'ultima_pagina' => $paginator->lastPage(),
                'total' => $paginator->total(),
                'gerado_em' => now()->toIso8601String(),
            ],
            'filtros' => (object) $filtros,
            'resumo' => $resumo,
            'escopo' => $this->escopo(),
        ]);
    }

    private function escopo(): array
    {
        return [
            'proprietario' => [
                'id_proprietario' => self::PROPRIETARIO_ID,
                'nome' => self::PROPRIETARIO_NOME,
            ],
            'locais' => self::LOCAIS,
            'veiculos_terceiros_incluidos' => false,
        ];
    }

    private function perPage(Request $request): int
    {
        return min(
            self::PER_PAGE_MAXIMO,
            max(1, (int) $request->query('per_page', self::PER_PAGE_PADRAO)),
        );
    }

    private function normalizarLocal(mixed $value): ?string
    {
        $text = mb_strtolower(trim((string) $value));
        if ($text === '' || $text === 'todos' || $text === 'todas') {
            return null;
        }
        foreach (self::LOCAIS as $local) {
            if (mb_strtolower($local) === $text) {
                return $local;
            }
        }
        abort(422, 'Local inválido. Use Matriz ou Viana.');
    }

    private function normalizarPlaca(mixed $value): string
    {
        return preg_replace('/[^A-Z0-9]/', '', mb_strtoupper((string) $value)) ?? '';
    }

    private function boolFilter(Request $request, string $name): ?bool
    {
        if (!$request->has($name) || trim((string) $request->query($name)) === '') {
            return null;
        }
        $value = filter_var($request->query($name), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($value === null) {
            abort(422, "O filtro {$name} deve ser true ou false.");
        }

        return $value;
    }

    private function dateOnly(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        try {
            return CarbonImmutable::parse($value)->toDateString();
        } catch (\Throwable) {
            return (string) $value;
        }
    }

    private function dateTime(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        try {
            return CarbonImmutable::parse($value)->toIso8601String();
        } catch (\Throwable) {
            return (string) $value;
        }
    }

    private function floatOrNull(mixed $value): ?float
    {
        return $value === null || $value === '' ? null : (float) $value;
    }

    private function jsonValue(mixed $value): mixed
    {
        if (!is_string($value)) {
            return $value;
        }
        $decoded = json_decode($value, true);

        return json_last_error() === JSON_ERROR_NONE ? $decoded : $value;
    }
}
