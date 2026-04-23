<?php

namespace App\Http\Controllers;

use App\Models\Abastecimento;
use App\Models\ValoresCombustivel;
use App\Models\Veiculo;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Barryvdh\DomPDF\Facade\Pdf;

class AbastecimentoController extends Controller
{
    public function index(Request $request)
    {
        $query = Abastecimento::with(['veiculo', 'motorista', 'proprietario']);

        if ($request->filled('id_proprietario')) {
            $query->where('id_proprietario', $request->id_proprietario);
        }
        if ($request->filled('id_veiculo')) {
            $query->where('id_veiculo', $request->id_veiculo);
        }
        if ($request->filled('placa')) {
            $query->whereHas('veiculo', fn($q) => $q->where('placa', 'ilike', '%' . $request->placa . '%'));
        }
        if ($request->filled('data_inicio')) {
            $query->whereDate('data', '>=', $request->data_inicio);
        }
        if ($request->filled('data_fim')) {
            $query->whereDate('data', '<=', $request->data_fim);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('tipo_combustivel')) {
            $query->where('tipo_combustivel', $request->tipo_combustivel);
        }

        $perPage = $request->get('per_page', 20);
        return new \Illuminate\Http\JsonResponse($query->orderByDesc('data_hora')->paginate($perPage));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'data'              => 'required|date',
            'data_hora'         => 'required|date',
            'frentista'         => 'nullable|string',
            'id_veiculo'        => 'required|exists:veiculos,id_veiculo',
            'id_motorista'      => 'nullable|exists:motoristas,id_motorista',
            'id_proprietario'   => 'required|exists:proprietarios,id_proprietario',
            'nome_motorista'    => 'nullable|string',
            'nome_proprietario' => 'nullable|string',
            'local'             => 'nullable|string',
            'tipo_combustivel'  => 'required|string',
            'quantidade_litros' => 'required|numeric|min:0',
            'odometro'          => 'nullable|integer',
            'foto_odometro'     => 'nullable|string',
            'bomba'             => 'nullable|string',
            'status'            => 'nullable|string',
        ]);

        $data['local'] = trim((string) ($data['local'] ?? '')) ?: 'Garagem';
        $data['status'] = trim((string) ($data['status'] ?? '')) ?: 'Pendente';

        // Buscar valor atual do combustível — NÃO pode ser alterado depois
        $valorAtual = ValoresCombustivel::where('tipo_combustivel', $data['tipo_combustivel'])
            ->orderByDesc('data')
            ->value('valor');

        $data['valor_por_litro'] = $valorAtual ?? 0;
        $data['valor_total'] = round(($data['quantidade_litros'] ?? 0) * ($valorAtual ?? 0), 2);

        // Atualizar odômetro do veículo
        if (!empty($data['odometro'])) {
            Veiculo::where('id_veiculo', $data['id_veiculo'])
                ->where('odometro', '<', $data['odometro'])
                ->update(['odometro' => $data['odometro']]);
        }

        $abastecimento = Abastecimento::create($data);
        return new \Illuminate\Http\JsonResponse($abastecimento->load(['veiculo','motorista','proprietario']), 201);
    }

    public function show(string $id)
    {
        $abastecimento = Abastecimento::with(['veiculo','motorista','proprietario','baixas'])
            ->findOrFail($id);
        return new \Illuminate\Http\JsonResponse($abastecimento);
    }

    public function update(Request $request, string $id)
    {
        $abastecimento = Abastecimento::findOrFail($id);

        $data = $request->validate([
            'data'              => 'sometimes|date',
            'data_hora'         => 'sometimes|date',
            'frentista'         => 'nullable|string',
            'id_veiculo'        => 'sometimes|exists:veiculos,id_veiculo',
            'id_motorista'      => 'nullable|exists:motoristas,id_motorista',
            'id_proprietario'   => 'sometimes|exists:proprietarios,id_proprietario',
            'nome_motorista'    => 'nullable|string',
            'nome_proprietario' => 'nullable|string',
            'local'             => 'nullable|string',
            'tipo_combustivel'  => 'sometimes|string',
            'quantidade_litros' => 'sometimes|numeric|min:0',
            'odometro'          => 'nullable|integer',
            'foto_odometro'     => 'nullable|string',
            'bomba'             => 'nullable|string',
            'status'            => 'nullable|string',
        ]);

        // REGRA: valor_por_litro NÃO é recalculado na edição
        // Apenas recalcular valor_total se quantidade mudar, usando o valor já gravado
        if (isset($data['quantidade_litros'])) {
            $data['valor_total'] = round(
                $data['quantidade_litros'] * $abastecimento->valor_por_litro,
                2
            );
        }

        // Remover campos protegidos caso venham no request
        unset($data['valor_por_litro']);

        $abastecimento->update($data);
        return new \Illuminate\Http\JsonResponse($abastecimento->fresh(['veiculo','motorista','proprietario']));
    }

    public function destroy(string $id)
    {
        $abastecimento = Abastecimento::findOrFail($id);
        // Remover baixas vinculadas primeiro
        $abastecimento->baixas()->delete();
        $abastecimento->delete();
        return new \Illuminate\Http\JsonResponse(['message' => 'Abastecimento excluído com sucesso']);
    }

    public function forceDelete(string $id)
    {
        return $this->destroy($id);
    }

    public function pendenteBaixa(Request $request)
    {
        $limit = (int) $request->get('limit', 400);
        $limit = max(1, min($limit, 1000));

        $query = Abastecimento::query()
            ->select([
                'id_abastecimento',
                'data',
                'data_hora',
                'id_veiculo',
                'id_motorista',
                'id_proprietario',
                'nome_motorista',
                'nome_proprietario',
                'quantidade_litros',
                'valor_total',
                'baixa_abastecimento',
            ])
            ->with([
                'veiculo:id_veiculo,placa,modelo,id_proprietario',
                'proprietario:id_proprietario,nome',
                'motorista:id_motorista,nome,id_proprietario',
            ])
            ->where('baixa_abastecimento', false);

        if ($request->filled('id_proprietario')) {
            $query->where('id_proprietario', $request->id_proprietario);
        }
        if ($request->filled('placa')) {
            $query->whereHas('veiculo', fn($q) => $q->where('placa', 'ilike', '%' . $request->placa . '%'));
        }
        if ($request->filled('data_inicio')) {
            $query->whereDate('data', '>=', $request->data_inicio);
        }
        if ($request->filled('data_fim')) {
            $query->whereDate('data', '<=', $request->data_fim);
        }

        return new \Illuminate\Http\JsonResponse(
            $query->orderByDesc('data_hora')->limit($limit)->get()
        );
    }

    public function comprovante(string $id)
    {
        $abastecimento = Abastecimento::with(['veiculo','motorista','proprietario'])
            ->findOrFail($id);

        $pdf = Pdf::loadView('pdf.comprovante', compact('abastecimento'))
            ->setPaper('a5', 'portrait');

        return $pdf->stream("comprovante_{$id}.pdf");
    }
}
