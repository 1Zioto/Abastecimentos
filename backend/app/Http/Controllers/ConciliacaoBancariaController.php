<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ConciliacaoBancariaController extends Controller
{
    private function garantirTabelas(): void
    {
        DB::statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS extratos_bancarios (
                id VARCHAR(120) PRIMARY KEY,
                data DATE NOT NULL,
                descricao VARCHAR(500) NULL,
                valor NUMERIC(12,2) NOT NULL,
                tipo VARCHAR(20) NOT NULL DEFAULT 'credito',
                documento VARCHAR(120) NULL,
                banco VARCHAR(80) NULL,
                local VARCHAR(40) NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pendente',
                conciliado_em TIMESTAMP NULL,
                conciliado_por VARCHAR(255) NULL,
                arquivo_origem VARCHAR(255) NULL,
                hash VARCHAR(64) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        SQL);

        DB::statement('ALTER TABLE extratos_bancarios ADD COLUMN IF NOT EXISTS hash VARCHAR(64) NULL');

        // Garante unicidade do hash para evitar reimportação duplicada
        DB::statement(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'extratos_bancarios_hash_unique'
                ) THEN
                    ALTER TABLE extratos_bancarios ADD CONSTRAINT extratos_bancarios_hash_unique UNIQUE (hash);
                END IF;
            END $$;
        SQL);

        DB::statement('ALTER TABLE baixa_abastecimento ADD COLUMN IF NOT EXISTS id_extrato_conciliado VARCHAR(120) NULL');
    }

    private function emptyToNull($value)
    {
        if ($value === null) return null;
        if (is_string($value) && trim($value) === '') return null;
        return $value;
    }

    public function index(Request $request): JsonResponse
    {
        $this->garantirTabelas();

        $query = DB::table('extratos_bancarios');

        if ($request->filled('status') && $request->status !== 'todos') {
            $query->where('status', $request->status);
        }
        if ($request->filled('tipo') && $request->tipo !== 'todos') {
            $query->where('tipo', $request->tipo);
        }
        if ($request->filled('local') && $request->local !== 'Todas') {
            $query->where('local', $request->local);
        }
        if ($request->filled('data_inicio')) {
            $query->whereDate('data', '>=', $request->data_inicio);
        }
        if ($request->filled('data_fim')) {
            $query->whereDate('data', '<=', $request->data_fim);
        }
        if ($request->filled('q')) {
            $term = '%' . mb_strtolower(trim((string) $request->q)) . '%';
            $query->where(function ($q) use ($term) {
                $q->whereRaw('LOWER(COALESCE(descricao, \'\')) LIKE ?', [$term])
                    ->orWhereRaw('LOWER(COALESCE(documento, \'\')) LIKE ?', [$term]);
            });
        }

        $itens = $query->orderByDesc('data')->orderByDesc('created_at')->limit(2000)->get();

        $resumo = [
            'total' => $itens->count(),
            'pendentes' => $itens->where('status', 'pendente')->count(),
            'conciliados' => $itens->where('status', 'conciliado')->count(),
            'ignorados' => $itens->where('status', 'ignorado')->count(),
            'valor_pendente_credito' => round((float) $itens->where('status', 'pendente')->where('tipo', 'credito')->sum('valor'), 2),
        ];

        return new JsonResponse(['data' => $itens, 'resumo' => $resumo]);
    }

    public function importar(Request $request): JsonResponse
    {
        $this->garantirTabelas();

        $data = $request->validate([
            'itens' => 'required|array|min:1',
            'itens.*.data' => 'required|date',
            'itens.*.descricao' => 'nullable|string',
            'itens.*.valor' => 'required|numeric',
            'itens.*.tipo' => 'nullable|in:credito,debito',
            'itens.*.documento' => 'nullable|string',
            'arquivo_origem' => 'nullable|string|max:255',
            'banco' => 'nullable|string|max:80',
            'local' => 'nullable|string|max:40',
        ]);

        $banco = $this->emptyToNull($data['banco'] ?? null);
        $local = $this->emptyToNull($data['local'] ?? null);
        $arquivoOrigem = $this->emptyToNull($data['arquivo_origem'] ?? null);

        $importados = 0;
        $duplicados = 0;

        foreach ($data['itens'] as $item) {
            $valorBruto = (float) $item['valor'];
            $valor = round(abs($valorBruto), 2);
            $tipo = $item['tipo'] ?? ($valorBruto < 0 ? 'debito' : 'credito');
            $descricao = trim((string) ($item['descricao'] ?? ''));
            $documento = trim((string) ($item['documento'] ?? ''));
            $dataStr = Carbon::parse((string) $item['data'])->toDateString();

            $hash = hash('sha256', implode('|', [$dataStr, $valor, $tipo, $descricao, $documento]));

            $existe = DB::table('extratos_bancarios')->where('hash', $hash)->exists();
            if ($existe) {
                $duplicados++;
                continue;
            }

            DB::table('extratos_bancarios')->insert([
                'id' => (string) Str::uuid(),
                'data' => $dataStr,
                'descricao' => $descricao !== '' ? $descricao : null,
                'valor' => $valor,
                'tipo' => $tipo,
                'documento' => $documento !== '' ? $documento : null,
                'banco' => $banco,
                'local' => $local,
                'status' => 'pendente',
                'arquivo_origem' => $arquivoOrigem,
                'hash' => $hash,
                'created_at' => now(),
            ]);
            $importados++;
        }

        return new JsonResponse([
            'message' => "{$importados} lançamento(s) importado(s)" . ($duplicados > 0 ? ", {$duplicados} duplicado(s) ignorado(s)." : '.'),
            'importados' => $importados,
            'duplicados' => $duplicados,
        ], 201);
    }

    public function ignorar(string $id): JsonResponse
    {
        $this->garantirTabelas();

        $extrato = DB::table('extratos_bancarios')->where('id', $id)->first();
        if (!$extrato) {
            abort(404, 'Lançamento não encontrado.');
        }
        if ($extrato->status === 'conciliado') {
            abort(422, 'Lançamento já conciliado. Desconcilie antes de ignorar.');
        }

        $novoStatus = $extrato->status === 'ignorado' ? 'pendente' : 'ignorado';
        DB::table('extratos_bancarios')->where('id', $id)->update(['status' => $novoStatus]);

        return new JsonResponse([
            'message' => $novoStatus === 'ignorado' ? 'Lançamento marcado como ignorado.' : 'Lançamento reaberto.',
            'status' => $novoStatus,
        ]);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->garantirTabelas();

        $extrato = DB::table('extratos_bancarios')->where('id', $id)->first();
        if (!$extrato) {
            abort(404, 'Lançamento não encontrado.');
        }
        if ($extrato->status === 'conciliado') {
            abort(422, 'Não é possível excluir um lançamento conciliado. Desconcilie primeiro.');
        }

        DB::table('extratos_bancarios')->where('id', $id)->delete();

        return new JsonResponse(['message' => 'Lançamento removido.']);
    }

    /**
     * Sugestões de baixas que podem corresponder a este lançamento do extrato.
     * Agrupa baixas pendentes de conciliação por proprietário + data de pagamento,
     * dentro de uma janela de dias em torno da data do extrato.
     */
    public function sugestoes(Request $request, string $id): JsonResponse
    {
        $this->garantirTabelas();

        $extrato = DB::table('extratos_bancarios')->where('id', $id)->first();
        if (!$extrato) {
            abort(404, 'Lançamento não encontrado.');
        }

        $dias = max(1, min(60, (int) $request->query('dias', 10)));
        $dataExtrato = Carbon::parse($extrato->data);
        $dataMin = $dataExtrato->copy()->subDays($dias)->toDateString();
        $dataMax = $dataExtrato->copy()->addDays($dias)->toDateString();

        $baixas = DB::table('baixa_abastecimento as b')
            ->join('abastecimentos as a', 'a.id_abastecimento', '=', 'b.id_abastecimento')
            ->whereNull('b.id_extrato_conciliado')
            ->whereNotNull('b.data_pagamento')
            ->whereBetween(DB::raw('b.data_pagamento::date'), [$dataMin, $dataMax])
            ->select(
                'b.id_baixa',
                'b.id_abastecimento',
                'b.data_pagamento',
                'b.forma_pagamento',
                'a.id_proprietario',
                'a.nome_proprietario',
                'a.valor',
                'a.data as data_abastecimento',
                'a.placa1'
            )
            ->get();

        $grupos = [];
        foreach ($baixas as $b) {
            $dataPg = Carbon::parse($b->data_pagamento)->toDateString();
            $key = ($b->id_proprietario ?? 'sem_proprietario') . '|' . $dataPg;

            if (!isset($grupos[$key])) {
                $grupos[$key] = [
                    'id_proprietario' => $b->id_proprietario,
                    'nome_proprietario' => $b->nome_proprietario,
                    'data_pagamento' => $dataPg,
                    'valor_total' => 0.0,
                    'baixas' => [],
                ];
            }

            $valor = round((float) $b->valor, 2);
            $grupos[$key]['valor_total'] = round($grupos[$key]['valor_total'] + $valor, 2);
            $grupos[$key]['baixas'][] = [
                'id_baixa' => $b->id_baixa,
                'id_abastecimento' => $b->id_abastecimento,
                'valor' => $valor,
                'data_abastecimento' => $b->data_abastecimento,
                'data_pagamento' => $dataPg,
                'forma_pagamento' => $b->forma_pagamento,
                'placa1' => $b->placa1,
            ];
        }

        $valorExtrato = round((float) $extrato->valor, 2);
        $resultado = array_values($grupos);
        foreach ($resultado as &$grupo) {
            $grupo['diferenca'] = round($grupo['valor_total'] - $valorExtrato, 2);
        }
        unset($grupo);

        usort($resultado, fn ($a, $b) => abs($a['diferenca']) <=> abs($b['diferenca']));

        return new JsonResponse(['data' => array_slice($resultado, 0, 15)]);
    }

    /**
     * Busca manual de baixas ainda não conciliadas (para quando a sugestão automática não encontra).
     */
    public function baixasDisponiveis(Request $request): JsonResponse
    {
        $this->garantirTabelas();

        $query = DB::table('baixa_abastecimento as b')
            ->join('abastecimentos as a', 'a.id_abastecimento', '=', 'b.id_abastecimento')
            ->whereNull('b.id_extrato_conciliado')
            ->select(
                'b.id_baixa',
                'b.id_abastecimento',
                'b.data_pagamento',
                'b.forma_pagamento',
                'a.id_proprietario',
                'a.nome_proprietario',
                'a.valor',
                'a.data as data_abastecimento',
                'a.placa1'
            );

        if ($request->filled('q')) {
            $term = '%' . mb_strtolower(trim((string) $request->q)) . '%';
            $query->whereRaw('LOWER(COALESCE(a.nome_proprietario, \'\')) LIKE ?', [$term]);
        }
        if ($request->filled('data_inicio')) {
            $query->whereDate('b.data_pagamento', '>=', $request->data_inicio);
        }
        if ($request->filled('data_fim')) {
            $query->whereDate('b.data_pagamento', '<=', $request->data_fim);
        }
        if ($request->filled('valor')) {
            $query->whereRaw('ABS(a.valor - ?) < 0.005', [(float) $request->valor]);
        }

        $itens = $query->orderByDesc('b.data_pagamento')->limit(200)->get();

        return new JsonResponse(['data' => $itens]);
    }

    public function conciliar(Request $request, string $id): JsonResponse
    {
        $this->garantirTabelas();

        $data = $request->validate([
            'ids_baixa' => 'required|array|min:1',
            'ids_baixa.*' => 'string',
        ]);

        $extrato = DB::table('extratos_bancarios')->where('id', $id)->first();
        if (!$extrato) {
            abort(404, 'Lançamento não encontrado.');
        }
        if ($extrato->status === 'conciliado') {
            abort(422, 'Lançamento já está conciliado.');
        }

        $baixas = DB::table('baixa_abastecimento as b')
            ->join('abastecimentos as a', 'a.id_abastecimento', '=', 'b.id_abastecimento')
            ->whereIn('b.id_baixa', $data['ids_baixa'])
            ->whereNull('b.id_extrato_conciliado')
            ->select('b.id_baixa', 'a.valor')
            ->get();

        if ($baixas->count() !== count(array_unique($data['ids_baixa']))) {
            abort(422, 'Uma ou mais baixas selecionadas não estão disponíveis para conciliação (podem já ter sido conciliadas).');
        }

        $somaSelecionada = round((float) $baixas->sum(fn ($b) => (float) $b->valor), 2);
        $diferenca = round($somaSelecionada - (float) $extrato->valor, 2);

        $usuario = auth()->user();

        DB::transaction(function () use ($data, $id, $usuario) {
            DB::table('baixa_abastecimento')
                ->whereIn('id_baixa', $data['ids_baixa'])
                ->update(['id_extrato_conciliado' => $id]);

            DB::table('extratos_bancarios')->where('id', $id)->update([
                'status' => 'conciliado',
                'conciliado_em' => now(),
                'conciliado_por' => $usuario?->nome ?? $usuario?->login ?? 'Sistema',
            ]);
        });

        $aviso = null;
        if (abs($diferenca) > 0.01) {
            $aviso = 'Atenção: a soma das baixas selecionadas (R$ ' . number_format($somaSelecionada, 2, ',', '.')
                . ') difere do valor do extrato (R$ ' . number_format((float) $extrato->valor, 2, ',', '.')
                . ') em R$ ' . number_format(abs($diferenca), 2, ',', '.') . '.';
        }

        return new JsonResponse([
            'message' => 'Conciliação registrada com sucesso.',
            'soma_baixas' => $somaSelecionada,
            'diferenca' => $diferenca,
            'aviso' => $aviso,
        ]);
    }

    public function desconciliar(string $id): JsonResponse
    {
        $this->garantirTabelas();

        $extrato = DB::table('extratos_bancarios')->where('id', $id)->first();
        if (!$extrato) {
            abort(404, 'Lançamento não encontrado.');
        }

        DB::transaction(function () use ($id) {
            DB::table('baixa_abastecimento')->where('id_extrato_conciliado', $id)->update(['id_extrato_conciliado' => null]);
            DB::table('extratos_bancarios')->where('id', $id)->update([
                'status' => 'pendente',
                'conciliado_em' => null,
                'conciliado_por' => null,
            ]);
        });

        return new JsonResponse(['message' => 'Conciliação desfeita.']);
    }

    public function detalhes(string $id): JsonResponse
    {
        $this->garantirTabelas();

        $extrato = DB::table('extratos_bancarios')->where('id', $id)->first();
        if (!$extrato) {
            abort(404, 'Lançamento não encontrado.');
        }

        $baixas = DB::table('baixa_abastecimento as b')
            ->join('abastecimentos as a', 'a.id_abastecimento', '=', 'b.id_abastecimento')
            ->where('b.id_extrato_conciliado', $id)
            ->select(
                'b.id_baixa',
                'b.id_abastecimento',
                'b.data_pagamento',
                'b.forma_pagamento',
                'a.id_proprietario',
                'a.nome_proprietario',
                'a.valor',
                'a.data as data_abastecimento',
                'a.placa1'
            )
            ->get();

        return new JsonResponse(['extrato' => $extrato, 'baixas' => $baixas]);
    }
}
