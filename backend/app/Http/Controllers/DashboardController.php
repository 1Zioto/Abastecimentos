<?php

namespace App\Http\Controllers;

use App\Models\Abastecimento;
use App\Models\Veiculo;
use App\Models\Proprietario;
use App\Models\Motorista;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $mes = $request->get('mes', now()->month);
        $ano = $request->get('ano', now()->year);

        $totalAbastecimentos = Abastecimento::whereMonth('data', $mes)->whereYear('data', $ano)->count();
        $totalLitros = Abastecimento::whereMonth('data', $mes)->whereYear('data', $ano)->sum('quantidade_litros');
        $totalValor = Abastecimento::whereMonth('data', $mes)->whereYear('data', $ano)->sum('valor_total');
        $totalPendenteBaixa = Abastecimento::where('baixa_abastecimento', false)->count();

        // Abastecimentos por dia (últimos 30 dias)
        $porDia = Abastecimento::selectRaw("DATE(data) as dia, COUNT(*) as total, SUM(quantidade_litros) as litros, SUM(valor_total) as valor")
            ->where('data', '>=', now()->subDays(30))
            ->groupBy('dia')
            ->orderBy('dia')
            ->get();

        // Por tipo de combustível
        $porCombustivel = Abastecimento::selectRaw("tipo_combustivel, COUNT(*) as total, SUM(quantidade_litros) as litros, SUM(valor_total) as valor")
            ->whereMonth('data', $mes)->whereYear('data', $ano)
            ->groupBy('tipo_combustivel')
            ->get();

        // Top proprietários
        $topProprietarios = Abastecimento::selectRaw("id_proprietario, nome_proprietario, COUNT(*) as total, SUM(valor_total) as valor")
            ->whereMonth('data', $mes)->whereYear('data', $ano)
            ->groupBy('id_proprietario','nome_proprietario')
            ->orderByDesc('valor')
            ->limit(5)
            ->get();

        return response()->json([
            'totais' => [
                'abastecimentos' => $totalAbastecimentos,
                'litros'         => round($totalLitros, 2),
                'valor'          => round($totalValor, 2),
                'pendente_baixa' => $totalPendenteBaixa,
                'veiculos'       => Veiculo::count(),
                'proprietarios'  => Proprietario::count(),
                'motoristas'     => Motorista::count(),
            ],
            'por_dia'          => $porDia,
            'por_combustivel'  => $porCombustivel,
            'top_proprietarios' => $topProprietarios,
        ]);
    }
}
