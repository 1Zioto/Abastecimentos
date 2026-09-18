<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class GraficosGerenciaisController extends Controller
{
    private const LOCAIS = ['Matriz', 'Viana'];

    /**
     * Chave usada para a linha de total geral vinda do GROUPING SETS
     * (local NULL) nos mapas por filial.
     */
    private const CHAVE_GERAL = '__todas__';

    public function index(Request $request): JsonResponse
    {
        $this->garantirCustoTransporteEntradaNotas();

        $dataInicio = $request->query('data_inicio') ?: now()->startOfMonth()->toDateString();
        $dataFim = $request->query('data_fim') ?: now()->toDateString();
        $local = trim((string) $request->query('local', ''));

        // Todos os agregados (geral + por filial) são coletados de uma vez com
        // GROUPING SETS — antes o resumo inteiro era recalculado 3x (geral,
        // Matriz e Viana), repetindo ~8 queries por passada no banco remoto.
        $dados = $this->coletarDados($request, $dataInicio, $dataFim);

        $resumo = $this->montarResumoDeDados($dados, $local, $dataInicio, $dataFim);
        $resumo['por_filial'] = array_map(
            fn (string $filial) => $this->montarResumoDeDados($dados, $filial, $dataInicio, $dataFim),
            $this->filiaisParaSeparacao()
        );

        return new JsonResponse($resumo);
    }

    private function coletarDados(Request $request, string $dataInicio, string $dataFim): array
    {
        $valorCompraFinalSql = $this->entradaNotaValorCompraFinalSql('entrada_notas');
        $custoTransporteSql = $this->entradaNotaCustoTransporteSql('entrada_notas');
        $pendenteSql = $this->tabelaTemColuna('abastecimentos', 'baixa_abastecimento')
            ? 'baixa_abastecimento IS NOT TRUE'
            : "LOWER(COALESCE(status, '')) <> 'pago'";
        $periodo = 'data >= ? AND data <= ?';
        $bind = [$dataInicio, $dataFim];

        // Vendas: métricas do período via FILTER + litros totais (tanque),
        // agrupadas por filial com uma linha extra de total geral.
        $vendas = $this->abastecimentosBase($request, '')
            ->selectRaw("
                local,
                COUNT(*) FILTER (WHERE {$periodo}) as total,
                COALESCE(SUM(quantidade_litros) FILTER (WHERE {$periodo}), 0) as litros,
                COALESCE(SUM(valor_total) FILTER (WHERE {$periodo}), 0) as valor,
                COALESCE(SUM(quantidade_litros) FILTER (WHERE {$periodo} AND {$pendenteSql}), 0) as pendente_litros,
                COALESCE(SUM(valor_total) FILTER (WHERE {$periodo} AND {$pendenteSql}), 0) as pendente_valor,
                COUNT(*) FILTER (WHERE {$periodo} AND {$pendenteSql}) as pendente_total,
                COUNT(*) FILTER (WHERE {$periodo} AND LOWER(COALESCE(status, '')) = 'inconsistente') as inconsistencias,
                COALESCE(SUM(quantidade_litros), 0) as litros_all
            ", array_merge($bind, $bind, $bind, $bind, $bind, $bind, $bind))
            ->groupByRaw('GROUPING SETS ((local), ())')
            ->get();

        // Entradas: compras do período + litros totais (tanque) + somas gerais
        // para o preço médio comprado de fallback.
        $entradas = $this->entradasBase($request, '')
            ->selectRaw("
                local,
                COUNT(*) FILTER (WHERE {$periodo}) as total,
                COALESCE(SUM(quantidade) FILTER (WHERE {$periodo}), 0) as litros,
                COALESCE(SUM(valor) FILTER (WHERE {$periodo}), 0) as valor_sem_transporte,
                COALESCE(SUM({$valorCompraFinalSql}) FILTER (WHERE {$periodo}), 0) as valor,
                COALESCE(SUM({$custoTransporteSql}) FILTER (WHERE {$periodo}), 0) as custo_transporte,
                COALESCE(SUM(quantidade), 0) as litros_all,
                COALESCE(SUM({$valorCompraFinalSql}), 0) as valor_all
            ", array_merge($bind, $bind, $bind, $bind, $bind))
            ->groupByRaw('GROUPING SETS ((local), ())')
            ->get();

        // Última entrada de nota por filial em uma query (DISTINCT ON);
        // o "geral" é o mais recente entre as filiais.
        $ultimas = $this->entradasBase($request, '')
            ->selectRaw('DISTINCT ON (local) *')
            ->orderByRaw('local, COALESCE(data_hora, data::timestamp) DESC, id_financeiro DESC')
            ->get();

        // Proprietários (uma carga) + pendências por proprietário e filial.
        $proprietarios = $this->proprietariosBase($request, '')->get();
        $pendencias = $this->aplicarFiltroPendenteBaixa($this->abastecimentosBase($request, ''))
            ->selectRaw('id_proprietario, local, COALESCE(SUM(valor_total), 0) as valor, COALESCE(SUM(quantidade_litros), 0) as litros')
            ->groupBy('id_proprietario', 'local')
            ->get();

        return [
            'vendas' => $this->porLocal($vendas),
            'entradas' => $this->porLocal($entradas),
            'ultimas' => $ultimas,
            'proprietarios' => $proprietarios,
            'pendencias' => $pendencias,
        ];
    }

    /** Indexa a coleção agrupada por filial; linha com local NULL vira o total geral. */
    private function porLocal($rows): array
    {
        $map = [];
        foreach ($rows as $row) {
            $map[$row->local === null ? self::CHAVE_GERAL : (string) $row->local] = $row;
        }
        return $map;
    }

    private function montarResumoDeDados(array $dados, string $local, string $dataInicio, string $dataFim): array
    {
        $chave = $local === '' ? self::CHAVE_GERAL : $local;
        $vendas = $dados['vendas'][$chave] ?? null;
        $compras = $dados['entradas'][$chave] ?? null;

        $tanqueLitros = (float) ($dados['entradas'][$chave]->litros_all ?? 0)
            - (float) ($dados['vendas'][$chave]->litros_all ?? 0);

        $precoMedioComprado = $this->media((float) ($compras->valor ?? 0), (float) ($compras->litros ?? 0));
        if ($precoMedioComprado <= 0) {
            $precoMedioComprado = $this->media(
                (float) ($compras->valor_all ?? 0),
                (float) ($compras->litros_all ?? 0)
            );
        }

        $precoMedioVendido = $this->media((float) ($vendas->valor ?? 0), (float) ($vendas->litros ?? 0));
        $ultimaEntrada = $this->ultimaEntradaNotaDeDados($dados['ultimas'], $local);
        $controleProprietarios = $this->controleProprietariosDeDados($dados, $local);

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

    private function aplicarFiltroPendenteBaixa($query)
    {
        if (!$this->tabelaTemColuna('abastecimentos', 'baixa_abastecimento')) {
            return $query->whereRaw("LOWER(COALESCE(status, '')) <> 'pago'");
        }

        return $query->whereRaw('baixa_abastecimento IS NOT TRUE');
    }

    /** Seleciona a última entrada para a filial (ou a mais recente geral). */
    private function ultimaEntradaNotaDeDados($ultimas, string $local): ?array
    {
        $candidatas = $local === ''
            ? $ultimas
            : $ultimas->filter(fn ($n) => mb_strtolower((string) $n->local) === mb_strtolower($local));

        $nota = $candidatas
            ->sortByDesc(fn ($n) => [(string) ($n->data_hora ?? ($n->data . ' 00:00:00')), (string) $n->id_financeiro])
            ->first();

        if (!$nota) {
            return null;
        }

        $custoLitro = (float) ($nota->custo_transporte_litro ?? self::ENTRADA_NOTA_CUSTO_TRANSPORTE_LITRO);

        return [
            'id_financeiro' => (string) $nota->id_financeiro,
            'data' => $nota->data,
            'data_hora' => $nota->data_hora,
            'numero_nota_fiscal' => $nota->numero_nota_fiscal,
            'quantidade' => round((float) $nota->quantidade, 2),
            'valor' => round((float) $nota->valor, 2),
            'valor_litro' => round((float) $nota->valor_litro, 3),
            'custo_transporte_litro' => round($custoLitro, 3),
            'custo_transporte_total' => round((float) ($nota->custo_transporte_total ?? ((float) $nota->quantidade * $custoLitro)), 2),
            'valor_compra_final' => round((float) ($nota->valor_compra_final ?? ((float) $nota->valor + ((float) $nota->quantidade * $custoLitro))), 2),
            'tipo' => $nota->tipo,
            'local' => $nota->local,
        ];
    }

    private function controleProprietariosDeDados(array $dados, string $local): array
    {
        $proprietarios = $local === ''
            ? $dados['proprietarios']
            : $dados['proprietarios']->filter(
                fn ($p) => mb_strtolower((string) ($p->local ?? '')) === mb_strtolower($local)
            );

        // Pendências por proprietário no escopo: filial específica usa a linha
        // (proprietario, local); o geral soma as filiais.
        $pendencias = [];
        foreach ($dados['pendencias'] as $row) {
            if ($local !== '' && mb_strtolower((string) $row->local) !== mb_strtolower($local)) {
                continue;
            }
            $id = (string) $row->id_proprietario;
            $pendencias[$id] = [
                'valor' => ($pendencias[$id]['valor'] ?? 0) + (float) $row->valor,
                'litros' => ($pendencias[$id]['litros'] ?? 0) + (float) $row->litros,
            ];
        }

        $bloqueados = 0;
        $proximos = 0;
        $estourados = 0;
        $lista = [];
        $temLimiteFinanceiro = $this->tabelaTemColuna('proprietarios', 'limite_financeiro');
        $temLimiteLitros = $this->tabelaTemColuna('proprietarios', 'limite_litros');
        $temAlertaLimite = $this->tabelaTemColuna('proprietarios', 'alerta_limite_percentual');

        foreach ($proprietarios as $proprietario) {
            $status = mb_strtolower(trim((string) ($proprietario->status ?? '')));
            if ($status === 'bloqueado') {
                $bloqueados++;
            }

            $pendencia = $pendencias[(string) $proprietario->id_proprietario] ?? null;
            $pendenteValor = (float) ($pendencia['valor'] ?? 0);
            $pendenteLitros = (float) ($pendencia['litros'] ?? 0);
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
