<?php

namespace App\Http\Controllers;

use App\Models\Abastecimento;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class ComprovantePagamentoController extends Controller
{
    // ─────────────────────────────────────────────
    // READ
    // ─────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $this->garantirTabelas();

        $query = DB::table('comprovantes_pagamento as c')
            ->leftJoin('proprietarios as p', 'c.proprietario_id', '=', 'p.id_proprietario')
            ->select(
                'c.*',
                'p.nome as proprietario_nome'
            );

        if ($request->filled('status')) {
            $query->where('c.status', $request->status);
        }
        // Pendentes primeiro/somente: sem isso, comprovantes aguardando há mais
        // tempo somem da tela quando os aplicados recentes lotam a página.
        if ($request->boolean('apenas_pendentes')) {
            $query->where('c.status', '<>', 'aplicado');
        }
        if ($request->filled('proprietario_id')) {
            $query->where('c.proprietario_id', $request->proprietario_id);
        }
        if ($request->filled('data_inicio')) {
            $query->where('c.created_at', '>=', $request->data_inicio);
        }
        if ($request->filled('data_fim')) {
            $query->where('c.created_at', '<=', $request->data_fim . ' 23:59:59');
        }

        $result = $query->orderByDesc('c.created_at')->paginate($request->get('per_page', 40));
        // A tela de listagem não usa o JSON completo da IA. O campo continua
        // disponível no endpoint show, mas não é repetido em todas as linhas.
        $result->through(function ($item) {
            unset($item->dados_ia);
            return $item;
        });
        return new JsonResponse($result);
    }

    public function show(string $id): JsonResponse
    {
        $this->garantirTabelas();
        $comprovante = DB::table('comprovantes_pagamento as c')
            ->leftJoin('proprietarios as p', 'c.proprietario_id', '=', 'p.id_proprietario')
            ->select('c.*', 'p.nome as proprietario_nome')
            ->where('c.id', $id)
            ->first();

        if (!$comprovante) {
            return new JsonResponse(['message' => 'Comprovante não encontrado.'], 404);
        }

        return new JsonResponse($comprovante);
    }

    // ─────────────────────────────────────────────
    // UPLOAD + ANÁLISE (JWT autenticado)
    // ─────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'arquivo'     => 'required_without:arquivo_url|file|max:20480',
            'arquivo_url' => 'required_without:arquivo|string|url',
        ]);

        $this->garantirTabelas();

        try {
            if ($request->hasFile('arquivo')) {
                $uploaded = $request->file('arquivo');
                $hash = hash_file('sha256', $uploaded->getRealPath());
                $duplicado = DB::table('comprovantes_pagamento')->where('arquivo_hash', $hash)->first();
                if ($duplicado) {
                    return new JsonResponse([
                        'message'    => 'Comprovante duplicado detectado.',
                        'duplicado'  => true,
                        'comprovante' => $this->enriquecerComprovante($duplicado),
                    ], 200);
                }

                $cloudinaryResult = $this->uploadComprovanteFile($uploaded, 'comprovantes_pagamento');
                $arquivoUrl = $cloudinaryResult['downloadUrl'] ?? '';
                $arquivoTipo = $this->detectarTipoArquivo($uploaded->getMimeType() ?: '');
            } else {
                $arquivoUrl = (string) $request->arquivo_url;
                $arquivoTipo = str_contains(strtolower($arquivoUrl), '.pdf') ? 'pdf' : 'image';
                $hash = null;
            }

            $analise = $this->analisarComprovanteSeguro($arquivoUrl, $arquivoTipo);
            $remetente = $this->extrairRemetente($analise);
            $resolucao = $this->resolverProprietario($remetente);
            $status = $resolucao['proprietario_id'] ? 'aguardando_confirmacao' : 'aguardando_proprietario';

            $user = auth()->user();
            $id = (string) Str::uuid();
            DB::table('comprovantes_pagamento')->insert([
                'id'                      => $id,
                'arquivo_url'             => $arquivoUrl,
                'arquivo_tipo'            => $arquivoTipo,
                'arquivo_hash'            => $hash,
                'valor_extraido'          => $this->numOuNull($analise['valor_pago'] ?? null),
                'data_pagamento_extraida' => $this->dataOuNull($analise['data_pagamento'] ?? null),
                'remetente_extraido'      => $remetente,
                'proprietario_id'         => $resolucao['proprietario_id'],
                'status'                  => $status,
                'confianca_ia'            => $this->numOuNull($analise['confidence'] ?? null),
                'dados_ia'                => json_encode($analise, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'usuario'                 => $user?->nome ?? $user?->login ?? 'sistema',
                'usuario_id'              => $user ? (string) $user->getAuthIdentifier() : null,
                'created_at'              => now(),
                'updated_at'              => now(),
            ]);

            $comprovante = DB::table('comprovantes_pagamento')->where('id', $id)->first();
            $this->moverComprovanteParaPasta($comprovante);
            return new JsonResponse($this->enriquecerComprovante($comprovante), 201);
        } catch (\Throwable $e) {
            return new JsonResponse(['message' => 'Erro ao processar comprovante: ' . $e->getMessage()], 500);
        }
    }

    private function moverComprovanteParaPasta($comprovante): void
    {
        if (empty($comprovante->proprietario_id) || empty($comprovante->arquivo_url)) {
            return;
        }

        try {
            $drive = app(\App\Services\GoogleDriveService::class);
            $fileId = $drive->extractFileId($comprovante->arquivo_url);
            if (!$fileId) return;

            $proprietario = DB::table('proprietarios')->where('id_proprietario', $comprovante->proprietario_id)->first();
            $proprietarioNome = trim((string)($proprietario->nome ?? 'Desconhecido'));
            
            $targetFolder = $drive->resolveProprietarioFolder($proprietarioNome, 'Baixas');
            $drive->moveFile($fileId, $targetFolder);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning("Falha ao mover comprovante no Drive: " . $e->getMessage());
        }
    }

    // ─────────────────────────────────────────────
    // UPLOAD EM LOTE (JWT autenticado)
    // ─────────────────────────────────────────────

    public function storeLote(Request $request): JsonResponse
    {
        $this->garantirTabelas();
        $user = auth()->user();

        $comprovantes = [];
        $duplicados = [];
        $erros = [];

        // Clientes novos enviam os bytes direto ao Google Drive e repassam
        // somente as URLs para análise, eliminando o tráfego binário da função.
        if ($request->has('arquivo_urls') && is_array($request->arquivo_urls)) {
            foreach ($request->arquivo_urls as $arquivoUrl) {
                try {
                    if (!filter_var($arquivoUrl, FILTER_VALIDATE_URL)) {
                        throw new \InvalidArgumentException('URL de comprovante inválida.');
                    }
                    $arquivoTipo = str_contains(strtolower($arquivoUrl), '.pdf') ? 'pdf' : 'image';
                    $comprovantes[] = $this->processarUnicoAutenticado(
                        $arquivoUrl,
                        $arquivoTipo,
                        null,
                        $user
                    );
                } catch (\Throwable $e) {
                    $erros[] = ['message' => 'Falha ao processar URL: ' . $e->getMessage()];
                }
            }

            return new JsonResponse([
                'message'        => 'Lote processado.',
                'comprovantes'   => $comprovantes,
                'duplicados'     => $duplicados,
                'erros'          => $erros,
                'total_recebido' => count($comprovantes),
            ], 200);
        }

        if (!$request->hasFile('arquivos')) {
            return new JsonResponse(['message' => 'Nenhum arquivo fornecido.'], 400);
        }

        foreach ($request->file('arquivos') as $uploaded) {
            try {
                $hash = hash_file('sha256', $uploaded->getRealPath());
                $duplicado = DB::table('comprovantes_pagamento')->where('arquivo_hash', $hash)->first();
                if ($duplicado) {
                    $duplicados[] = $this->enriquecerComprovante($duplicado);
                    continue;
                }

                $driveResult = $this->uploadComprovanteFile($uploaded, 'comprovantes_pagamento');
                $arquivoUrl = $driveResult['downloadUrl'] ?? '';
                $arquivoTipo = $this->detectarTipoArquivo($uploaded->getMimeType() ?: '');

                $comprovantes[] = $this->processarUnicoAutenticado($arquivoUrl, $arquivoTipo, $hash, $user);
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::error('Erro ao processar comprovante enviado: ' . $e->getMessage(), ['exception' => $e]);
                $erros[] = ['message' => 'Falha no arquivo ' . $uploaded->getClientOriginalName() . ': ' . $e->getMessage()];
            }
        }

        return new JsonResponse([
            'message'        => 'Lote processado.',
            'comprovantes'   => $comprovantes,
            'duplicados'     => $duplicados,
            'erros'          => $erros,
            'total_recebido' => count($comprovantes),
        ], 200);
    }

    private function processarUnicoAutenticado(string $arquivoUrl, string $arquivoTipo, ?string $hash, $user): array
    {
        $analise = $this->analisarComprovanteSeguro($arquivoUrl, $arquivoTipo);
        $remetente = $this->extrairRemetente($analise);
        $resolucao = $this->resolverProprietario($remetente);
        $status = $resolucao['proprietario_id'] ? 'aguardando_confirmacao' : 'aguardando_proprietario';

        $id = (string) Str::uuid();
        DB::table('comprovantes_pagamento')->insert([
            'id'                      => $id,
            'arquivo_url'             => $arquivoUrl,
            'arquivo_tipo'            => $arquivoTipo,
            'arquivo_hash'            => $hash,
            'valor_extraido'          => $this->numOuNull($analise['valor_pago'] ?? null),
            'data_pagamento_extraida' => $this->dataOuNull($analise['data_pagamento'] ?? null),
            'remetente_extraido'      => $remetente,
            'proprietario_id'         => $resolucao['proprietario_id'],
            'status'                  => $status,
            'confianca_ia'            => $this->numOuNull($analise['confidence'] ?? null),
            'dados_ia'                => json_encode($analise, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'usuario'                 => $user?->nome ?? $user?->login ?? 'sistema',
            'usuario_id'              => $user ? (string) $user->getAuthIdentifier() : null,
            'created_at'              => now(),
            'updated_at'              => now(),
        ]);

        $comprovante = DB::table('comprovantes_pagamento')->where('id', $id)->first();
        $this->moverComprovanteParaPasta($comprovante);
        return $this->enriquecerComprovante($comprovante);
    }

    // ─────────────────────────────────────────────
    // REANALISAR (JWT autenticado)
    // ─────────────────────────────────────────────

    public function verificarNovamente(string $id): JsonResponse
    {
        $this->garantirTabelas();

        $comprovante = DB::table('comprovantes_pagamento')->where('id', $id)->first();
        if (!$comprovante) {
            return new JsonResponse(['message' => 'Comprovante não encontrado.'], 404);
        }

        $analise = $this->analisarComprovanteSeguro((string) $comprovante->arquivo_url, (string) ($comprovante->arquivo_tipo ?: 'image'));
        $remetente = $this->extrairRemetente($analise);
        $resolucao = $this->resolverProprietario($remetente);

        $jaAplicado = ($comprovante->status ?? null) === 'aplicado';
        $novoProprietario = $resolucao['proprietario_id'] ?? $comprovante->proprietario_id;
        $status = $jaAplicado
            ? 'aplicado'
            : ($novoProprietario ? 'aguardando_confirmacao' : 'aguardando_proprietario');

        DB::table('comprovantes_pagamento')->where('id', $id)->update([
            'valor_extraido'          => $this->numOuNull($analise['valor_pago'] ?? null),
            'data_pagamento_extraida' => $this->dataOuNull($analise['data_pagamento'] ?? null),
            'remetente_extraido'      => $remetente,
            'proprietario_id'         => $novoProprietario,
            'status'                  => $status,
            'confianca_ia'            => $this->numOuNull($analise['confidence'] ?? null),
            'dados_ia'                => json_encode($analise, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'updated_at'              => now(),
        ]);

        $comprovante = DB::table('comprovantes_pagamento')->where('id', $id)->first();
        if (!$jaAplicado) {
            $this->moverComprovanteParaPasta($comprovante);
        }
        return new JsonResponse($this->enriquecerComprovante($comprovante));
    }

    // ─────────────────────────────────────────────
    // UPLOAD EXTERNO (API key)
    // ─────────────────────────────────────────────

    public function storeExterno(Request $request): JsonResponse
    {
        $request->validate([
            'arquivo'     => 'required_without:arquivo_url|file|max:20480',
            'arquivo_url' => 'required_without:arquivo|string|url',
        ]);

        $this->garantirTabelas();

        try {
            if ($request->hasFile('arquivo')) {
                $uploaded = $request->file('arquivo');
                $hash = hash_file('sha256', $uploaded->getRealPath());
                $duplicado = DB::table('comprovantes_pagamento')->where('arquivo_hash', $hash)->first();
                if ($duplicado) {
                    return new JsonResponse([
                        'message'    => 'Comprovante duplicado.',
                        'duplicado'  => true,
                        'comprovante' => $this->enriquecerComprovante($duplicado),
                    ], 200);
                }

                $cloudinaryResult = $this->uploadComprovanteFile($uploaded, 'comprovantes_pagamento');
                $arquivoUrl = $cloudinaryResult['downloadUrl'] ?? '';
                $arquivoTipo = $this->detectarTipoArquivo($uploaded->getMimeType() ?: '');
            } else {
                $arquivoUrl = (string) $request->arquivo_url;
                $arquivoTipo = str_contains(strtolower($arquivoUrl), '.pdf') ? 'pdf' : 'image';
                $hash = null;
            }

            $analise = $this->analisarComprovanteSeguro($arquivoUrl, $arquivoTipo);
            $remetente = $this->extrairRemetente($analise);
            $resolucao = $this->resolverProprietario($remetente);
            $status = $resolucao['proprietario_id'] ? 'aguardando_confirmacao' : 'aguardando_proprietario';

            $apiKeyNome = $request->get('_api_key_nome', 'externo');
            $id = (string) Str::uuid();
            DB::table('comprovantes_pagamento')->insert([
                'id'                      => $id,
                'arquivo_url'             => $arquivoUrl,
                'arquivo_tipo'            => $arquivoTipo,
                'arquivo_hash'            => $hash,
                'valor_extraido'          => $this->numOuNull($analise['valor_pago'] ?? null),
                'data_pagamento_extraida' => $this->dataOuNull($analise['data_pagamento'] ?? null),
                'remetente_extraido'      => $remetente,
                'proprietario_id'         => $resolucao['proprietario_id'],
                'status'                  => $status,
                'confianca_ia'            => $this->numOuNull($analise['confidence'] ?? null),
                'dados_ia'                => json_encode($analise, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'usuario'                 => 'api:' . $apiKeyNome,
                'usuario_id'              => null,
                'created_at'              => now(),
                'updated_at'              => now(),
            ]);

            $comprovante = DB::table('comprovantes_pagamento')->where('id', $id)->first();
            return new JsonResponse([
                'message'     => 'Comprovante recebido e em análise.',
                'comprovante' => $this->enriquecerComprovante($comprovante),
            ], 201);
        } catch (\Throwable $e) {
            return new JsonResponse(['message' => 'Erro ao processar comprovante: ' . $e->getMessage()], 500);
        }
    }

    public function storeExternoLote(Request $request): JsonResponse
    {
        try {
            $this->garantirTabelas();

            $comprovantes = [];
            $duplicados = [];
            $erros = [];

            if ($request->hasFile('arquivos')) {
                foreach ($request->file('arquivos') as $uploaded) {
                    try {
                        $hash = hash_file('sha256', $uploaded->getRealPath());
                        $duplicado = DB::table('comprovantes_pagamento')->where('arquivo_hash', $hash)->first();
                        if ($duplicado) {
                            $duplicados[] = $this->enriquecerComprovante($duplicado);
                            continue;
                        }

                        $cloudinaryResult = $this->uploadComprovanteFile($uploaded, 'comprovantes_pagamento');
                        $arquivoUrl = $cloudinaryResult['downloadUrl'] ?? '';
                        $arquivoTipo = $this->detectarTipoArquivo($uploaded->getMimeType() ?: '');
                        
                        $comprovantes[] = $this->processarUnicoExterno($arquivoUrl, $arquivoTipo, $hash, $request->get('_api_key_nome', 'externo'));
                    } catch (\Throwable $e) {
                        \Illuminate\Support\Facades\Log::error('Erro ao processar comprovante enviado: ' . $e->getMessage(), ['exception' => $e]);
                        $erros[] = 'Falha no arquivo ' . $uploaded->getClientOriginalName() . ': ' . $e->getMessage();
                    }
                }
            } elseif ($request->has('arquivo_urls') && is_array($request->arquivo_urls)) {
                $urls = $request->arquivo_urls;
                $hashes = $request->arquivo_hashes ?? [];
                
                foreach ($urls as $i => $arquivoUrl) {
                    try {
                        $hash = $hashes[$i] ?? null;
                        if ($hash) {
                            $duplicado = DB::table('comprovantes_pagamento')->where('arquivo_hash', $hash)->first();
                            if ($duplicado) {
                                $duplicados[] = $this->enriquecerComprovante($duplicado);
                                continue;
                            }
                        }

                        $arquivoTipo = str_contains(strtolower($arquivoUrl), '.pdf') ? 'pdf' : 'image';
                        $comprovantes[] = $this->processarUnicoExterno($arquivoUrl, $arquivoTipo, $hash, $request->get('_api_key_nome', 'externo'));
                    } catch (\Throwable $e) {
                        \Illuminate\Support\Facades\Log::error('Erro ao processar comprovante por URL: ' . $e->getMessage(), ['exception' => $e]);
                        $erros[] = 'Falha na URL ' . $arquivoUrl . ': ' . $e->getMessage();
                    }
                }
            } else {
                return new JsonResponse(['message' => 'Nenhum arquivo ou URL fornecido.'], 400);
            }

            return new JsonResponse([
                'message'        => 'Lote processado.',
                'comprovantes'   => $comprovantes,
                'duplicados'     => $duplicados,
                'erros'          => $erros,
                'total_recebido' => count($comprovantes),
            ], 200);
        } catch (\Throwable $e) {
            return new JsonResponse([
                'message' => 'Erro ao processar lote: ' . $e->getMessage(),
                'file'    => $e->getFile(),
                'line'    => $e->getLine()
            ], 500);
        }
    }

    private function processarUnicoExterno(string $arquivoUrl, string $arquivoTipo, ?string $hash, string $apiKeyNome): array
    {
        $analise = $this->analisarComprovanteSeguro($arquivoUrl, $arquivoTipo);
        $remetente = $this->extrairRemetente($analise);
        $resolucao = $this->resolverProprietario($remetente);
        $status = $resolucao['proprietario_id'] ? 'aguardando_confirmacao' : 'aguardando_proprietario';

        $id = (string) Str::uuid();
        DB::table('comprovantes_pagamento')->insert([
            'id'                      => $id,
            'arquivo_url'             => $arquivoUrl,
            'arquivo_tipo'            => $arquivoTipo,
            'arquivo_hash'            => $hash,
            'valor_extraido'          => $this->numOuNull($analise['valor_pago'] ?? null),
            'data_pagamento_extraida' => $this->dataOuNull($analise['data_pagamento'] ?? null),
            'remetente_extraido'      => $remetente,
            'proprietario_id'         => $resolucao['proprietario_id'],
            'status'                  => $status,
            'confianca_ia'            => $this->numOuNull($analise['confidence'] ?? null),
            'dados_ia'                => json_encode($analise, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'usuario'                 => 'api:' . $apiKeyNome,
            'usuario_id'              => null,
            'created_at'              => now(),
            'updated_at'              => now(),
        ]);

        $comprovante = DB::table('comprovantes_pagamento')->where('id', $id)->first();
        return $this->enriquecerComprovante($comprovante);
    }

    // ─────────────────────────────────────────────
    // ATRIBUIR PROPRIETÁRIO
    // ─────────────────────────────────────────────

    public function update(Request $request, string $id): JsonResponse
    {
        $this->garantirTabelas();

        $data = $request->validate([
            'proprietario_id' => 'required|exists:proprietarios,id_proprietario',
            'salvar_alias'    => 'nullable|boolean',
        ]);

        $comprovante = DB::table('comprovantes_pagamento')->where('id', $id)->first();
        if (!$comprovante) {
            return new JsonResponse(['message' => 'Comprovante não encontrado.'], 404);
        }

        DB::table('comprovantes_pagamento')
            ->where('id', $id)
            ->update([
                'proprietario_id' => $data['proprietario_id'],
                'status'          => 'aguardando_confirmacao',
                'isolado'         => DB::raw('false'),
                'updated_at'      => now(),
            ]);

        if ($request->boolean('salvar_alias') && $comprovante->remetente_extraido) {
            AliasProprietarioController::garantirTabelaAliasProprietarios();
            $nomeNorm = AliasProprietarioController::normalizarNome($comprovante->remetente_extraido);
            if ($nomeNorm !== '') {
                $user = auth()->user();
                DB::table('alias_proprietarios')->upsert(
                    [
                        'id'                 => (string) Str::uuid(),
                        'nome_alias'         => $nomeNorm,
                        'nome_alias_original' => $comprovante->remetente_extraido,
                        'proprietario_id'    => $data['proprietario_id'],
                        'usuario_id'         => $user ? (string) $user->getAuthIdentifier() : null,
                        'created_at'         => now(),
                        'updated_at'         => now(),
                    ],
                    ['nome_alias'],
                    ['proprietario_id', 'nome_alias_original', 'updated_at']
                );
            }
        }

        $comprovante = DB::table('comprovantes_pagamento')->where('id', $id)->first();
        $this->moverComprovanteParaPasta($comprovante);
        return new JsonResponse($this->enriquecerComprovante($comprovante));
    }

    // ─────────────────────────────────────────────
    // CONFIRMAR GRUPO (múltiplos comprovantes)
    // ─────────────────────────────────────────────

    public function confirmarGrupo(Request $request): JsonResponse
    {
        $this->garantirTabelas();

        $data = $request->validate([
            'comprovante_ids'          => 'required|array|min:1',
            'comprovante_ids.*'        => 'string',
            'ids_abastecimentos'       => 'required|array|min:1',
            'ids_abastecimentos.*'     => 'exists:abastecimentos,id_abastecimento',
            'proprietarios_terceiros'  => 'nullable|array',
            'proprietarios_terceiros.*'=> 'string',
            'forma_pagamento'          => 'nullable|string',
            'data_pagamento'           => 'nullable|date',
            'data_baixa'               => 'nullable|date',
            'tipo_despesa'             => 'nullable|string',
            'descricao'                => 'nullable|string',
            'recebedor'                => 'nullable|string',
            'recebedor2'               => 'nullable|string',
            'valor_recebedor1'         => 'nullable|numeric|min:0',
            'valor_recebedor2'         => 'nullable|numeric|min:0',
            'abono_desconto'           => 'nullable|numeric|min:0',
            'valor_recebido'           => 'nullable|numeric|min:0',
            'credito_usado'            => 'nullable|numeric|min:0',
            'observacao'               => 'nullable|string',
        ]);

        $this->garantirColunasRateioRecebedor();

        // Load all comprovantes
        $comprovantes = DB::table('comprovantes_pagamento')
            ->whereIn('id', $data['comprovante_ids'])
            ->get();

        if ($comprovantes->isEmpty()) {
            return new JsonResponse(['message' => 'Nenhum comprovante encontrado.'], 404);
        }

        // Check none are already applied
        $jaAplicado = $comprovantes->firstWhere('status', 'aplicado');
        if ($jaAplicado) {
            return new JsonResponse(['message' => 'Comprovante já foi aplicado.'], 422);
        }

        // Determine the proprietario — use the first comprovante's proprietario_id
        $proprietarioId = $comprovantes->first()->proprietario_id;
        if (!$proprietarioId) {
            return new JsonResponse(['message' => 'Comprovante sem proprietário atribuído.'], 422);
        }

        // Build allowed proprietario IDs (main + terceiros)
        $allowedProprietarios = [$proprietarioId];
        if (!empty($data['proprietarios_terceiros'])) {
            $allowedProprietarios = array_merge($allowedProprietarios, $data['proprietarios_terceiros']);
        }

        // Validate abastecimentos belong to allowed proprietarios
        $abastecimentos = Abastecimento::whereIn('id_abastecimento', $data['ids_abastecimentos'])->get();
        foreach ($abastecimentos as $abastecimento) {
            if (!in_array((string) $abastecimento->id_proprietario, array_map('strval', $allowedProprietarios), true)) {
                return new JsonResponse([
                    'message' => 'Abastecimento ' . $abastecimento->id_abastecimento . ' não pertence ao proprietário do comprovante.',
                ], 422);
            }
        }

        // Regra de filial: a baixa segue a filial do abastecimento — não pode
        // misturar abastecimentos de filiais diferentes na mesma baixa.
        $locaisDistintos = $abastecimentos
            ->map(fn ($a) => trim((string) ($a->local ?? '')))
            ->filter(fn ($l) => $l !== '')
            ->unique()
            ->values();
        if ($locaisDistintos->count() > 1) {
            return new JsonResponse([
                'message' => 'A baixa deve ser dada na mesma filial do abastecimento. '
                    . 'Não é permitido baixar abastecimentos de filiais diferentes na mesma baixa. '
                    . 'Filiais encontradas: ' . $locaisDistintos->implode(', ') . '.',
            ], 422);
        }

        $user = auth()->user();
        $notaEntrada = 'comprovantes:' . implode(',', $data['comprovante_ids']);

        // Collect all arquivo_urls from comprovantes for the anexo field
        $anexoUrls = $comprovantes->pluck('arquivo_url')->filter()->values()->all();
        $anexo = count($anexoUrls) === 1
            ? $anexoUrls[0]
            : (count($anexoUrls) > 1 ? json_encode($anexoUrls, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null);

        $dataPayload = [
            'forma_pagamento' => $data['forma_pagamento'] ?? 'PIX',
            'data_pagamento'  => $data['data_pagamento'] ?? $data['data_baixa'] ?? now()->format('Y-m-d'),
            'nota_entrada'    => $notaEntrada,
            'data_baixa'      => $data['data_baixa'] ?? now()->format('Y-m-d'),
            'tipo_despesa'    => $data['tipo_despesa'] ?? 'Combustível',
            'descricao'       => $data['descricao'] ?? null,
            'recebedor'       => $data['recebedor'] ?? null,
            'recebedor2'      => isset($data['recebedor2']) && trim((string) $data['recebedor2']) !== '' ? trim((string) $data['recebedor2']) : null,
            'valor_recebedor1' => $data['valor_recebedor1'] ?? null,
            'valor_recebedor2' => $data['valor_recebedor2'] ?? null,
            'abono_desconto'  => $data['abono_desconto'] ?? null,
            'observacao'      => $data['observacao'] ?? null,
            'valor'           => null,
            'anexo'           => $anexo,
        ];

        $errors = [];
        $success = 0;

        DB::beginTransaction();
        try {
            // Upsert das baixas em lote (3 queries no total) em vez de
            // SELECT + INSERT/UPDATE por abastecimento no banco remoto.
            $abastecimentosValidos = $data['ids_abastecimentos'];
            try {
                $this->upsertBaixasEmLote($abastecimentosValidos, $dataPayload, $user);
                $success = count($abastecimentosValidos);
            } catch (\Throwable $e) {
                $abastecimentosValidos = [];
                foreach ($data['ids_abastecimentos'] as $idAbastecimento) {
                    $errors[] = ['id_abastecimento' => $idAbastecimento, 'message' => $e->getMessage()];
                }
            }

            if (!empty($abastecimentosValidos)) {
                Abastecimento::whereIn('id_abastecimento', $abastecimentosValidos)
                    ->update($this->buildAbastecimentoBaixaUpdate($dataPayload));

                // Crédito do proprietário: o excedente do comprovante (valor_recebido
                // acima do total selecionado) vira crédito; o saldo pode ser usado
                // para cobrir parte do total. Roda na transação da baixa.
                $totalBaixa = round((float) $abastecimentos->whereIn('id_abastecimento', $abastecimentosValidos)->sum('valor_total'), 2);
                CreditoProprietarioController::aplicarNaBaixa(
                    (string) $proprietarioId,
                    $totalBaixa,
                    $data['valor_recebido'] ?? null,
                    $data['credito_usado'] ?? null,
                    (float) ($data['abono_desconto'] ?? 0),
                    'baixa_comprovante',
                    $notaEntrada,
                    $user
                );
            }

            if (empty($errors)) {
                // Mark all comprovantes as applied
                DB::table('comprovantes_pagamento')
                    ->whereIn('id', $data['comprovante_ids'])
                    ->update(['status' => 'aplicado', 'nota_entrada' => $notaEntrada, 'updated_at' => now()]);
                DB::commit();
            } else {
                DB::rollBack();
                return new JsonResponse([
                    'message' => 'Erro ao aplicar parte das baixas.',
                    'errors'  => $errors,
                ], 500);
            }
        } catch (\Throwable $e) {
            DB::rollBack();
            return new JsonResponse(['message' => 'Erro ao confirmar baixa: ' . $e->getMessage()], 500);
        }

        return new JsonResponse([
            'message' => $success . ' baixa(s) registrada(s) com sucesso.',
            'success' => $success,
        ], 201);
    }

    // ─────────────────────────────────────────────
    // CANCELAR
    // ─────────────────────────────────────────────

    public function destroy(string $id): JsonResponse
    {
        $this->garantirTabelas();

        $deleted = DB::table('comprovantes_pagamento')
            ->where('id', $id)
            ->whereIn('status', ['aguardando_proprietario', 'aguardando_confirmacao', 'erro'])
            ->delete();

        if (!$deleted) {
            return new JsonResponse(['message' => 'Comprovante não encontrado ou já aplicado.'], 404);
        }

        \App\Services\NotificacaoCriticaService::aoMovimentarComprovanteOuBaixa('comprovante_credito_alterado_excluido', "Comprovante de Pagamento Cancelado (#{$id})", "O comprovante de pagamento #{$id} foi cancelado/excluído por " . (auth()->user()?->nome ?? auth()->user()?->login ?? 'Administrador') . ".", 'comprovantes_pagamento', $id, 'Geral', ['id' => $id]);
        return new JsonResponse(['message' => 'Comprovante cancelado.']);
    }

    /**
     * Tira o comprovante do grupo automático (mesmo proprietário) sem apagar
     * nada: ele passa a aparecer sozinho, em uma caixa própria, disponível
     * para ser usado numa baixa futura.
     */
    public function isolar(string $id): JsonResponse
    {
        $this->garantirTabelas();

        $comprovante = DB::table('comprovantes_pagamento')->where('id', $id)->first();
        if (!$comprovante) {
            return new JsonResponse(['message' => 'Comprovante não encontrado.'], 404);
        }

        if (($comprovante->status ?? null) === 'aplicado') {
            return new JsonResponse(['message' => 'Este comprovante já foi aplicado a uma baixa; use desvincular.'], 422);
        }

        DB::table('comprovantes_pagamento')->where('id', $id)->update([
            'isolado'    => DB::raw('true'),
            'updated_at' => now(),
        ]);

        return new JsonResponse(['message' => 'Comprovante separado em uma caixa própria.']);
    }

    public function atualizarFormaPagamento(Request $request, string $id): JsonResponse
    {
        $this->garantirTabelas();

        $data = $request->validate([
            'forma_pagamento' => 'required|string|max:40',
        ]);

        $atualizado = DB::table('comprovantes_pagamento')->where('id', $id)->update([
            'forma_pagamento' => $data['forma_pagamento'],
            'updated_at'      => now(),
        ]);

        if (!$atualizado) {
            return new JsonResponse(['message' => 'Comprovante não encontrado.'], 404);
        }

        return new JsonResponse(['message' => 'Forma de pagamento atualizada.']);
    }

    public function desvincular(string $id): JsonResponse
    {
        $this->garantirTabelas();

        $user = auth()->user();
        if (!$user || ($user->tipo ?? null) !== 'admin') {
            return new JsonResponse(['message' => 'Apenas administradores podem desvincular comprovantes.'], 403);
        }

        $comprovante = DB::table('comprovantes_pagamento')->where('id', $id)->first();
        if (!$comprovante) {
            return new JsonResponse(['message' => 'Comprovante não encontrado.'], 404);
        }

        if (($comprovante->status ?? null) !== 'aplicado' || empty($comprovante->nota_entrada)) {
            DB::table('comprovantes_pagamento')->where('id', $id)->update([
                'proprietario_id' => null,
                'status'          => 'aguardando_proprietario',
                'updated_at'      => now(),
            ]);

            return new JsonResponse([
                'message' => 'Comprovante desvinculado do proprietário e devolvido para revisão.',
                'baixa_revertida' => false,
            ]);
        }

        $nota = (string) $comprovante->nota_entrada;
        if (!str_starts_with($nota, 'comprovantes:')) {
            return new JsonResponse(['message' => 'Este comprovante não está vinculado a uma baixa por comprovante.'], 422);
        }

        DB::beginTransaction();
        try {
            DB::table('comprovantes_pagamento')->where('id', $id)->update([
                'status'       => $comprovante->proprietario_id ? 'aguardando_confirmacao' : 'aguardando_proprietario',
                'nota_entrada' => null,
                'isolado'      => DB::raw('true'),
                'updated_at'   => now(),
            ]);

            $idsAbast = DB::table('baixa_abastecimento')
                ->where('nota_entrada', $nota)
                ->pluck('id_abastecimento')
                ->all();

            foreach ($idsAbast as $idAbast) {
                DB::table('abastecimentos')
                    ->where('id_abastecimento', $idAbast)
                    ->update([
                        'anexo' => $this->removerUrlDeAnexo($this->anexoAbastecimento($idAbast), (string) $comprovante->arquivo_url),
                        'sync_token_at' => now(),
                    ]);
            }

            $restantes = DB::table('comprovantes_pagamento')
                ->where('nota_entrada', $nota)
                ->count();

            $baixaRevertida = false;
            if ($restantes === 0 && !empty($idsAbast)) {
                DB::table('abastecimentos')
                    ->whereIn('id_abastecimento', $idsAbast)
                    ->update([
                        'baixa_abastecimento' => DB::raw('false'),
                        'data_baixa'          => null,
                        'tipo_despesa'        => null,
                        'descricao'           => null,
                        'valor'               => null,
                        'placa1'              => null,
                        'recebedor'           => null,
                        'observacao'          => null,
                        'anexo'               => null,
                        'sync_token_at'       => now(),
                    ]);

                DB::table('baixa_abastecimento')->where('nota_entrada', $nota)->delete();
                CreditoProprietarioController::removerPorNota($nota);
                \App\Services\NotificacaoCriticaService::aoMovimentarComprovanteOuBaixa('baixa_excluida_estornada', "Baixa Revertida por Desvinculação (" . count($idsAbast) . " abast.)", "Comprovante #{$id} desvinculado por " . ($user->nome ?? $user->login ?? 'Administrador') . " — baixa estornada (" . count($idsAbast) . " abastecimentos voltaram para Pendente).", 'comprovantes_pagamento', $id, 'Geral', ['comprovante_id' => $id, 'baixa_revertida' => true, 'abastecimentos' => $idsAbast]);
                $baixaRevertida = true;
            }

            DB::commit();

            return new JsonResponse([
                'message' => $baixaRevertida
                    ? 'Comprovante desvinculado. Era o último: a baixa foi revertida e os abastecimentos voltaram para Pendente.'
                    : 'Comprovante desvinculado da baixa e devolvido para "Baixa por Comprovante".',
                'baixa_revertida' => $baixaRevertida,
                'comprovantes_restantes' => $restantes,
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            return new JsonResponse(['message' => 'Erro ao desvincular comprovante: ' . $e->getMessage()], 500);
        }
    }

    private function anexoAbastecimento(string $idAbastecimento): ?string
    {
        $valor = DB::table('abastecimentos')
            ->where('id_abastecimento', $idAbastecimento)
            ->value('anexo');

        return $valor !== null ? (string) $valor : null;
    }

    private function removerUrlDeAnexo($anexo, string $url): ?string
    {
        if (!$anexo) return null;
        $s = trim((string) $anexo);
        $lista = [];

        if (str_starts_with($s, '[')) {
            $dec = json_decode($s, true);
            if (is_array($dec)) $lista = $dec;
        } elseif ($s !== '') {
            $lista = [$s];
        }

        $lista = array_values(array_filter($lista, fn ($u) => trim((string) $u) !== $url));
        if (empty($lista)) return null;

        return count($lista) === 1
            ? $lista[0]
            : json_encode($lista, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    // ─────────────────────────────────────────────
    // AI ANALYSIS
    // ─────────────────────────────────────────────

    private function analisarComprovanteSeguro(string $arquivoUrl, string $arquivoTipo): array
    {
        $urlAnalise = $this->prepararUrlParaAnalise($arquivoUrl, $arquivoTipo);

        try {
            return $this->analisarComprovanteIA($urlAnalise);
        } catch (\Throwable $e) {
            return [
                'valor_pago'       => null,
                'data_pagamento'   => null,
                'remetente'        => null,
                'tipo_comprovante' => null,
                'banco_origem'     => null,
                'chave_pix'        => null,
                'raw_text'         => 'Falha ao analisar comprovante com IA: ' . $e->getMessage(),
                'confidence'       => 0,
                '_erro_ia'         => true,
            ];
        }
    }

    private function prepararUrlParaAnalise(string $arquivoUrl, string $arquivoTipo): string
    {
        if (str_contains($arquivoUrl, 'drive.google.com')) {
            try {
                $driveService = app(\App\Services\GoogleDriveService::class);
                $fileId = $driveService->extractFileId($arquivoUrl);
                
                if ($fileId) {
                    $accessToken = $driveService->accessToken();
                    
                    $request = \Illuminate\Support\Facades\Http::withToken($accessToken);
                    if (PHP_OS_FAMILY === 'Windows') {
                        $request = $request->withoutVerifying();
                    }

                    // First try to get the thumbnail link
                    $response = $request->get("https://www.googleapis.com/drive/v3/files/{$fileId}?fields=thumbnailLink,mimeType");

                    if ($response->successful()) {
                        $data = $response->json();
                        $thumbnailLink = $data['thumbnailLink'] ?? null;
                        
                        if ($thumbnailLink) {
                            // Request larger thumbnail for better OCR
                            $thumbnailLink = preg_replace('/=s\d+/', '=s1024', $thumbnailLink);
                            
                            $thumbRequest = \Illuminate\Support\Facades\Http::withToken($accessToken);
                            if (PHP_OS_FAMILY === 'Windows') {
                                $thumbRequest = $thumbRequest->withoutVerifying();
                            }
                            
                            $thumbResponse = $thumbRequest->get($thumbnailLink);
                            
                            if ($thumbResponse->successful()) {
                                $base64 = base64_encode($thumbResponse->body());
                                return 'data:image/jpeg;base64,' . $base64;
                            }
                        }
                        
                        // If no thumbnail but it's an image, fetch original
                        if (str_starts_with($data['mimeType'] ?? '', 'image/')) {
                            $imgRequest = \Illuminate\Support\Facades\Http::withToken($accessToken);
                            if (PHP_OS_FAMILY === 'Windows') {
                                $imgRequest = $imgRequest->withoutVerifying();
                            }
                            
                            $imgResponse = $imgRequest->get("https://www.googleapis.com/drive/v3/files/{$fileId}?alt=media");
                            
                            if ($imgResponse->successful()) {
                                $mime = $data['mimeType'] ?: 'image/jpeg';
                                $base64 = base64_encode($imgResponse->body());
                                return 'data:' . $mime . ';base64,' . $base64;
                            }
                        }
                    }
                }
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::error('Erro ao baixar arquivo do Drive para IA: ' . $e->getMessage());
            }
        }

        // Remoção completa do Cloudinary (Pente Fino)

        return $arquivoUrl;
    }

    private function montarUrl(array $parts): string
    {
        $scheme = $parts['scheme'] ?? 'https';
        $host = $parts['host'] ?? '';
        $port = isset($parts['port']) ? ':' . $parts['port'] : '';
        $path = $parts['path'] ?? '';
        $query = isset($parts['query']) ? '?' . $parts['query'] : '';

        return $scheme . '://' . $host . $port . $path . $query;
    }

    private function analisarComprovanteIA(string $imageUrl): array
    {
        $apiKey = (string) env('OPENAI_API_KEY', '');
        if ($apiKey === '') {
            return [
                'valor_pago'      => null,
                'data_pagamento'  => null,
                'remetente'       => null,
                'tipo_comprovante' => null,
                'confidence'      => 0,
                'raw_text'        => 'OPENAI_API_KEY não configurada.',
                '_sem_ia'         => true,
            ];
        }

        $prompt = <<<'PROMPT'
Analise este comprovante de pagamento/transferência bancária.
Retorne apenas JSON válido, sem markdown, sem texto extra.

Campos obrigatórios:
- valor_pago: número decimal (valor total pago em reais) ou null
- data_pagamento: "YYYY-MM-DD" ou null
- remetente: nome COMPLETO de quem fez o pagamento (o cliente que está pagando)
- tipo_comprovante: "pix", "transferencia", "ted", "doc", "boleto", "deposito", "dinheiro", "cheque", "outro"
- banco_origem: nome do banco de quem pagou ou null
- chave_pix: chave pix do recebedor (se visível) ou null
- raw_text: resumo curto do texto lido
- confidence: número de 0 a 1

REGRAS CRÍTICAS sobre o campo "remetente":
1. O remetente é quem ESTÁ PAGANDO - o cliente/empresa que enviou o dinheiro.
2. NUNCA retorne "VIPE", "VIPE Transportes" ou qualquer nome contendo a palavra "VIPE" como remetente.
3. NUNCA retorne "Joao Augusto Barbosa" (ou variações do nome "Augusto") como remetente - essa pessoa é um recebedor interno, nunca o cliente pagador.
4. Se o nome do pagador contém "VIPE" ou "Joao Augusto Barbosa"/"Augusto", use o nome do outro participante (destinatário/beneficiário) como remetente.
5. O destinatário (quem recebe) é sempre a VIPE, "Joao Augusto Barbosa"/"Augusto" ou empresa de combustível - ignore este.
6. Se não for possível identificar o remetente sem incluir VIPE ou Augusto, retorne remetente: null.
7. Inclua CPF/CNPJ junto ao nome se visível, ex: "José Silva (123.456.789-00)".
PROMPT;

        $response = Http::withToken($apiKey)
            ->connectTimeout(10)
            ->timeout(45)
            ->post('https://api.openai.com/v1/chat/completions', [
                'model' => (string) env('OPENAI_MODEL', 'gpt-4o-mini'),
                'response_format' => ['type' => 'json_object'],
                'messages' => [[
                    'role' => 'user',
                    'content' => [
                        ['type' => 'text', 'text' => $prompt],
                        ['type' => 'image_url', 'image_url' => ['url' => $imageUrl]],
                    ],
                ]],
            ]);

        if (!$response->successful()) {
            throw new \RuntimeException('Falha ao analisar comprovante com IA: ' . $response->body());
        }

        $content = $response->json('choices.0.message.content');
        $decoded = is_string($content) ? json_decode($content, true) : null;
        if (!is_array($decoded)) {
            throw new \RuntimeException('IA retornou resposta inválida.');
        }

        return $decoded;
    }

    // ─────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────

    private function extrairRemetente(array $analise): ?string
    {
        $remetente = trim((string) ($analise['remetente'] ?? ''));
        if ($remetente === '' || $remetente === 'null') {
            return null;
        }
        // Double-check: remove if contains VIPE
        if (stripos($remetente, 'VIPE') !== false) {
            return null;
        }
        // Double-check: "Joao Augusto Barbosa" / "Augusto" é o recebedor interno (RecebedorBaixa::AUGUSTO),
        // nunca um proprietário/cliente pagador — mesma regra dada à IA no prompt.
        if (stripos($remetente, 'augusto') !== false) {
            return null;
        }
        return $remetente;
    }

    private function resolverProprietario(?string $remetente): array
    {
        if (!$remetente) {
            return ['proprietario_id' => null, 'proprietario_nome' => null];
        }

        AliasProprietarioController::garantirTabelaAliasProprietarios();
        $nomeNorm = AliasProprietarioController::normalizarNome($remetente);

        // 1. Check alias table
        $alias = DB::table('alias_proprietarios')->where('nome_alias', $nomeNorm)->first();
        if ($alias) {
            $proprietario = DB::table('proprietarios')->where('id_proprietario', $alias->proprietario_id)->first();
            return [
                'proprietario_id'   => $alias->proprietario_id,
                'proprietario_nome' => $proprietario?->nome,
            ];
        }

        // 2. Try direct name match on proprietarios
        $proprietario = DB::table('proprietarios')
            ->whereRaw('LOWER(TRIM(nome)) = LOWER(TRIM(?))', [$remetente])
            ->whereNull('deleted_at')
            ->first();

        if ($proprietario) {
            return [
                'proprietario_id'   => $proprietario->id_proprietario,
                'proprietario_nome' => $proprietario->nome,
            ];
        }

        return ['proprietario_id' => null, 'proprietario_nome' => null];
    }

    private function enriquecerComprovante(object $comprovante): array
    {
        $arr = (array) $comprovante;
        if ($arr['dados_ia'] && is_string($arr['dados_ia'])) {
            $arr['dados_ia'] = json_decode($arr['dados_ia'], true);
        }
        if ($arr['proprietario_id'] && empty($arr['proprietario_nome'])) {
            $proprietario = DB::table('proprietarios')->where('id_proprietario', $arr['proprietario_id'])->first();
            $arr['proprietario_nome'] = $proprietario?->nome;
        }
        return $arr;
    }

    private function numOuNull(mixed $value): ?float
    {
        if ($value === null || $value === '' || $value === 'null') {
            return null;
        }
        $v = is_numeric($value) ? (float) $value : null;
        return ($v !== null && $v > 0) ? round($v, 2) : null;
    }

    private function dataOuNull(mixed $value): ?string
    {
        if (!$value || $value === 'null') return null;
        try {
            $dt = new \DateTimeImmutable((string) $value);
            return $dt->format('Y-m-d');
        } catch (\Throwable) {
            return null;
        }
    }

    private function detectarTipoArquivo(string $mimeType): string
    {
        if (str_contains($mimeType, 'pdf')) return 'pdf';
        if (str_contains($mimeType, 'image')) return 'image';
        return 'image';
    }

    private function uploadComprovanteFile($uploaded, string $folder = 'comprovantes_pagamento'): array
    {
        $drive = app(\App\Services\GoogleDriveService::class);
        $result = $drive->uploadComprovante(
            $uploaded->getRealPath(),
            $uploaded->getClientOriginalName(),
            $uploaded->getMimeType() ?: 'application/octet-stream'
        );

        return [
            'id'          => $result['file_id'] ?? null,
            'downloadUrl' => $result['downloadUrl'] ?? null,
        ];
    }

    /**
     * Upsert das baixas em lote: 1 SELECT dos existentes + 1 UPDATE whereIn
     * + 1 bulk INSERT, em vez de 2 round-trips por abastecimento.
     */
    private function upsertBaixasEmLote(array $idsAbastecimentos, array $data, $user): void
    {
        if (empty($idsAbastecimentos)) {
            return;
        }

        $payloadComum = [
            'data_hora'        => now(),
            'usuario'          => $user?->nome ?? $user?->login ?? 'sistema',
            'forma_pagamento'  => $data['forma_pagamento'] ?? 'PIX',
            'data_pagamento'   => $data['data_pagamento'] ?? now(),
            'nota_entrada'     => $data['nota_entrada'] ?? '',
            'sync_token_at'    => now(),
        ];

        // Ao reaproveitar uma linha de baixa que estava inativa/excluída (o
        // pluck abaixo não filtra deleted_at), é obrigatório REATIVÁ-LA. Sem
        // isto a baixa era regravada mas continuava com deleted_at/status
        // 'Inativo', ficando invisível no relatório de baixas efetuadas
        // enquanto o abastecimento seguia marcado como baixado (estado órfão).
        foreach (['deleted_at', 'deleted_by', 'deleted_by_id'] as $coluna) {
            if (\Illuminate\Support\Facades\Schema::hasColumn('baixa_abastecimento', $coluna)) {
                $payloadComum[$coluna] = null;
            }
        }
        if (\Illuminate\Support\Facades\Schema::hasColumn('baixa_abastecimento', 'status')) {
            $payloadComum['status'] = 'Ativo';
        }

        $existentes = DB::table('baixa_abastecimento')
            ->whereIn('id_abastecimento', $idsAbastecimentos)
            ->pluck('id_baixa', 'id_abastecimento');

        if ($existentes->isNotEmpty()) {
            DB::table('baixa_abastecimento')
                ->whereIn('id_baixa', $existentes->values()->all())
                ->update($payloadComum);
        }

        $novos = [];
        foreach ($idsAbastecimentos as $id) {
            if ($existentes->has($id)) {
                continue;
            }
            $novos[] = array_merge($payloadComum, [
                'id_baixa'         => (string) Str::uuid(),
                'id_abastecimento' => $id,
            ]);
        }
        if (!empty($novos)) {
            DB::table('baixa_abastecimento')->insert($novos);
        }
    }

    private function buildAbastecimentoBaixaUpdate(array $data): array
    {
        $update = [
            'baixa_abastecimento' => DB::raw('true'),
            'data_baixa'          => $data['data_baixa'] ?? now(),
            'tipo_despesa'        => $data['tipo_despesa'] ?? 'Combustível',
            'descricao'           => $data['descricao'] ?? null,
            'valor'               => $data['valor'] ?? null,
            'recebedor'           => $data['recebedor'] ?? null,
            'observacao'          => $data['observacao'] ?? null,
            'anexo'               => $data['anexo'] ?? null,
            'sync_token_at'       => now(),
        ];

        if (\Illuminate\Support\Facades\Schema::hasColumn('abastecimentos', 'valor_recebedor1')) {
            $update['valor_recebedor1'] = $data['valor_recebedor1'] ?? null;
            $update['recebedor2']       = $data['recebedor2'] ?? null;
            $update['valor_recebedor2'] = $data['valor_recebedor2'] ?? null;
        }

        if (\Illuminate\Support\Facades\Schema::hasColumn('abastecimentos', 'abono_desconto')) {
            $update['abono_desconto'] = $data['abono_desconto'] ?? null;
        }

        return $update;
    }

    private static bool $tabelasGarantidas = false;

    private function garantirTabelas(): void
    {
        // Memoizado por processo: este método roda em praticamente todo
        // endpoint de comprovantes (tela "Nova Baixa por Comprovante"), então
        // evitar repetir DDL a cada request tem impacto direto na latência
        // percebida dessa tela.
        if (self::$tabelasGarantidas) {
            return;
        }

        DB::statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS comprovantes_pagamento (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                arquivo_url TEXT NOT NULL,
                arquivo_tipo VARCHAR(20) NOT NULL DEFAULT 'image',
                arquivo_hash VARCHAR(64) NULL,
                valor_extraido NUMERIC(12,2) NULL,
                data_pagamento_extraida DATE NULL,
                remetente_extraido TEXT NULL,
                proprietario_id VARCHAR(120) NULL,
                status VARCHAR(40) NOT NULL DEFAULT 'aguardando_confirmacao',
                confianca_ia NUMERIC(5,4) NULL,
                dados_ia JSONB NULL,
                nota_entrada TEXT NULL,
                usuario VARCHAR(255) NULL,
                usuario_id VARCHAR(120) NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        SQL);

        DB::statement('CREATE INDEX IF NOT EXISTS idx_comprovantes_status ON comprovantes_pagamento (status)');
        DB::statement('CREATE INDEX IF NOT EXISTS idx_comprovantes_hash ON comprovantes_pagamento (arquivo_hash)');
        DB::statement('CREATE INDEX IF NOT EXISTS idx_comprovantes_proprietario ON comprovantes_pagamento (proprietario_id)');
        DB::statement(
            'ALTER TABLE comprovantes_pagamento ' .
            "ALTER COLUMN proprietario_id TYPE VARCHAR(120) USING proprietario_id::text, " .
            "ALTER COLUMN nota_entrada TYPE TEXT USING nota_entrada::text, " .
            'ADD COLUMN IF NOT EXISTS isolado BOOLEAN NOT NULL DEFAULT FALSE, ' .
            "ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(40) NOT NULL DEFAULT 'PIX'"
        );

        AliasProprietarioController::garantirTabelaAliasProprietarios();

        self::$tabelasGarantidas = true;
    }
}
