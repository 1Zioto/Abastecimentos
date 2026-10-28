<?php

namespace App\Http\Controllers;

use App\Models\ConferenciaVipeImportacao;
use App\Models\ConferenciaVipeItem;
use App\Services\VipeAbastecimentoConferenceService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ConferenciaVipeController extends Controller
{
    private const LOCAL_CONSIDERADO = 'Matriz';

    public function index(): JsonResponse
    {
        $importacoes = ConferenciaVipeImportacao::query()
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn (ConferenciaVipeImportacao $importacao) => $this->serializeImportacao(
                $importacao,
                true,
            ))
            ->values();

        return new JsonResponse(['data' => $importacoes]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $importacao = ConferenciaVipeImportacao::query()->findOrFail($id);

        return new JsonResponse($this->storedResponse(
            $importacao,
            $this->validateMonth($request->query('mes')),
        ));
    }

    public function comparar(
        Request $request,
        VipeAbastecimentoConferenceService $conference,
    ): JsonResponse {
        $data = $request->validate($this->comparisonRules());
        $hash = hash('sha256', (string) json_encode([
            'local' => self::LOCAL_CONSIDERADO,
            'itens' => $data['itens'],
        ], JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION));

        $existing = ConferenciaVipeImportacao::query()
            ->where('arquivo_hash', $hash)
            ->first();
        if ($existing) {
            $response = $this->storedResponse($existing);
            $response['reutilizado'] = true;

            return new JsonResponse($response);
        }

        $comparison = $this->calculateComparison(
            $data['itens'],
            (int) ($data['linhas_ignoradas'] ?? 0),
            $conference,
        );
        $user = auth()->user();

        $importacao = DB::transaction(function () use ($data, $hash, $comparison, $user) {
            $metadata = $comparison['metadata'];
            $importacao = ConferenciaVipeImportacao::query()->create([
                'arquivo_origem' => $data['arquivo_origem'] ?? 'Relatório sem nome.xlsx',
                'arquivo_hash' => $hash,
                'local_considerado' => self::LOCAL_CONSIDERADO,
                'proprietarios' => $metadata['proprietarios'],
                'placas_cadastradas' => $metadata['placas_cadastradas'],
                'linhas_arquivo' => $metadata['linhas_arquivo'],
                'linhas_vipe' => $metadata['linhas_vipe'],
                'linhas_ignoradas_formato' => $metadata['linhas_ignoradas_formato'],
                'linhas_outros_proprietarios' => $metadata['linhas_outros_proprietarios'],
                'placas_outros_proprietarios' => $metadata['placas_outros_proprietarios'],
                'periodo_inicio' => $metadata['periodo_inicio'],
                'periodo_fim' => $metadata['periodo_fim'],
                'importado_por_id' => (string) ($user?->id_user ?? $user?->id ?? ''),
                'importado_por' => trim((string) ($user?->nome ?? $user?->login ?? 'Administrador')),
            ]);

            $now = now();
            $rows = [];
            foreach ($comparison['result']['items'] as $item) {
                $rows[] = $this->comparisonItemPayload(
                    $importacao->id_conferencia,
                    $item,
                    $now,
                );
            }
            foreach (array_chunk($rows, 300) as $chunk) {
                DB::table('conferencia_vipe_itens')->insert($chunk);
            }

            return $importacao;
        });

        return new JsonResponse($this->storedResponse($importacao->fresh()));
    }

    public function reprocessar(
        string $id,
        VipeAbastecimentoConferenceService $conference,
    ): JsonResponse {
        $importacao = ConferenciaVipeImportacao::query()->findOrFail($id);
        $storedItems = ConferenciaVipeItem::query()
            ->where('id_conferencia', $id)
            ->orderBy('linha_arquivo')
            ->get();

        $reportRows = $storedItems->map(fn (ConferenciaVipeItem $item) => [
            'linha' => $item->linha_arquivo,
            'placa' => $item->placa,
            'data' => $item->data?->toDateString(),
            'data_hora' => $item->data_hora?->format('Y-m-d H:i:s')
                ?? $item->data?->startOfDay()->format('Y-m-d H:i:s'),
            'valor_total' => $item->valor_relatorio,
            'quantidade_litros' => $item->quantidade_relatorio,
            'documento' => $item->documento,
            'codigo_viagem' => $item->codigo_viagem,
            'item' => $item->item,
            'descricao' => $item->descricao,
        ])->all();

        $comparison = $this->calculateComparison($reportRows, 0, $conference);
        $byLine = collect($comparison['result']['items'])
            ->keyBy(fn (array $item) => (int) $item['linha']);

        DB::transaction(function () use ($storedItems, $byLine) {
            foreach ($storedItems as $storedItem) {
                $computed = $byLine->get((int) $storedItem->linha_arquivo);
                if (!$computed) {
                    continue;
                }
                $storedItem->forceFill(
                    $this->comparisonItemUpdatePayload($computed),
                )->save();
            }
        });

        return new JsonResponse($this->storedResponse($importacao->fresh()));
    }

    public function checarItem(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'checado' => 'required|boolean',
            'observacao' => 'nullable|string|max:1000',
        ]);
        $item = ConferenciaVipeItem::query()->findOrFail($id);

        if (
            $data['checado']
            && !in_array(
                $item->status_original,
                [
                    VipeAbastecimentoConferenceService::STATUS_ATENCAO,
                    VipeAbastecimentoConferenceService::STATUS_PENDENTE,
                ],
                true,
            )
        ) {
            abort(422, 'Somente pendências e pontos de atenção podem ser marcados como checados.');
        }

        $user = auth()->user();
        $userId = $user?->id_user ?? $user?->id;
        $checkedAt = now();

        DB::table('conferencia_vipe_itens')
            ->where('id_item', $item->id_item)
            ->update($data['checado'] ? [
                'checado' => DB::raw('TRUE'),
                'checado_por_id' => $userId ? (string) $userId : null,
                'checado_por' => trim((string) ($user?->nome ?? $user?->login ?? 'Administrador')),
                'checado_em' => $checkedAt,
                'observacao_checagem' => trim((string) ($data['observacao'] ?? '')),
                'updated_at' => $checkedAt,
            ] : [
                'checado' => DB::raw('FALSE'),
                'checado_por_id' => null,
                'checado_por' => null,
                'checado_em' => null,
                'observacao_checagem' => null,
                'updated_at' => $checkedAt,
            ]);

        return new JsonResponse([
            'message' => $data['checado']
                ? 'Abastecimento marcado como checado.'
                : 'Checagem removida.',
            'data' => $this->serializeItem($item->fresh()),
        ]);
    }

    /**
     * @return array<string, string>
     */
    private function comparisonRules(): array
    {
        return [
            'arquivo_origem' => 'nullable|string|max:255',
            'linhas_ignoradas' => 'nullable|integer|min:0',
            'itens' => 'required|array|min:1|max:6000',
            'itens.*.linha' => 'nullable|integer|min:1',
            'itens.*.placa' => 'required|string|max:20',
            'itens.*.data' => 'required|date',
            'itens.*.data_hora' => 'nullable|date',
            'itens.*.valor_total' => 'nullable|numeric',
            'itens.*.quantidade_litros' => 'nullable|numeric|min:0',
            'itens.*.documento' => 'nullable|string|max:120',
            'itens.*.codigo_viagem' => 'nullable|string|max:120',
            'itens.*.item' => 'nullable|string|max:255',
            'itens.*.descricao' => 'nullable|string|max:500',
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @return array<string, mixed>
     */
    private function calculateComparison(
        array $items,
        int $ignoredFormat,
        VipeAbastecimentoConferenceService $conference,
    ): array {
        $owners = DB::table('proprietarios')
            ->select('id_proprietario', 'nome')
            ->get()
            ->filter(fn ($owner) => $conference->isVipeTransportes($owner->nome));

        if ($owners->isEmpty()) {
            abort(422, 'O proprietário Vipe Transportes não foi encontrado no cadastro.');
        }

        $ownerIds = $owners->pluck('id_proprietario')->filter()->values()->all();
        $vehicles = DB::table('veiculos')
            ->whereIn('id_proprietario', $ownerIds)
            ->select('id_veiculo', 'placa')
            ->get();

        $plates = [];
        foreach ($vehicles as $vehicle) {
            $plate = $conference->normalizePlate($vehicle->placa);
            if ($plate !== '') {
                $plates[$plate] = true;
            }
        }
        if ($plates === []) {
            abort(422, 'A Vipe Transportes não possui placas cadastradas.');
        }

        $reportRows = [];
        $ignoredOtherOwners = 0;
        $ignoredPlates = [];
        foreach ($items as $item) {
            $plate = $conference->normalizePlate($item['placa'] ?? null);
            if (!isset($plates[$plate])) {
                $ignoredOtherOwners++;
                if ($plate !== '') {
                    $ignoredPlates[$plate] = true;
                }
                continue;
            }
            $item['placa'] = $plate;
            $reportRows[] = $item;
        }
        if ($reportRows === []) {
            abort(422, 'Nenhuma linha do relatório pertence às placas cadastradas para a Vipe Transportes.');
        }

        $dates = array_map(
            fn (array $item) => Carbon::parse((string) ($item['data_hora'] ?? $item['data'])),
            $reportRows,
        );
        $minDate = collect($dates)->min();
        $maxDate = collect($dates)->max();
        $start = $minDate->copy()->subDay()->toDateString();
        $end = $maxDate->copy()->addDay()->toDateString();
        $vehicleIds = $vehicles->pluck('id_veiculo')->filter()->values()->all();

        $systemRows = DB::table('abastecimentos as a')
            ->leftJoin('veiculos as v', 'v.id_veiculo', '=', 'a.id_veiculo')
            ->where(function ($query) use ($ownerIds, $vehicleIds) {
                $query->whereIn('a.id_proprietario', $ownerIds);
                if ($vehicleIds !== []) {
                    $query->orWhereIn('a.id_veiculo', $vehicleIds);
                }
            })
            ->where('a.local', self::LOCAL_CONSIDERADO)
            ->whereBetween(DB::raw('COALESCE(a.data_hora::date, a.data::date)'), [$start, $end])
             ->selectRaw(
                'a.id_abastecimento, COALESCE(v.placa, a.placa1) AS placa, ' .
                 'COALESCE(a.data_hora::date, a.data::date) AS data, ' .
                 'COALESCE(a.data_hora, a.data::timestamp) AS data_hora, ' .
                 'a.quantidade_litros, a.valor_por_litro, ' .
                 'COALESCE(a.valor_total, a.valor, FLOOR(COALESCE(a.valor_por_litro, 0) * COALESCE(a.quantidade_litros, 0) + 0.000001)) AS valor_total, ' .
                 'a.local, a.sofit_id, a.sofit_trip_id',
            )
            ->get()
            ->map(fn ($row) => (array) $row)
            ->all();

        return [
            'metadata' => [
                'proprietarios' => $owners->pluck('nome')->values()->all(),
                'placas_cadastradas' => count($plates),
                'linhas_arquivo' => count($items) + $ignoredFormat,
                'linhas_vipe' => count($reportRows),
                'linhas_ignoradas_formato' => $ignoredFormat,
                'linhas_outros_proprietarios' => $ignoredOtherOwners,
                'placas_outros_proprietarios' => array_values(array_keys($ignoredPlates)),
                'periodo_inicio' => $minDate->toDateString(),
                'periodo_fim' => $maxDate->toDateString(),
            ],
            'result' => $conference->compare($reportRows, $systemRows),
        ];
    }

    /**
     * @param  array<string, mixed>  $item
     * @return array<string, mixed>
     */
    private function comparisonItemPayload(
        string $importId,
        array $item,
        Carbon $now,
    ): array {
        return [
            'id_item' => (string) Str::uuid(),
            'id_conferencia' => $importId,
            'linha_arquivo' => (int) ($item['linha'] ?? 0),
            'placa' => $item['placa'],
            'data' => $item['data'],
            'data_hora' => $item['data_hora'] ?? null,
            'documento' => $item['documento'] ?? null,
            'codigo_viagem' => $item['codigo_viagem'] ?? null,
            'item' => $item['item'] ?? null,
            'descricao' => $item['descricao'] ?? null,
            'valor_relatorio' => $item['valor_relatorio'],
            'quantidade_relatorio' => $item['quantidade_relatorio'],
            ...$this->comparisonItemUpdatePayload($item),
            'created_at' => $now,
            'updated_at' => $now,
        ];
    }

    /**
     * @param  array<string, mixed>  $item
     * @return array<string, mixed>
     */
    private function comparisonItemUpdatePayload(array $item): array
    {
        $match = is_array($item['abastecimento'] ?? null)
            ? $item['abastecimento']
            : [];

        return [
            'status_original' => $item['status'],
            'status_label_original' => $item['status_label'],
            'mensagem_original' => $item['mensagem'],
            'id_abastecimento' => $match['id_abastecimento'] ?? null,
            'abastecimento_placa' => $match['placa'] ?? null,
            'abastecimento_data' => $match['data'] ?? null,
            'abastecimento_data_hora' => $match['data_hora'] ?? null,
            'abastecimento_quantidade' => $match['quantidade_litros'] ?? null,
            'abastecimento_valor_por_litro' => $match['valor_por_litro'] ?? null,
            'abastecimento_valor_total' => $match['valor_total'] ?? null,
            'abastecimento_local' => $match['local'] ?? null,
            'abastecimento_sofit_id' => $match['sofit_id'] ?? null,
            'abastecimento_sofit_trip_id' => $match['sofit_trip_id'] ?? null,
            'criterio_vinculo' => $item['criterio_vinculo'] ?? null,
            'diferenca_valor' => $item['diferenca_valor'],
            'diferenca_quantidade' => $item['diferenca_quantidade'],
            'diferenca_dias' => $item['diferenca_dias'] ?? null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function storedResponse(
        ConferenciaVipeImportacao $importacao,
        ?string $month = null,
    ): array {
        $query = ConferenciaVipeItem::query()
            ->where('id_conferencia', $importacao->id_conferencia);
        if ($month) {
            $start = Carbon::createFromFormat('Y-m-d', $month . '-01')->startOfMonth();
            $query->whereBetween('data', [
                $start->toDateString(),
                $start->copy()->endOfMonth()->toDateString(),
            ]);
        }
        $items = $query->orderBy('linha_arquivo')->get();

        return [
            'importacao' => $this->serializeImportacao($importacao),
            'arquivo_origem' => $importacao->arquivo_origem,
            'proprietarios' => $importacao->proprietarios ?? [],
            'local_considerado' => $importacao->local_considerado,
            'placas_cadastradas' => $importacao->placas_cadastradas,
            'linhas_arquivo' => $importacao->linhas_arquivo,
            'linhas_vipe' => $items->count(),
            'linhas_vipe_total' => $importacao->linhas_vipe,
            'linhas_ignoradas_formato' => $importacao->linhas_ignoradas_formato,
            'linhas_outros_proprietarios' => $importacao->linhas_outros_proprietarios,
            'placas_outros_proprietarios' => $importacao->placas_outros_proprietarios ?? [],
            'mes' => $month,
            'meses_disponiveis' => $this->monthsForImport($importacao->id_conferencia),
            'resumo' => $this->summary($items),
            'data' => $items->map(fn (ConferenciaVipeItem $item) => $this->serializeItem($item))->values(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeImportacao(
        ConferenciaVipeImportacao $importacao,
        bool $withSummary = false,
    ): array {
        $serialized = [
            'id_conferencia' => $importacao->id_conferencia,
            'arquivo_origem' => $importacao->arquivo_origem,
            'local_considerado' => $importacao->local_considerado,
            'periodo_inicio' => $importacao->periodo_inicio?->toDateString(),
            'periodo_fim' => $importacao->periodo_fim?->toDateString(),
            'linhas_vipe' => $importacao->linhas_vipe,
            'importado_por' => $importacao->importado_por,
            'importado_em' => $importacao->created_at?->toIso8601String(),
            'meses_disponiveis' => $this->monthsForImport($importacao->id_conferencia),
        ];

        if ($withSummary) {
            $serialized['resumo'] = $this->summary(
                ConferenciaVipeItem::query()
                    ->where('id_conferencia', $importacao->id_conferencia)
                    ->get(),
            );
        }

        return $serialized;
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeItem(ConferenciaVipeItem $item): array
    {
        $checked = (bool) $item->checado;
        $status = $checked ? 'checado' : $item->status_original;
        $statusLabel = $checked ? 'Checado manualmente' : $item->status_label_original;

        return [
            'id_item' => $item->id_item,
            'linha' => $item->linha_arquivo,
            'placa' => $item->placa,
            'data' => $item->data?->toDateString(),
            'data_hora' => $item->data_hora?->toIso8601String(),
            'documento' => $item->documento,
            'codigo_viagem' => $item->codigo_viagem,
            'item' => $item->item,
            'descricao' => $item->descricao,
            'valor_relatorio' => $this->nullableFloat($item->valor_relatorio),
            'quantidade_relatorio' => $this->nullableFloat($item->quantidade_relatorio),
            'status' => $status,
            'status_label' => $statusLabel,
            'status_original' => $item->status_original,
            'status_label_original' => $item->status_label_original,
            'mensagem' => $checked
                ? 'Item checado manualmente. ' . trim((string) $item->observacao_checagem)
                : $item->mensagem_original,
            'mensagem_original' => $item->mensagem_original,
            'abastecimento' => $item->id_abastecimento ? [
                'id_abastecimento' => $item->id_abastecimento,
                'placa' => $item->abastecimento_placa,
                'data' => $item->abastecimento_data?->toDateString(),
                'data_hora' => $item->abastecimento_data_hora?->toIso8601String(),
                'quantidade_litros' => $this->nullableFloat($item->abastecimento_quantidade),
                'valor_por_litro' => $this->nullableFloat($item->abastecimento_valor_por_litro),
                'valor_total' => $this->nullableFloat($item->abastecimento_valor_total),
                'local' => $item->abastecimento_local,
                'sofit_id' => $item->abastecimento_sofit_id,
                'sofit_trip_id' => $item->abastecimento_sofit_trip_id,
            ] : null,
            'diferenca_valor' => $this->nullableFloat($item->diferenca_valor),
            'diferenca_quantidade' => $this->nullableFloat($item->diferenca_quantidade),
            'diferenca_dias' => $item->diferenca_dias,
            'criterio_vinculo' => $item->criterio_vinculo,
            'checado' => $checked,
            'checagem' => $checked ? [
                'por_id' => $item->checado_por_id,
                'por' => $item->checado_por,
                'em' => $item->checado_em?->toIso8601String(),
                'observacao' => $item->observacao_checagem,
            ] : null,
        ];
    }

    /**
     * @return array<string, int|float>
     */
    private function summary(Collection $items): array
    {
        $summary = [
            'total' => $items->count(),
            'ok' => 0,
            'atencao' => 0,
            'pendentes' => 0,
            'checados' => 0,
            'valor_relatorio' => 0.0,
            'valor_sistema' => 0.0,
            'diferenca_valor' => 0.0,
            'quantidade_relatorio' => 0.0,
            'quantidade_sistema' => 0.0,
            'diferenca_quantidade' => 0.0,
        ];

        foreach ($items as $item) {
            if ($item->checado) {
                $summary['checados']++;
            } elseif ($item->status_original === VipeAbastecimentoConferenceService::STATUS_OK) {
                $summary['ok']++;
            } elseif ($item->status_original === VipeAbastecimentoConferenceService::STATUS_ATENCAO) {
                $summary['atencao']++;
            } else {
                $summary['pendentes']++;
            }

            $summary['valor_relatorio'] += (float) ($item->valor_relatorio ?? 0);
            $summary['valor_sistema'] += (float) ($item->abastecimento_valor_total ?? 0);
            $summary['quantidade_relatorio'] += (float) ($item->quantidade_relatorio ?? 0);
            $summary['quantidade_sistema'] += (float) ($item->abastecimento_quantidade ?? 0);
        }

        foreach ([
            'valor_relatorio',
            'valor_sistema',
            'quantidade_relatorio',
            'quantidade_sistema',
        ] as $key) {
            $summary[$key] = round($summary[$key], 2);
        }
        $summary['diferenca_valor'] = round(
            $summary['valor_sistema'] - $summary['valor_relatorio'],
            2,
        );
        $summary['diferenca_quantidade'] = round(
            $summary['quantidade_sistema'] - $summary['quantidade_relatorio'],
            2,
        );

        return $summary;
    }

    /**
     * @return array<int, string>
     */
    private function monthsForImport(string $importId): array
    {
        return DB::table('conferencia_vipe_itens')
            ->where('id_conferencia', $importId)
            ->selectRaw("TO_CHAR(data, 'YYYY-MM') AS mes")
            ->distinct()
            ->orderBy('mes')
            ->pluck('mes')
            ->map(fn ($month) => (string) $month)
            ->values()
            ->all();
    }

    private function validateMonth(mixed $month): ?string
    {
        $value = trim((string) $month);
        if ($value === '') {
            return null;
        }
        if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $value)) {
            abort(422, 'Mês inválido. Use o formato AAAA-MM.');
        }

        return $value;
    }

    private function nullableFloat(mixed $value): ?float
    {
        return $value === null || $value === '' ? null : (float) $value;
    }
}
