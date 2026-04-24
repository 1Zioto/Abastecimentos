<?php

namespace App\Http\Controllers;

use App\Models\Abastecimento;
use App\Models\EntradaNota;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $inicio12Meses = now()->startOfMonth()->subMonths(11);
        $fim12Meses = now()->endOfMonth();

        $totalAbastecimentos = Abastecimento::count();
        $totalLitros = (float) Abastecimento::whereBetween('data', [$inicio12Meses->toDateString(), $fim12Meses->toDateString()])->sum('quantidade_litros');
        $valorTotalVendido = (float) Abastecimento::whereBetween('data', [$inicio12Meses->toDateString(), $fim12Meses->toDateString()])->sum('valor_total');
        $valorTotalPendente = (float) Abastecimento::query()
            ->whereRaw("LOWER(COALESCE(status, '')) = 'pendente'")
            ->sum('valor_total');
        $valorTotalRecebido = (float) Abastecimento::query()
            ->whereRaw("LOWER(COALESCE(status, '')) = 'pago'")
            ->sum('valor_total');
        $totalPendenteBaixa = (int) Abastecimento::query()
            ->whereRaw("LOWER(COALESCE(status, '')) = 'pendente'")
            ->count();

        $vendidoPorMes = Abastecimento::query()
            ->selectRaw("TO_CHAR(data, 'YYYY-MM') as ym, COALESCE(SUM(quantidade_litros), 0) as vendido_litros, COALESCE(SUM(valor_total), 0) as vendido_valor")
            ->whereBetween('data', [$inicio12Meses->toDateString(), $fim12Meses->toDateString()])
            ->groupBy('ym')
            ->get()
            ->keyBy('ym');

        $vendidoPagoPorMes = Abastecimento::query()
            ->selectRaw("TO_CHAR(data, 'YYYY-MM') as ym, COALESCE(SUM(quantidade_litros), 0) as vendido_litros_pago, COALESCE(SUM(valor_total), 0) as vendido_valor_pago")
            ->whereRaw("LOWER(COALESCE(status, '')) = 'pago'")
            ->whereBetween('data', [$inicio12Meses->toDateString(), $fim12Meses->toDateString()])
            ->groupBy('ym')
            ->get()
            ->keyBy('ym');

        $vendidoPendentePorMes = Abastecimento::query()
            ->selectRaw("TO_CHAR(data, 'YYYY-MM') as ym, COALESCE(SUM(quantidade_litros), 0) as vendido_litros_pendente, COALESCE(SUM(valor_total), 0) as vendido_valor_pendente")
            ->whereRaw("LOWER(COALESCE(status, '')) = 'pendente'")
            ->whereBetween('data', [$inicio12Meses->toDateString(), $fim12Meses->toDateString()])
            ->groupBy('ym')
            ->get()
            ->keyBy('ym');

        $compradoPorMes = EntradaNota::query()
            ->selectRaw("TO_CHAR(data, 'YYYY-MM') as ym, COALESCE(SUM(quantidade), 0) as comprado_litros, COALESCE(SUM(valor), 0) as comprado_valor")
            ->whereBetween('data', [$inicio12Meses->toDateString(), $fim12Meses->toDateString()])
            ->groupBy('ym')
            ->get()
            ->keyBy('ym');

        $comparativo12Meses = collect();
        for ($i = 0; $i < 12; $i++) {
            $ref = $inicio12Meses->copy()->addMonths($i);
            $key = $ref->format('Y-m');
            $comprado = $compradoPorMes->get($key);
            $vendido = $vendidoPorMes->get($key);
            $vendidoPago = $vendidoPagoPorMes->get($key);
            $vendidoPendente = $vendidoPendentePorMes->get($key);
            $comparativo12Meses->push([
                'mes_ref' => $key,
                'label' => $ref->format('m/y'),
                'comprado_litros' => round((float) ($comprado->comprado_litros ?? 0), 2),
                'comprado_valor' => round((float) ($comprado->comprado_valor ?? 0), 2),
                'vendido_litros' => round((float) ($vendido->vendido_litros ?? 0), 2),
                'vendido_valor' => round((float) ($vendido->vendido_valor ?? 0), 2),
                'vendido_litros_pago' => round((float) ($vendidoPago->vendido_litros_pago ?? 0), 2),
                'vendido_valor_pago' => round((float) ($vendidoPago->vendido_valor_pago ?? 0), 2),
                'vendido_litros_pendente' => round((float) ($vendidoPendente->vendido_litros_pendente ?? 0), 2),
                'vendido_valor_pendente' => round((float) ($vendidoPendente->vendido_valor_pendente ?? 0), 2),
            ]);
        }

        $statusGeral = Abastecimento::query()
            ->selectRaw("
                CASE
                    WHEN LOWER(COALESCE(status, '')) = 'pago' THEN 'Pago'
                    WHEN LOWER(COALESCE(status, '')) = 'pendente' THEN 'Pendente'
                END as status
            ")
            ->selectRaw('COUNT(*) as total, COALESCE(SUM(valor_total), 0) as valor_total, COALESCE(SUM(quantidade_litros), 0) as litros_total')
            ->whereIn(DB::raw("LOWER(COALESCE(status, ''))"), ['pendente', 'pago'])
            ->groupBy('status')
            ->get()
            ->keyBy('status');

        $statusResumo = [
            [
                'status' => 'Pendente',
                'total' => (int) ($statusGeral->get('Pendente')->total ?? 0),
                'valor_total' => round((float) ($statusGeral->get('Pendente')->valor_total ?? 0), 2),
                'litros_total' => round((float) ($statusGeral->get('Pendente')->litros_total ?? 0), 2),
            ],
            [
                'status' => 'Pago',
                'total' => (int) ($statusGeral->get('Pago')->total ?? 0),
                'valor_total' => round((float) ($statusGeral->get('Pago')->valor_total ?? 0), 2),
                'litros_total' => round((float) ($statusGeral->get('Pago')->litros_total ?? 0), 2),
            ],
        ];

        $topProprietarios = Abastecimento::selectRaw("id_proprietario, nome_proprietario, COUNT(*) as total, SUM(valor_total) as valor")
            ->whereBetween('data', [$inicio12Meses->toDateString(), $fim12Meses->toDateString()])
            ->groupBy('id_proprietario','nome_proprietario')
            ->orderByDesc('valor')
            ->limit(5)
            ->get();

        return new \Illuminate\Http\JsonResponse([
            'totais' => [
                'abastecimentos' => $totalAbastecimentos,
                'litros'         => round($totalLitros, 2),
                'valor'          => round($valorTotalVendido, 2),
                'pendente_baixa' => $totalPendenteBaixa,
                'valor_total_vendido' => round($valorTotalVendido, 2),
                'valor_total_pendente_baixa' => round($valorTotalPendente, 2),
                'valor_total_recebido' => round($valorTotalRecebido, 2),
            ],
            'comparativo_12_meses' => $comparativo12Meses,
            'status_resumo' => $statusResumo,
            'top_proprietarios' => $topProprietarios,
        ]);
    }
}
