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
            return $query->whereRaw('COALESCE(baixa_abastecimento, false) = true');
        }
        if ($normalizado === 'pendente') {
            return $query->whereRaw('COALESCE(baixa_abastecimento, false) = false');
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
                'filters' => $request->all(),
            ]);

            return new \Illuminate\Http\JsonResponse([
                'message' => 'Erro ao gerar PDF do relatório.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}
