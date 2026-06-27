<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Portal público do proprietário: acesso por token (sem login) para
 * consultar abastecimentos pendentes e baixas já realizadas.
 */
class PortalProprietarioController extends Controller
{
    private function garantirColunaToken(): void
    {
        DB::statement('ALTER TABLE proprietarios ADD COLUMN IF NOT EXISTS portal_token VARCHAR(80) NULL');
        DB::statement('CREATE INDEX IF NOT EXISTS idx_proprietarios_portal_token ON proprietarios (portal_token)');
    }

    /**
     * Admin: gera (ou regenera) o token do portal de um proprietário.
     */
    public function gerarToken(Request $request, string $id): JsonResponse
    {
        $this->garantirColunaToken();

        $proprietario = DB::table('proprietarios')->where('id_proprietario', $id)->first();
        if (!$proprietario) {
            return new JsonResponse(['message' => 'Proprietário não encontrado.'], 404);
        }

        $regenerar = $request->boolean('regenerar', false);
        $token = $proprietario->portal_token ?? null;
        if (!$token || $regenerar) {
            $token = 'pp_' . Str::random(40);
            DB::table('proprietarios')
                ->where('id_proprietario', $id)
                ->update(['portal_token' => $token]);
        }

        return new JsonResponse([
            'token' => $token,
            'proprietario' => $proprietario->nome,
        ]);
    }

    /**
     * Público: dados do portal pelo token.
     */
    public function show(string $token): JsonResponse
    {
        $this->garantirColunaToken();

        $token = trim($token);
        if ($token === '' || strlen($token) < 20) {
            return new JsonResponse(['message' => 'Link inválido.'], 404);
        }

        $proprietario = DB::table('proprietarios')->where('portal_token', $token)->first();
        if (!$proprietario) {
            return new JsonResponse(['message' => 'Link inválido ou expirado.'], 404);
        }

        $id = $proprietario->id_proprietario;

        $baseAtivos = fn() => DB::table('abastecimentos as a')
            ->leftJoin('veiculos as v', 'v.id_veiculo', '=', 'a.id_veiculo')
            ->where('a.id_proprietario', $id)
            ->whereNull('a.deleted_at')
            ->whereRaw("LOWER(COALESCE(a.status, '')) <> 'inativo'");

        $pendentes = $baseAtivos()
            ->whereRaw('COALESCE(a.baixa_abastecimento, false) = false')
            ->orderByDesc('a.data')
            ->orderByDesc('a.data_hora')
            ->limit(300)
            ->get([
                'a.data', 'a.data_hora', 'v.placa', 'a.nome_motorista',
                'a.tipo_combustivel', 'a.quantidade_litros', 'a.valor_total',
            ]);

        $baixados = $baseAtivos()
            ->whereRaw('COALESCE(a.baixa_abastecimento, false) = true')
            ->orderByDesc('a.data_baixa')
            ->orderByDesc('a.data')
            ->limit(100)
            ->get([
                'a.data', 'a.data_hora', 'v.placa', 'a.nome_motorista',
                'a.quantidade_litros', 'a.valor_total', 'a.data_baixa', 'a.recebedor',
            ]);

        $totalPendente = (float) $pendentes->sum(fn($r) => (float) ($r->valor_total ?? 0));
        $litrosPendentes = (float) $pendentes->sum(fn($r) => (float) ($r->quantidade_litros ?? 0));

        return new JsonResponse([
            'proprietario' => [
                'nome' => $proprietario->nome,
            ],
            'resumo' => [
                'total_pendente' => round($totalPendente, 2),
                'litros_pendentes' => round($litrosPendentes, 2),
                'qtd_pendentes' => $pendentes->count(),
            ],
            'pendentes' => $pendentes,
            'baixados' => $baixados,
            'gerado_em' => now()->toIso8601String(),
        ]);
    }
}
