<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Crédito do proprietário (saldo excedente).
 *
 * Quando o proprietário paga mais do que os abastecimentos selecionados numa
 * baixa, a diferença vira um crédito (movimento "entrada"). Em baixas futuras o
 * operador pode optar por usar esse saldo (movimento "saida"). Tudo é gravado
 * num razão (ledger) por proprietário, vinculado à baixa pela nota_entrada, de
 * forma que a reversão da baixa também apague os movimentos correspondentes.
 *
 * Saldo = SUM(valor WHERE tipo='entrada') - SUM(valor WHERE tipo='saida').
 */
class CreditoProprietarioController extends Controller
{
    private static bool $tabelaGarantida = false;

    public static function garantirTabela(): void
    {
        if (self::$tabelaGarantida) {
            return;
        }

        DB::statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS creditos_proprietario (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                proprietario_id VARCHAR(120) NOT NULL,
                tipo VARCHAR(10) NOT NULL,
                valor NUMERIC(14,2) NOT NULL,
                origem VARCHAR(40) NOT NULL,
                nota_entrada TEXT NULL,
                observacao TEXT NULL,
                usuario VARCHAR(255) NULL,
                usuario_id VARCHAR(120) NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        SQL);

        DB::statement('CREATE INDEX IF NOT EXISTS idx_creditos_proprietario ON creditos_proprietario (proprietario_id)');
        DB::statement('CREATE INDEX IF NOT EXISTS idx_creditos_nota ON creditos_proprietario (nota_entrada)');
        DB::statement('ALTER TABLE creditos_proprietario ALTER COLUMN nota_entrada TYPE TEXT USING nota_entrada::text');

        self::$tabelaGarantida = true;
    }

    /** Saldo disponível (entradas - saídas) de um proprietário. */
    public static function saldo(string $proprietarioId): float
    {
        self::garantirTabela();

        $entradas = (float) DB::table('creditos_proprietario')
            ->where('proprietario_id', $proprietarioId)
            ->where('tipo', 'entrada')
            ->sum('valor');
        $saidas = (float) DB::table('creditos_proprietario')
            ->where('proprietario_id', $proprietarioId)
            ->where('tipo', 'saida')
            ->sum('valor');

        return round($entradas - $saidas, 2);
    }

    /**
     * Grava um movimento de crédito dentro da transação corrente da baixa.
     * $tipo: 'entrada' (crédito gerado) | 'saida' (crédito usado). $valor sempre positivo.
     */
    public static function registrarMovimento(
        string $proprietarioId,
        string $tipo,
        float $valor,
        string $origem,
        ?string $notaEntrada = null,
        ?string $observacao = null,
        $user = null
    ): void {
        $valor = round($valor, 2);
        if ($valor <= 0) {
            return;
        }

        self::garantirTabela();

        DB::table('creditos_proprietario')->insert([
            'id'              => (string) Str::uuid(),
            'proprietario_id' => $proprietarioId,
            'tipo'            => $tipo,
            'valor'           => $valor,
            'origem'          => $origem,
            'nota_entrada'    => $notaEntrada,
            'observacao'      => $observacao,
            'usuario'         => $user?->nome ?? $user?->login ?? 'sistema',
            'usuario_id'      => $user ? (string) $user->getAuthIdentifier() : null,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
    }

    /**
     * Aplica as regras de crédito de uma baixa (usadas pelas duas telas).
     *
     * - credito_gerado = max(0, valor_recebido - total)      -> entrada
     * - falta = max(0, total - valor_recebido)               -> coberta por credito_usado + abono
     *   credito_usado (<= saldo, <= falta)                   -> saida
     *
     * Lança \RuntimeException se o saldo for insuficiente ou faltar valor.
     * Deve rodar DENTRO da transação da baixa.
     */
    public static function aplicarNaBaixa(
        string $proprietarioId,
        float $total,
        ?float $valorRecebido,
        ?float $creditoUsado,
        float $abonoDesconto,
        string $origem,
        ?string $notaEntrada,
        $user
    ): void {
        $total = round($total, 2);
        // Sem valor_recebido informado, assume que recebeu exatamente o total
        // (comportamento antigo: nenhum crédito gerado/usado).
        $valorRecebido = $valorRecebido === null ? $total : round((float) $valorRecebido, 2);
        $creditoUsado = round((float) ($creditoUsado ?? 0), 2);
        $abonoDesconto = round((float) $abonoDesconto, 2);

        if ($valorRecebido < 0 || $creditoUsado < 0) {
            throw new \RuntimeException('Valores de crédito não podem ser negativos.');
        }

        $creditoGerado = round(max(0.0, $valorRecebido - $total), 2);
        $falta = round(max(0.0, $total - $valorRecebido), 2);

        if ($creditoUsado > 0) {
            if ($creditoUsado > $falta + 0.001) {
                throw new \RuntimeException('O crédito usado não pode ser maior que o valor que falta cobrir.');
            }
            $saldo = self::saldo($proprietarioId);
            if ($creditoUsado > $saldo + 0.001) {
                throw new \RuntimeException(
                    'Saldo de crédito insuficiente. Disponível: R$ ' . number_format($saldo, 2, ',', '.') . '.'
                );
            }
        }

        // Depois de usar o crédito e o abono, ainda pode faltar valor.
        $restante = round($falta - $creditoUsado - $abonoDesconto, 2);
        if ($restante > 0.001) {
            throw new \RuntimeException(
                'Valor insuficiente para fechar a baixa: faltam R$ ' . number_format($restante, 2, ',', '.') .
                '. Aumente o valor recebido, use crédito ou informe abono/desconto.'
            );
        }

        if ($creditoGerado > 0) {
            self::registrarMovimento(
                $proprietarioId,
                'entrada',
                $creditoGerado,
                $origem,
                $notaEntrada,
                'Excedente do pagamento (recebido R$ ' . number_format($valorRecebido, 2, ',', '.') .
                ' para baixa de R$ ' . number_format($total, 2, ',', '.') . ').',
                $user
            );
        }

        if ($creditoUsado > 0) {
            self::registrarMovimento(
                $proprietarioId,
                'saida',
                $creditoUsado,
                $origem,
                $notaEntrada,
                'Crédito usado para cobrir parte da baixa.',
                $user
            );
        }
    }

    /** Remove os movimentos de crédito vinculados a uma baixa (reversão). */
    public static function removerPorNota(?string $notaEntrada): void
    {
        $nota = trim((string) $notaEntrada);
        if ($nota === '') {
            return;
        }

        try {
            if (!DB::getSchemaBuilder()->hasTable('creditos_proprietario')) {
                return;
            }
            DB::table('creditos_proprietario')->where('nota_entrada', $nota)->delete();
        } catch (\Throwable $e) {
            // A reversão da baixa não pode ser bloqueada por falha aqui.
        }
    }

    // ─────────────────────────────────────────────
    // ENDPOINT: GET proprietarios/{id}/credito
    // ─────────────────────────────────────────────

    public function saldoEndpoint(string $id): JsonResponse
    {
        self::garantirTabela();

        $movimentos = DB::table('creditos_proprietario')
            ->where('proprietario_id', $id)
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();

        return new JsonResponse([
            'proprietario_id' => $id,
            'saldo'           => self::saldo($id),
            'movimentos'      => $movimentos,
        ]);
    }
}
