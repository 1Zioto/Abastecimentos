<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class VariacaoEntradasSaidasController extends Controller
{
    private function filiaisPermitidas(): array
    {
        $user = auth()->user();
        if (!$user) {
            abort(401, 'Não autenticado.');
        }

        return method_exists($user, 'filiaisAcesso')
            ? $user->filiaisAcesso()
            : ['Matriz', 'Viana'];
    }

    public function index(Request $request): JsonResponse
    {
        $this->garantirCustoTransporteEntradaNotas();

        $permitidas = $this->filiaisPermitidas();
        $local = trim((string) $request->query('local', ''));

        // Definição das datas
        $dataFim = $request->query('data_fim')
            ? Carbon::parse($request->query('data_fim'))->toDateString()
            : now()->toDateString();

        $diasFiltro = $request->query('dias');
        if ($request->query('data_inicio')) {
            $dataInicio = Carbon::parse($request->query('data_inicio'))->toDateString();
        } else {
            $qtdDias = is_numeric($diasFiltro) ? max(1, (int) $diasFiltro) : 30;
            $dataInicio = Carbon::parse($dataFim)->subDays($qtdDias - 1)->toDateString();
        }

        // Garante ordem cronológica
        if ($dataInicio > $dataFim) {
            [$dataInicio, $dataFim] = [$dataFim, $dataInicio];
        }

        $dtInicio = Carbon::parse($dataInicio);
        $dtFim = Carbon::parse($dataFim);
        $diasTotais = $dtInicio->diffInDays($dtFim) + 1;

        // Agrupamento temporal: 'dia', 'semana', 'mes' ou 'auto'
        $agrupamentoReq = trim((string) $request->query('agrupamento', 'auto'));
        $agrupamento = match ($agrupamentoReq) {
            'dia' => 'dia',
            'semana' => 'semana',
            'mes' => 'mes',
            default => $diasTotais > 180 ? 'mes' : ($diasTotais > 60 ? 'semana' : 'dia'),
        };

        // Período anterior equivalente para comparativo de variação
        $dataFimAnterior = $dtInicio->copy()->subDay()->toDateString();
        $dataInicioAnterior = Carbon::parse($dataFimAnterior)->subDays($diasTotais - 1)->toDateString();

        // 1. Totais do período atual
        $totaisAtual = $this->calcularTotaisPeriodo($request, $permitidas, $local, $dataInicio, $dataFim);

        // 2. Totais do período anterior para comparativo
        $totaisAnterior = $this->calcularTotaisPeriodo($request, $permitidas, $local, $dataInicioAnterior, $dataFimAnterior);

        // 3. Comparativo percentual
        $comparativo = $this->calcularComparativo($totaisAtual, $totaisAnterior);

        // 4. Série temporal detalhada
        $serie = $this->gerarSerieTemporal($request, $permitidas, $local, $dataInicio, $dataFim, $agrupamento);

        // 5. Destaques (picos de entrada, saída e saldos)
        $destaques = $this->extrairDestaques($serie['pontos']);

        // 6. Resumo por filial se consultado geral
        $resumoPorFilial = [];
        if ($local === '' && count($permitidas) > 1) {
            foreach ($permitidas as $filial) {
                $resumoPorFilial[$filial] = $this->calcularTotaisPeriodo($request, [$filial], $filial, $dataInicio, $dataFim);
            }
        }

        return new JsonResponse([
            'periodo' => [
                'data_inicio' => $dataInicio,
                'data_fim' => $dataFim,
                'dias_totais' => $diasTotais,
                'local' => $local ?: 'Todas',
                'agrupamento' => $agrupamento,
                'periodo_anterior' => [
                    'data_inicio' => $dataInicioAnterior,
                    'data_fim' => $dataFimAnterior,
                ],
            ],
            'totais' => $totaisAtual,
            'totais_anterior' => $totaisAnterior,
            'comparativo' => $comparativo,
            'destaques' => $destaques,
            'serie_temporal' => $serie['pontos'],
            'por_filial' => $resumoPorFilial,
        ]);
    }

    private function calcularTotaisPeriodo(Request $request, array $permitidas, ?string $local, string $dataInicio, string $dataFim): array
    {
        $valorCompraFinalSql = $this->entradaNotaValorCompraFinalSql('entrada_notas');

        // Entradas
        $qEntradas = DB::table('entrada_notas');
        $this->aplicarFiltroAtivos($qEntradas, 'entrada_notas', $request);
        $this->aplicarFiltroNotasAjusteEntradaNotas($qEntradas);
        $this->aplicarFiltroLocalPermitido($qEntradas, 'entrada_notas', $permitidas, $local);
        $qEntradas->whereBetween('data', [$dataInicio, $dataFim]);

        $resEntradas = $qEntradas->selectRaw("
            COUNT(*) as qtd_notas,
            COALESCE(SUM(quantidade), 0) as litros,
            COALESCE(SUM({$valorCompraFinalSql}), 0) as valor
        ")->first();

        // Saídas
        $qSaidas = DB::table('abastecimentos');
        $this->aplicarFiltroAtivos($qSaidas, 'abastecimentos', $request);
        $this->aplicarFiltroLocalPermitido($qSaidas, 'abastecimentos', $permitidas, $local);
        $qSaidas->whereBetween('data', [$dataInicio, $dataFim]);

        $resSaidas = $qSaidas->selectRaw("
            COUNT(*) as qtd_abastecimentos,
            COALESCE(SUM(quantidade_litros), 0) as litros,
            COALESCE(SUM(valor_total), 0) as valor
        ")->first();

        $dias = max(1, Carbon::parse($dataInicio)->diffInDays(Carbon::parse($dataFim)) + 1);

        $entradasLitros = (float) ($resEntradas->litros ?? 0);
        $entradasValor = (float) ($resEntradas->valor ?? 0);
        $entradasQtd = (int) ($resEntradas->qtd_notas ?? 0);

        $saidasLitros = (float) ($resSaidas->litros ?? 0);
        $saidasValor = (float) ($resSaidas->valor ?? 0);
        $saidasQtd = (int) ($resSaidas->qtd_abastecimentos ?? 0);

        $saldoLitros = $entradasLitros - $saidasLitros;
        $saldoValor = $saidasValor - $entradasValor;

        $precoMedioEntrada = $entradasLitros > 0 ? round($entradasValor / $entradasLitros, 3) : 0.0;
        $precoMedioSaida = $saidasLitros > 0 ? round($saidasValor / $saidasLitros, 3) : 0.0;
        $spreadMedioLitro = round($precoMedioSaida - $precoMedioEntrada, 3);

        $taxaReposicao = $saidasLitros > 0 ? round(($entradasLitros / $saidasLitros) * 100, 2) : 0.0;

        return [
            'entradas_litros' => round($entradasLitros, 2),
            'entradas_valor' => round($entradasValor, 2),
            'entradas_qtd_notas' => $entradasQtd,
            'entradas_media_diaria_litros' => round($entradasLitros / $dias, 2),
            'entradas_media_diaria_valor' => round($entradasValor / $dias, 2),
            'preco_medio_entrada' => $precoMedioEntrada,

            'saidas_litros' => round($saidasLitros, 2),
            'saidas_valor' => round($saidasValor, 2),
            'saidas_qtd_abastecimentos' => $saidasQtd,
            'saidas_media_diaria_litros' => round($saidasLitros / $dias, 2),
            'saidas_media_diaria_valor' => round($saidasValor / $dias, 2),
            'preco_medio_saida' => $precoMedioSaida,

            'saldo_litros' => round($saldoLitros, 2),
            'saldo_valor' => round($saldoValor, 2),
            'spread_medio_litro' => $spreadMedioLitro,
            'taxa_reposicao_percentual' => $taxaReposicao,
        ];
    }

    private function calcularComparativo(array $atual, array $anterior): array
    {
        $calcPct = function (float $at, float $ant): float {
            if ($ant == 0.0) {
                return $at > 0 ? 100.0 : 0.0;
            }
            return round((($at - $ant) / abs($ant)) * 100, 1);
        };

        return [
            'var_entradas_litros_pct' => $calcPct($atual['entradas_litros'], $anterior['entradas_litros']),
            'var_entradas_valor_pct' => $calcPct($atual['entradas_valor'], $anterior['entradas_valor']),
            'var_saidas_litros_pct' => $calcPct($atual['saidas_litros'], $anterior['saidas_litros']),
            'var_saidas_valor_pct' => $calcPct($atual['saidas_valor'], $anterior['saidas_valor']),
            'var_saldo_litros_pct' => $calcPct($atual['saldo_litros'], $anterior['saldo_litros']),
            'var_saldo_valor_pct' => $calcPct($atual['saldo_valor'], $anterior['saldo_valor']),
        ];
    }

    private function gerarSerieTemporal(Request $request, array $permitidas, ?string $local, string $dataInicio, string $dataFim, string $agrupamento): array
    {
        $valorCompraFinalSql = $this->entradaNotaValorCompraFinalSql('entrada_notas');

        // Formatação de data no SQL baseada no PostgreSQL
        $dateExprEntradas = match ($agrupamento) {
            'mes' => "TO_CHAR(data, 'YYYY-MM')",
            'semana' => "TO_CHAR(DATE_TRUNC('week', data), 'YYYY-\"W\"IW')",
            default => "TO_CHAR(data, 'YYYY-MM-DD')",
        };

        $dateExprSaidas = match ($agrupamento) {
            'mes' => "TO_CHAR(data, 'YYYY-MM')",
            'semana' => "TO_CHAR(DATE_TRUNC('week', data), 'YYYY-\"W\"IW')",
            default => "TO_CHAR(data, 'YYYY-MM-DD')",
        };

        // Query Entradas agrupada
        $qEntradas = DB::table('entrada_notas');
        $this->aplicarFiltroAtivos($qEntradas, 'entrada_notas', $request);
        $this->aplicarFiltroNotasAjusteEntradaNotas($qEntradas);
        $this->aplicarFiltroLocalPermitido($qEntradas, 'entrada_notas', $permitidas, $local);
        $entradasAgrupadas = $qEntradas
            ->whereBetween('data', [$dataInicio, $dataFim])
            ->selectRaw("
                {$dateExprEntradas} as bucket,
                COUNT(*) as qtd,
                COALESCE(SUM(quantidade), 0) as litros,
                COALESCE(SUM({$valorCompraFinalSql}), 0) as valor
            ")
            ->groupBy('bucket')
            ->get()
            ->keyBy('bucket');

        // Query Saídas agrupada
        $qSaidas = DB::table('abastecimentos');
        $this->aplicarFiltroAtivos($qSaidas, 'abastecimentos', $request);
        $this->aplicarFiltroLocalPermitido($qSaidas, 'abastecimentos', $permitidas, $local);
        $saidasAgrupadas = $qSaidas
            ->whereBetween('data', [$dataInicio, $dataFim])
            ->selectRaw("
                {$dateExprSaidas} as bucket,
                COUNT(*) as qtd,
                COALESCE(SUM(quantidade_litros), 0) as litros,
                COALESCE(SUM(valor_total), 0) as valor
            ")
            ->groupBy('bucket')
            ->get()
            ->keyBy('bucket');

        // Montagem de todos os buckets do intervalo para garantir continuidade da linha do tempo
        $buckets = $this->gerarBucketsContinuos($dataInicio, $dataFim, $agrupamento);

        $pontos = [];
        $saldoAcumulado = 0.0;

        foreach ($buckets as $b) {
            $ent = $entradasAgrupadas->get($b['key']);
            $sai = $saidasAgrupadas->get($b['key']);

            $entLitros = round((float) ($ent->litros ?? 0), 2);
            $entValor = round((float) ($ent->valor ?? 0), 2);
            $entQtd = (int) ($ent->qtd ?? 0);

            $saiLitros = round((float) ($sai->litros ?? 0), 2);
            $saiValor = round((float) ($sai->valor ?? 0), 2);
            $saiQtd = (int) ($sai->qtd ?? 0);

            $saldoL = round($entLitros - $saiLitros, 2);
            $saldoV = round($saiValor - $entValor, 2);
            $saldoAcumulado += $saldoL;

            $pmEntrada = $entLitros > 0 ? round($entValor / $entLitros, 3) : 0.0;
            $pmSaida = $saiLitros > 0 ? round($saiValor / $saiLitros, 3) : 0.0;

            $pontos[] = [
                'chave' => $b['key'],
                'label' => $b['label'],
                'label_completo' => $b['label_completo'],
                'data_inicio' => $b['data_inicio'],
                'data_fim' => $b['data_fim'],
                'entradas_litros' => $entLitros,
                'entradas_valor' => $entValor,
                'entradas_qtd' => $entQtd,
                'saidas_litros' => $saiLitros,
                'saidas_valor' => $saiValor,
                'saidas_qtd' => $saiQtd,
                'saldo_litros' => $saldoL,
                'saldo_valor' => $saldoV,
                'saldo_acumulado_litros' => round($saldoAcumulado, 2),
                'preco_medio_entrada' => $pmEntrada,
                'preco_medio_saida' => $pmSaida,
            ];
        }

        return ['pontos' => $pontos];
    }

    private function gerarBucketsContinuos(string $dataInicio, string $dataFim, string $agrupamento): array
    {
        $buckets = [];
        $dtInicio = Carbon::parse($dataInicio);
        $dtFim = Carbon::parse($dataFim);

        if ($agrupamento === 'dia') {
            $period = CarbonPeriod::create($dtInicio, $dtFim);
            foreach ($period as $dt) {
                $buckets[] = [
                    'key' => $dt->format('Y-m-d'),
                    'label' => $dt->format('d/m'),
                    'label_completo' => $dt->format('d/m/Y'),
                    'data_inicio' => $dt->format('Y-m-d'),
                    'data_fim' => $dt->format('Y-m-d'),
                ];
            }
        } elseif ($agrupamento === 'semana') {
            // Itera pelas semanas
            $curr = $dtInicio->copy()->startOfWeek();
            $end = $dtFim->copy()->endOfWeek();
            while ($curr->lte($end)) {
                $weekEnd = $curr->copy()->endOfWeek();
                $buckets[] = [
                    'key' => $curr->format('o-\WW'), // Ano ISO e semana ISO
                    'label' => 'Sem ' . $curr->format('W'),
                    'label_completo' => 'Semana ' . $curr->format('W') . ' (' . $curr->format('d/m') . ' a ' . $weekEnd->format('d/m') . ')',
                    'data_inicio' => $curr->format('Y-m-d'),
                    'data_fim' => $weekEnd->format('Y-m-d'),
                ];
                $curr->addWeek();
            }
        } else {
            // Meses
            $curr = $dtInicio->copy()->startOfMonth();
            $end = $dtFim->copy()->startOfMonth();
            while ($curr->lte($end)) {
                $buckets[] = [
                    'key' => $curr->format('Y-m'),
                    'label' => $curr->translatedFormat('M/y') ?: $curr->format('m/Y'),
                    'label_completo' => $curr->translatedFormat('F/Y') ?: $curr->format('m/Y'),
                    'data_inicio' => $curr->copy()->startOfMonth()->format('Y-m-d'),
                    'data_fim' => $curr->copy()->endOfMonth()->format('Y-m-d'),
                ];
                $curr->addMonth();
            }
        }

        return $buckets;
    }

    private function extrairDestaques(array $pontos): array
    {
        $maiorEntrada = null;
        $maiorSaida = null;
        $maiorSuperavit = null;
        $maiorDeficit = null;

        foreach ($pontos as $p) {
            if ($p['entradas_litros'] > 0) {
                if ($maiorEntrada === null || $p['entradas_litros'] > $maiorEntrada['litros']) {
                    $maiorEntrada = [
                        'label' => $p['label_completo'] ?? $p['label'],
                        'data' => $p['data_inicio'],
                        'litros' => $p['entradas_litros'],
                        'valor' => $p['entradas_valor'],
                    ];
                }
            }

            if ($p['saidas_litros'] > 0) {
                if ($maiorSaida === null || $p['saidas_litros'] > $maiorSaida['litros']) {
                    $maiorSaida = [
                        'label' => $p['label_completo'] ?? $p['label'],
                        'data' => $p['data_inicio'],
                        'litros' => $p['saidas_litros'],
                        'valor' => $p['saidas_valor'],
                    ];
                }
            }

            if ($p['saldo_litros'] > 0) {
                if ($maiorSuperavit === null || $p['saldo_litros'] > $maiorSuperavit['litros']) {
                    $maiorSuperavit = [
                        'label' => $p['label_completo'] ?? $p['label'],
                        'data' => $p['data_inicio'],
                        'litros' => $p['saldo_litros'],
                    ];
                }
            } elseif ($p['saldo_litros'] < 0) {
                if ($maiorDeficit === null || $p['saldo_litros'] < $maiorDeficit['litros']) {
                    $maiorDeficit = [
                        'label' => $p['label_completo'] ?? $p['label'],
                        'data' => $p['data_inicio'],
                        'litros' => $p['saldo_litros'],
                    ];
                }
            }
        }

        return [
            'maior_entrada' => $maiorEntrada,
            'maior_saida' => $maiorSaida,
            'maior_superavit' => $maiorSuperavit,
            'maior_deficit' => $maiorDeficit,
        ];
    }
}
