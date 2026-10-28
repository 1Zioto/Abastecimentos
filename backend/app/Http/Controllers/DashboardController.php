<?php

namespace App\Http\Controllers;

use App\Models\Abastecimento;
use App\Models\EntradaNota;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
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

        return $query->whereRaw('baixa_abastecimento IS NOT TRUE');
    }

    public function index(Request $request)
    {
        $this->garantirCustoTransporteEntradaNotas();
        $inicio12Meses = now()->startOfMonth()->subMonths(11);
        $fim12Meses = now()->endOfMonth();
        $hoje = now()->toDateString();
        $local = $request->query('local');
        $valorCompraFinalSql = $this->entradaNotaValorCompraFinalSql('entrada_notas');

        $ini = $inicio12Meses->toDateString();
        $fim = $fim12Meses->toDateString();

        // Expressões de pago/pendente (com fallback para bancos sem a coluna),
        // usadas nos FILTER (WHERE ...) abaixo.
        $temColBaixa = $this->tabelaTemColuna('abastecimentos', 'baixa_abastecimento');
        $pagoExpr = $temColBaixa ? 'baixa_abastecimento IS TRUE' : "LOWER(COALESCE(status, '')) = 'pago'";
        $pendExpr = $temColBaixa ? 'baixa_abastecimento IS NOT TRUE' : "LOWER(COALESCE(status, '')) <> 'pago'";

        // Todos os totais do painel em UMA passada na tabela (antes eram 9
        // agregações sequenciais — cada uma pagando latência do banco remoto).
        $tot = $this->abastecimentosAtivos($request, $local)
            ->selectRaw("
                COUNT(*) AS total_abastecimentos,
                COALESCE(SUM(quantidade_litros) FILTER (WHERE data BETWEEN ? AND ?), 0) AS litros_12m,
                COALESCE(SUM(valor_total) FILTER (WHERE data BETWEEN ? AND ?), 0) AS valor_12m,
                COALESCE(SUM(valor_total) FILTER (WHERE {$pendExpr}), 0) AS valor_pendente,
                COALESCE(SUM(valor_total) FILTER (WHERE {$pagoExpr}), 0) AS valor_recebido,
                COALESCE(SUM(quantidade_litros) FILTER (WHERE data = ?), 0) AS litros_hoje,
                COALESCE(SUM(valor_total) FILTER (WHERE data = ?), 0) AS valor_hoje,
                COUNT(*) FILTER (WHERE {$pendExpr}) AS qtd_pendente,
                COUNT(*) FILTER (WHERE {$pagoExpr}) AS qtd_pago,
                COALESCE(SUM(quantidade_litros) FILTER (WHERE {$pendExpr}), 0) AS litros_pendente,
                COALESCE(SUM(quantidade_litros) FILTER (WHERE {$pagoExpr}), 0) AS litros_pago,
                COALESCE(SUM(quantidade_litros), 0) AS litros_total
            ", [$ini, $fim, $ini, $fim, $hoje, $hoje])
            ->first();

        $totalAbastecimentos = (int) ($tot->total_abastecimentos ?? 0);
        $totalLitros = (float) ($tot->litros_12m ?? 0);
        $valorTotalVendido = (float) ($tot->valor_12m ?? 0);
        $valorTotalPendente = (float) ($tot->valor_pendente ?? 0);
        $valorTotalRecebido = (float) ($tot->valor_recebido ?? 0);
        $litrosVendidosHoje = (float) ($tot->litros_hoje ?? 0);
        $valorVendidoHoje = (float) ($tot->valor_hoje ?? 0);
        $totalPendenteBaixa = (int) ($tot->qtd_pendente ?? 0);
        $totalVendidoTanque = (float) ($tot->litros_total ?? 0);

        // Entradas de nota: valor 12 meses + litros totais em uma query.
        // (aplicarFiltroNotasAjusteEntradaNotas é identidade com a constante
        // de números ignorados vazia, mantido pelo mesmo motivo do original.)
        $entradasQuery = $this->entradasAtivas($request, $local);
        $this->aplicarFiltroNotasAjusteEntradaNotas($entradasQuery);
        $ent = $entradasQuery
            ->selectRaw("
                COALESCE(SUM({$valorCompraFinalSql}) FILTER (WHERE data BETWEEN ? AND ?), 0) AS comprado_valor_12m,
                COALESCE(SUM(quantidade), 0) AS comprado_litros_total
            ", [$ini, $fim])
            ->first();
        $valorTotalComprado = (float) ($ent->comprado_valor_12m ?? 0);
        $totalCompradoTanque = (float) ($ent->comprado_litros_total ?? 0);
        $combustivelTanque = $totalCompradoTanque - $totalVendidoTanque;

        // Série mensal (total/pago/pendente) em UM GROUP BY, antes eram três.
        $vendidoMensal = $this->abastecimentosAtivos($request, $local)
            ->selectRaw("
                TO_CHAR(data, 'YYYY-MM') as ym,
                COALESCE(SUM(quantidade_litros), 0) as vendido_litros,
                COALESCE(SUM(valor_total), 0) as vendido_valor,
                COALESCE(SUM(quantidade_litros) FILTER (WHERE {$pagoExpr}), 0) as vendido_litros_pago,
                COALESCE(SUM(valor_total) FILTER (WHERE {$pagoExpr}), 0) as vendido_valor_pago,
                COALESCE(SUM(quantidade_litros) FILTER (WHERE {$pendExpr}), 0) as vendido_litros_pendente,
                COALESCE(SUM(valor_total) FILTER (WHERE {$pendExpr}), 0) as vendido_valor_pendente
            ")
            ->whereBetween('data', [$ini, $fim])
            ->groupBy('ym')
            ->get()
            ->keyBy('ym');

        $compradoPorMes = $this->entradasAtivas($request, $local)
            ->selectRaw("TO_CHAR(data, 'YYYY-MM') as ym, COALESCE(SUM(quantidade), 0) as comprado_litros, COALESCE(SUM({$valorCompraFinalSql}), 0) as comprado_valor")
            ->whereBetween('data', [$ini, $fim])
            ->groupBy('ym');
        $this->aplicarFiltroNotasAjusteEntradaNotas($compradoPorMes);
        $compradoPorMes = $compradoPorMes->get()->keyBy('ym');

        $comparativo12Meses = collect();
        for ($i = 0; $i < 12; $i++) {
            $ref = $inicio12Meses->copy()->addMonths($i);
            $key = $ref->format('Y-m');
            $comprado = $compradoPorMes->get($key);
            $vendido = $vendidoMensal->get($key);
            $comparativo12Meses->push([
                'mes_ref' => $key,
                'label' => $ref->format('m/y'),
                'comprado_litros' => round((float) ($comprado->comprado_litros ?? 0), 2),
                'comprado_valor' => round((float) ($comprado->comprado_valor ?? 0), 2),
                'vendido_litros' => round((float) ($vendido->vendido_litros ?? 0), 2),
                'vendido_valor' => round((float) ($vendido->vendido_valor ?? 0), 2),
                'vendido_litros_pago' => round((float) ($vendido->vendido_litros_pago ?? 0), 2),
                'vendido_valor_pago' => round((float) ($vendido->vendido_valor_pago ?? 0), 2),
                'vendido_litros_pendente' => round((float) ($vendido->vendido_litros_pendente ?? 0), 2),
                'vendido_valor_pendente' => round((float) ($vendido->vendido_valor_pendente ?? 0), 2),
            ]);
        }

        // Resumo por status derivado da mesma agregação única de totais.
        $statusResumo = [
            [
                'status' => 'Pendente',
                'total' => (int) ($tot->qtd_pendente ?? 0),
                'valor_total' => round((float) ($tot->valor_pendente ?? 0), 2),
                'litros_total' => round((float) ($tot->litros_pendente ?? 0), 2),
            ],
            [
                'status' => 'Pago',
                'total' => (int) ($tot->qtd_pago ?? 0),
                'valor_total' => round((float) ($tot->valor_recebido ?? 0), 2),
                'litros_total' => round((float) ($tot->litros_pago ?? 0), 2),
            ],
        ];

        $topProprietarios = $this->abastecimentosAtivos($request, $local)
            ->selectRaw("id_proprietario, nome_proprietario, COUNT(*) as total, SUM(valor_total) as valor")
            ->whereBetween('data', [$inicio12Meses->toDateString(), $fim12Meses->toDateString()])
            ->groupBy('id_proprietario','nome_proprietario')
            ->orderByDesc('valor')
            ->limit(5)
            ->get();

        // ── Alerta: clientes com valores em aberto há mais de 30 dias ──
        $corte30 = now()->subDays(30)->toDateString();
        $emAberto30Query = $this->aplicarFiltroPendenteBaixa(
            $this->abastecimentosAtivos($request, $local)
        );
        $emAberto30 = $emAberto30Query
            ->whereDate('data', '<', $corte30)
            ->selectRaw("id_proprietario, COALESCE(nome_proprietario, 'Sem proprietário') as nome_proprietario, COUNT(*) as total, COALESCE(SUM(valor_total), 0) as valor, MIN(data) as mais_antigo")
            ->groupBy('id_proprietario', 'nome_proprietario')
            ->orderByDesc('valor')
            ->limit(30)
            ->get()
            ->map(function ($row) {
                $dias = null;
                try {
                    $dias = (int) now()->diffInDays(\Carbon\Carbon::parse($row->mais_antigo));
                } catch (\Throwable $e) {
                }
                return [
                    'id_proprietario' => $row->id_proprietario,
                    'nome_proprietario' => $row->nome_proprietario,
                    'total' => (int) $row->total,
                    'valor' => round((float) $row->valor, 2),
                    'mais_antigo' => $row->mais_antigo,
                    'dias_mais_antigo' => $dias,
                ];
            })
            ->values();

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
            'alerta_em_aberto_30_dias' => $emAberto30,
        ]);
    }
}
