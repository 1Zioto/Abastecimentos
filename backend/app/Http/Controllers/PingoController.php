<?php

namespace App\Http\Controllers;

use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PingoController extends Controller
{
    private function filiaisPermitidas(): array
    {
        $user = auth()->user();
        if (!$user) abort(401, 'Não autenticado.');
        return method_exists($user, 'filiaisAcesso') ? $user->filiaisAcesso() : ['Matriz', 'Viana'];
    }

    private function base(Request $request, bool $aplicarDatas = true)
    {
        $query = DB::table('abastecimentos as a')
            ->leftJoin('veiculos as v', 'v.id_veiculo', '=', 'a.id_veiculo')
            ->whereNull('a.deleted_at');

        $permitidas = $this->filiaisPermitidas();
        $local = trim((string) $request->input('local'));
        if ($local === '' || !in_array($local, $permitidas, true)) {
            throw ValidationException::withMessages(['local' => 'Selecione uma filial permitida.']);
        }
        $query->where('a.local', $local);

        if ($aplicarDatas) {
            foreach ([['data_inicio', '>='], ['data_fim', '<=']] as [$campo, $op]) {
                if ($request->filled($campo)) $query->whereDate('a.data', $op, $request->input($campo));
            }
        }
        if ($request->filled('proprietario')) $query->where('a.nome_proprietario', $request->input('proprietario'));
        if ($request->filled('motorista')) $query->where('a.nome_motorista', $request->input('motorista'));
        if ($request->filled('placa')) {
            $placa = $request->input('placa');
            $query->where(fn ($q) => $q->where('v.placa', $placa)->orWhere('a.placa1', $placa));
        }
        if ($request->input('situacao') === 'pago') $query->where('a.baixa_abastecimento', true);
        if ($request->input('situacao') === 'pendente') $query->where(fn ($q) => $q->whereNull('a.baixa_abastecimento')->orWhere('a.baixa_abastecimento', false));
        return $query;
    }

    public function opcoes(Request $request): JsonResponse
    {
        $base = $this->base($request);
        $distinct = fn (string $campo) => (clone $base)->whereNotNull($campo)->where($campo, '<>', '')
            ->distinct()->orderBy($campo)->limit(500)->pluck($campo)->values();
        $placas = (clone $base)->selectRaw("DISTINCT COALESCE(NULLIF(v.placa, ''), a.placa1) AS placa")
            ->whereRaw("COALESCE(NULLIF(v.placa, ''), a.placa1) IS NOT NULL")->orderBy('placa')->limit(500)->pluck('placa')->values();
        return response()->json([
            'proprietarios' => $distinct('a.nome_proprietario'),
            'motoristas' => $distinct('a.nome_motorista'),
            'placas' => $placas,
        ]);
    }

    public function perguntar(Request $request): JsonResponse
    {
        $data = $request->validate([
            'pergunta' => ['required', 'string', 'min:3', 'max:1000'],
            'local' => ['required', 'string'],
            'data_inicio' => ['nullable', 'date'], 'data_fim' => ['nullable', 'date', 'after_or_equal:data_inicio'],
            'proprietario' => ['nullable', 'string', 'max:255'], 'motorista' => ['nullable', 'string', 'max:255'],
            'placa' => ['nullable', 'string', 'max:30'], 'situacao' => ['nullable', 'in:todos,pago,pendente'],
            'historico' => ['nullable', 'array', 'max:6'],
            'historico.*.role' => ['required', 'in:user,assistant'],
            'historico.*.text' => ['required', 'string', 'max:1500'],
        ]);
        $base = $this->base($request);
        $resumo = (clone $base)->selectRaw(<<<'SQL'
            COUNT(*) total,
            COUNT(*) FILTER (WHERE a.baixa_abastecimento IS TRUE) pagos,
            COUNT(*) FILTER (WHERE a.baixa_abastecimento IS NOT TRUE) pendentes,
            COALESCE(SUM(a.valor_total) FILTER (WHERE a.baixa_abastecimento IS TRUE), 0) valor_pago,
            COALESCE(SUM(a.valor_total) FILTER (WHERE a.baixa_abastecimento IS NOT TRUE), 0) valor_pendente,
            COALESCE(SUM(a.quantidade_litros),0) litros,
            COALESCE(SUM(a.valor_total),0) valor,
            COALESCE(AVG(a.valor_por_litro),0) preco_medio,
            MIN(a.data) primeira_data,
            MAX(a.data) ultima_data
        SQL)->first();
        $porDia = (clone $base)->selectRaw('a.data, COUNT(*) quantidade, SUM(a.quantidade_litros) litros, SUM(a.valor_total) valor')->groupBy('a.data')->orderBy('a.data')->limit(370)->get();
        $top = function (string $campo) use ($base) {
            return (clone $base)->selectRaw("{$campo} nome, COUNT(*) quantidade, SUM(a.quantidade_litros) litros, SUM(a.valor_total) valor")
                ->whereRaw("{$campo} IS NOT NULL")->groupByRaw($campo)->orderByDesc('valor')->limit(15)->get();
        };
        $topPorQuantidade = function (string $campo) use ($base) {
            return (clone $base)->selectRaw("{$campo} nome, COUNT(*) quantidade, SUM(a.quantidade_litros) litros, SUM(a.valor_total) valor")
                ->whereRaw("{$campo} IS NOT NULL")->groupByRaw($campo)->orderByDesc('quantidade')->limit(15)->get();
        };
        $textoConversa = collect($data['historico'] ?? [])
            ->pluck('text')
            ->push($data['pergunta'])
            ->implode(' ');
        $querDuplicidades = Str::contains(Str::lower(Str::ascii($textoConversa)), [
            'duplic', 'repetid', 'registro igual', 'mesma placa',
        ]);
        $textoNormalizado = Str::lower(Str::ascii($textoConversa));
        $querAuditoria = $querDuplicidades || Str::contains($textoNormalizado, [
            'audit', 'inconsist', 'anomali', 'suspeit', 'irregular', 'erro', 'fora do padrao',
            'sem placa', 'sem motorista', 'sem proprietario', 'sem foto', 'odometro',
        ]);
        $querComparacao = Str::contains($textoNormalizado, [
            'compar', 'mes anterior', 'periodo anterior', 'aument', 'diminu', 'cresceu', 'caiu', 'variacao',
        ]);
        $querProjecao = Str::contains($textoNormalizado, [
            'previs', 'projec', 'tendencia', 'fim do mes', 'fechamento do mes', 'estimativa',
        ]);

        $contexto = [
            'filtros' => collect($data)->except('pergunta')->all(), 'resumo' => $resumo, 'por_dia' => $porDia,
            'top_proprietarios_por_valor' => $top('a.nome_proprietario'),
            'top_proprietarios_por_quantidade' => $topPorQuantidade('a.nome_proprietario'),
            'top_motoristas_por_valor' => $top('a.nome_motorista'),
            'top_motoristas_por_quantidade' => $topPorQuantidade('a.nome_motorista'),
            'top_veiculos' => $top("COALESCE(NULLIF(v.placa, ''), a.placa1)"),
            'top_veiculos_por_quantidade' => $topPorQuantidade("COALESCE(NULLIF(v.placa, ''), a.placa1)"),
        ];
        if ($querDuplicidades) {
            $contexto['analise_duplicidades'] = $this->analisarDuplicidades($base);
        }
        if ($querAuditoria) {
            $contexto['auditoria_operacional'] = $this->analisarAuditoria($base);
        }
        if ($querComparacao) {
            $contexto['comparacao_periodos_mesma_filial'] = $this->compararPeriodos($request);
        }
        if ($querProjecao) {
            $contexto['projecao_mes_atual'] = $this->projetarMesAtual($request);
        }
        $entidades = $this->detalharEntidadesMencionadas($base, $textoNormalizado);
        if ($entidades !== []) {
            $contexto['entidades_mencionadas'] = $entidades;
        }
        $historico = collect($data['historico'] ?? [])->map(fn (array $mensagem) => [
            'role' => $mensagem['role'],
            'content' => $mensagem['text'],
        ])->values()->all();

        $key = (string) env('OPENAI_API_KEY');
        if ($key === '') return response()->json(['message' => 'OPENAI_API_KEY não configurada no servidor.'], 503);
        $response = Http::withToken($key)->timeout(45)->post('https://api.openai.com/v1/chat/completions', [
            'model' => env('OPENAI_MODEL', 'gpt-4.1-mini'), 'temperature' => 0.1, 'max_tokens' => 900,
            'messages' => [
                ['role' => 'system', 'content' => 'Você é o Pingo, analista de abastecimento da VIPE. Responda em português brasileiro, de forma objetiva, usando exclusivamente o JSON fornecido. Nunca invente dados. REGRA ABSOLUTA DE FILIAL: analise somente a filial em filtros.local; nunca compare, misture, mencione totais nem busque dados de outra filial. REGRA DE CONTEXTO: antes de responder, resolva pronomes e perguntas elípticas usando as últimas mensagens. Se a conversa identificou uma pessoa, placa, proprietário ou tipo de análise e a pergunta seguinte complementar critérios ou pedir detalhe, mantenha esse assunto — nunca volte ao resumo global sem pedido explícito. Os filtros atuais prevalecem como escopo numérico. Use rankings por quantidade para "mais abastecimentos" e por valor para "maior gasto". Em analise_duplicidades, trate grupos como candidatos à conferência, nunca como exclusões confirmadas. Em auditoria_operacional, diferencie alertas de evidências conclusivas. Em comparacao_periodos_mesma_filial, compare apenas os dois períodos informados da mesma filial e explique quantidade, litros, valor e preço. Em projecao_mes_atual, declare que é estimativa linear e informe os dias observados. Quando entidades_mencionadas existir, perguntas seguintes como "ele", "essa placa", "valor", "quantidade" ou "detalhe" referem-se à entidade correspondente. Não afirme falta de dados detalhados quando houver análises ou amostras. Você é somente leitura e jamais sugere que realizou alterações. Valores são BRL e volumes são litros. Retorne somente texto natural, sem JSON ou bloco de código.'],
                ...$historico,
                ['role' => 'user', 'content' => "PERGUNTA ATUAL:\n{$data['pergunta']}\n\nDADOS ATUAIS FILTRADOS:\n" . json_encode($contexto, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)],
            ],
        ]);
        if (!$response->successful()) return response()->json(['message' => 'Não foi possível consultar a IA agora.'], 502);
        $texto = trim((string) $response->json('choices.0.message.content'));
        $semCerca = preg_replace('/^```(?:json)?\s*|\s*```$/i', '', $texto) ?? $texto;
        $json = json_decode($semCerca, true);
        if (is_array($json) && is_string($json['resposta'] ?? null)) {
            $texto = trim($json['resposta']);
        }
        $capacidadesUsadas = collect([
            'duplicidades' => isset($contexto['analise_duplicidades']),
            'auditoria' => isset($contexto['auditoria_operacional']),
            'comparacao_temporal' => isset($contexto['comparacao_periodos_mesma_filial']),
            'projecao' => isset($contexto['projecao_mes_atual']),
            'detalhe_entidade' => isset($contexto['entidades_mencionadas']),
        ])->filter()->keys()->values()->all();
        $entidadeAtiva = collect($contexto['entidades_mencionadas'] ?? [])->last();

        return response()->json([
            'resposta' => $texto,
            'resumo' => $resumo,
            'contexto' => [
                'filial' => $data['local'],
                'entidade_ativa' => $entidadeAtiva ? [
                    'tipo' => $entidadeAtiva['tipo'],
                    'nome' => $entidadeAtiva['nome'],
                ] : null,
                'capacidades_usadas' => $capacidadesUsadas,
            ],
        ]);
    }

    /**
     * Localiza candidatos a duplicidade no escopo já autorizado e filtrado.
     * A coincidência de placa + litros é um indício para conferência, não uma
     * confirmação automática de que um registro deve ser removido.
     */
    private function analisarDuplicidades($base): array
    {
        $placaSql = "UPPER(TRIM(COALESCE(NULLIF(v.placa, ''), a.placa1)))";
        $litrosSql = 'ROUND(CAST(a.quantidade_litros AS numeric), 2)';

        $grupos = (clone $base)
            ->selectRaw("{$placaSql} placa, {$litrosSql} quantidade_litros, COUNT(*) ocorrencias")
            ->whereRaw("COALESCE(NULLIF(v.placa, ''), a.placa1) IS NOT NULL")
            ->whereNotNull('a.quantidade_litros')
            ->groupByRaw("{$placaSql}, {$litrosSql}")
            ->havingRaw('COUNT(*) > 1')
            ->orderByDesc('ocorrencias')
            ->limit(25)
            ->get();

        $amostras = $grupos->map(function ($grupo) use ($base, $placaSql, $litrosSql) {
            $registros = (clone $base)
                ->whereRaw("{$placaSql} = ?", [$grupo->placa])
                ->whereRaw("{$litrosSql} = ?", [$grupo->quantidade_litros])
                ->selectRaw("a.id_abastecimento, a.data, a.data_hora, {$placaSql} placa, a.quantidade_litros, a.valor_total, a.nome_motorista, a.nome_proprietario")
                ->orderBy('a.data_hora')
                ->limit(10)
                ->get();

            return [
                'placa' => $grupo->placa,
                'quantidade_litros' => (float) $grupo->quantidade_litros,
                'ocorrencias' => (int) $grupo->ocorrencias,
                'registros' => $registros,
            ];
        })->values();

        return [
            'criterio' => ['placa', 'quantidade_litros_arredondada_2_casas'],
            'classificacao' => 'possiveis_duplicidades_para_conferencia',
            'total_grupos_encontrados' => $grupos->count(),
            'total_registros_nos_grupos' => $grupos->sum(fn ($grupo) => (int) $grupo->ocorrencias),
            'resultado_limitado' => $grupos->count() === 25,
            'grupos' => $amostras,
        ];
    }

    private function analisarAuditoria($base): array
    {
        $placaSql = "COALESCE(NULLIF(v.placa, ''), NULLIF(a.placa1, ''))";
        $resumo = (clone $base)->selectRaw(<<<SQL
            COUNT(*) FILTER (WHERE {$placaSql} IS NULL) sem_placa,
            COUNT(*) FILTER (WHERE NULLIF(TRIM(a.nome_motorista), '') IS NULL) sem_motorista,
            COUNT(*) FILTER (WHERE NULLIF(TRIM(a.nome_proprietario), '') IS NULL) sem_proprietario,
            COUNT(*) FILTER (WHERE NULLIF(TRIM(a.bomba), '') IS NULL) sem_foto_bomba,
            COUNT(*) FILTER (WHERE LOWER(COALESCE(a.status, '')) = 'inconsistente') marcados_inconsistentes,
            COUNT(*) FILTER (WHERE a.quantidade_litros IS NOT NULL AND a.valor_por_litro IS NOT NULL
                AND a.valor_total IS NOT NULL
                AND ABS(a.valor_total - (a.quantidade_litros * a.valor_por_litro)) > 0.05) calculo_divergente
        SQL)->first();

        $estatisticasPreco = (clone $base)
            ->selectRaw('a.tipo_combustivel tipo, AVG(a.valor_por_litro) media, STDDEV_POP(a.valor_por_litro) desvio')
            ->whereNotNull('a.valor_por_litro')
            ->groupBy('a.tipo_combustivel')
            ->get();
        $precosForaPadrao = collect();
        foreach ($estatisticasPreco as $estatistica) {
            $desvio = (float) $estatistica->desvio;
            if ($desvio <= 0) continue;
            $limite = max($desvio * 2, (float) $estatistica->media * 0.10);
            $amostras = (clone $base)
                ->where('a.tipo_combustivel', $estatistica->tipo)
                ->whereRaw('ABS(a.valor_por_litro - ?) > ?', [(float) $estatistica->media, $limite])
                ->selectRaw("a.id_abastecimento, a.data, {$placaSql} placa, a.tipo_combustivel, a.valor_por_litro, a.quantidade_litros, a.valor_total")
                ->orderByDesc('a.data_hora')->limit(10)->get();
            if ($amostras->isNotEmpty()) {
                $precosForaPadrao->push([
                    'combustivel' => $estatistica->tipo,
                    'preco_medio' => round((float) $estatistica->media, 3),
                    'criterio_desvio_absoluto' => round($limite, 3),
                    'registros' => $amostras,
                ]);
            }
        }

        $registros = (clone $base)
            ->selectRaw("a.id_abastecimento, a.data, a.data_hora, {$placaSql} placa, a.nome_motorista, a.nome_proprietario, a.quantidade_litros, a.valor_por_litro, a.valor_total, a.odometro, a.status")
            ->orderBy('placa')->orderBy('a.data_hora')->limit(1500)->get();
        $muitoProximos = [];
        $odometrosRegressivos = [];
        foreach ($registros->groupBy(fn ($r) => strtoupper(trim((string) $r->placa))) as $placa => $itens) {
            if ($placa === '') continue;
            $anterior = null;
            foreach ($itens as $item) {
                if ($anterior && $anterior->data_hora && $item->data_hora) {
                    $minutos = CarbonImmutable::parse($anterior->data_hora)->diffInMinutes(CarbonImmutable::parse($item->data_hora));
                    if ($minutos <= 60 && count($muitoProximos) < 20) {
                        $muitoProximos[] = ['placa' => $placa, 'intervalo_minutos' => $minutos, 'anterior' => $anterior, 'atual' => $item];
                    }
                }
                if ($anterior && (float) $anterior->odometro > 0 && (float) $item->odometro > 0
                    && (float) $item->odometro <= (float) $anterior->odometro && count($odometrosRegressivos) < 20) {
                    $odometrosRegressivos[] = ['placa' => $placa, 'anterior' => $anterior, 'atual' => $item];
                }
                $anterior = $item;
            }
        }

        return [
            'resumo' => $resumo,
            'precos_fora_do_padrao' => $precosForaPadrao,
            'abastecimentos_ate_60_minutos_na_mesma_placa' => $muitoProximos,
            'odometros_nao_crescentes' => $odometrosRegressivos,
            'limite_registros_avaliados_em_sequencia' => 1500,
            'observacao' => 'Alertas são candidatos para conferência e não autorizam alteração de registros.',
        ];
    }

    private function compararPeriodos(Request $request): array
    {
        $fimAtual = $request->filled('data_fim')
            ? CarbonImmutable::parse((string) $request->input('data_fim'))->endOfDay()
            : CarbonImmutable::now()->endOfDay();
        $inicioAtual = $request->filled('data_inicio')
            ? CarbonImmutable::parse((string) $request->input('data_inicio'))->startOfDay()
            : $fimAtual->startOfMonth();
        $dias = $inicioAtual->diffInDays($fimAtual) + 1;
        $fimAnterior = $inicioAtual->subDay()->endOfDay();
        $inicioAnterior = $fimAnterior->subDays($dias - 1)->startOfDay();

        $resumir = function ($query, CarbonImmutable $inicio, CarbonImmutable $fim) {
            return $query->whereDate('a.data', '>=', $inicio->toDateString())
                ->whereDate('a.data', '<=', $fim->toDateString())
                ->selectRaw('COUNT(*) quantidade, COALESCE(SUM(a.quantidade_litros),0) litros, COALESCE(SUM(a.valor_total),0) valor, COALESCE(AVG(a.valor_por_litro),0) preco_medio')
                ->first();
        };
        $atual = $resumir($this->base($request, false), $inicioAtual, $fimAtual);
        $anterior = $resumir($this->base($request, false), $inicioAnterior, $fimAnterior);
        $variacao = fn ($a, $b) => (float) $b === 0.0 ? null : round((((float) $a - (float) $b) / (float) $b) * 100, 2);

        return [
            'filial' => (string) $request->input('local'),
            'periodo_atual' => ['inicio' => $inicioAtual->toDateString(), 'fim' => $fimAtual->toDateString(), 'dados' => $atual],
            'periodo_anterior' => ['inicio' => $inicioAnterior->toDateString(), 'fim' => $fimAnterior->toDateString(), 'dados' => $anterior],
            'variacao_percentual' => [
                'quantidade' => $variacao($atual->quantidade, $anterior->quantidade),
                'litros' => $variacao($atual->litros, $anterior->litros),
                'valor' => $variacao($atual->valor, $anterior->valor),
                'preco_medio' => $variacao($atual->preco_medio, $anterior->preco_medio),
            ],
        ];
    }

    private function projetarMesAtual(Request $request): array
    {
        $hoje = CarbonImmutable::now();
        $inicio = $hoje->startOfMonth();
        $resumo = $this->base($request, false)
            ->whereDate('a.data', '>=', $inicio->toDateString())
            ->whereDate('a.data', '<=', $hoje->toDateString())
            ->selectRaw('COUNT(*) quantidade, COALESCE(SUM(a.quantidade_litros),0) litros, COALESCE(SUM(a.valor_total),0) valor')
            ->first();
        $diasObservados = max(1, $inicio->diffInDays($hoje) + 1);
        $fator = $hoje->daysInMonth / $diasObservados;

        return [
            'filial' => (string) $request->input('local'),
            'mes' => $hoje->format('Y-m'),
            'dias_observados' => $diasObservados,
            'dias_no_mes' => $hoje->daysInMonth,
            'realizado' => $resumo,
            'estimativa_linear_fim_do_mes' => [
                'quantidade' => (int) round((float) $resumo->quantidade * $fator),
                'litros' => round((float) $resumo->litros * $fator, 2),
                'valor' => round((float) $resumo->valor * $fator, 2),
            ],
        ];
    }

    private function detalharEntidadesMencionadas($base, string $textoNormalizado): array
    {
        $configuracoes = [
            'motorista' => 'a.nome_motorista',
            'proprietario' => 'a.nome_proprietario',
            'placa' => "COALESCE(NULLIF(v.placa, ''), a.placa1)",
        ];
        $resultado = [];
        foreach ($configuracoes as $tipo => $campo) {
            $nomes = (clone $base)->selectRaw("DISTINCT {$campo} nome")
                ->whereRaw("{$campo} IS NOT NULL")->limit(500)->pluck('nome');
            $mencionado = $nomes->first(function ($nome) use ($textoNormalizado) {
                $normalizado = Str::lower(Str::ascii(trim((string) $nome)));
                return mb_strlen($normalizado) >= 3 && Str::contains($textoNormalizado, $normalizado);
            });
            if (!$mencionado) continue;
            $dados = (clone $base)->whereRaw("UPPER(TRIM({$campo})) = UPPER(TRIM(?))", [$mencionado])
                ->selectRaw('COUNT(*) quantidade, COALESCE(SUM(a.quantidade_litros),0) litros, COALESCE(SUM(a.valor_total),0) valor, COALESCE(AVG(a.valor_por_litro),0) preco_medio, COUNT(*) FILTER (WHERE a.baixa_abastecimento IS NOT TRUE) pendentes')
                ->first();
            $resultado[] = ['tipo' => $tipo, 'nome' => $mencionado, 'dados' => $dados];
        }
        return $resultado;
    }
}
