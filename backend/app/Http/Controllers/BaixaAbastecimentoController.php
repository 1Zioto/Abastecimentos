<?php

namespace App\Http\Controllers;

use App\Models\BaixaAbastecimento;
use App\Models\Abastecimento;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class BaixaAbastecimentoController extends Controller
{
    private function emptyToNull($value)
    {
        if ($value === null) return null;
        if (is_string($value) && trim($value) === '') return null;
        return $value;
    }

    private function buildAbastecimentoBaixaUpdate(array $data): array
    {
        return [
            'baixa_abastecimento' => true,
            'data_baixa'   => $data['data_baixa'] ?? now(),
            'tipo_despesa' => $data['tipo_despesa'] ?? null,
            'descricao'    => $data['descricao'] ?? null,
            'valor'        => $data['valor'] ?? null,
            'status'       => $data['status'] ?? 'Pago',
            'placa1'       => $data['placa1'] ?? null,
            'recebedor'    => $data['recebedor'] ?? null,
            'observacao'   => $data['observacao'] ?? null,
            'anexo'        => $data['anexo'] ?? null,
        ];
    }

    private function upsertBaixa(string $idAbastecimento, array $data): void
    {
        $existingId = DB::table('baixa_abastecimento')
            ->where('id_abastecimento', $idAbastecimento)
            ->value('id_baixa');

        $payload = [
            'id_abastecimento' => $idAbastecimento,
            'data_hora'        => now(),
            'usuario'          => auth()->user()?->nome ?? 'sistema',
            'forma_pagamento'  => $data['forma_pagamento'] ?? '',
            'data_pagamento'   => $data['data_pagamento'] ?? now(),
            'nota_entrada'     => '',
        ];

        if ($existingId) {
            DB::table('baixa_abastecimento')
                ->where('id_baixa', $existingId)
                ->update($payload);
            return;
        }

        $payload['id_baixa'] = (string) Str::uuid();
        DB::table('baixa_abastecimento')->insert($payload);
    }

    public function index(Request $request)
    {
        $query = BaixaAbastecimento::with(['abastecimento.veiculo','abastecimento.proprietario']);

        if ($request->filled('id_abastecimento')) {
            $query->where('id_abastecimento', $request->id_abastecimento);
        }

        return new \Illuminate\Http\JsonResponse($query->orderByDesc('data_hora')->paginate($request->get('per_page', 20)));
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
            'status'           => 'nullable|string',
            'placa1'           => 'nullable|string',
            'recebedor'        => 'nullable|string',
            'observacao'       => 'nullable|string',
            'anexo'            => 'nullable|string',
        ]);

        $data['data_pagamento'] = $this->emptyToNull($data['data_pagamento'] ?? null);
        $data['data_baixa'] = $this->emptyToNull($data['data_baixa'] ?? null);
        $data['status'] = $this->emptyToNull($data['status'] ?? null) ?? 'Pago';
        $data['recebedor'] = $this->emptyToNull($data['recebedor'] ?? null);
        $data['observacao'] = $this->emptyToNull($data['observacao'] ?? null);
        $data['anexo'] = $this->emptyToNull($data['anexo'] ?? null);
        $data['descricao'] = $this->emptyToNull($data['descricao'] ?? null);
        $data['tipo_despesa'] = $this->emptyToNull($data['tipo_despesa'] ?? null) ?? 'Combustível';

        DB::beginTransaction();
        try {
            $this->upsertBaixa($data['id_abastecimento'], $data);
            $baixa = BaixaAbastecimento::where('id_abastecimento', $data['id_abastecimento'])->latest('data_hora')->first();

            // Atualizar o abastecimento com os dados de baixa
            Abastecimento::where('id_abastecimento', $data['id_abastecimento'])
                ->update($this->buildAbastecimentoBaixaUpdate($data));

            DB::commit();
            return new \Illuminate\Http\JsonResponse($baixa->load('abastecimento'), 201);
        } catch (\Exception $e) {
            DB::rollBack();
            return new \Illuminate\Http\JsonResponse(['message' => 'Erro ao registrar baixa: ' . $e->getMessage()], 500);
        }
    }

    public function storeLote(Request $request)
    {
        $data = $request->validate([
            'ids'              => 'required|array|min:1',
            'ids.*'            => 'exists:abastecimentos,id_abastecimento',
            'forma_pagamento'  => 'nullable|string',
            'data_pagamento'   => 'nullable|date',
            'data_baixa'       => 'nullable|date',
            'tipo_despesa'     => 'nullable|string',
            'descricao'        => 'nullable|string',
            'valor'            => 'nullable|numeric',
            'status'           => 'nullable|string',
            'recebedor'        => 'nullable|string',
            'observacao'       => 'nullable|string',
            'anexo'            => 'nullable|string',
        ]);

        $data['data_pagamento'] = $this->emptyToNull($data['data_pagamento'] ?? null);
        $data['data_baixa'] = $this->emptyToNull($data['data_baixa'] ?? null);
        $data['tipo_despesa'] = $this->emptyToNull($data['tipo_despesa'] ?? null) ?? 'Combustível';
        $data['descricao'] = $this->emptyToNull($data['descricao'] ?? null);
        $data['status'] = $this->emptyToNull($data['status'] ?? null) ?? 'Pago';
        $data['recebedor'] = $this->emptyToNull($data['recebedor'] ?? null);
        $data['observacao'] = $this->emptyToNull($data['observacao'] ?? null);
        $data['anexo'] = $this->emptyToNull($data['anexo'] ?? null);
        $data['valor'] = $this->emptyToNull($data['valor'] ?? null);

        $errors = [];
        $success = 0;

        foreach ($data['ids'] as $idAbastecimento) {
            try {
                $this->upsertBaixa($idAbastecimento, $data);
                Abastecimento::where('id_abastecimento', $idAbastecimento)
                    ->update($this->buildAbastecimentoBaixaUpdate($data));
                $success++;
            } catch (\Throwable $e) {
                $errors[] = [
                    'id_abastecimento' => $idAbastecimento,
                    'message' => $e->getMessage(),
                ];
            }
        }

        if (!empty($errors)) {
            return new \Illuminate\Http\JsonResponse([
                'message' => 'Erro ao registrar parte das baixas.',
                'success' => $success,
                'errors' => $errors,
            ], 500);
        }

        return new \Illuminate\Http\JsonResponse(['message' => $success . ' baixas registradas com sucesso']);
    }

    public function show(string $id)
    {
        return new \Illuminate\Http\JsonResponse(BaixaAbastecimento::with('abastecimento.veiculo')->findOrFail($id));
    }

    public function update(Request $request, string $id)
    {
        $baixa = BaixaAbastecimento::findOrFail($id);
        $baixa->update($request->only(['forma_pagamento','data_pagamento','nota_entrada']));
        return new \Illuminate\Http\JsonResponse($baixa->fresh());
    }

    public function destroy(string $id)
    {
        $baixa = BaixaAbastecimento::findOrFail($id);
        // Reverter o abastecimento para não baixado
        Abastecimento::where('id_abastecimento', $baixa->id_abastecimento)->update([
            'baixa_abastecimento' => false,
            'data_baixa' => null,
            'tipo_despesa' => null,
            'descricao' => null,
            'valor' => null,
            'status' => 'Pendente',
            'placa1' => null,
            'recebedor' => null,
            'observacao' => null,
            'anexo' => null,
        ]);
        $baixa->delete();
        return new \Illuminate\Http\JsonResponse(['message' => 'Baixa excluída e abastecimento retornou para Pendente']);
    }

    public function forceDelete(string $id)
    {
        return $this->destroy($id);
    }
}
