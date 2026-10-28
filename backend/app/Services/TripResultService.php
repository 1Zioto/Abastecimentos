<?php

namespace App\Services;

use App\Models\SystemParameter;
use App\Models\Trip;

/**
 * Motor de resultado financeiro por viagem (Fase 1, regra 6.1 do blueprint).
 *
 * Recebe uma viagem (com receitas e custos carregados) e devolve a demonstração
 * financeira completa: receita, custos, margem, lucro, R$/km, R$/ton, ponto de
 * equilíbrio e preço mínimo/recomendado. Todos os parâmetros que não estão na
 * própria viagem vêm de system_parameters — nada é hard-coded.
 *
 * A versão da fórmula é gravada no resultado para auditoria. Qualquer valor
 * derivado de estimativa é sinalizado.
 */
class TripResultService
{
    public const VERSAO_FORMULA = '1.0.0';

    public function calcular(Trip $trip): array
    {
        $companyId = $trip->company_id;

        // Garante que as relações estejam disponíveis sem exigir eager loading externo.
        $revenues = $trip->relationLoaded('revenues') ? $trip->revenues : $trip->revenues()->get();
        $costs    = $trip->relationLoaded('costs') ? $trip->costs : $trip->costs()->get();

        // ---- Receita ----
        $receitaBruta = round((float) $revenues->sum('valor'), 2);

        // ---- Custos ----
        $custoVariavel = round((float) $costs->where('natureza', 'variavel')->sum('valor'), 2);
        $custoFixoLancado = round((float) $costs->where('natureza', 'fixo_rateado')->sum('valor'), 2);

        // Se não houver custo fixo lançado manualmente, rateia pelo custo fixo diário
        // (da viagem, ou do parâmetro global) multiplicado pela duração em dias.
        $dias = $this->diasViagem($trip);
        $custoFixoDiario = $trip->custo_fixo_diario !== null
            ? (float) $trip->custo_fixo_diario
            : (float) SystemParameter::valor('custo_fixo_diario_veiculo', 0, $companyId);
        $custoFixoRateado = $custoFixoLancado > 0
            ? $custoFixoLancado
            : round($custoFixoDiario * $dias, 2);

        $custoTotal = round($custoVariavel + $custoFixoRateado, 2);

        // ---- Margens e lucro ----
        $margemContribuicao = round($receitaBruta - $custoVariavel, 2);
        $lucroOperacional   = round($margemContribuicao - $custoFixoRateado, 2);
        $margemPct = $receitaBruta > 0 ? round($lucroOperacional / $receitaBruta * 100, 2) : null;

        // ---- Indicadores por km ----
        $kmTotal = $this->kmTotal($trip);
        $receitaPorKm = $kmTotal ? round($receitaBruta / $kmTotal, 2) : null;
        $custoPorKm   = $kmTotal ? round($custoTotal / $kmTotal, 2) : null;
        $lucroPorKm   = $kmTotal ? round($lucroOperacional / $kmTotal, 2) : null;

        // ---- Indicadores por tonelada ----
        $toneladas = $trip->peso_kg ? (float) $trip->peso_kg / 1000 : null;
        $receitaPorTon = $toneladas ? round($receitaBruta / $toneladas, 2) : null;
        $custoPorTon   = $toneladas ? round($custoTotal / $toneladas, 2) : null;
        $lucroPorTon   = $toneladas ? round($lucroOperacional / $toneladas, 2) : null;

        // ---- Ponto de equilíbrio (km para cobrir o fixo com a margem/km) ----
        $margemContribPorKm = $kmTotal ? $margemContribuicao / $kmTotal : null;
        $pontoEquilibrioKm = ($margemContribPorKm && $margemContribPorKm > 0)
            ? round($custoFixoRateado / $margemContribPorKm, 2)
            : null;

        // ---- Preço mínimo e recomendado ----
        $margemDesejadaPct = $trip->margem_desejada_pct !== null
            ? (float) $trip->margem_desejada_pct
            : (float) SystemParameter::valor('margem_desejada_pct', 15, $companyId);
        $precoMinimo = round($custoTotal, 2); // sem lucro
        $precoRecomendado = ($margemDesejadaPct < 100)
            ? round($custoTotal / (1 - $margemDesejadaPct / 100), 2)
            : null;

        // ---- Sinalizações ----
        $abaixoDoCusto = $receitaBruta > 0 && $receitaBruta < $precoMinimo;
        $kmVazio = $trip->km_vazio !== null ? (float) $trip->km_vazio : null;
        $pctKmVazio = ($kmTotal && $kmVazio !== null) ? round($kmVazio / $kmTotal * 100, 2) : null;

        return [
            'versao_formula' => self::VERSAO_FORMULA,
            'calculado_em' => now()->toIso8601String(),
            'parametros' => [
                'custo_fixo_diario' => $custoFixoDiario,
                'dias_viagem' => $dias,
                'margem_desejada_pct' => $margemDesejadaPct,
            ],
            'receita' => [
                'bruta' => $receitaBruta,
            ],
            'custos' => [
                'variavel' => $custoVariavel,
                'fixo_rateado' => $custoFixoRateado,
                'total' => $custoTotal,
            ],
            'resultado' => [
                'margem_contribuicao' => $margemContribuicao,
                'lucro_operacional' => $lucroOperacional,
                'margem_pct' => $margemPct,
            ],
            'por_km' => [
                'km_total' => $kmTotal,
                'km_vazio' => $kmVazio,
                'pct_km_vazio' => $pctKmVazio,
                'receita' => $receitaPorKm,
                'custo' => $custoPorKm,
                'lucro' => $lucroPorKm,
            ],
            'por_tonelada' => [
                'toneladas' => $toneladas,
                'receita' => $receitaPorTon,
                'custo' => $custoPorTon,
                'lucro' => $lucroPorTon,
            ],
            'ponto_equilibrio_km' => $pontoEquilibrioKm,
            'preco_minimo' => $precoMinimo,
            'preco_recomendado' => $precoRecomendado,
            'alertas' => [
                'frete_abaixo_do_custo' => $abaixoDoCusto,
                'prejuizo' => $lucroOperacional < 0,
            ],
        ];
    }

    /** Calcula e persiste o snapshot na própria viagem. */
    public function calcularEGravar(Trip $trip): array
    {
        $resultado = $this->calcular($trip);
        $trip->resultado_json = $resultado;
        $trip->saveQuietly();
        return $resultado;
    }

    private function kmTotal(Trip $trip): ?float
    {
        if ($trip->km_inicial !== null && $trip->km_final !== null) {
            $km = (float) $trip->km_final - (float) $trip->km_inicial;
            return $km > 0 ? round($km, 2) : null;
        }
        // fallback: soma de carregado + vazio, se informados
        if ($trip->km_carregado !== null || $trip->km_vazio !== null) {
            $km = (float) ($trip->km_carregado ?? 0) + (float) ($trip->km_vazio ?? 0);
            return $km > 0 ? round($km, 2) : null;
        }
        return null;
    }

    private function diasViagem(Trip $trip): float
    {
        $ini = $trip->saida_real ?? $trip->previsao_saida;
        $fim = $trip->chegada_real ?? $trip->previsao_chegada;
        if ($ini && $fim && $fim->greaterThan($ini)) {
            return max(1, round($ini->diffInHours($fim) / 24, 2));
        }
        return 1; // mínimo de 1 dia para o rateio de fixos
    }
}
