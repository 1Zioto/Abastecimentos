<?php

namespace App\Http\Controllers;

use App\Models\Abastecimento;
use App\Models\EntradaNota;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    private const STATUS_BAIXA_CASE = "
        CASE
            WHEN COALESCE(baixa_abastecimento, false) = true THEN 'Pago'
            ELSE 'Pendente'
        END
    ";

    private function applyLocal($query, ?string $local)
    {
        $user = auth()->user();
        if (!$user) {
            abort(401, 'Não autenticado.');
        }
        $permitidas = method_exists($user, 'filiaisAcesso') ? $user->filiaisAcesso() : ['Matriz', 'Viana'];
        return $this->aplicarFiltroLocalPermitido(
            $query,
            $query->getModel()->getTable(),
            $permitidas,
            $local
        );
    }

    private function abastecimentosAtivos(Request $request, ?string $local)
    {
        $query = $this->applyLocal(Abastecimento::query(), $local);
        return $this->aplicarFiltroAtivos($query, 'abastecimentos', $request);
    }

    private function entradasAtivas(Request $request, ?string $local)
    {
        $query = $this->applyLocal(EntradaNota::query(), $local);
        return $this->aplicarFiltroAtivos($query, 'entrada_notas', $request);
    }

    private function aplicarFiltroPendenteBaixa($query)
    {
        if (!$this->tabelaTemColuna('abastecimentos', 'baixa_abastecimento')) {
            return $query->whereRaw("LOWER(COALESCE(status, '')) <> 'pago'");
        }

        return $query->whereRaw('COALESCE(baixa_abastecimento, false) = false');
    }

    private function aplicarFiltroBaixado($query)
    {
        if (!$this->tabelaTemColuna('abastecimentos', 'baixa_abastecimento')) {
            return $query->whereRaw("LOWER(COALESCE(status, '')) = 'pago'");
        }

        return $query->whereRaw('COALESCE(baixa_abastecimento, false) = true');
    }

    public function index(Request $request)
    {
        $this->garantirCustoTransporteEntradaNotas();
        $inicio12Meses = now()->startOfMonth()->subMonths(11);
        $fim12Meses = now()->endOfMonth();
        $hoje = now()->toDateString();
        $local = $request->query('local');
        $valorCompraFinalSql = $this->entradaNotaValorCompraFinalSql('entrada_notas');

        $totalAbastecimentos = (int) $this->abastecimentosAtivos($request, $local)->count();
        $totalLitros = (float) $this->abastecimentosAtivos($request, $local)
            ->whereBetween('data', [$inicio12Meses->toDateString(), $fim12Meses->toDateString()])
            ->sum('quantidade_litros');
        $valorTotalVendido = (float) $this->abastecimentosAtivos($request, $local)
            ->whereBetween('data', [$inicio12Meses->toDateString(), $fim12Meses->toDateString()])
            ->sum('valor_total');
        $comprasFinanceiras = $this->entradasAtivas($request, $local)
            ->whereBetween('data', [$inicio12Meses->toDateString(), $fim12Meses->toDateString()]);
        $this->aplicarFiltroNotasAjusteEntradaNotas($comprasFinanceiras);
        $valorTotalComprado = (float) $comprasFinanceiras
            ->selectRaw("COALESCE(SUM({$valorCompraFinalSql}), 0) as valor")
            ->value('valor');
        $valorTotalPendente = (float) $this->aplicarFiltroPendenteBaixa(
            $this->abastecimentosAtivos($request, $local)
        )->sum('valor_total');
        $valorTotalRecebido = (float) $this->aplicarFiltroBaixado(
            $this->abastecimentosAtivos($request, $local)
        )->sum('valor_total');
        $litrosVendidosHoje = (float) $this->abastecimentosAtivos($request, $local)
            ->whereDate('data', $hoje)
            ->sum('quantidade_litros');
        $valorVendidoHoje = (float) $this->abastecimentosAtivos($request, $local)
            ->whereDate('data', $hoje)
            ->sum('valor_total');
        $totalPendenteBaixa = (int) $this->aplicarFiltroPendenteBaixa(
            $this->abastecimentosAtivos($request, $local)
        )->count();
        $totalCompradoTanque = (float) $this->entradasAtivas($request, $local)
            ->sum('quantidade');
        $totalVendidoTanque = (float) $this->abastecimentosAtivos($request, $local)
            ->sum('quantidade_litros');
        $combustivelTanque = $totalCompradoTanque - $totalVendidoTanque;

        $vendidoPorMes = $this->abastecimentosAtivos($request, $local)
            ->selectRaw("TO_CHAR(data, 'YYYY-MM') as ym, COALESCE(SUM(quantidade_litros), 0) as vendido_litros, COALESCE(SUM(valor_total), 0) as vendido_valor")
            ->whereBetween('data', [$inicio12Meses->toDateString(), $fim12Meses->toDateString()])
            ->groupBy('ym')
            ->get()
            ->keyBy('ym');

        $vendidoPagoPorMes = $this->abastecimentosAtivos($request, $local)
            ->selectRaw("TO_CHAR(data, 'YYYY-MM') as ym, COALESCE(SUM(quantidade_litros), 0) as vendido_litros_pago, COALESCE(SUM(valor_total), 0) as vendido_valor_pago")
            ->whereBetween('data', [$inicio12Meses->toDateString(), $fim12Meses->toDateString()])
            ->groupBy('ym');
        $this->aplicarFiltroBaixado($vendidoPagoPorMes);
        $vendidoPagoPorMes = $vendidoPagoPorMes->get()
            ->keyBy('ym');

        $vendidoPendentePorMes = $this->abastecimentosAtivos($request, $local)
            ->selectRaw("TO_CHAR(data, 'YYYY-MM') as ym, COALESCE(SUM(quantidade_litros), 0) as vendido_litros_pendente, COALESCE(SUM(valor_total), 0) as vendido_valor_pendente")
            ->whereBetween('data', [$inicio12Meses->toDateString(), $fim12Meses->toDateString()])
            ->groupBy('ym');
        $this->aplicarFiltroPendenteBaixa($vendidoPendentePorMes);
        $vendidoPendentePorMes = $vendidoPendentePorMes->get()
            ->keyBy('ym');

        $compradoPorMes = $this->entradasAtivas($request, $local)
            ->selectRaw("TO_CHAR(data, 'YYYY-MM') as ym, COALESCE(SUM(quantidade), 0) as comprado_litros, COALESCE(SUM({$valorCompraFinalSql}), 0) as comprado_valor")
            ->whereBetween('data', [$inicio12Meses->toDateString(), $fim12Meses->toDateString()])
            ->groupBy('ym');
        $this->aplicarFiltroNotasAjusteEntradaNotas($compradoPorMes);
        $compradoPorMes = $compradoPorMes->get()->keyBy('ym');

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

        $statusGeral = $this->abastecimentosAtivos($request, $local)
            ->selectRaw(self::STATUS_BAIXA_CASE . ' as status')
            ->selectRaw('COUNT(*) as total, COALESCE(SUM(valor_total), 0) as valor_total, COALESCE(SUM(quantidade_litros), 0) as litros_total')
            ->groupByRaw(self::STATUS_BAIXA_CASE)
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

        $topProprietarios = $this->abastecimentosAtivos($request, $local)
            ->selectRaw("id_proprietario, nome_proprietario, COUNT(*) as total, SUM(valor_total) as valor")
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
                'valor_total_comprado' => round($valorTotalComprado, 2),
                'valor_total_vendido' => round($valorTotalVendido, 2),
                'valor_total_pendente_baixa' => round($valorTotalPendente, 2),
                'valor_total_recebido' => round($valorTotalRecebido, 2),
                'litros_vendidos_hoje' => round($litrosVendidosHoje, 2),
                'valor_vendido_hoje' => round($valorVendidoHoje, 2),
                'combustivel_comprado_litros' => round($totalCompradoTanque, 2),
                'combustivel_vendido_litros' => round($totalVendidoTanque, 2),
                'combustivel_tanque_litros' => round($combustivelTanque, 2),
            ],
            'comparativo_12_meses' => $comparativo12Meses,
            'status_resumo' => $statusResumo,
            'top_proprietarios' => $topProprietarios,
        ]);
    }
}
