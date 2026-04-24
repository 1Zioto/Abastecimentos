<?php

namespace App\Http\Controllers;

use App\Models\Abastecimento;
use App\Models\Proprietario;
use App\Models\ValoresCombustivel;
use App\Models\Veiculo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Barryvdh\DomPDF\Facade\Pdf;

class AbastecimentoController extends Controller
{
    private function normalizarStatusBaixa(array &$data, ?Abastecimento $original = null): void
    {
        if (!array_key_exists('status', $data)) {
            return;
        }

        $status = trim((string) ($data['status'] ?? ''));
        if ($status === '') {
            return;
        }

        if ($status === 'Pago') {
            $data['baixa_abastecimento'] = true;
            $data['data_baixa'] = $data['data_baixa'] ?? now();
            return;
        }

        if ($status === 'Pendente') {
            $jaTemBaixa = $original
                ? $original->baixas()->exists()
                : false;

            if (!$jaTemBaixa) {
                $data['baixa_abastecimento'] = false;
            }
        }
    }

    private function buildComprovanteDiagnostics(Abastecimento $abastecimento): array
    {
        $rawDataHora = method_exists($abastecimento, 'getRawOriginal')
            ? $abastecimento->getRawOriginal('data_hora')
            : ($abastecimento->data_hora ?? null);

        $rawData = method_exists($abastecimento, 'getRawOriginal')
            ? $abastecimento->getRawOriginal('data')
            : ($abastecimento->data ?? null);

        return [
            'id_abastecimento' => $abastecimento->id_abastecimento,
            'id_veiculo' => $abastecimento->id_veiculo,
            'id_motorista' => $abastecimento->id_motorista,
            'id_proprietario' => $abastecimento->id_proprietario,
            'raw' => [
                'data' => $rawData,
                'data_hora' => $rawDataHora,
                'tipo_combustivel' => $abastecimento->tipo_combustivel,
                'status' => $abastecimento->status,
                'odometro' => $abastecimento->odometro,
                'quantidade_litros' => $abastecimento->quantidade_litros,
                'valor_por_litro' => $abastecimento->valor_por_litro,
                'valor_total' => $abastecimento->valor_total,
            ],
            'relations' => [
                'veiculo_loaded' => $abastecimento->relationLoaded('veiculo'),
                'motorista_loaded' => $abastecimento->relationLoaded('motorista'),
                'proprietario_loaded' => $abastecimento->relationLoaded('proprietario'),
                'veiculo_exists' => (bool) optional($abastecimento->veiculo)->id_veiculo,
                'motorista_exists' => (bool) optional($abastecimento->motorista)->id_motorista,
                'proprietario_exists' => (bool) optional($abastecimento->proprietario)->id_proprietario,
            ],
            'runtime' => [
                'php_version' => PHP_VERSION,
                'tmp_dir' => sys_get_temp_dir(),
                'dompdf_options' => $this->pdfRuntimeOptions(),
            ],
        ];
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

    private function getUltimoOdometroInformado(string $idVeiculo, ?string $ignoreAbastecimentoId = null): ?int
    {
        $query = Abastecimento::query()
            ->where('id_veiculo', $idVeiculo)
            ->whereNotNull('odometro');

        if ($ignoreAbastecimentoId) {
            $query->where('id_abastecimento', '!=', $ignoreAbastecimentoId);
        }

        $ultimoAbastecimentoOdometro = $query
            ->orderByDesc('data_hora')
            ->value('odometro');

        $odometroVeiculo = Veiculo::query()
            ->where('id_veiculo', $idVeiculo)
            ->value('odometro');

        $candidatos = array_values(array_filter([
            $ultimoAbastecimentoOdometro,
            $odometroVeiculo,
        ], fn ($v) => $v !== null));

        if (empty($candidatos)) {
            return null;
        }

        return (int) max($candidatos);
    }

    private function validarOdometroMinimo(array $data, ?string $ignoreAbastecimentoId = null): void
    {
        if (!array_key_exists('odometro', $data) || $data['odometro'] === null) {
            return;
        }

        $idVeiculo = $data['id_veiculo'] ?? null;
        if (!$idVeiculo) {
            return;
        }

        $ultimoOdometro = $this->getUltimoOdometroInformado($idVeiculo, $ignoreAbastecimentoId);
        if ($ultimoOdometro === null) {
            return;
        }

        if ((int) $data['odometro'] < $ultimoOdometro) {
            throw ValidationException::withMessages([
                'odometro' => "Odômetro inválido: informe um valor maior ou igual a {$ultimoOdometro} km.",
            ]);
        }
    }

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
            if ($request->status === 'Pago') {
                $query->where(function ($q) {
                    $q->where('status', 'Pago')
                      ->orWhere('baixa_abastecimento', true);
                });
            } else {
                $query->where('status', $request->status);
            }
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

        $proprietario = Proprietario::query()
            ->select(['id_proprietario', 'nome', 'status', 'observacao'])
            ->findOrFail($data['id_proprietario']);

        if ($proprietario->status === 'Bloqueado') {
            return new JsonResponse([
                'message' => 'Proprietário bloqueado. Não é possível registrar abastecimento para este proprietário.',
                'observacao' => $proprietario->observacao,
            ], 422);
        }

        $this->normalizarStatusBaixa($data);

        // Buscar valor atual do combustível — NÃO pode ser alterado depois
        $valorAtual = ValoresCombustivel::where('tipo_combustivel', $data['tipo_combustivel'])
            ->orderByDesc('data')
            ->value('valor');

        $data['valor_por_litro'] = $valorAtual ?? 0;
        $data['valor_total'] = round(($data['quantidade_litros'] ?? 0) * ($valorAtual ?? 0), 2);

        $this->validarOdometroMinimo($data);

        // Atualizar odômetro do veículo
        if (!empty($data['odometro'])) {
            Veiculo::where('id_veiculo', $data['id_veiculo'])
                ->where('odometro', '<', $data['odometro'])
                ->update(['odometro' => $data['odometro']]);
        }

        $abastecimento = Abastecimento::create($data);
        return new \Illuminate\Http\JsonResponse($abastecimento->load(['veiculo','motorista','proprietario']), 201);
    }

