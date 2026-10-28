<?php

namespace App\Services;

use App\Models\SystemParameter;
use App\Models\Trip;
use Illuminate\Support\Facades\DB;

/**
 * Converte indicadores de telemetria (banco Sascar) em valores financeiros.
 * Diferencial do produto: em vez de "4 h em marcha lenta", mostra também
 * "~12 L → R$ 76,80 (estimado)".
 *
 * A telemetria vem da conexão 'sascar' (tabela posicoes). Todos os fatores de
 * conversão são parâmetros configuráveis (system_parameters).
 */
class TelemetryCostService
{
    /** Intervalo máximo entre duas posições para contar como marcha lenta contínua. */
    private const GAP_MAX_SEGUNDOS = 1800; // 30 min — acima disso é lacuna de sinal

    private function placaNormalizada(string $placa): string
    {
        $base = preg_replace('/-\d+$/', '', strtoupper(trim($placa))) ?? '';
        return preg_replace('/[^A-Z0-9]/', '', $base) ?? '';
    }

    /**
     * Segundos em marcha lenta (motor ligado e veículo parado) no período,
     * somando os intervalos entre posições consecutivas com ignição=1 e vel=0.
     */
    public function marchaLentaSegundos(string $placa, string $inicioIso, string $fimIso): int
    {
        $norm = $this->placaNormalizada($placa);
        if ($norm === '') return 0;

        $row = DB::connection('sascar')->selectOne(
            <<<SQL
            WITH seq AS (
                SELECT data_posicao, ignicao, velocidade,
                       LEAD(data_posicao) OVER (ORDER BY data_posicao) AS prox
                FROM posicoes
                WHERE regexp_replace(regexp_replace(upper(placa), '-[0-9]+\$', ''), '[^A-Z0-9]', '', 'g') = ?
                  AND data_posicao >= ?::timestamptz
                  AND data_posicao <= ?::timestamptz
            )
            SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (prox - data_posicao))), 0) AS segundos
            FROM seq
            WHERE ignicao = 1 AND velocidade = 0 AND prox IS NOT NULL
              AND EXTRACT(EPOCH FROM (prox - data_posicao)) <= ?
            SQL,
            [$norm, $inicioIso, $fimIso, self::GAP_MAX_SEGUNDOS]
        );

        return (int) round($row->segundos ?? 0);
    }

    /**
     * Converte segundos de marcha lenta em desperdício financeiro (estimado).
     * @return array{horas:float, litros:float, custo:float, estimado:bool, parametros:array}
     */
    public function converterMarchaLenta(int $segundos, ?string $companyId = null): array
    {
        $horas = round($segundos / 3600, 2);
        $consumoLph = (float) SystemParameter::valor('consumo_marcha_lenta_lph', 3.0, $companyId);
        $precoDiesel = (float) SystemParameter::valor('preco_medio_diesel', 6.20, $companyId);

        $litros = round($horas * $consumoLph, 2);
        $custo = round($litros * $precoDiesel, 2);

        return [
            'horas' => $horas,
            'litros' => $litros,
            'custo' => $custo,
            'estimado' => true,
            'parametros' => [
                'consumo_marcha_lenta_lph' => $consumoLph,
                'preco_medio_diesel' => $precoDiesel,
            ],
        ];
    }

    /** Marcha lenta em R$ para uma placa e período. */
    public function marchaLentaFinanceira(string $placa, string $inicioIso, string $fimIso, ?string $companyId = null): array
    {
        $segundos = $this->marchaLentaSegundos($placa, $inicioIso, $fimIso);
        return array_merge(
            ['placa' => strtoupper($placa), 'segundos' => $segundos],
            $this->converterMarchaLenta($segundos, $companyId)
        );
    }

    /** Marcha lenta em R$ para uma viagem (usa placa do veículo e janela da viagem). */
    public function marchaLentaDaViagem(Trip $trip): ?array
    {
        $placa = optional($trip->veiculo)->placa;
        $ini = $trip->saida_real ?? $trip->previsao_saida;
        $fim = $trip->chegada_real ?? $trip->previsao_chegada;
        if (!$placa || !$ini || !$fim) return null;

        return $this->marchaLentaFinanceira(
            $placa,
            $ini->copy()->timezone('America/Sao_Paulo')->format('Y-m-d H:i:sP'),
            $fim->copy()->timezone('America/Sao_Paulo')->format('Y-m-d H:i:sP'),
            $trip->company_id
        );
    }
}
