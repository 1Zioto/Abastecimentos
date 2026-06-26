<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class GraficosGerenciaisController extends Controller
{
    private const LOCAIS = ['Matriz', 'Viana'];

    public function index(Request $request): JsonResponse
    {
        $this->garantirCustoTransporteEntradaNotas();

        $dataInicio = $request->query('data_inicio') ?: now()->startOfMonth()->toDateString();
        $dataFim = $request->query('data_fim') ?: now()->toDateString();
        $local = trim((string) $request->query('local', ''));

        $resumo = $this->montarResumo($request, $dataInicio, $dataFim, $local);
        $resumo['por_filial'] = array_map(
            fn (string $filial) => $this->montarResumo($request, $dataInicio, $dataFim, $filial),
            $this->filiaisParaSeparacao()
        );

        return new JsonResponse($resumo);
    }

    private function montarResumo(Request $request, string $dataInicio, string $dataFim, string $local): array
    {
        $abastecimentosPeriodo = $this->abastecimentosBase($request, $local);
        $this->aplicarPeriodo($abastecimentosPeriodo, 'data', $dataInicio, $dataFim);

        $entradasPeriodo = $this->entradasBase($request, $local);
        $this->aplicarPeriodo($entradasPeriodo, 'data', $dataInicio, $dataFim);
        $valorCompraFinalSql = $this->entradaNotaValorCompraFinalSql('entrada_notas');
        $custoTransporteSql = $this->entradaNotaCustoTransporteSql('entrada_notas');

        $pendenteSql = $this->tabelaTemColuna('abastecimentos', 'baixa_abastecimento')
            ? 'COALESCE(baixa_abastecimento, false) = false'
            : "LOWER(COALESCE(status, '')) <> 'pago'";
        $vendas = (clone $abastecimentosPeriodo)
            ->selectRaw('COUNT(*) as total')
            ->selectRaw('COALESCE(SUM(quantidade_litros), 0) as litros')
            ->selectRaw('COALESCE(SUM(valor_total), 0) as valor')
            ->selectRaw("COALESCE(SUM(CASE WHEN {$pendenteSql} THEN quantidade_litros ELSE 0 END), 0) as pendente_litros")
            ->selectRaw("COALESCE(SUM(CASE WHEN {$pendenteSql} THEN valor_total ELSE 0 END), 0) as pendente_valor")
            ->selectRaw("COALESCE(SUM(CASE WHEN {$pendenteSql} THEN 1 ELSE 0 END), 0) as pendente_total")
            ->selectRaw("COALESCE(SUM(CASE WHEN LOWER(COALESCE(status, '')) = 'inconsistente' THEN 1 ELSE 0 END), 0) as inconsistencias")
            ->first();

        $compras = (clone $entradasPeriodo)
            ->selectRaw("COUNT(*) as total, COALESCE(SUM(quantidade), 0) as litros, COALESCE(SUM(valor), 0) as valor_sem_transporte, COALESCE(SUM({$valorCompraFinalSql}), 0) as valor, COALESCE(SUM({$custoTransporteSql}), 0) as custo_transporte")
            ->first();

        $tanqueLitros = $this->combustivelNoTanque($request, $local);
        $precoMedioComprado = $this->media((float) ($compras->valor ?? 0), (float) ($compras->litros ?? 0));
        if ($precoMedioComprado <= 0) {
            $precoMedioComprado = $this->precoMedioCompradoGeral($request, $local);
        }

        $precoMedioVendido = $this->media((float) ($vendas->valor ?? 0), (float) ($vendas->litros ?? 0));
        $ultimaEntrada = $this->ultimaEntradaNota($request, $local);
        $controleProprietarios = $this->controleProprietarios($request, $local);

        $comprasValor = (float) ($compras->valor ?? 0);
        $comprasValorSemTransporte = (float) ($compras->valor_sem_transporte ?? 0);
        $custoTransporteTotal = (float) ($compras->custo_transporte ?? 0);
        $comprasLitros = (float) ($compras->litros ?? 0);
        $vendasValor = (float) ($vendas->valor ?? 0);
        $vendasLitros = (float) ($vendas->litros ?? 0);

        return [
            'periodo' => [
                'data_inicio' => $dataInicio,
                'data_fim' => $dataFim,
                'local' => $local !== '' ? $local : 'Todas',
            ],
            'totais' => [
                'comprado_valor' => round($comprasValor, 2),
                'comprado_valor_sem_transporte' => round($comprasValorSemTransporte, 2),
                'comprado_litros' => round($comprasLitros, 2),
                'comprado_registros' => (int) ($compras->total ?? 0),
                'custo_transporte_total' => round($custoTransporteTotal, 2),
                'vendido_valor' => round($vendasValor, 2),
                'vendido_litros' => round($vendasLitros, 2),
                'abastecimentos_total' => (int) ($vendas->total ?? 0),
                'margem_bruta' => round($vendasValor - $comprasValor, 2),
                'pendente_baixa_valor' => round((float) ($vendas->pendente_valor ?? 0), 2),
                'pendente_baixa_litros' => round((float) ($vendas->pendente_litros ?? 0), 2),
                'pendente_baixa_total' => (int) ($vendas->pendente_total ?? 0),
                'ticket_medio' => round($this->media($vendasValor, (float) ($vendas->total ?? 0)), 2),
                'preco_medio_comprado' => round($precoMedioComprado, 3),
                'preco_medio_vendido' => round($precoMedioVendido, 3),
                'diferenca_media_litro' => round($precoMedioVendido - $precoMedioComprado, 3),
                'inconsistencias' => (int) ($vendas->inconsistencias ?? 0),
                'proprietarios_bloqueados' => $controleProprietarios['bloqueados'],
                'proprietarios_proximos_limite' => $controleProprietarios['proximos_limite'],
                'proprietarios_limite_estourado' => $controleProprietarios['limite_estourado'],
                'tanque_litros' => round($tanqueLitros, 2),
                'estoque_estimado_valor' => round($tanqueLitros * $precoMedioComprado, 2),
            ],
            'proprietarios_controle' => $controleProprietarios,
            'ultima_entrada_nota' => $ultimaEntrada,
        ];
    }

    private function abastecimentosBase(Request $request, string $local)
    {
        $query = DB::table('abastecimentos');
        $this->aplicarFiltroLocalPermitido($query, 'abastecimentos', $this->filiaisPermitidas(), $local);
        $this->aplicarFiltroAtivos($query, 'abastecimentos', $request);
        return $query;
    }

    private function entradasBase(Request $request, string $local, bool $incluirAjustes = false)
    {
        $query = DB::table('entrada_notas');
        $this->aplicarFiltroLocalPermitido($query, 'entrada_notas', $this->filiaisPermitidas(), $local);
        $this->aplicarFiltroAtivos($query, 'entrada_notas', $request);
        if (!$incluirAjustes) {
            $this->aplicarFiltroNotasAjusteEntradaNotas($query);
        }
        return $query;
    }

    private function proprietariosBase(Request $request, string $local)
    {
        $query = DB::table('proprietarios');
        $this->aplicarFiltroLocalPermitido($query, 'proprietarios', $this->filiaisPermitidas(), $local);
        $this->aplicarFiltroAtivos($query, 'proprietarios', $request);
        return $query;
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

    private function combustivelNoTanque(Request $request, string $local): float
    {
        $comprado = (float) $this->entradasBase($request, $local, true)->sum('quantidade');
        $vendido = (float) $this->abastecimentosBase($request, $local)->sum('quantidade_litros');
        return $comprado - $vendido;
    }

    private function precoMedioCompradoGeral(Request $request, string $local): float
    {
        $valorCompraFinalSql = $this->entradaNotaValorCompraFinalSql('entrada_notas');
        $entrada = $this->entradasBase($request, $local)
            ->selectRaw("COALESCE(SUM({$valorCompraFinalSql}), 0) as valor, COALESCE(SUM(quantidade), 0) as litros")
            ->first();

        return $this->media((float) ($entrada->valor ?? 0), (float) ($entrada->litros ?? 0));
    }

    private function ultimaEntradaNota(Request $request, string $local): ?array
    {
        $nota = $this->entradasBase($request, $local)
            ->orderByRaw('COALESCE(data_hora, data::timestamp) DESC')
            ->orderByDesc('id_financeiro')
            ->first();

        if (!$nota) {
            return null;
        }

        return [
            'id_financeiro' => (string) $nota->id_financeiro,
            'data' => $nota->data,
            'data_hora' => $nota->data_hora,
            'numero_nota_fiscal' => $nota->numero_nota_fiscal,
            'quantidade' => round((float) $nota->quantidade, 2),
            'valor' => round((float) $nota->valor, 2),
            'valor_litro' => round((float) $nota->valor_litro, 3),
            'custo_transporte_litro' => round((float) ($nota->custo_transporte_litro ?? self::ENTRADA_NOTA_CUSTO_TRANSPORTE_LITRO), 3),
            'custo_transporte_total' => round((float) ($nota->custo_transporte_total ?? ((float) $nota->quantidade * self::ENTRADA_NOTA_CUSTO_TRANSPORTE_LITRO)), 2),
            'valor_compra_final' => round((float) ($nota->valor_compra_final ?? ((float) $nota->valor + ((float) $nota->quantidade * self::ENTRADA_NOTA_CUSTO_TRANSPORTE_LITRO))), 2),
            'tipo' => $nota->tipo,
            'local' => $nota->local,
        ];
    }

    private function controleProprietarios(Request $request, string $local): array
    {
        $proprietarios = $this->proprietariosBase($request, $local)->get();
        $pendencias = $this->aplicarFiltroPendenteBaixa($this->abastecimentosBase($request, $local))
            ->selectRaw('id_proprietario, COALESCE(SUM(valor_total), 0) as valor, COALESCE(SUM(quantidade_litros), 0) as litros')
            ->groupBy('id_proprietario')
            ->get()
            ->keyBy('id_proprietario');

        $bloqueados = 0;
        $proximos = 0;
        $estourados = 0;
        $lista = [];
        $temLimiteFinanceiro = Schema::hasColumn('proprietarios', 'limite_financeiro');
        $temLimiteLitros = Schema::hasColumn('proprietarios', 'limite_litros');
        $temAlertaLimite = Schema::hasColumn('proprietarios', 'alerta_limite_percentual');

        foreach ($proprietarios as $proprietario) {
            $status = mb_strtolower(trim((string) ($proprietario->status ?? '')));
            if ($status === 'bloqueado') {
                $bloqueados++;
            }

            $pendencia = $pendencias->get($proprietario->id_proprietario);
            $pendenteValor = (float) ($pendencia->valor ?? 0);
            $pendenteLitros = (float) ($pendencia->litros ?? 0);
            $limiteFinanceiro = $temLimiteFinanceiro ? (float) ($proprietario->limite_financeiro ?? 0) : 0.0;
            $limiteLitros = $temLimiteLitros ? (float) ($proprietario->limite_litros ?? 0) : 0.0;
            $alerta = $temAlertaLimite ? (float) ($proprietario->alerta_limite_percentual ?? 80) : 80.0;
            if ($alerta <= 0) {
                $alerta = 80.0;
            }

            $percentualFinanceiro = $limiteFinanceiro > 0 ? ($pendenteValor / $limiteFinanceiro) * 100 : null;
            $percentualLitros = $limiteLitros > 0 ? ($pendenteLitros / $limiteLitros) * 100 : null;
            $maiorPercentual = max($percentualFinanceiro ?? 0, $percentualLitros ?? 0);

            $estourado = ($percentualFinanceiro !== null && $percentualFinanceiro > 100)
                || ($percentualLitros !== null && $percentualLitros > 100);
            $proximo = !$estourado && (
                ($percentualFinanceiro !== null && $percentualFinanceiro >= $alerta)
                || ($percentualLitros !== null && $percentualLitros >= $alerta)
            );

            if ($estourado) {
                $estourados++;
            } elseif ($proximo) {
                $proximos++;
            }

            if ($status === 'bloqueado' || $estourado || $proximo) {
                $lista[] = [
                    'id_proprietario' => (string) $proprietario->id_proprietario,
                    'nome' => (string) $proprietario->nome,
                    'status' => (string) ($proprietario->status ?? ''),
                    'local' => (string) ($proprietario->local ?? ''),
                    'pendente_valor' => round($pendenteValor, 2),
                    'pendente_litros' => round($pendenteLitros, 2),
                    'percentual_limite' => round($maiorPercentual, 2),
                    'situacao' => $estourado ? 'estourado' : ($proximo ? 'proximo_limite' : 'bloqueado'),
                ];
            }
        }

        usort($lista, fn (array $a, array $b) => ($b['percentual_limite'] <=> $a['percentual_limite'])
            ?: strcmp($a['nome'], $b['nome']));

        return [
            'bloqueados' => $bloqueados,
            'proximos_limite' => $proximos,
            'limite_estourado' => $estourados,
            'itens' => array_slice($lista, 0, 8),
        ];
    }

    private function filiaisPermitidas(): array
    {
        $user = auth()->user();
        if (!$user) {
            abort(401, 'Não autenticado.');
        }

        return method_exists($user, 'filiaisAcesso') ? $user->filiaisAcesso() : self::LOCAIS;
    }

    private function filiaisParaSeparacao(): array
    {
        $permitidas = $this->filiaisPermitidas();
        $ordenadas = array_values(array_filter(
            self::LOCAIS,
            fn (string $local) => in_array($local, $permitidas, true)
        ));

        return $ordenadas ?: array_values($permitidas);
    }

    private function media(float $valor, float $base): float
    {
        return $base > 0 ? $valor / $base : 0.0;
    }
}
