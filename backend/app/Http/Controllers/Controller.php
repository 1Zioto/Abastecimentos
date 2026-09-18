<?php

namespace App\Http\Controllers;

use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Foundation\Validation\ValidatesRequests;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use App\Models\ValoresCombustivel;

class Controller extends BaseController
{
    use AuthorizesRequests;
    use ValidatesRequests;

    protected const ENTRADA_NOTA_CUSTO_TRANSPORTE_LITRO = 0.04;
    protected const ENTRADA_NOTA_NUMEROS_AJUSTE_IGNORADOS = [];
    private static bool $entradaNotasCustoTransporteGarantido = false;
    private static array $colunasAuditoriaGarantidas = [];
    private static bool $colunasRateioRecebedorGarantidas = false;

    /**
     * Cache por processo da lista de colunas de cada tabela. Schema::hasColumn
     * dispara uma consulta ao information_schema em TODA chamada — endpoints
     * como o dashboard chegavam a fazer 40+ dessas consultas por request, o
     * que em banco remoto (Neon) soma segundos de pura latência.
     */
    private static array $colunasPorTabela = [];

    protected function colunasDaTabela(string $table): array
    {
        if (!array_key_exists($table, self::$colunasPorTabela)) {
            try {
                $rows = DB::select(
                    'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?',
                    [$table]
                );
                self::$colunasPorTabela[$table] = array_map(
                    static fn ($r) => $r->column_name,
                    $rows
                );
            } catch (\Throwable $e) {
                self::$colunasPorTabela[$table] = [];
            }
        }
        return self::$colunasPorTabela[$table];
    }

    protected static function esquecerColunasDaTabela(string $table): void
    {
        unset(self::$colunasPorTabela[$table]);
    }

    protected function aplicarFiltroSyncToken($query, Request $request, string $table)
    {
        $token = trim((string) $request->query('sync_token_after', ''));
        if ($token === '' || !$this->tabelaTemColuna($table, 'sync_token_at')) {
            return $query;
        }

        return $query->where($table . '.sync_token_at', '>', $token);
    }

    protected function usandoSyncIncremental(Request $request): bool
    {
        return trim((string) $request->query('sync_token_after', '')) !== '';
    }

    protected function suportaSyncIncremental(Request $request, string $table): bool
    {
        return $this->usandoSyncIncremental($request)
            && $this->tabelaTemColuna($table, 'sync_token_at');
    }

    protected function tabelaTemColuna(string $table, string $column): bool
    {
        // Uma tabela sem colunas no cache significa "tabela não existe" —
        // mesmo comportamento de Schema::hasColumn nesse caso (false).
        return in_array($column, $this->colunasDaTabela($table), true);
    }

    protected function garantirAuditoria(): void
    {
        DB::statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS auditoria_alteracoes (
                id BIGSERIAL PRIMARY KEY,
                tabela VARCHAR(80) NOT NULL,
                registro_id VARCHAR(120) NOT NULL,
                acao VARCHAR(40) NOT NULL,
                campo VARCHAR(120) NULL,
                valor_anterior TEXT NULL,
                valor_novo TEXT NULL,
                usuario_id VARCHAR(120) NULL,
                usuario_nome VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        SQL);
    }

