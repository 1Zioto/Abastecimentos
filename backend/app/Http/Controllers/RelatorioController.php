<?php

namespace App\Http\Controllers;

use App\Models\Abastecimento;
use App\Models\Proprietario;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Log;
use Barryvdh\DomPDF\Facade\Pdf;

class RelatorioController extends Controller
{
    private function aplicarFiltroFiliais($query, Request $request)
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
            $request->query('local')
        );
    }

    private function pdfRuntimeOptions(): array
    {
        $tmpBase = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR);

        return [
            'defaultFont' => 'Helvetica',
            'isHtml5ParserEnabled' => true,
            'isRemoteEnabled' => false,
            'tempDir' => $tmpBase,
            'chroot' => base_path(),
        ];
    }

    private function aplicarFiltroBaixaOuStatusImagem($query, ?string $status)
    {
        $status = trim((string) $status);
        if ($status === '') {
            return $query;
        }

        $normalizado = mb_strtolower($status);
        if ($normalizado === 'pago') {
            return $query->whereRaw('baixa_abastecimento IS TRUE');
        }
        if ($normalizado === 'pendente') {
            return $query->whereRaw('baixa_abastecimento IS NOT TRUE');
        }

        return $query->where('status', $status);
    }

    public function porProprietario(Request $request)
    {
        $request->validate([
            'id_proprietario' => 'nullable|exists:proprietarios,id_proprietario',
        ]);

        $proprietario = $request->filled('id_proprietario')
            ? Proprietario::findOrFail($request->id_proprietario)
            : null;

        $query = Abastecimento::with(['veiculo','motorista','proprietario']);
        if ($request->filled('id_proprietario')) {
            $query->where('id_proprietario', $request->id_proprietario);
        }
        // Excluir abastecimentos excluídos/inativados do relatório (senão um
        // abastecimento apagado ainda aparece, inclusive como pendente).
        $this->aplicarFiltroAtivos($query, 'abastecimentos', $request);
        $this->aplicarFiltroFiliais($query, $request);

        if ($request->filled('data_inicio')) {
            $query->whereDate('data', '>=', $request->data_inicio);
        }
        if ($request->filled('data_fim')) {
            $query->whereDate('data', '<=', $request->data_fim);
        }
        if ($request->filled('status')) {
            $this->aplicarFiltroBaixaOuStatusImagem($query, $request->status);
        }
        if ($request->filled('id_veiculo')) {
            $query->where('id_veiculo', $request->id_veiculo);
        }

        $abastecimentos = $query->orderByDesc('data_hora')->get([
            'id_abastecimento','data_hora','id_veiculo','id_motorista','id_proprietario',
            'nome_motorista','nome_proprietario','quantidade_litros','valor_por_litro',
            'valor_total','status','tipo_combustivel','baixa_abastecimento'
        ]);

        $totais = [
            'quantidade_litros' => $abastecimentos->sum('quantidade_litros'),
            'valor_total'        => $abastecimentos->sum('valor_total'),
            'registros'          => $abastecimentos->count(),
        ];

        return new \Illuminate\Http\JsonResponse([
            'proprietario'   => $proprietario,
            'abastecimentos' => $abastecimentos,
            'totais'         => $totais,
            'filtros'        => $request->only(['id_proprietario','data_inicio','data_fim','status','id_veiculo']),
        ]);
    }

    public function porProprietarioPdf(Request $request)
    {
        try {
            $request->validate([
                'id_proprietario' => 'required|exists:proprietarios,id_proprietario',
            ]);

            $proprietario = Proprietario::findOrFail($request->id_proprietario);

            $query = Abastecimento::with(['veiculo','motorista'])
                ->where('id_proprietario', $request->id_proprietario);
            $this->aplicarFiltroAtivos($query, 'abastecimentos', $request);
            $this->aplicarFiltroFiliais($query, $request);

            if ($request->filled('data_inicio')) $query->whereDate('data', '>=', $request->data_inicio);
            if ($request->filled('data_fim'))    $query->whereDate('data', '<=', $request->data_fim);
            if ($request->filled('status'))      $this->aplicarFiltroBaixaOuStatusImagem($query, $request->status);
            if ($request->filled('id_veiculo'))  $query->where('id_veiculo', $request->id_veiculo);

            $abastecimentos = $query->orderByDesc('data_hora')->get();
            $totais = [
                'quantidade_litros' => $abastecimentos->sum('quantidade_litros'),
                'valor_total'        => $abastecimentos->sum('valor_total'),
            ];

            $pdf = Pdf::setOption($this->pdfRuntimeOptions())
                ->loadView('pdf.relatorio_proprietario', compact('proprietario','abastecimentos','totais','request'))
                ->setPaper('a4', 'portrait');

            $safeOwner = Str::slug((string) $proprietario->nome, '_');
            $safeOwner = $safeOwner !== '' ? $safeOwner : (string) $proprietario->id_proprietario;
            $filename = "relatorio_{$safeOwner}.pdf";

            return $pdf->download($filename);
        } catch (\Throwable $e) {
            Log::error('Erro ao gerar PDF de relatório por proprietário', [
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return new \Illuminate\Http\JsonResponse([
                'message' => 'Erro ao gerar PDF do relatório.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function faturamentoMensal(Request $request)
    {
        $local = trim((string) $request->query('local', ''));
        $dataInicio = $request->query('data_inicio');
        $dataFim = $request->query('data_fim');
        $segmentoFiltro = trim((string) $request->query('segmento', '')); // 'frota', 'terceiros'

        $baseQuery = Abastecimento::query();
        $this->aplicarFiltroAtivos($baseQuery, 'abastecimentos', $request);
        $this->aplicarFiltroFiliais($baseQuery, $request);

        if (!empty($dataInicio)) {
            $baseQuery->whereDate('data', '>=', $dataInicio);
        }
        if (!empty($dataFim)) {
            $baseQuery->whereDate('data', '<=', $dataFim);
        }
        if ($segmentoFiltro === 'frota') {
            $baseQuery->whereRaw("UPPER(COALESCE(nome_proprietario, '')) LIKE '%VIPE%'");
        } elseif ($segmentoFiltro === 'terceiros') {
            $baseQuery->whereRaw("UPPER(COALESCE(nome_proprietario, '')) NOT LIKE '%VIPE%'");
        }

        // 1. Resumo consolidado mês a mês
        $resumoMensal = (clone $baseQuery)
            ->selectRaw("
                TO_CHAR(data, 'YYYY-MM') as mes,
                COUNT(*) as total_abastecimentos,
                ROUND(COALESCE(SUM(quantidade_litros), 0)::numeric, 2) as litros,
                ROUND(COALESCE(SUM(valor_total), 0)::numeric, 2) as valor_total,
                ROUND(COALESCE(AVG(valor_por_litro), 0)::numeric, 3) as preco_medio,
                ROUND((COALESCE(SUM(valor_total), 0) / NULLIF(COUNT(*), 0))::numeric, 2) as ticket_medio,
                ROUND(COALESCE(SUM(CASE WHEN baixa_abastecimento IS TRUE THEN valor_total ELSE 0 END), 0)::numeric, 2) as valor_recebido,
                ROUND(COALESCE(SUM(CASE WHEN baixa_abastecimento IS NOT TRUE THEN valor_total ELSE 0 END), 0)::numeric, 2) as valor_pendente
            ")
            ->groupByRaw("TO_CHAR(data, 'YYYY-MM')")
            ->orderByRaw("TO_CHAR(data, 'YYYY-MM') DESC")
            ->get();

        // 2. Resumo por filial e mês
        $porFilial = (clone $baseQuery)
            ->selectRaw("
                TO_CHAR(data, 'YYYY-MM') as mes,
                COALESCE(local, 'Não Informado') as local,
                COUNT(*) as total_abastecimentos,
                ROUND(COALESCE(SUM(quantidade_litros), 0)::numeric, 2) as litros,
                ROUND(COALESCE(SUM(valor_total), 0)::numeric, 2) as valor_total,
                ROUND(COALESCE(AVG(valor_por_litro), 0)::numeric, 3) as preco_medio,
                ROUND(COALESCE(SUM(CASE WHEN baixa_abastecimento IS TRUE THEN valor_total ELSE 0 END), 0)::numeric, 2) as valor_recebido,
                ROUND(COALESCE(SUM(CASE WHEN baixa_abastecimento IS NOT TRUE THEN valor_total ELSE 0 END), 0)::numeric, 2) as valor_pendente
            ")
            ->groupByRaw("TO_CHAR(data, 'YYYY-MM'), local")
            ->orderByRaw("TO_CHAR(data, 'YYYY-MM') DESC, local ASC")
            ->get();

        // 3. Resumo por segmento (Frota Própria vs Terceiros) e mês
        $porSegmento = (clone $baseQuery)
            ->selectRaw("
                TO_CHAR(data, 'YYYY-MM') as mes,
                CASE 
                    WHEN UPPER(COALESCE(nome_proprietario, '')) LIKE '%VIPE%' THEN 'Frota Própria (VIPE)'
                    ELSE 'Terceiros / Parceiros'
                END as segmento,
                COUNT(*) as total_abastecimentos,
                ROUND(COALESCE(SUM(quantidade_litros), 0)::numeric, 2) as litros,
                ROUND(COALESCE(SUM(valor_total), 0)::numeric, 2) as valor_total,
                ROUND(COALESCE(AVG(valor_por_litro), 0)::numeric, 3) as preco_medio,
                ROUND(COALESCE(SUM(CASE WHEN baixa_abastecimento IS TRUE THEN valor_total ELSE 0 END), 0)::numeric, 2) as valor_recebido,
                ROUND(COALESCE(SUM(CASE WHEN baixa_abastecimento IS NOT TRUE THEN valor_total ELSE 0 END), 0)::numeric, 2) as valor_pendente
            ")
            ->groupByRaw("TO_CHAR(data, 'YYYY-MM'), 2")
            ->orderByRaw("TO_CHAR(data, 'YYYY-MM') DESC, 2 ASC")
            ->get();

        // 4. Top Proprietários / Clientes
        $topProprietarios = (clone $baseQuery)
            ->selectRaw("
                COALESCE(nome_proprietario, 'Não Identificado') as proprietario,
                COUNT(*) as total_abastecimentos,
                ROUND(COALESCE(SUM(quantidade_litros), 0)::numeric, 2) as litros,
                ROUND(COALESCE(SUM(valor_total), 0)::numeric, 2) as valor_total,
                ROUND(COALESCE(SUM(CASE WHEN baixa_abastecimento IS TRUE THEN valor_total ELSE 0 END), 0)::numeric, 2) as valor_recebido,
                ROUND(COALESCE(SUM(CASE WHEN baixa_abastecimento IS NOT TRUE THEN valor_total ELSE 0 END), 0)::numeric, 2) as valor_pendente
            ")
            ->groupByRaw("COALESCE(nome_proprietario, 'Não Identificado')")
            ->orderByDesc('valor_total')
            ->limit(50)
            ->get();

        // 5. Totais Gerais do Período
        $totaisGerais = (clone $baseQuery)
            ->selectRaw("
                COUNT(*) as total_abastecimentos,
                ROUND(COALESCE(SUM(quantidade_litros), 0)::numeric, 2) as litros,
                ROUND(COALESCE(SUM(valor_total), 0)::numeric, 2) as valor_total,
                ROUND(COALESCE(AVG(valor_por_litro), 0)::numeric, 3) as preco_medio,
                ROUND((COALESCE(SUM(valor_total), 0) / NULLIF(COUNT(*), 0))::numeric, 2) as ticket_medio,
                ROUND(COALESCE(SUM(CASE WHEN baixa_abastecimento IS TRUE THEN valor_total ELSE 0 END), 0)::numeric, 2) as valor_recebido,
                ROUND(COALESCE(SUM(CASE WHEN baixa_abastecimento IS NOT TRUE THEN valor_total ELSE 0 END), 0)::numeric, 2) as valor_pendente
            ")
            ->first();

        return new \Illuminate\Http\JsonResponse([
            'resumo_mensal' => $resumoMensal,
            'por_filial' => $porFilial,
            'por_segmento' => $porSegmento,
            'top_proprietarios' => $topProprietarios,
            'totais' => $totaisGerais,
            'filtros' => [
                'local' => $local,
                'data_inicio' => $dataInicio,
                'data_fim' => $dataFim,
                'segmento' => $segmentoFiltro,
            ]
        ]);
    }

    public function faturamentoMensalDetalhado(Request $request)
    {
        $query = Abastecimento::with(['veiculo', 'motorista', 'proprietario']);
        $this->aplicarFiltroAtivos($query, 'abastecimentos', $request);
        $this->aplicarFiltroFiliais($query, $request);

        if ($request->filled('data_inicio')) {
            $query->whereDate('data', '>=', $request->data_inicio);
        }
        if ($request->filled('data_fim')) {
            $query->whereDate('data', '<=', $request->data_fim);
        }
        if ($request->filled('mes')) {
            $query->whereRaw("TO_CHAR(data, 'YYYY-MM') = ?", [$request->mes]);
        }
        if ($request->filled('status')) {
            $this->aplicarFiltroBaixaOuStatusImagem($query, $request->status);
        }
        if ($request->query('segmento') === 'frota') {
            $query->whereRaw("UPPER(COALESCE(nome_proprietario, '')) LIKE '%VIPE%'");
        } elseif ($request->query('segmento') === 'terceiros') {
            $query->whereRaw("UPPER(COALESCE(nome_proprietario, '')) NOT LIKE '%VIPE%'");
        }
        if ($request->filled('id_proprietario')) {
            $query->where('id_proprietario', $request->id_proprietario);
        }
        if ($request->filled('id_veiculo')) {
            $query->where('id_veiculo', $request->id_veiculo);
        }

        // Paginação rigorosa de 50 registros por página (conforme AGENTS.md)
        $abastecimentos = $query->orderByDesc('data_hora')->paginate(50);

        return new \Illuminate\Http\JsonResponse($abastecimentos);
    }
}

