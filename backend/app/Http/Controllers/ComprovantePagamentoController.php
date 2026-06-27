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
    // CONFIRMAR BAIXA
    // ─────────────────────────────────────────────

    public function confirmar(Request $request, string $id): JsonResponse
    {
        $this->garantirTabelas();

        $data = $request->validate([
            'ids_abastecimentos' => 'required|array|min:1',
            'ids_abastecimentos.*' => 'exists:abastecimentos,id_abastecimento',
            'forma_pagamento'    => 'nullable|string',
            'data_baixa'         => 'nullable|date',
            'tipo_despesa'       => 'nullable|string',
            'descricao'          => 'nullable|string',
            'recebedor'          => 'nullable|string',
            'observacao'         => 'nullable|string',
        ]);

        $comprovante = DB::table('comprovantes_pagamento')->where('id', $id)->first();
        if (!$comprovante) {
            return new JsonResponse(['message' => 'Comprovante não encontrado.'], 404);
        }
        if (!$comprovante->proprietario_id) {
            return new JsonResponse(['message' => 'Comprovante sem proprietário atribuído.'], 422);
        }
        if ($comprovante->status === 'aplicado') {
            return new JsonResponse(['message' => 'Comprovante já foi aplicado.'], 422);
        }

        // Validate all abastecimentos belong to this proprietario
        $abastecimentos = Abastecimento::whereIn('id_abastecimento', $data['ids_abastecimentos'])->get();
        foreach ($abastecimentos as $abastecimento) {
            if ((string) $abastecimento->id_proprietario !== (string) $comprovante->proprietario_id) {
                return new JsonResponse([
                    'message' => 'Abastecimento ' . $abastecimento->id_abastecimento . ' não pertence ao proprietário do comprovante.',
                ], 422);
            }
        }

        $user = auth()->user();
        $notaEntrada = 'comprovante:' . $id;
        $dataPayload = [
            'forma_pagamento' => $data['forma_pagamento'] ?? 'PIX',
            'data_pagamento'  => $data['data_baixa'] ?? $comprovante->data_pagamento_extraida ?? now()->format('Y-m-d'),
            'nota_entrada'    => $notaEntrada,
            'data_baixa'      => $data['data_baixa'] ?? now()->format('Y-m-d'),
            'tipo_despesa'    => $data['tipo_despesa'] ?? 'Combustível',
            'descricao'       => $data['descricao'] ?? null,
            'recebedor'       => $data['recebedor'] ?? null,
            'observacao'      => $data['observacao'] ?? null,
            'valor'           => null,
            'anexo'           => $comprovante->arquivo_url,
        ];

        $errors = [];
        $success = 0;

        DB::beginTransaction();
        try {
            foreach ($data['ids_abastecimentos'] as $idAbastecimento) {
                try {
                    $this->upsertBaixa($idAbastecimento, $dataPayload, $user);
                    Abastecimento::where('id_abastecimento', $idAbastecimento)
                        ->update($this->buildAbastecimentoBaixaUpdate($dataPayload));
                    $success++;
                } catch (\Throwable $e) {
                    $errors[] = ['id_abastecimento' => $idAbastecimento, 'message' => $e->getMessage()];
                }
            }

            if (empty($errors)) {
                DB::table('comprovantes_pagamento')
                    ->where('id', $id)
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

        return new JsonResponse(['message' => 'Comprovante cancelado.']);
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
3. Se o nome do pagador contém "VIPE", use o nome do outro participante (destinatário/beneficiário) como remetente.
4. O destinatário (quem recebe) é sempre a VIPE ou empresa de combustível - ignore este.
5. Se não for possível identificar o remetente sem incluir VIPE, retorne remetente: null.
6. Inclua CPF/CNPJ junto ao nome se visível, ex: "José Silva (123.456.789-00)".
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

    private function upsertBaixa(string $idAbastecimento, array $data, $user): void
    {
        $existingId = DB::table('baixa_abastecimento')
            ->where('id_abastecimento', $idAbastecimento)
            ->value('id_baixa');

        $payload = [
            'id_abastecimento' => $idAbastecimento,
            'data_hora'        => now(),
            'usuario'          => $user?->nome ?? $user?->login ?? 'sistema',
            'forma_pagamento'  => $data['forma_pagamento'] ?? 'PIX',
            'data_pagamento'   => $data['data_pagamento'] ?? now(),
            'nota_entrada'     => $data['nota_entrada'] ?? '',
            'sync_token_at'    => now(),
        ];

        if ($existingId) {
            DB::table('baixa_abastecimento')->where('id_baixa', $existingId)->update($payload);
            return;
        }

        $payload['id_baixa'] = (string) Str::uuid();
        DB::table('baixa_abastecimento')->insert($payload);
    }

    private function buildAbastecimentoBaixaUpdate(array $data): array
    {
        return [
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
    }

    private function garantirTabelas(): void
    {
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
                nota_entrada VARCHAR(200) NULL,
                usuario VARCHAR(255) NULL,
                usuario_id VARCHAR(120) NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        SQL);

        DB::statement('CREATE INDEX IF NOT EXISTS idx_comprovantes_status ON comprovantes_pagamento (status)');
        DB::statement('CREATE INDEX IF NOT EXISTS idx_comprovantes_hash ON comprovantes_pagamento (arquivo_hash)');
        DB::statement('CREATE INDEX IF NOT EXISTS idx_comprovantes_proprietario ON comprovantes_pagamento (proprietario_id)');
        DB::statement('ALTER TABLE comprovantes_pagamento ALTER COLUMN proprietario_id TYPE VARCHAR(120) USING proprietario_id::text');

        AliasProprietarioController::garantirTabelaAliasProprietarios();
    }
}
