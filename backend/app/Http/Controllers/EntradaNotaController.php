<?php

namespace App\Http\Controllers;

use App\Models\EntradaNota;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class EntradaNotaController extends Controller
{
    private function garantirEstruturaEntradaNotas(): void
    {
        $this->garantirColunasAuditoria('entrada_notas');
        DB::statement('ALTER TABLE entrada_notas ADD COLUMN IF NOT EXISTS nota_verificacao_status VARCHAR(30) NULL');
        DB::statement('ALTER TABLE entrada_notas ADD COLUMN IF NOT EXISTS nota_verificacao_mensagem TEXT NULL');
        DB::statement('ALTER TABLE entrada_notas ADD COLUMN IF NOT EXISTS nota_verificacao_tipo VARCHAR(80) NULL');
        DB::statement('ALTER TABLE entrada_notas ADD COLUMN IF NOT EXISTS nota_verificacao_confianca NUMERIC(6,3) NULL');
        DB::statement('ALTER TABLE entrada_notas ADD COLUMN IF NOT EXISTS nota_verificada_em TIMESTAMP NULL');
        DB::statement('ALTER TABLE entrada_notas ADD COLUMN IF NOT EXISTS fornecedor VARCHAR(255) NULL');
        DB::statement('ALTER TABLE entrada_notas ADD COLUMN IF NOT EXISTS fornecedor_ia_status VARCHAR(30) NULL');
        DB::statement('ALTER TABLE entrada_notas ADD COLUMN IF NOT EXISTS fornecedor_ia_mensagem TEXT NULL');
        DB::statement('ALTER TABLE entrada_notas ADD COLUMN IF NOT EXISTS fornecedor_ia_extraido VARCHAR(255) NULL');
        DB::statement('ALTER TABLE entrada_notas ADD COLUMN IF NOT EXISTS fornecedor_confirmado BOOLEAN NOT NULL DEFAULT FALSE');
        DB::statement('ALTER TABLE entrada_notas ADD COLUMN IF NOT EXISTS paga BOOLEAN NOT NULL DEFAULT FALSE');
        if ($this->tabelaTemColuna('entrada_notas', 'data_hora')) {
            $this->garantirCustoTransporteEntradaNotas();
            return;
        }
        DB::statement('ALTER TABLE entrada_notas ADD COLUMN IF NOT EXISTS data_hora TIMESTAMP NULL');
        $this->garantirCustoTransporteEntradaNotas();
    }

    private function filiaisPermitidas(): array
    {
        $user = auth()->user();
        if (!$user) {
            abort(401, 'Não autenticado.');
        }
        return method_exists($user, 'filiaisAcesso') ? $user->filiaisAcesso() : ['Matriz', 'Viana'];
    }

    private function applyLocal($query, ?string $local)
    {
        return $this->aplicarFiltroLocalPermitido(
            $query,
            'entrada_notas',
            $this->filiaisPermitidas(),
            $local
        );
    }

    private function validarAcessoFilial(string $local): void
    {
        if (!in_array($local, $this->filiaisPermitidas(), true)) {
            abort(403, 'Usuário sem acesso a esta filial.');
        }
    }

    public function index(Request $request)
    {
        $this->garantirEstruturaEntradaNotas();
        $query = $this->applyLocal(EntradaNota::query(), $request->query('local'));
        $this->aplicarFiltroAtivos($query, 'entrada_notas', $request);
        $this->aplicarFiltroSyncToken($query, $request, 'entrada_notas');
        if ($request->filled('tipo')) $query->where('tipo', $request->tipo);
        if ($request->filled('numero_nota_fiscal')) {
            $numeroNota = trim((string) $request->query('numero_nota_fiscal'));
            $query->where('numero_nota_fiscal', 'ilike', '%'.$numeroNota.'%');
        }
        if ($request->filled('data_inicio')) $query->whereDate('data', '>=', $request->data_inicio);
        if ($request->filled('data_fim')) $query->whereDate('data', '<=', $request->data_fim);
        if ($request->filled('fornecedor')) {
            $fornecedor = trim((string) $request->query('fornecedor'));
            $query->where('fornecedor', 'ilike', '%'.$fornecedor.'%');
        }
        if ($this->suportaSyncIncremental($request, 'entrada_notas')) {
            return new \Illuminate\Http\JsonResponse(
                $query->orderBy('sync_token_at')->orderBy('id_financeiro')->paginate($request->get('per_page', 30))
            );
        }
        return new \Illuminate\Http\JsonResponse(
            $query
                ->orderByRaw('COALESCE(data_hora, data::timestamp) DESC')
                ->orderByDesc('id_financeiro')
                ->paginate($request->get('per_page', 30))
        );
    }

    public function fornecedores(Request $request)
    {
        $this->garantirEstruturaEntradaNotas();
        $query = $this->applyLocal(EntradaNota::query(), $request->query('local'));
        $this->aplicarFiltroAtivos($query, 'entrada_notas', $request);

        $fornecedores = $query
            ->whereNotNull('fornecedor')
            ->where('fornecedor', '!=', '')
            ->distinct()
            ->orderBy('fornecedor')
            ->limit(200)
            ->pluck('fornecedor')
            ->map(fn ($f) => trim((string) $f))
            ->filter()
            ->unique()
            ->values();

        return new \Illuminate\Http\JsonResponse(['data' => $fornecedores]);
    }

    public function confirmarFornecedor(Request $request, string $id): JsonResponse
    {
        $this->garantirEstruturaEntradaNotas();
        $nota = EntradaNota::findOrFail($id);
        $this->validarAcessoFilial((string) $nota->local);

        $nota->forceFill(['fornecedor_confirmado' => DB::raw('true')])->save();

        return new JsonResponse(['ok' => true, 'entrada_nota' => $nota->fresh()]);
    }

    public function baixar(Request $request, string $id): JsonResponse
    {
        $this->garantirEstruturaEntradaNotas();
        $nota = EntradaNota::findOrFail($id);
        $this->validarAcessoFilial((string) $nota->local);

        $nota->forceFill(['paga' => DB::raw('true')])->save();

        return new JsonResponse(['ok' => true, 'entrada_nota' => $nota->fresh()]);
    }

    public function store(Request $request)
    {
        $this->garantirEstruturaEntradaNotas();
        $data = $request->validate([
            'data'               => 'required|date',
            'data_hora'          => 'nullable|date',
            'numero_nota_fiscal' => 'nullable|string',
            'valor'              => 'required|numeric|min:0.01',
            'quantidade'         => 'nullable|numeric|min:0',
            'valor_litro'        => 'nullable|numeric|min:0',
            'responsavel'        => 'nullable|string',
            'foto_nota'          => 'nullable|string',
            'tipo'               => 'nullable|string',
            'local'              => 'nullable|string|in:Matriz,Viana',
            'fornecedor'         => 'nullable|string|max:255',
        ]);
        if (array_key_exists('fornecedor', $data)) {
            $data['fornecedor'] = trim((string) ($data['fornecedor'] ?? '')) ?: null;
        }
        $data['data_hora'] = $data['data_hora'] ?? $data['data'];
        $data['responsavel'] = auth()->user()?->nome ?? ($data['responsavel'] ?? null);
        $data['local'] = trim((string) ($data['local'] ?? '')) ?: ($this->filiaisPermitidas()[0] ?? 'Matriz');
        $this->validarAcessoFilial($data['local']);
        $data = array_merge($data, $this->calcularCustoTransporteEntradaNota($data));
        if (!empty($data['numero_nota_fiscal'])) {
            $existing = EntradaNota::query()
                ->where('numero_nota_fiscal', $data['numero_nota_fiscal'])
                ->whereDate('data', $data['data'])
                ->when(
                    $this->tabelaTemColuna('entrada_notas', 'local'),
                    fn ($q) => $q->whereRaw('LOWER(local) = LOWER(?)', [$data['local']])
                )
                ->when($data['tipo'] ?? null, fn ($q, $tipo) => $q->where('tipo', $tipo))
                ->first();
            if ($existing) {
                $custo = $this->calcularCustoTransporteEntradaNota($existing->toArray(), $existing);
                if (
                    $existing->custo_transporte_litro === null ||
                    $existing->custo_transporte_total === null ||
                    $existing->valor_compra_final === null
                ) {
                    $existing->forceFill($custo)->save();
                    $existing = $existing->fresh();
                }
                return new \Illuminate\Http\JsonResponse($existing);
            }
        }
        $nota = EntradaNota::create($data);

        // Move the file to the correct folder
        if (!empty($nota->foto_nota)) {
            try {
                $drive = app(\App\Services\GoogleDriveService::class);
                $fileId = $drive->extractFileId($nota->foto_nota);
                if ($fileId) {
                    $fornecedor = trim((string)$nota->fornecedor) ?: 'Desconhecido';
                    $targetFolder = $drive->resolveProprietarioFolder($fornecedor, 'Notas');
                    $drive->moveFile($fileId, $targetFolder);
                }
            } catch (\Throwable $e) {
                // Ignore errors during move to not break the save flow
                \Illuminate\Support\Facades\Log::warning("Falha ao organizar pasta no Google Drive: " . $e->getMessage());
            }
        }

        return new \Illuminate\Http\JsonResponse($nota, 201);
    }

    public function show(string $id)
    {
        $nota = EntradaNota::findOrFail($id);
        $this->validarAcessoFilial((string) $nota->local);
        return new \Illuminate\Http\JsonResponse($nota);
    }

    public function update(Request $request, string $id)
    {
        $this->garantirEstruturaEntradaNotas();
        $nota = EntradaNota::findOrFail($id);
        $this->validarAcessoFilial((string) $nota->local);
        $data = $request->validate([
            'data'               => 'sometimes|date',
            'data_hora'          => 'nullable|date',
            'numero_nota_fiscal' => 'nullable|string',
            'valor'              => 'sometimes|required|numeric|min:0.01',
            'quantidade'         => 'nullable|numeric|min:0',
            'valor_litro'        => 'nullable|numeric|min:0',
            'responsavel'        => 'nullable|string',
            'foto_nota'          => 'nullable|string',
            'tipo'               => 'nullable|string',
            'local'              => 'nullable|string|in:Matriz,Viana',
            'fornecedor'         => 'nullable|string|max:255',
        ]);
        if (array_key_exists('data', $data) && !array_key_exists('data_hora', $data)) {
            $data['data_hora'] = $data['data'];
        }
        if (array_key_exists('fornecedor', $data)) {
            $data['fornecedor'] = trim((string) ($data['fornecedor'] ?? '')) ?: null;
            // Mudou o fornecedor informado: a verificação/confirmação anterior fica obsoleta.
            if ($data['fornecedor'] !== $nota->fornecedor) {
                $data['fornecedor_confirmado'] = DB::raw('false');
                $data['fornecedor_ia_status'] = null;
                $data['fornecedor_ia_mensagem'] = null;
                $data['fornecedor_ia_extraido'] = null;
            }
        }
        $data['responsavel'] = auth()->user()?->nome ?? ($data['responsavel'] ?? $nota->responsavel);
        if (array_key_exists('local', $data)) {
            $data['local'] = trim((string) ($data['local'] ?? '')) ?: $nota->local;
            $this->validarAcessoFilial($data['local']);
        }
        $data = array_merge($data, $this->calcularCustoTransporteEntradaNota($data, $nota));
        $this->registrarAlteracoes($nota, $data);
        $nota->update($data);

        // Move the file to the correct folder if there's an image
        if (!empty($nota->foto_nota)) {
            try {
                $drive = app(\App\Services\GoogleDriveService::class);
                $fileId = $drive->extractFileId($nota->foto_nota);
                if ($fileId) {
                    $fornecedor = trim((string)$nota->fornecedor) ?: 'Desconhecido';
                    $targetFolder = $drive->resolveProprietarioFolder($fornecedor, 'Notas');
                    $drive->moveFile($fileId, $targetFolder);
                }
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning("Falha ao organizar pasta no Google Drive: " . $e->getMessage());
            }
        }

        return new \Illuminate\Http\JsonResponse($nota->fresh());
    }

    public function analisarIa(Request $request, string $id): JsonResponse
    {
        $this->garantirEstruturaEntradaNotas();
        $nota = EntradaNota::findOrFail($id);
        $this->validarAcessoFilial((string) $nota->local);

        $data = $request->validate([
            'image_url' => 'nullable|string',
        ]);

        if ($this->globalAnalysisEngine() !== 'ai') {
            $nota->forceFill([
                'nota_verificacao_status' => 'desativada',
                'nota_verificacao_mensagem' => 'Análise por IA desativada na configuração global.',
                'nota_verificacao_tipo' => null,
                'nota_verificacao_confianca' => null,
                'nota_verificada_em' => now(),
                'fornecedor_ia_status' => 'desativada',
                'fornecedor_ia_mensagem' => null,
                'fornecedor_ia_extraido' => null,
            ])->save();

            return new JsonResponse([
                'ok' => true,
                'status' => 'desativada',
                'message' => $nota->nota_verificacao_mensagem,
                'entrada_nota' => $nota->fresh(),
            ]);
        }

        $imageUrl = trim((string) ($data['image_url'] ?? $nota->foto_nota ?? ''));
        if ($imageUrl === '') {
            $nota->forceFill([
                'nota_verificacao_status' => 'suspeita',
                'nota_verificacao_mensagem' => 'Nota fiscal sem anexo para verificação.',
                'nota_verificacao_tipo' => 'sem_anexo',
                'nota_verificacao_confianca' => 0,
                'nota_verificada_em' => now(),
                'fornecedor_ia_status' => trim((string) $nota->fornecedor) !== '' ? 'pendente' : null,
                'fornecedor_ia_mensagem' => trim((string) $nota->fornecedor) !== ''
                    ? 'Não foi possível verificar o fornecedor: nota sem anexo.'
                    : null,
                'fornecedor_ia_extraido' => null,
            ])->save();

            return new JsonResponse([
                'ok' => false,
                'status' => 'suspeita',
                'message' => $nota->nota_verificacao_mensagem,
                'entrada_nota' => $nota->fresh(),
            ]);
        }

        $apiKey = (string) env('OPENAI_API_KEY', '');
        if ($apiKey === '') {
            throw new HttpResponseException(new JsonResponse([
                'message' => 'OPENAI_API_KEY não configurada no backend.',
            ], 422));
        }

        $result = $this->analisarImagemNotaFiscal($apiKey, $imageUrl, $nota);
        $isNota = (bool) ($result['parece_nota_fiscal'] ?? false);
        $status = $isNota ? 'validada' : 'suspeita';
        $confidence = $this->num($result['confidence'] ?? null);
        $message = trim((string) ($result['reason'] ?? ''));
        if ($message === '') {
            $message = $isNota
                ? 'Imagem parece ser uma nota fiscal ou documento fiscal.'
                : 'Imagem não parece ser uma nota fiscal/documento fiscal.';
        }

        // Verificação de coerência do fornecedor informado x emitente identificado na nota.
        $fornecedorInformado = trim((string) ($nota->fornecedor ?? ''));
        $fornecedorExtraido = trim((string) (
            $result['fornecedor_emitente']
                ?? ($result['readable_fields']['fornecedor'] ?? '')
                ?? ''
        )) ?: null;
        $fornecedorCoerente = $result['fornecedor_coerente'] ?? null;
        $fornecedorMensagemIa = trim((string) ($result['fornecedor_mensagem'] ?? ''));

        if ($fornecedorInformado === '') {
            $fornecedorIaStatus = null;
            $fornecedorIaMensagem = null;
        } elseif ($fornecedorExtraido === null) {
            $fornecedorIaStatus = 'pendente';
            $fornecedorIaMensagem = $fornecedorMensagemIa ?: 'Não foi possível identificar o fornecedor/emitente na imagem da nota.';
        } elseif ($fornecedorCoerente === true) {
            $fornecedorIaStatus = 'coerente';
            $fornecedorIaMensagem = $fornecedorMensagemIa ?: 'Fornecedor informado é coerente com o emitente identificado na nota.';
        } elseif ($fornecedorCoerente === false) {
            $fornecedorIaStatus = 'divergente';
            $fornecedorIaMensagem = $fornecedorMensagemIa ?: 'Fornecedor informado parece divergente do emitente identificado na nota.';
        } else {
            $fornecedorIaStatus = 'pendente';
            $fornecedorIaMensagem = $fornecedorMensagemIa ?: 'Não foi possível confirmar se o fornecedor informado é coerente com a nota.';
        }

        $nota->forceFill([
            'nota_verificacao_status' => $status,
            'nota_verificacao_mensagem' => $message,
            'nota_verificacao_tipo' => trim((string) ($result['document_type'] ?? '')) ?: null,
            'nota_verificacao_confianca' => $confidence,
            'nota_verificada_em' => now(),
            'fornecedor_ia_status' => $fornecedorIaStatus,
            'fornecedor_ia_mensagem' => $fornecedorIaMensagem,
            'fornecedor_ia_extraido' => $fornecedorExtraido,
        ])->save();

        return new JsonResponse([
            'ok' => $isNota,
            'status' => $status,
            'message' => $message,
            'document_type' => $nota->nota_verificacao_tipo,
            'confidence' => $confidence,
            'extracted' => $result,
            'entrada_nota' => $nota->fresh(),
        ]);
    }

    public function destroy(string $id)
    {
        $nota = EntradaNota::findOrFail($id);
        $this->validarAcessoFilial((string) $nota->local);
        return $this->inativarRegistro($nota, 'Nota fiscal inativada');
    }

    public function forceDelete(string $id)
    {
        return $this->destroy($id);
    }

    public function restore(string $id)
    {
        $nota = EntradaNota::findOrFail($id);
        $this->validarAcessoFilial((string) $nota->local);
        return $this->restaurarRegistro($nota, 'Nota fiscal restaurada');
    }

    private function analisarImagemNotaFiscal(string $apiKey, string $imageUrl, EntradaNota $nota): array
    {
        $promptConfig = $this->globalNotaFiscalPrompt();
        $expected = [
            'numero_nota_fiscal' => $nota->numero_nota_fiscal,
            'data' => $this->formatDateValue($nota->data, 'Y-m-d'),
            'data_hora' => $this->formatDateValue($nota->data_hora, 'Y-m-d H:i:s'),
            'tipo' => $nota->tipo,
            'quantidade' => $nota->quantidade,
            'valor_litro' => $nota->valor_litro,
            'valor' => $nota->valor,
            'local' => $nota->local,
            'fornecedor_informado' => $nota->fornecedor,
        ];

        $prompt = <<<PROMPT
Analise a imagem anexada em uma entrada de nota fiscal.
Retorne apenas JSON válido, sem markdown.
Campos obrigatórios:
- parece_nota_fiscal: boolean
- document_type: "nota_fiscal", "danfe", "comprovante_fiscal", "documento_fiscal", "recibo_nao_fiscal", "outro" ou "ilegivel"
- confidence: número de 0 a 1
- reason: explicação curta em português
- readable_fields: objeto com campos visíveis quando existirem, como numero_nota_fiscal, data, valor_total, quantidade, fornecedor, chave_acesso, produto
- fornecedor_emitente: nome/razão social do emitente (fornecedor) identificado na nota fiscal/DANFE, ou null se não for possível ler
- fornecedor_coerente: boolean ou null — compare o campo "fornecedor_informado" dos dados cadastrados com o emitente identificado na imagem; true se for o mesmo fornecedor (mesmo com pequenas diferenças de grafia/abreviação), false se forem claramente diferentes, ou null se "fornecedor_informado" estiver vazio ou o emitente não puder ser lido
- fornecedor_mensagem: explicação curta em português sobre a comparação do fornecedor (ou null)

Objetivo:
Verificar se a imagem de fato é uma nota fiscal/documento fiscal de entrada ou pelo menos parece ser uma.
Não precisa validar todos os valores do lançamento agora; classifique principalmente o tipo do anexo.
Além disso, identifique o emitente/fornecedor da nota e verifique se é coerente com o fornecedor informado pelo usuário.

Dados cadastrados para contexto:
PROMPT;

        $prompt .= "\n" . json_encode($expected, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $prompt .= "\n\nOrientação configurada pelo administrador:\n" . $promptConfig;

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
            throw new HttpResponseException(new JsonResponse([
                'message' => 'Falha ao analisar nota fiscal com IA.',
                'error' => $response->body(),
            ], 502));
        }

        $content = $response->json('choices.0.message.content');
        $decoded = is_string($content) ? json_decode($content, true) : null;
        if (!is_array($decoded)) {
            throw new HttpResponseException(new JsonResponse([
                'message' => 'IA retornou uma resposta inválida para a nota fiscal.',
            ], 502));
        }

        return $decoded;
    }

    private function globalAnalysisEngine(): string
    {
        try {
            $value = DB::table('configuracoes_sistema')
                ->where('chave', 'abastecimento_analysis_engine')
                ->value('valor');
        } catch (\Throwable) {
            return 'ai';
        }

        return $value === 'ocr' ? 'ocr' : 'ai';
    }

    private function globalNotaFiscalPrompt(): string
    {
        $default = <<<'TEXT'
Classifique a imagem enviada no campo de nota fiscal.
Ela deve parecer uma nota fiscal, DANFE, comprovante fiscal, documento de entrada de combustível ou imagem legível de documento fiscal.
Retorne como válida se houver indícios claros de documento fiscal: número da nota, emitente/destinatário, chave de acesso, DANFE, NF-e, valores, data, produtos ou quantidade.
Retorne como suspeita se a imagem for tela preta, foto sem documento, bomba de combustível, odômetro, recibo manuscrito simples, selfie, paisagem, imagem vazia ou qualquer arquivo que não pareça nota/documento fiscal.
Não exija que todos os campos estejam legíveis; o objetivo principal é validar se a imagem parece uma nota fiscal ou documento fiscal de entrada.
TEXT;

        try {
            $value = trim((string) DB::table('configuracoes_sistema')
                ->where('chave', 'nota_fiscal_ai_prompt')
                ->value('valor'));
            return $value !== '' ? $value : $default;
        } catch (\Throwable) {
            return $default;
        }
    }

    private function num(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }
        return is_numeric($value) ? (float) $value : null;
    }

    private function formatDateValue(mixed $value, string $format): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if ($value instanceof \DateTimeInterface) {
            return $value->format($format);
        }
        $ts = strtotime((string) $value);
        return $ts ? date($format, $ts) : null;
    }
}