    public function show(Request $request, string $id)
    {
        $abastecimentoQuery = Abastecimento::query()
            ->with([
                'veiculo:id_veiculo,placa,modelo,tipo_combustivel,id_proprietario',
                'motorista:id_motorista,nome,id_proprietario',
                'proprietario:id_proprietario,nome',
            ]);

        if ($request->boolean('include_baixas')) {
            $abastecimentoQuery->with([
                'baixas' => fn ($q) => $q
                    ->select([
                        'id_baixa',
                        'id_abastecimento',
                        'data_hora',
                        'usuario',
                        'forma_pagamento',
                        'data_pagamento',
                        'nota_entrada',
                    ])
                    ->orderByDesc('data_hora')
                    ->limit(200),
            ]);
        }

        $abastecimento = $abastecimentoQuery->findOrFail($id);
        return new \Illuminate\Http\JsonResponse($abastecimento);
    }

    public function update(Request $request, string $id)
    {
        $currentUser = auth()->user();
        if (!$currentUser || $currentUser->tipo !== 'admin') {
            return new \Illuminate\Http\JsonResponse(['message' => 'Somente administradores podem editar registros'], 403);
        }

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
        $this->normalizarStatusBaixa($data, $abastecimento);

        $dataParaValidacaoOdometro = [
            'id_veiculo' => $data['id_veiculo'] ?? $abastecimento->id_veiculo,
            'odometro' => $data['odometro'] ?? null,
        ];
        $this->validarOdometroMinimo($dataParaValidacaoOdometro, $abastecimento->id_abastecimento);

        $abastecimento->update($data);
        return new \Illuminate\Http\JsonResponse($abastecimento->fresh(['veiculo','motorista','proprietario']));
    }

    public function destroy(string $id)
    {
        $currentUser = auth()->user();
        if (!$currentUser || $currentUser->tipo !== 'admin') {
            return new \Illuminate\Http\JsonResponse(['message' => 'Somente administradores podem excluir abastecimentos'], 403);
        }

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
        $limit = (int) $request->get('limit', 120);
        $limit = max(1, min($limit, 300));

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
                'veiculo:id_veiculo,placa,modelo',
            ])
            ->where('baixa_abastecimento', false)
            ->where(function ($q) {
                $q->whereNull('status')
                    ->orWhere('status', '!=', 'Pago');
            });

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

    public function comprovante(Request $request, string $id)
    {
        $errorId = (string) Str::uuid();

        try {
            $abastecimento = Abastecimento::with(['veiculo', 'motorista', 'proprietario'])
                ->findOrFail($id);

            $diagnostics = $this->buildComprovanteDiagnostics($abastecimento);
            Log::info('Comprovante PDF - início', [
                'error_id' => $errorId,
                'id_abastecimento' => $id,
                'diagnostics' => $diagnostics,
            ]);

            $forcePdf = $request->boolean('pdf') || $request->query('format') === 'pdf';
            if (!$forcePdf) {
                return response()
                    ->view('pdf.comprovante', compact('abastecimento'))
                    ->header('Content-Type', 'text/html; charset=UTF-8');
            }

            $pdf = Pdf::setOption($this->pdfRuntimeOptions())
                ->loadView('pdf.comprovante', compact('abastecimento'))
                ->setPaper('a5', 'portrait');

            return $pdf->stream("comprovante_{$id}.pdf", ['Attachment' => false]);
        } catch (\Throwable $e) {
            $context = [
                'error_id' => $errorId,
                'id_abastecimento' => $id,
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ];

            try {
                $abastecimento = Abastecimento::with(['veiculo', 'motorista', 'proprietario'])->find($id);
                if ($abastecimento) {
                    $context['diagnostics'] = $this->buildComprovanteDiagnostics($abastecimento);
                } else {
                    $context['diagnostics'] = ['record_found' => false];
                }
            } catch (\Throwable $diagError) {
                $context['diagnostics_error'] = $diagError->getMessage();
            }

            Log::error('Erro ao gerar comprovante PDF', [
                ...$context,
            ]);

            return new JsonResponse([
                'message' => 'Erro ao gerar comprovante PDF',
                'error' => $e->getMessage(),
                'error_id' => $errorId,
            ], 500);
        }
    }

    public function comprovanteDebug(string $id): JsonResponse
    {
        $abastecimento = Abastecimento::with(['veiculo', 'motorista', 'proprietario'])
            ->findOrFail($id);

        $diagnostics = $this->buildComprovanteDiagnostics($abastecimento);
        $renderStatus = ['view_rendered' => false, 'error' => null];

        try {
            view('pdf.comprovante', compact('abastecimento'))->render();
            $renderStatus['view_rendered'] = true;
        } catch (\Throwable $e) {
            $renderStatus['error'] = $e->getMessage();
        }

        return new JsonResponse([
            'ok' => true,
            'id_abastecimento' => $id,
            'diagnostics' => $diagnostics,
            'render_status' => $renderStatus,
        ]);
    }
}
