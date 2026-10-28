<?php

namespace App\Services;

use App\Models\Abastecimento;
use App\Models\Trip;
use Illuminate\Support\Facades\DB;

/**
 * Casa abastecimentos (já existentes no banco) com viagens e lança o valor como
 * custo de combustível da viagem (trip_costs, categoria=combustivel).
 *
 * Regra (blueprint seção 13): um abastecimento pertence à viagem do MESMO veículo
 * cuja janela [saída, chegada] contém a data/hora do abastecimento. Idempotente:
 * relançar não duplica — os custos de origem 'abastecimento' são recriados.
 */
class FuelingTripMatchService
{
    public function __construct(private TripResultService $resultService)
    {
    }

    /**
     * Vincula os abastecimentos de UMA viagem e recalcula o resultado.
     * @return array{vinculados:int, valor_total:float}
     */
    public function vincularViagem(Trip $trip): array
    {
        $ini = $trip->saida_real ?? $trip->previsao_saida;
        $fim = $trip->chegada_real ?? $trip->previsao_chegada;
        if (!$trip->vehicle_id || !$ini || !$fim) {
            return ['vinculados' => 0, 'valor_total' => 0.0];
        }

        $abastecimentos = Abastecimento::query()
            ->whereNull('deleted_at')
            ->where('id_veiculo', $trip->vehicle_id)
            ->whereBetween('data_hora', [$ini, $fim])
            ->get();

        return DB::transaction(function () use ($trip, $abastecimentos) {
            // Idempotência: remove os custos de combustível vindos de abastecimento
            $trip->costs()->where('origem', 'abastecimento')->delete();

            $valorTotal = 0.0;
            foreach ($abastecimentos as $a) {
                $valor = (float) $a->valor_total;
                $valorTotal += $valor;
                $trip->costs()->create([
                    'categoria' => 'combustivel',
                    'natureza' => 'variavel',
                    'descricao' => trim(($a->local ?? 'Posto') . ' · ' .
                        number_format((float) $a->quantidade_litros, 2, ',', '.') . ' L'),
                    'valor' => $valor,
                    'origem' => 'abastecimento',
                    'ref_id' => $a->id_abastecimento,
                ]);
            }

            $this->resultService->calcularEGravar($trip->load(['revenues', 'costs']));

            return ['vinculados' => $abastecimentos->count(), 'valor_total' => round($valorTotal, 2)];
        });
    }

    /**
     * Vincula em lote as viagens de um período (por previsão de saída).
     * @return array{viagens:int, vinculados:int, valor_total:float}
     */
    public function vincularPeriodo(?string $inicio, ?string $fim, ?string $companyId = null): array
    {
        $q = Trip::query();
        if ($companyId) $q->where('company_id', $companyId);
        if ($inicio) $q->where('previsao_saida', '>=', $inicio . ' 00:00:00');
        if ($fim) $q->where('previsao_saida', '<=', $fim . ' 23:59:59');

        $totViagens = 0; $totVinc = 0; $totValor = 0.0;
        $q->chunkById(100, function ($viagens) use (&$totViagens, &$totVinc, &$totValor) {
            foreach ($viagens as $trip) {
                $r = $this->vincularViagem($trip);
                $totViagens++;
                $totVinc += $r['vinculados'];
                $totValor += $r['valor_total'];
            }
        });

        return ['viagens' => $totViagens, 'vinculados' => $totVinc, 'valor_total' => round($totValor, 2)];
    }
}
