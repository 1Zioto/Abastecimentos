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

class Controller extends BaseController
{
    use AuthorizesRequests;
    use ValidatesRequests;

    protected const ENTRADA_NOTA_CUSTO_TRANSPORTE_LITRO = 0.04;
    protected const ENTRADA_NOTA_NUMEROS_AJUSTE_IGNORADOS = ['AJUSTE-INICIO-MATRIZ-20260601', '00001'];
    private static bool $entradaNotasCustoTransporteGarantido = false;

    protected function aplicarFiltroSyncToken($query, Request $request, string $table)
    {
        $token = trim((string) $request->query('sync_token_after', ''));
        if ($token === '' || !Schema::hasColumn($table, 'sync_token_at')) {
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
            && Schema::hasColumn($table, 'sync_token_at');
    }

    protected function tabelaTemColuna(string $table, string $column): bool
    {
        return Schema::hasColumn($table, $column);
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
        if (!Schema::hasTable($table)) {
            return;
        }

        if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $table)) {
            return;
        }

        $quotedTable = '"' . str_replace('"', '""', $table) . '"';
        DB::statement("ALTER TABLE {$quotedTable} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL");
        DB::statement("ALTER TABLE {$quotedTable} ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255) NULL");
        DB::statement("ALTER TABLE {$quotedTable} ADD COLUMN IF NOT EXISTS deleted_by_id VARCHAR(120) NULL");
        DB::statement("ALTER TABLE {$quotedTable} ADD COLUMN IF NOT EXISTS status VARCHAR(40) NULL");
        DB::statement("ALTER TABLE {$quotedTable} ADD COLUMN IF NOT EXISTS sync_token_at TIMESTAMP NULL");
    }

    protected function aplicarFiltroAtivos($query, string $table, Request $request)
    {
        if ($request->boolean('include_inactive')) {
            return $query;
        }

        if (Schema::hasColumn($table, 'deleted_at')) {
            $query->whereNull($table . '.deleted_at');
        }

        if (Schema::hasColumn($table, 'status')) {
            $query->where(function ($q) use ($table) {
                $q->whereNull($table . '.status')
                    ->orWhereRaw('LOWER(' . $table . '.status) <> ?', ['inativo']);
            });
        }

        return $query;
    }

    protected function garantirCustoTransporteEntradaNotas(): void
    {
        if (self::$entradaNotasCustoTransporteGarantido || !Schema::hasTable('entrada_notas')) {
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

    protected function calcularCustoTransporteEntradaNota(array $data, ?Model $original = null): array
    {
        $quantidade = array_key_exists('quantidade', $data)
            ? (float) ($data['quantidade'] ?? 0)
            : (float) ($original?->getAttribute('quantidade') ?? 0);
        $valor = array_key_exists('valor', $data)
            ? (float) ($data['valor'] ?? 0)
            : (float) ($original?->getAttribute('valor') ?? 0);
        $custoTotal = round($quantidade * self::ENTRADA_NOTA_CUSTO_TRANSPORTE_LITRO, 2);

        return [
            'custo_transporte_litro' => self::ENTRADA_NOTA_CUSTO_TRANSPORTE_LITRO,
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

        if (Schema::hasColumn($model->getTable(), 'status')) {
            $payload['status'] = 'Inativo';
        }
        if (Schema::hasColumn($model->getTable(), 'deleted_at')) {
            $payload['deleted_at'] = now();
        }
        if (Schema::hasColumn($model->getTable(), 'deleted_by')) {
            $payload['deleted_by'] = $user?->nome ?? $user?->login ?? 'Sistema';
        }
        if (Schema::hasColumn($model->getTable(), 'deleted_by_id')) {
            $payload['deleted_by_id'] = $user ? (string) $user->getAuthIdentifier() : null;
        }
        if (Schema::hasColumn($model->getTable(), 'sync_token_at')) {
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

        if (Schema::hasColumn($model->getTable(), 'status')) {
            $payload['status'] = 'Ativo';
        }
        if (Schema::hasColumn($model->getTable(), 'deleted_at')) {
            $payload['deleted_at'] = null;
        }
        if (Schema::hasColumn($model->getTable(), 'deleted_by')) {
            $payload['deleted_by'] = null;
        }
        if (Schema::hasColumn($model->getTable(), 'deleted_by_id')) {
            $payload['deleted_by_id'] = null;
        }
        if (Schema::hasColumn($model->getTable(), 'sync_token_at')) {
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
