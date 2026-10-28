<?php

namespace App\Http\Controllers;

use App\Models\Trip;
use App\Services\TelemetryCostService;
use Illuminate\Http\Request;

/**
 * Indicadores de telemetria convertidos em R$ (marcha lenta, etc.) e o painel
 * "Dinheiro perdido hoje" (Fase 2 do Sistema de Rentabilidade).
 */
class TelemetryCostController extends Controller
{
    public function __construct(private TelemetryCostService $telemetry)
    {
    }

    /** GET /api/v1/telemetria/marcha-lenta?placa=XXX&inicio=YYYY-MM-DD&fim=YYYY-MM-DD */
    public function marchaLenta(Request $request)
    {
        $request->validate([
            'placa' => ['required', 'string'],
            'inicio' => ['required', 'date'],
            'fim' => ['required', 'date'],
        ]);
        $ini = $request->inicio . ' 00:00:00-03';
        $fim = $request->fim . ' 23:59:59-03';
        return response()->json(
            $this->telemetry->marchaLentaFinanceira($request->placa, $ini, $fim)
        );
    }

    /** GET /api/v1/trips/{trip}/marcha-lenta — marcha lenta em R$ da viagem. */
    public function marchaLentaViagem(Trip $trip)
    {
        $trip->load('veiculo');
        $r = $this->telemetry->marchaLentaDaViagem($trip);
        if ($r === null) {
            return response()->json(['message' => 'Viagem sem placa ou sem janela de datas para calcular.'], 422);
        }
        return response()->json($r);
    }

    /**
     * GET /api/v1/dinheiro-perdido?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
     * Agrega, por veículo, o desperdício estimado de marcha lenta no período.
     * (Primeira fonte do painel "Dinheiro perdido"; outras fontes entram nas próximas fases.)
     */
    public function dinheiroPerdido(Request $request)
    {
        $request->validate([
            'inicio' => ['required', 'date'],
            'fim' => ['required', 'date'],
        ]);
        $ini = $request->inicio . ' 00:00:00-03';
        $fim = $request->fim . ' 23:59:59-03';

        $placas = \DB::table('veiculos')->whereNull('deleted_at')
            ->whereNotNull('placa')->pluck('placa');

        $itens = [];
        $total = 0.0;
        foreach ($placas as $placa) {
            $r = $this->telemetry->marchaLentaFinanceira($placa, $ini, $fim);
            if ($r['custo'] > 0) {
                $itens[] = [
                    'origem' => 'marcha_lenta',
                    'placa' => $r['placa'],
                    'horas' => $r['horas'],
                    'litros' => $r['litros'],
                    'valor_estimado' => $r['custo'],
                    'nivel_confianca' => 'estimado',
                    'metodo' => 'horas_marcha_lenta × consumo_lph × preço_diesel',
                    'acao_recomendada' => 'Orientar motorista a desligar o motor em paradas longas',
                ];
                $total += $r['custo'];
            }
        }
        usort($itens, fn ($a, $b) => $b['valor_estimado'] <=> $a['valor_estimado']);

        return response()->json([
            'periodo' => ['inicio' => $request->inicio, 'fim' => $request->fim],
            'total_estimado' => round($total, 2),
            'itens' => $itens,
        ]);
    }
}
