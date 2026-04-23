<?php

namespace App\Http\Controllers;

use App\Models\Abastecimento;
use App\Models\Proprietario;
use Illuminate\Http\Request;
use Barryvdh\DomPDF\Facade\Pdf;

class RelatorioController extends Controller
{
    public function porProprietario(Request $request)
    {
        $request->validate([
            'id_proprietario' => 'required|exists:proprietarios,id_proprietario',
        ]);

        $proprietario = Proprietario::findOrFail($request->id_proprietario);

        $query = Abastecimento::with(['veiculo','motorista'])
            ->where('id_proprietario', $request->id_proprietario);

        if ($request->filled('data_inicio')) {
            $query->whereDate('data', '>=', $request->data_inicio);
        }
        if ($request->filled('data_fim')) {
            $query->whereDate('data', '<=', $request->data_fim);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('id_veiculo')) {
            $query->where('id_veiculo', $request->id_veiculo);
        }

        $abastecimentos = $query->orderByDesc('data_hora')->get([
            'id_abastecimento','data_hora','id_veiculo','id_motorista',
            'nome_motorista','quantidade_litros','valor_por_litro','valor_total','status','tipo_combustivel'
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
            'filtros'        => $request->only(['data_inicio','data_fim','status','id_veiculo']),
        ]);
    }

    public function porProprietarioPdf(Request $request)
    {
        $request->validate([
            'id_proprietario' => 'required|exists:proprietarios,id_proprietario',
        ]);

        $proprietario = Proprietario::findOrFail($request->id_proprietario);

        $query = Abastecimento::with(['veiculo','motorista'])
            ->where('id_proprietario', $request->id_proprietario);

        if ($request->filled('data_inicio')) $query->whereDate('data', '>=', $request->data_inicio);
        if ($request->filled('data_fim'))    $query->whereDate('data', '<=', $request->data_fim);

        $abastecimentos = $query->orderByDesc('data_hora')->get();
        $totais = [
            'quantidade_litros' => $abastecimentos->sum('quantidade_litros'),
            'valor_total'        => $abastecimentos->sum('valor_total'),
        ];

        $pdf = Pdf::loadView('pdf.relatorio_proprietario', compact('proprietario','abastecimentos','totais','request'))
            ->setPaper('a4', 'landscape');

        return $pdf->stream("relatorio_{$proprietario->nome}.pdf");
    }
}
