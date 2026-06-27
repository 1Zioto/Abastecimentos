<?php

namespace App\Http\Controllers;

use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TanqueHistoricoController extends Controller
{
    private const LOCAIS = ['Matriz', 'Viana'];

    public function index(Request $request): JsonResponse
    {
        $this->garantirCustoTransporteEntradaNotas();

        $dataInicio = $this->normalizarData(
            $request->query('data_inicio'),
            now()->startOfMonth()->toDateString(),
        );
        $dataFim = $this->normalizarData(
            $request->query('data_fim'),
            now()->toDateString(),
        );

        if ($dataInicio > $dataFim) {
            [$dataInicio, $dataFim] = [$dataFim, $dataInicio];
        }

        $linhas = collect(self::LOCAIS)
            ->filter(fn (string $local) => in_array($local, $this->filiaisPermitidas(), true))
            ->map(fn (string $local) => $this->historicoLocal($local, $dataInicio, $dataFim, $request))
            ->values();

        return new JsonResponse([
            'periodo' => [
                'data_inicio' => $dataInicio,
                'data_fim' => $dataFim,
            ],
            'locais' => $linhas,
        ]);
    }

    private function historicoLocal(string $local, string $dataInicio, string $dataFim, Request $request): array
    {
        $saldoInicial = $this->totalEntradasAntes($local, $dataInicio, $request)
            - $this->totalSaidasAntes($local, $dataInicio, $request);

        $entradasPorDia = $this->entradasPeriodo($local, $dataInicio, $dataFim, $request)
            ->get()
            ->keyBy(fn ($row) => CarbonImmutable::parse($row->data)->toDateString());

        $saidasPorDia = $this->saidasPeriodo($local, $dataInicio, $dataFim, $request)
            ->get()
            ->keyBy(fn ($row) => CarbonImmutable::parse($row->data)->toDateString());

        $saldo = $saldoInicial;
        $entradaPeriodo = 0.0;
        $saidaPeriodo = 0.0;
        $pontos = [];

        for (
            $dia = CarbonImmutable::parse($dataInicio);
            $dia->lte(CarbonImmutable::parse($dataFim));
            $dia = $dia->addDay()
        ) {
            $key = $dia->toDateString();
            $entrada = (float) ($entradasPorDia->get($key)->litros ?? 0);
            $saida = (float) ($saidasPorDia->get($key)->litros ?? 0);
            $saldo += $entrada - $saida;
            $entradaPeriodo += $entrada;
            $saidaPeriodo += $saida;

            $pontos[] = [
                'data' => $key,
                'label' => $dia->format('d/m'),
                'entrada_litros' => round($entrada, 2),
                'saida_litros' => round($saida, 2),
                'saldo_litros' => round($saldo, 2),
                'entradas' => (int) ($entradasPorDia->get($key)->registros ?? 0),
                'saidas' => (int) ($saidasPorDia->get($key)->registros ?? 0),
                'entrada_valor' => round((float) ($entradasPorDia->get($key)->valor ?? 0), 2),
                'saida_valor' => round((float) ($saidasPorDia->get($key)->valor ?? 0), 2),
            ];
        }

        return [
            'local' => $local,
            'saldo_inicial_litros' => round($saldoInicial, 2),
            'saldo_final_litros' => round($saldo, 2),
            'entrada_periodo_litros' => round($entradaPeriodo, 2),
            'saida_periodo_litros' => round($saidaPeriodo, 2),
            'pontos' => $pontos,
        ];
    }

    private function entradasBase(string $local, Request $request)
    {
        $query = DB::table('entrada_notas')->where('local', $local);
        return $this->aplicarFiltroAtivos($query, 'entrada_notas', $request);
    }

    private function saidasBase(string $local, Request $request)
    {
        $query = DB::table('abastecimentos')->where('local', $local);
        return $this->aplicarFiltroAtivos($query, 'abastecimentos', $request);
    }

    private function totalEntradasAntes(string $local, string $dataInicio, Request $request): float
    {
        return (float) $this->entradasBase($local, $request)
            ->whereDate('data', '<', $dataInicio)
            ->sum('quantidade');
    }

    private function totalSaidasAntes(string $local, string $dataInicio, Request $request): float
    {
        return (float) $this->saidasBase($local, $request)
            ->whereDate('data', '<', $dataInicio)
            ->sum('quantidade_litros');
    }

    private function entradasPeriodo(string $local, string $dataInicio, string $dataFim, Request $request)
    {
        $valorCompraFinalSql = $this->entradaNotaValorCompraFinalSql('entrada_notas');
        return $this->entradasBase($local, $request)
            ->selectRaw("data, COUNT(*) as registros, COALESCE(SUM(quantidade), 0) as litros, COALESCE(SUM({$valorCompraFinalSql}), 0) as valor")
            ->whereDate('data', '>=', $dataInicio)
            ->whereDate('data', '<=', $dataFim)
            ->groupBy('data')
            ->orderBy('data');
    }

    private function saidasPeriodo(string $local, string $dataInicio, string $dataFim, Request $request)
    {
        return $this->saidasBase($local, $request)
            ->selectRaw('data, COUNT(*) as registros, COALESCE(SUM(quantidade_litros), 0) as litros, COALESCE(SUM(valor_total), 0) as valor')
            ->whereDate('data', '>=', $dataInicio)
            ->whereDate('data', '<=', $dataFim)
            ->groupBy('data')
            ->orderBy('data');
    }

    private function normalizarData(mixed $value, string $fallback): string
    {
        try {
            $text = trim((string) $value);
            if ($text === '') {
                return $fallback;
            }
            return CarbonImmutable::parse($text)->toDateString();
        } catch (\Throwable) {
            return $fallback;
        }
    }

    private function filiaisPermitidas(): array
    {
        $user = auth('api')->user();
        if (!$user) {
            abort(401, 'Não autenticado.');
        }

        return method_exists($user, 'filiaisAcesso') ? $user->filiaisAcesso() : self::LOCAIS;
    }

}
