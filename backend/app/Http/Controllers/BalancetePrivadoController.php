<?php

namespace App\Http\Controllers;

use Carbon\CarbonPeriod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BalancetePrivadoController extends Controller
{
    private const LOCAIS = ['Matriz', 'Viana'];

    public function index(Request $request): JsonResponse
    {
        if ($erro = $this->ensurePrivateAccess()) {
            return $erro;
        }

        $this->garantirCustoTransporteEntradaNotas();

        $dataInicio = $request->query('data_inicio') ?: now()->startOfMonth()->toDateString();
        $dataFim = $request->query('data_fim') ?: now()->toDateString();

        $locais = collect(self::LOCAIS)
            ->filter(fn (string $local) => in_array($local, $this->filiaisPermitidas(), true))
            ->values();
        $linhas = $locais
            ->map(fn (string $local) => $this->linhaLocal($local, $dataInicio, $dataFim, $request))
            ->values();

        return new JsonResponse([
            'periodo' => [
                'data_inicio' => $dataInicio,
                'data_fim' => $dataFim,
            ],
            'locais' => $linhas,
            'consolidado' => $this->consolidar($linhas->all()),
            'serie_diaria' => $this->serieDiaria($locais->all(), $dataInicio, $dataFim, $request),
        ]);
    }

    private function linhaLocal(string $local, string $dataInicio, string $dataFim, Request $request): array
    {
        $abastecimentos = DB::table('abastecimentos')->where('local', $local);
        $this->aplicarFiltroAtivos($abastecimentos, 'abastecimentos', $request);
        $this->aplicarPeriodo($abastecimentos, 'data', $dataInicio, $dataFim);

        $entradas = DB::table('entrada_notas')->where('local', $local);
        $this->aplicarFiltroAtivos($entradas, 'entrada_notas', $request);
        $this->aplicarFiltroNotasAjusteEntradaNotas($entradas);
        $this->aplicarPeriodo($entradas, 'data', $dataInicio, $dataFim);
        $valorCompraFinalSql = $this->entradaNotaValorCompraFinalSql('entrada_notas');
        $custoTransporteSql = $this->entradaNotaCustoTransporteSql('entrada_notas');

        $despesas = DB::table('despesas_avulsas')->where('local', $local);
        $this->aplicarFiltroAtivos($despesas, 'despesas_avulsas', $request);
        $this->aplicarPeriodo($despesas, 'data', $dataInicio, $dataFim);

        $vendidos = (clone $abastecimentos)
            ->selectRaw('COUNT(*) as total, COALESCE(SUM(quantidade_litros), 0) as litros, COALESCE(SUM(valor_total), 0) as valor')
            ->first();

        $recebidos = $this->aplicarFiltroBaixado(clone $abastecimentos)
            ->selectRaw('COUNT(*) as total, COALESCE(SUM(quantidade_litros), 0) as litros, COALESCE(SUM(valor_total), 0) as valor')
            ->first();

        $pendentes = $this->aplicarFiltroPendenteBaixa(clone $abastecimentos)
            ->selectRaw('COUNT(*) as total, COALESCE(SUM(quantidade_litros), 0) as litros, COALESCE(SUM(valor_total), 0) as valor')
            ->first();

        $compras = (clone $entradas)
            ->selectRaw("COUNT(*) as total, COALESCE(SUM(quantidade), 0) as litros, COALESCE(SUM({$valorCompraFinalSql}), 0) as valor, COALESCE(SUM({$custoTransporteSql}), 0) as custo_transporte")
            ->first();

        $despesasResumo = (clone $despesas)
            ->selectRaw('COUNT(*) as total, COALESCE(SUM(valor), 0) as valor')
            ->first();

        $despesasPorCategoria = (clone $despesas)
            ->selectRaw("COALESCE(NULLIF(TRIM(categoria), ''), 'Sem categoria') as categoria, COALESCE(SUM(valor), 0) as valor")
            ->groupByRaw("COALESCE(NULLIF(TRIM(categoria), ''), 'Sem categoria')")
            ->orderByDesc('valor')
            ->limit(5)
            ->get()
            ->map(fn ($item) => [
                'categoria' => (string) $item->categoria,
                'valor' => round((float) $item->valor, 2),
            ]);

        $pendentesPorProprietario = $this->aplicarFiltroPendenteBaixa(clone $abastecimentos)
            ->selectRaw("COALESCE(nome_proprietario, 'Sem proprietário') as nome_proprietario, COALESCE(SUM(valor_total), 0) as valor")
            ->groupByRaw("COALESCE(nome_proprietario, 'Sem proprietário')")
            ->orderByDesc('valor')
            ->get()
            ->map(fn ($item) => [
                'nome_proprietario' => (string) $item->nome_proprietario,
                'valor' => round((float) $item->valor, 2),
            ]);

        $comprasValor = (float) ($compras->valor ?? 0);
        $vendidosValor = (float) ($vendidos->valor ?? 0);
        $recebidosValor = (float) ($recebidos->valor ?? 0);
        $pendentesValor = (float) ($pendentes->valor ?? 0);
        $despesasValor = (float) ($despesasResumo->valor ?? 0);
        $comprasLitros = (float) ($compras->litros ?? 0);
        $vendidosLitros = (float) ($vendidos->litros ?? 0);
        $custoMedioCompraLitro = $comprasLitros > 0 ? $comprasValor / $comprasLitros : 0.0;
        $custoVendidoEstimado = $vendidosLitros * $custoMedioCompraLitro;
        $diferencaBrutaEstimada = $vendidosValor - $custoVendidoEstimado;
        $resultadoOperacionalEstimado = $diferencaBrutaEstimada - $despesasValor;
        $resultadoCompetencia = $vendidosValor - $comprasValor - $despesasValor;
        $resultadoCaixa = $recebidosValor - $comprasValor - $despesasValor;

        return [
            'local' => $local,
            'compras' => [
                'registros' => (int) ($compras->total ?? 0),
                'litros' => round($comprasLitros, 2),
                'valor' => round($comprasValor, 2),
                'valor_sinalizado' => round(-$comprasValor, 2),
                'custo_transporte' => round((float) ($compras->custo_transporte ?? 0), 2),
            ],
            'vendas' => [
                'registros' => (int) ($vendidos->total ?? 0),
                'litros' => round($vendidosLitros, 2),
                'valor' => round($vendidosValor, 2),
                'valor_sinalizado' => round($vendidosValor, 2),
            ],
            'recebidos' => [
                'registros' => (int) ($recebidos->total ?? 0),
                'litros' => round((float) ($recebidos->litros ?? 0), 2),
                'valor' => round($recebidosValor, 2),
                'valor_sinalizado' => round($recebidosValor, 2),
            ],
            'pendentes' => [
                'registros' => (int) ($pendentes->total ?? 0),
                'litros' => round((float) ($pendentes->litros ?? 0), 2),
                'valor' => round($pendentesValor, 2),
                'valor_sinalizado' => round($pendentesValor, 2),
            ],
            'despesas' => [
                'registros' => (int) ($despesasResumo->total ?? 0),
                'valor' => round($despesasValor, 2),
                'valor_sinalizado' => round(-$despesasValor, 2),
                'categorias' => $despesasPorCategoria,
            ],
            'top_pendentes' => $pendentesPorProprietario,
            'estoque_periodo_litros' => round($comprasLitros - $vendidosLitros, 2),
            'saldo_a_receber' => round($pendentesValor, 2),
            'custo_medio_compra_litro' => round($custoMedioCompraLitro, 4),
            'custo_vendido_estimado' => round($custoVendidoEstimado, 2),
            'diferenca_bruta_estimada' => round($diferencaBrutaEstimada, 2),
            'resultado_operacional_estimado' => round($resultadoOperacionalEstimado, 2),
            'resultado_competencia' => round($resultadoCompetencia, 2),
            'resultado_caixa' => round($resultadoCaixa, 2),
            'movimento_financeiro' => [
                'comprado' => round(-$comprasValor, 2),
                'vendido_pendente' => round($pendentesValor, 2),
                'recebido' => round($recebidosValor, 2),
                'despesas' => round(-$despesasValor, 2),
                'saldo_competencia' => round($resultadoCompetencia, 2),
                'saldo_caixa' => round($resultadoCaixa, 2),
            ],
        ];
    }

    private function serieDiaria(array $locais, string $dataInicio, string $dataFim, Request $request): array
    {
        if (empty($locais)) {
            return [];
        }

        $valorEntradaSql = $this->entradaNotaValorCompraFinalSql('entrada_notas');

        $entradas = DB::table('entrada_notas')
            ->whereIn('local', $locais)
            ->selectRaw("DATE(data) as dia, COALESCE(SUM({$valorEntradaSql}), 0) as valor");
        $this->aplicarFiltroAtivos($entradas, 'entrada_notas', $request);
        $this->aplicarFiltroNotasAjusteEntradaNotas($entradas);
        $this->aplicarPeriodo($entradas, 'data', $dataInicio, $dataFim);
        $entradasPorDia = $entradas
            ->groupByRaw('DATE(data)')
            ->pluck('valor', 'dia')
            ->map(fn ($valor) => (float) $valor);

        $despesas = DB::table('despesas_avulsas')
            ->whereIn('local', $locais)
            ->selectRaw('DATE(data) as dia, COALESCE(SUM(valor), 0) as valor');
        $this->aplicarFiltroAtivos($despesas, 'despesas_avulsas', $request);
        $this->aplicarPeriodo($despesas, 'data', $dataInicio, $dataFim);
        $despesasPorDia = $despesas
            ->groupByRaw('DATE(data)')
            ->pluck('valor', 'dia')
            ->map(fn ($valor) => (float) $valor);

        $vendas = DB::table('abastecimentos')
            ->whereIn('local', $locais)
            ->selectRaw('DATE(data) as dia, COALESCE(SUM(valor_total), 0) as valor');
        $this->aplicarFiltroAtivos($vendas, 'abastecimentos', $request);
        $this->aplicarPeriodo($vendas, 'data', $dataInicio, $dataFim);
        $vendasPorDia = $vendas
            ->groupByRaw('DATE(data)')
            ->pluck('valor', 'dia')
            ->map(fn ($valor) => (float) $valor);

        $serie = [];
        foreach (CarbonPeriod::create($dataInicio, $dataFim) as $date) {
            $dia = $date->toDateString();
            $custos = (float) ($entradasPorDia[$dia] ?? 0) + (float) ($despesasPorDia[$dia] ?? 0);
            $vendasDia = (float) ($vendasPorDia[$dia] ?? 0);
            $serie[] = [
                'data' => $dia,
                'label' => $date->format('d/m'),
                'custos' => round($custos, 2),
                'vendas' => round($vendasDia, 2),
            ];
        }

        return $serie;
    }

    private function consolidar(array $linhas): array
    {
        $base = [
            'compras' => ['registros' => 0, 'litros' => 0.0, 'valor' => 0.0, 'custo_transporte' => 0.0],
            'vendas' => ['registros' => 0, 'litros' => 0.0, 'valor' => 0.0],
            'recebidos' => ['registros' => 0, 'litros' => 0.0, 'valor' => 0.0],
            'pendentes' => ['registros' => 0, 'litros' => 0.0, 'valor' => 0.0],
            'despesas' => ['registros' => 0, 'valor' => 0.0],
            'estoque_periodo_litros' => 0.0,
            'saldo_a_receber' => 0.0,
            'custo_vendido_estimado' => 0.0,
            'diferenca_bruta_estimada' => 0.0,
            'resultado_operacional_estimado' => 0.0,
            'resultado_competencia' => 0.0,
            'resultado_caixa' => 0.0,
            'movimento_financeiro' => [
                'comprado' => 0.0,
                'vendido_pendente' => 0.0,
                'recebido' => 0.0,
                'despesas' => 0.0,
                'saldo_competencia' => 0.0,
                'saldo_caixa' => 0.0,
            ],
        ];

        foreach ($linhas as $linha) {
            foreach (['compras', 'vendas', 'recebidos', 'pendentes'] as $grupo) {
                $base[$grupo]['registros'] += (int) ($linha[$grupo]['registros'] ?? 0);
                $base[$grupo]['litros'] += (float) ($linha[$grupo]['litros'] ?? 0);
                $base[$grupo]['valor'] += (float) ($linha[$grupo]['valor'] ?? 0);
                if ($grupo === 'compras') {
                    $base[$grupo]['custo_transporte'] += (float) ($linha[$grupo]['custo_transporte'] ?? 0);
                }
                $base[$grupo]['valor_sinalizado'] = ($base[$grupo]['valor_sinalizado'] ?? 0.0)
                    + (float) ($linha[$grupo]['valor_sinalizado'] ?? $linha[$grupo]['valor'] ?? 0);
            }
            $base['despesas']['registros'] += (int) ($linha['despesas']['registros'] ?? 0);
            $base['despesas']['valor'] += (float) ($linha['despesas']['valor'] ?? 0);
            $base['despesas']['valor_sinalizado'] = ($base['despesas']['valor_sinalizado'] ?? 0.0)
                + (float) ($linha['despesas']['valor_sinalizado'] ?? -($linha['despesas']['valor'] ?? 0));
            $base['estoque_periodo_litros'] += (float) ($linha['estoque_periodo_litros'] ?? 0);
            $base['saldo_a_receber'] += (float) ($linha['saldo_a_receber'] ?? 0);
            $base['custo_vendido_estimado'] += (float) ($linha['custo_vendido_estimado'] ?? 0);
            $base['diferenca_bruta_estimada'] += (float) ($linha['diferenca_bruta_estimada'] ?? 0);
            $base['resultado_operacional_estimado'] += (float) ($linha['resultado_operacional_estimado'] ?? 0);
            $base['resultado_competencia'] += (float) ($linha['resultado_competencia'] ?? 0);
            $base['resultado_caixa'] += (float) ($linha['resultado_caixa'] ?? 0);
            foreach ($base['movimento_financeiro'] as $campo => $_) {
                $base['movimento_financeiro'][$campo] += (float) ($linha['movimento_financeiro'][$campo] ?? 0);
            }
        }

        return $this->roundRecursive($base);
    }

    private function aplicarPeriodo($query, string $column, string $dataInicio, string $dataFim): void
    {
        $query->whereDate($column, '>=', $dataInicio)
            ->whereDate($column, '<=', $dataFim);
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

    private function filiaisPermitidas(): array
    {
        $user = auth('api')->user();
        if (!$user) {
            abort(401, 'Não autenticado.');
        }

        return method_exists($user, 'filiaisAcesso') ? $user->filiaisAcesso() : self::LOCAIS;
    }

    private function ensurePrivateAccess(): ?JsonResponse
    {
        $currentUser = auth('api')->user();
        $tipo = strtolower((string) ($currentUser?->tipo ?? ''));

        if (!$currentUser || $tipo !== 'admin') {
            return new JsonResponse(['message' => 'Acesso restrito.'], 403);
        }

        return null;
    }

    private function roundRecursive(array $value): array
    {
        foreach ($value as $key => $item) {
            if (is_array($item)) {
                $value[$key] = $this->roundRecursive($item);
            } elseif (is_float($item)) {
                $value[$key] = round($item, 2);
            }
        }

        return $value;
    }
}
