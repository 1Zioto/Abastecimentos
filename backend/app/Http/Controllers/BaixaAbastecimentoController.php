<?php

namespace App\Http\Controllers;

use App\Models\BaixaAbastecimento;
use App\Models\Abastecimento;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BaixaAbastecimentoController extends Controller
{
    public function index(Request $request)
    {
        $query = BaixaAbastecimento::with(['abastecimento.veiculo','abastecimento.proprietario']);

        if ($request->filled('id_abastecimento')) {
            $query->where('id_abastecimento', $request->id_abastecimento);
        }

        return response()->json($query->orderByDesc('data_hora')->paginate($request->get('per_page', 20)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'id_abastecimento' => 'required|exists:abastecimentos,id_abastecimento',
            'forma_pagamento'  => 'nullable|string',
            'data_pagamento'   => 'nullable|date',
            'nota_entrada'     => 'nullable|string',
            // Campos da baixa salvos no abastecimento
            'data_baixa'       => 'nullable|date',
            'tipo_despesa'     => 'nullable|string',
            'descricao'        => 'nullable|string',
            'valor'            => 'nullable|numeric',
            'status1'          => 'nullable|string',
            'placa1'           => 'nullable|string',
            'recebedor'        => 'nullable|string',
            'observacao'       => 'nullable|string',
            'anexo'            => 'nullable|string',
        ]);

        DB::beginTransaction();
        try {
            $baixa = BaixaAbastecimento::create([
                'id_abastecimento' => $data['id_abastecimento'],
                'data_hora'        => now(),
                'usuario'          => auth()->user()->nome ?? 'sistema',
                'forma_pagamento'  => $data['forma_pagamento'] ?? null,
                'data_pagamento'   => $data['data_pagamento'] ?? null,
                'nota_entrada'     => $data['nota_entrada'] ?? null,
            ]);

            // Atualizar o abastecimento com os dados de baixa
            Abastecimento::where('id_abastecimento', $data['id_abastecimento'])->update([
                'baixa_abastecimento' => true,
                'data_baixa'   => $data['data_baixa'] ?? now(),
                'tipo_despesa' => $data['tipo_despesa'] ?? null,
                'descricao'    => $data['descricao'] ?? null,
                'valor'        => $data['valor'] ?? null,
                'status1'      => $data['status1'] ?? null,
                'placa1'       => $data['placa1'] ?? null,
                'recebedor'    => $data['recebedor'] ?? null,
                'observacao'   => $data['observacao'] ?? null,
                'anexo'        => $data['anexo'] ?? null,
            ]);

            DB::commit();
            return response()->json($baixa->load('abastecimento'), 201);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Erro ao registrar baixa: ' . $e->getMessage()], 500);
        }
    }

    public function storeLote(Request $request)
    {
        $request->validate([
            'ids'              => 'required|array|min:1',
            'ids.*'            => 'exists:abastecimentos,id_abastecimento',
            'forma_pagamento'  => 'nullable|string',
            'data_pagamento'   => 'nullable|date',
            'tipo_despesa'     => 'nullable|string',
            'recebedor'        => 'nullable|string',
            'observacao'       => 'nullable|string',
        ]);

        DB::beginTransaction();
        try {
            foreach ($request->ids as $idAbastecimento) {
                BaixaAbastecimento::create([
                    'id_abastecimento' => $idAbastecimento,
                    'data_hora'        => now(),
                    'usuario'          => auth()->user()->nome ?? 'sistema',
                    'forma_pagamento'  => $request->forma_pagamento,
                    'data_pagamento'   => $request->data_pagamento,
                ]);

                Abastecimento::where('id_abastecimento', $idAbastecimento)->update([
                    'baixa_abastecimento' => true,
                    'data_baixa'   => $request->data_pagamento ?? now(),
                    'tipo_despesa' => $request->tipo_despesa,
                    'recebedor'    => $request->recebedor,
                    'observacao'   => $request->observacao,
                ]);
            }

            DB::commit();
            return response()->json(['message' => count($request->ids) . ' baixas registradas com sucesso']);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Erro: ' . $e->getMessage()], 500);
        }
    }

    public function show(string $id)
    {
        return response()->json(BaixaAbastecimento::with('abastecimento.veiculo')->findOrFail($id));
    }

    public function update(Request $request, string $id)
    {
        $baixa = BaixaAbastecimento::findOrFail($id);
        $baixa->update($request->only(['forma_pagamento','data_pagamento','nota_entrada']));
        return response()->json($baixa->fresh());
    }

    public function destroy(string $id)
    {
        $baixa = BaixaAbastecimento::findOrFail($id);
        // Reverter o abastecimento para não baixado
        Abastecimento::where('id_abastecimento', $baixa->id_abastecimento)->update([
            'baixa_abastecimento' => false,
            'data_baixa' => null,
        ]);
        $baixa->delete();
        return response()->json(['message' => 'Baixa excluída e abastecimento revertido']);
    }

    public function forceDelete(string $id)
    {
        return $this->destroy($id);
    }
}