    protected function garantirColunasAuditoria(string $table): void
    {
        // Memoizado por processo: evita repetir o ALTER TABLE em cada request
        // dentro do mesmo worker/processo (efeito real quando há reuso de
        // instância, ex.: Fluid Compute/Octane; inofensivo caso contrário).
        if (self::$colunasAuditoriaGarantidas[$table] ?? false) {
            return;
        }

        if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $table)) {
            return;
        }

        // No PHP serverless da Vercel cada request é um processo novo, então o
        // memo estático acima nunca sobrevive entre requisições: na prática
        // este método rodava um Schema::hasTable (reflexão no pg_attribute),
        // um ALTER TABLE e uma releitura do information_schema em TODA request,
        // vezes cada tabela. Como as colunas já existem há muito tempo, o
        // caminho normal agora é só conferir a lista de colunas já em cache e
        // sair — sem DDL, sem round-trip extra. O ALTER continua aqui para o
        // caso de uma tabela realmente estar sem alguma coluna.
        $colunas = $this->colunasDaTabela($table);
        if ($colunas === []) {
            // Lista vazia = tabela não existe; mesmo efeito do hasTable antigo.
            return;
        }

        $faltantes = array_diff(
            ['deleted_at', 'deleted_by', 'deleted_by_id', 'status', 'sync_token_at'],
            $colunas
        );
        if ($faltantes === []) {
            self::$colunasAuditoriaGarantidas[$table] = true;
            return;
        }

        $quotedTable = '"' . str_replace('"', '""', $table) . '"';
        // Uma única instrução combinando todos os ADD COLUMN: 1 round-trip
        // ao banco em vez de 5, o que importa bastante em bancos remotos
        // (ex.: Neon) onde cada round-trip soma 20-80ms+ de latência.
        DB::statement(
            "ALTER TABLE {$quotedTable} " .
            "ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL, " .
            "ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255) NULL, " .
            "ADD COLUMN IF NOT EXISTS deleted_by_id VARCHAR(120) NULL, " .
            "ADD COLUMN IF NOT EXISTS status VARCHAR(40) NULL, " .
            "ADD COLUMN IF NOT EXISTS sync_token_at TIMESTAMP NULL"
        );

        self::esquecerColunasDaTabela($table);
        self::$colunasAuditoriaGarantidas[$table] = true;
    }

    protected function garantirColunasRateioRecebedor(): void
    {
        if (self::$colunasRateioRecebedorGarantidas) {
            return;
        }

        // Mesmo raciocínio de garantirColunasAuditoria: confere pela lista de
        // colunas já em cache e só emite DDL se algo estiver realmente faltando.
        $colunas = $this->colunasDaTabela('abastecimentos');
        if ($colunas === []) {
            return;
        }

        $faltantes = array_diff(
            ['valor_recebedor1', 'recebedor2', 'valor_recebedor2', 'abono_desconto'],
            $colunas
        );
        if ($faltantes === []) {
            self::$colunasRateioRecebedorGarantidas = true;
            return;
        }

        DB::statement(
            'ALTER TABLE abastecimentos ' .
            'ADD COLUMN IF NOT EXISTS valor_recebedor1 NUMERIC(12,2) NULL, ' .
            'ADD COLUMN IF NOT EXISTS recebedor2 VARCHAR(255) NULL, ' .
            'ADD COLUMN IF NOT EXISTS valor_recebedor2 NUMERIC(12,2) NULL, ' .
            'ADD COLUMN IF NOT EXISTS abono_desconto NUMERIC(12,2) NULL'
        );

        self::esquecerColunasDaTabela('abastecimentos');
        self::$colunasRateioRecebedorGarantidas = true;
    }

    /**
     * Regra de filial da baixa: a baixa segue a filial do abastecimento. Uma
     * mesma baixa não pode misturar abastecimentos de filiais diferentes
     * (ex.: dar baixa na Matriz em abastecimento de Viana). Bloqueia com 422
     * quando há mais de um `local` distinto entre os abastecimentos informados.
     */
    protected function validarMesmaFilialBaixa(array $idsAbastecimentos): void
    {
        $ids = array_values(array_filter(array_map('strval', $idsAbastecimentos), fn ($id) => $id !== ''));
        if (count($ids) < 2 || !$this->tabelaTemColuna('abastecimentos', 'local')) {
            return;
        }

        $locais = \App\Models\Abastecimento::query()
            ->whereIn('id_abastecimento', $ids)
            ->whereNotNull('local')
            ->whereRaw("TRIM(local) <> ''")
            ->pluck('local')
            ->map(fn ($l) => trim((string) $l))
            ->unique()
            ->values();

        if ($locais->count() > 1) {
            abort(422, 'A baixa deve ser dada na mesma filial do abastecimento. '
                . 'Não é permitido baixar abastecimentos de filiais diferentes na mesma baixa. '
                . 'Filiais encontradas: ' . $locais->implode(', ') . '.');
        }
    }

    protected function aplicarFiltroAtivos($query, string $table, Request $request)
    {
        if ($request->boolean('include_inactive')) {
            return $query;
        }

        if ($this->tabelaTemColuna($table, 'deleted_at')) {
            $query->whereNull($table . '.deleted_at');
        }

        if ($this->tabelaTemColuna($table, 'status')) {
            $query->where(function ($q) use ($table) {
                $q->whereNull($table . '.status')
                    ->orWhereRaw('LOWER(' . $table . '.status) <> ?', ['inativo']);
            });
        }

        return $query;
    }

    protected function garantirCustoTransporteEntradaNotas(): void
    {
        if (self::$entradaNotasCustoTransporteGarantido) {
            return;
        }

        // Este era o pior dos três: um Schema::hasTable + quatro
        // Schema::hasColumn (cada um uma consulta ao information_schema, sem
        // passar pelo cache) + um UPDATE varrendo entrada_notas — tudo isso em
        // toda request. Com as colunas já criadas, sai tudo em uma checagem
        // sobre a lista em cache.
        $colunas = $this->colunasDaTabela('entrada_notas');
        if ($colunas === []) {
            return;
        }

        $faltantes = array_diff(
            ['custo_transporte_litro', 'custo_transporte_total', 'valor_compra_final'],
            $colunas
        );
        if ($faltantes === []) {
            self::$entradaNotasCustoTransporteGarantido = true;
            return;
        }

        if (!Schema::hasColumn('entrada_notas', 'custo_transporte_litro')) {
            Schema::table('entrada_notas', function (Blueprint $table) {
                $table->decimal('custo_transporte_litro', 10, 3)
                    ->nullable()
                    ->default(self::ENTRADA_NOTA_CUSTO_TRANSPORTE_LITRO);
            });
        }

        if (!Schema::hasColumn('entrada_notas', 'custo_transporte_total')) {
            Schema::table('entrada_notas', function (Blueprint $table) {
                $table->decimal('custo_transporte_total', 12, 2)->nullable();
            });
        }

        if (!Schema::hasColumn('entrada_notas', 'valor_compra_final')) {
            Schema::table('entrada_notas', function (Blueprint $table) {
                $table->decimal('valor_compra_final', 12, 2)->nullable();
            });
        }

        $updates = [
            'custo_transporte_litro' => self::ENTRADA_NOTA_CUSTO_TRANSPORTE_LITRO,
            'custo_transporte_total' => DB::raw(
                'ROUND(COALESCE(quantidade, 0) * ' . self::ENTRADA_NOTA_CUSTO_TRANSPORTE_LITRO . ', 2)'
            ),
            'valor_compra_final' => DB::raw(
                'ROUND(COALESCE(valor, 0) + (COALESCE(quantidade, 0) * ' . self::ENTRADA_NOTA_CUSTO_TRANSPORTE_LITRO . '), 2)'
            ),
        ];

        if (Schema::hasColumn('entrada_notas', 'sync_token_at')) {
            $updates['sync_token_at'] = DB::raw('CURRENT_TIMESTAMP');
        }

        DB::table('entrada_notas')
            ->where(function ($query) {
                $query->whereNull('custo_transporte_litro')
                    ->orWhereNull('custo_transporte_total')
                    ->orWhereNull('valor_compra_final');
            })
            ->update($updates);

        self::$entradaNotasCustoTransporteGarantido = true;
    }

    protected function obterCustoFreteLitro(?string $tipoCombustivel, ?string $local, ?string $data = null): float
    {
        $tipo = trim((string) $tipoCombustivel) ?: 'OLEO DIESEL S10';
        $local = trim((string) $local) ?: 'Matriz';

        try {
            if (!$this->tabelaTemColuna('valores_combustivel', 'valor_frete')) {
                return self::ENTRADA_NOTA_CUSTO_TRANSPORTE_LITRO;
            }

            $query = ValoresCombustivel::query()
                ->whereRaw('LOWER(tipo_combustivel) = LOWER(?)', [$tipo])
                ->whereRaw('LOWER(local) = LOWER(?)', [$local]);

            if (!empty($data)) {
                $query->whereDate('data', '<=', $data);
            }

            $query->orderByDesc('data');
            if ($this->tabelaTemColuna('valores_combustivel', 'sync_token_at')) {
                $query->orderByDesc('sync_token_at');
            }
            $query->orderByDesc('id_valor');

            $valorCombustivel = $query->first();

            if ($valorCombustivel && $valorCombustivel->valor_frete !== null) {
                return (float) $valorCombustivel->valor_frete;
            }

            // Fallback para o mais recente da filial e combustível
            if (!empty($data)) {
                $recente = ValoresCombustivel::query()
                    ->whereRaw('LOWER(tipo_combustivel) = LOWER(?)', [$tipo])
                    ->whereRaw('LOWER(local) = LOWER(?)', [$local])
                    ->orderByDesc('data')
                    ->orderByDesc('id_valor')
                    ->first();
                if ($recente && $recente->valor_frete !== null) {
                    return (float) $recente->valor_frete;
                }
            }
        } catch (\Throwable) {
            // Em caso de erro, mantém fallback padrão
        }

        return self::ENTRADA_NOTA_CUSTO_TRANSPORTE_LITRO;
    }

    protected function calcularCustoTransporteEntradaNota(array $data, ?Model $original = null): array
    {
        $quantidade = array_key_exists('quantidade', $data)
            ? (float) ($data['quantidade'] ?? 0)
            : (float) ($original?->getAttribute('quantidade') ?? 0);
        $valor = array_key_exists('valor', $data)
            ? (float) ($data['valor'] ?? 0)
            : (float) ($original?->getAttribute('valor') ?? 0);

        $custoLitro = null;
        if (array_key_exists('custo_transporte_litro', $data) && $data['custo_transporte_litro'] !== null) {
            $custoLitro = (float) $data['custo_transporte_litro'];
        } elseif ($original?->getAttribute('custo_transporte_litro') !== null) {
            $custoLitro = (float) $original->getAttribute('custo_transporte_litro');
        } else {
            $tipo = $data['tipo'] ?? $original?->getAttribute('tipo') ?? 'OLEO DIESEL S10';
            $local = $data['local'] ?? $original?->getAttribute('local') ?? 'Matriz';
            $dataRef = $data['data'] ?? $original?->getAttribute('data');
            $custoLitro = $this->obterCustoFreteLitro($tipo, $local, $dataRef ? (string) $dataRef : null);
        }

        $custoTotal = round($quantidade * $custoLitro, 2);

        return [
            'custo_transporte_litro' => $custoLitro,
            'custo_transporte_total' => $custoTotal,
            'valor_compra_final' => round($valor + $custoTotal, 2),
        ];
    }

    protected function entradaNotaValorCompraFinalSql(string $table = 'entrada_notas'): string
    {
        $prefix = $table !== '' ? $table . '.' : '';
        return 'COALESCE(' . $prefix . 'valor_compra_final, COALESCE(' . $prefix . 'valor, 0) + ROUND(COALESCE(' . $prefix . 'quantidade, 0) * ' . self::ENTRADA_NOTA_CUSTO_TRANSPORTE_LITRO . ', 2))';
    }

    protected function entradaNotaCustoTransporteSql(string $table = 'entrada_notas'): string
    {
        $prefix = $table !== '' ? $table . '.' : '';
        return 'COALESCE(' . $prefix . 'custo_transporte_total, ROUND(COALESCE(' . $prefix . 'quantidade, 0) * ' . self::ENTRADA_NOTA_CUSTO_TRANSPORTE_LITRO . ', 2))';
    }

    protected function aplicarFiltroNotasAjusteEntradaNotas($query, string $table = 'entrada_notas')
    {
        if (empty(self::ENTRADA_NOTA_NUMEROS_AJUSTE_IGNORADOS)) {
            return $query;
        }

        if (!$this->tabelaTemColuna('entrada_notas', 'numero_nota_fiscal')) {
            return $query;
        }

        $prefix = $table !== '' ? $table . '.' : '';
        return $query->where(function ($q) use ($prefix) {
            $q->whereNull($prefix . 'numero_nota_fiscal')
                ->orWhereNotIn(
                    DB::raw('UPPER(TRIM(' . $prefix . 'numero_nota_fiscal))'),
                    self::ENTRADA_NOTA_NUMEROS_AJUSTE_IGNORADOS
                );
        });
    }

    protected function registrarAuditoria(Model $model, string $acao, ?string $campo = null, mixed $anterior = null, mixed $novo = null): void
    {
        $this->garantirAuditoria();
        $user = auth()->user();

        DB::table('auditoria_alteracoes')->insert([
            'tabela' => $model->getTable(),
            'registro_id' => (string) $model->getKey(),
            'acao' => $acao,
            'campo' => $campo,
            'valor_anterior' => $this->valorAuditoria($anterior),
            'valor_novo' => $this->valorAuditoria($novo),
            'usuario_id' => $user ? (string) $user->getAuthIdentifier() : null,
            'usuario_nome' => $user?->nome ?? $user?->login ?? 'Sistema',
            'created_at' => now(),
        ]);
    }

    protected function registrarAlteracoes(Model $model, array $data): void
    {
        foreach ($data as $campo => $novo) {
            if (!$model->offsetExists($campo) && !array_key_exists($campo, $model->getAttributes())) {
                continue;
            }

            $anterior = $model->getAttribute($campo);
            if ($this->valoresEquivalentesParaAuditoria($campo, $anterior, $novo)) {
                continue;
            }

            $this->registrarAuditoria($model, 'update', $campo, $anterior, $novo);
        }
    }

    protected function manterSomenteAlteracoesReais(Model $model, array $data): array
    {
        $filtrado = [];
        foreach ($data as $campo => $novo) {
            if (!$model->offsetExists($campo) && !array_key_exists($campo, $model->getAttributes())) {
                $filtrado[$campo] = $novo;
                continue;
            }

            if (!$this->valoresEquivalentesParaAuditoria($campo, $model->getAttribute($campo), $novo)) {
                $filtrado[$campo] = $novo;
            }
        }

        return $filtrado;
    }

    protected function inativarRegistro(Model $model, string $mensagem = 'Registro inativado'): \Illuminate\Http\JsonResponse
    {
        $this->garantirColunasAuditoria($model->getTable());
        $user = auth()->user();
        $payload = [];

        if ($this->tabelaTemColuna($model->getTable(), 'status')) {
            $payload['status'] = 'Inativo';
        }
        if ($this->tabelaTemColuna($model->getTable(), 'deleted_at')) {
            $payload['deleted_at'] = now();
        }
        if ($this->tabelaTemColuna($model->getTable(), 'deleted_by')) {
            $payload['deleted_by'] = $user?->nome ?? $user?->login ?? 'Sistema';
        }
        if ($this->tabelaTemColuna($model->getTable(), 'deleted_by_id')) {
            $payload['deleted_by_id'] = $user ? (string) $user->getAuthIdentifier() : null;
        }
        if ($this->tabelaTemColuna($model->getTable(), 'sync_token_at')) {
            $payload['sync_token_at'] = now();
        }

        $this->registrarAuditoria($model, 'delete', null, $model->toArray(), $payload);
        $model->forceFill($payload)->save();

        return new \Illuminate\Http\JsonResponse(['message' => $mensagem]);
    }

    protected function restaurarRegistro(Model $model, string $mensagem = 'Registro restaurado'): \Illuminate\Http\JsonResponse
    {
        $this->garantirColunasAuditoria($model->getTable());
        $payload = [];

        if ($this->tabelaTemColuna($model->getTable(), 'status')) {
            $payload['status'] = 'Ativo';
        }
        if ($this->tabelaTemColuna($model->getTable(), 'deleted_at')) {
            $payload['deleted_at'] = null;
        }
        if ($this->tabelaTemColuna($model->getTable(), 'deleted_by')) {
            $payload['deleted_by'] = null;
        }
        if ($this->tabelaTemColuna($model->getTable(), 'deleted_by_id')) {
            $payload['deleted_by_id'] = null;
        }
        if ($this->tabelaTemColuna($model->getTable(), 'sync_token_at')) {
            $payload['sync_token_at'] = now();
        }

        $this->registrarAuditoria($model, 'restore', null, $model->toArray(), $payload);
        $model->forceFill($payload)->save();

        return new \Illuminate\Http\JsonResponse(['message' => $mensagem]);
    }

    private function valorAuditoria(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        if ($value instanceof \DateTimeInterface) {
            return $value->format(DATE_ATOM);
        }
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_scalar($value)) {
            return (string) $value;
        }

        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private function valoresEquivalentesParaAuditoria(string $campo, mixed $anterior, mixed $novo): bool
    {
        return $this->valorComparavelAuditoria($campo, $anterior) === $this->valorComparavelAuditoria($campo, $novo);
    }

    private function valorComparavelAuditoria(string $campo, mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        $campoNormalizado = strtolower($campo);

        if ($value instanceof \DateTimeInterface) {
            if (str_contains($campoNormalizado, 'data_hora')) {
                return $value->format('Y-m-d H:i');
            }
            if ($campoNormalizado === 'data' || str_starts_with($campoNormalizado, 'data_')) {
                return $value->format('Y-m-d');
            }
            return $value->format(DATE_ATOM);
        }

        if (is_string($value) && ($campoNormalizado === 'data' || str_starts_with($campoNormalizado, 'data_'))) {
            try {
                $dt = new \DateTimeImmutable($value);
                return str_contains($campoNormalizado, 'data_hora')
                    ? $dt->format('Y-m-d H:i')
                    : $dt->format('Y-m-d');
            } catch (\Throwable) {
            }
        }

        if (is_bool($value)) {
            return $value ? '1' : '0';
        }

        if (is_numeric($value)) {
            $number = (float) $value;
            $scale = match ($campoNormalizado) {
                'valor_por_litro' => 3,
                'quantidade_litros', 'valor_total', 'valor' => 2,
                default => 6,
            };
            $formatted = number_format($number, $scale, '.', '');
            return rtrim(rtrim($formatted, '0'), '.');
        }

        if (is_scalar($value)) {
            return trim((string) $value);
        }

        return $this->valorAuditoria($value);
    }

    protected function aplicarFiltroLocalPermitido($query, string $table, array $permitidas, ?string $local = null)
    {
        if (!$this->tabelaTemColuna($table, 'local')) {
            return $query;
        }

        $query->whereIn($table . '.local', $permitidas);

        $local = trim((string) $local);
        if ($local === '') {
            return $query;
        }

        if (!in_array($local, $permitidas, true)) {
            return $query->whereRaw('1 = 0');
        }

        return $query->whereRaw('LOWER(' . $table . '.local) = LOWER(?)', [$local]);
    }
}
