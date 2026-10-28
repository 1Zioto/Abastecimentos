<?php

namespace App\Http\Controllers;

use App\Models\Abastecimento;
use App\Services\AtuaAbastecidaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Envio dos abastecimentos da frota VIPE para a Atua (API Abastecidas).
 *
 * Chamado pelo cron da Vercel, protegido por CRON_SECRET — mesmo padrão do
 * relatório semanal. Também aceita ?secret= para disparo manual.
 */
class AtuaIntegracaoController extends Controller
{
    public function enviar(Request $request, AtuaAbastecidaService $service): JsonResponse
    {
        $secret = (string) env('CRON_SECRET', '');
        $bearer = trim(str_ireplace('Bearer ', '', (string) $request->header('Authorization', '')));
        $fornecido = $bearer !== '' ? $bearer : (string) $request->query('secret', '');
        if ($secret === '' || !hash_equals($secret, $fornecido)) {
            return new JsonResponse(['message' => 'Não autorizado.'], 403);
        }

        $limite = $request->filled('limite') ? (int) $request->query('limite') : null;
        $pendentes = $service->pendentes($limite);

        if ($pendentes->isEmpty()) {
            return new JsonResponse([
                'message'   => 'Nenhum abastecimento pendente.',
                'enviados'  => 0,
                'falhas'    => 0,
            ]);
        }

        if ($request->boolean('dry_run')) {
            return new JsonResponse([
                'message'  => 'Simulação — nada enviado.',
                'pendentes' => $pendentes->count(),
                'payload'  => ['abastecimentos' => $pendentes->map(fn ($a) => $service->montarItem($a))->values()],
            ]);
        }

        $r = $service->enviar($pendentes);

        return new JsonResponse([
            'message'   => "{$r['enviados']} abastecimento(s) integrado(s) na Atua.",
            'enviados'  => $r['enviados'],
            'falhas'    => $r['falhas'],
            'mensagens' => $r['mensagens'],
        ]);
    }

    /** Situação da integração (quantos pendentes, últimos erros). */
    public function status(Request $request, AtuaAbastecidaService $service): JsonResponse
    {
        $user = auth()->user();
        if (!$user || !in_array(mb_strtolower((string) ($user->tipo ?? '')), ['admin', 'visualizador'], true)) {
            return new JsonResponse(['message' => 'Disponível para administradores e visualizadores.'], 403);
        }

        $pendentes = $service->pendentes(500);

        return new JsonResponse([
            'habilitado' => (bool) config('atua.habilitado'),
            'pendentes'  => $pendentes->count(),
            'itens'      => $pendentes->take(50)->map(fn ($a) => [
                'atua_id'   => $a->atua_id,
                'data_hora' => optional($a->data_hora)->toIso8601String(),
                'placa'     => $a->veiculo?->placa,
                'litros'    => (float) $a->quantidade_litros,
                'valor'     => (float) $a->valor_total,
                'erro'      => $a->atua_erro,
            ])->values(),
        ]);
    }

    /**
     * Lista os lançamentos da integração (enviados, com erro e pendentes),
     * para a tela "Integração Atua".
     */
    public function lancamentos(Request $request): JsonResponse
    {
        // Consulta liberada para administradores e visualizadores.
        $user = auth()->user();
        if (!$user || !in_array(mb_strtolower((string) ($user->tipo ?? '')), ['admin', 'visualizador'], true)) {
            return new JsonResponse(['message' => 'Disponível para administradores e visualizadores.'], 403);
        }

        $idVipe = (string) config('atua.id_proprietario_vipe', '1');

        // Base com TODOS os filtros já aplicados (menos a aba de situação).
        // Assim os filtros valem sobre a base inteira, não só sobre a página
        // exibida, e os totais dos cartões refletem o que está filtrado.
        $base = Abastecimento::query()
            ->with('veiculo:id_veiculo,placa')
            ->whereNull('deleted_at')
            ->whereRaw("LOWER(COALESCE(status, '')) <> 'inativo'")
            ->where('id_proprietario', $idVipe)
            ->whereNotNull('atua_seq');

        if ($request->filled('data_inicio')) {
            $base->whereDate('data', '>=', $request->query('data_inicio'));
        }
        if ($request->filled('data_fim')) {
            $base->whereDate('data', '<=', $request->query('data_fim'));
        }
        if ($request->filled('busca')) {
            $busca = trim((string) $request->query('busca'));
            $base->where(function ($q) use ($busca) {
                $q->where('atua_id', 'ilike', "%{$busca}%")
                    ->orWhere('atua_caixa', 'ilike', "%{$busca}%")
                    ->orWhere('nome_motorista', 'ilike', "%{$busca}%")
                    ->orWhereHas('veiculo', fn ($v) => $v->where('placa', 'ilike', "%{$busca}%"));
            });
        }
        if ($request->filled('placa')) {
            // Aceita com ou sem máscara/espaços: ODA4J95, oda-4j95, "oda 4j95".
            $placa = preg_replace('/[^A-Za-z0-9]/', '', (string) $request->query('placa'));
            if ($placa !== '') {
                $base->whereHas('veiculo', fn ($v) => $v->whereRaw(
                    "REGEXP_REPLACE(UPPER(placa), '[^A-Z0-9]', '', 'g') LIKE ?",
                    ['%' . mb_strtoupper($placa) . '%']
                ));
            }
        }
        if ($request->filled('motorista')) {
            $motorista = trim((string) $request->query('motorista'));
            $base->where('nome_motorista', 'ilike', "%{$motorista}%");
        }

        // Totais por situação, já considerando os filtros acima.
        $resumo = [
            'enviados'  => (clone $base)->whereNotNull('atua_caixa')->count(),
            'erros'     => (clone $base)->whereNull('atua_enviado_em')->whereNotNull('atua_erro')->count(),
            'pendentes' => (clone $base)->whereNull('atua_enviado_em')->count(),
            'historico' => (clone $base)->whereNotNull('atua_enviado_em')->whereNull('atua_caixa')->count(),
            'total'     => (clone $base)->count(),
        ];

        $query = $base;
        switch ((string) $request->query('filtro', 'todos')) {
            case 'enviados':
                $query->whereNotNull('atua_caixa');
                break;
            case 'erros':
                $query->whereNull('atua_enviado_em')->whereNotNull('atua_erro');
                break;
            case 'pendentes':
                $query->whereNull('atua_enviado_em');
                break;
            case 'historico':
                $query->whereNotNull('atua_enviado_em')->whereNull('atua_caixa');
                break;
        }

        $pagina = $query->orderByDesc('data_hora')
            ->paginate((int) $request->query('per_page', 50));

        $pagina->getCollection()->transform(function ($a) {
            if ($a->atua_caixa) {
                $situacao = 'enviado';
            } elseif ($a->atua_enviado_em) {
                $situacao = 'historico';
            } elseif ($a->atua_erro) {
                $situacao = 'erro';
            } else {
                $situacao = 'pendente';
            }

            return [
                'id_abastecimento' => $a->id_abastecimento,
                'atua_id'          => $a->atua_id,
                'atua_seq'         => $a->atua_seq,
                'atua_caixa'       => $a->atua_caixa,
                'situacao'         => $situacao,
                'data_hora'        => optional($a->data_hora)->toIso8601String(),
                'placa'            => $a->veiculo?->placa,
                'motorista'        => $a->nome_motorista,
                'litros'           => (float) $a->quantidade_litros,
                'valor_por_litro'  => (float) $a->valor_por_litro,
                'valor_total'      => (float) $a->valor_total,
                'odometro'         => (int) $a->odometro,
                'foto_odometro'    => $a->foto_odometro,
                'local'            => $a->local,
                'enviado_em'       => optional($a->atua_enviado_em)->toIso8601String(),
                'erro'             => $a->atua_erro,
            ];
        });

        return new JsonResponse([
            'habilitado' => (bool) config('atua.habilitado'),
            'resumo'     => $resumo,
            'dados'      => $pagina,
        ]);
    }

    /**
     * Opções para os filtros: TODAS as placas e motoristas da frota VIPE,
     * independentemente da página exibida.
     */
    public function opcoes(): JsonResponse
    {
        $user = auth()->user();
        if (!$user || !in_array(mb_strtolower((string) ($user->tipo ?? '')), ['admin', 'visualizador'], true)) {
            return new JsonResponse(['message' => 'Disponível para administradores e visualizadores.'], 403);
        }

        $idVipe = (string) config('atua.id_proprietario_vipe', '1');

        // Placas: todos os veículos ativos do proprietário VIPE (mesmo os que
        // ainda não têm abastecimento lançado).
        $placas = \Illuminate\Support\Facades\DB::table('veiculos')
            ->whereNull('deleted_at')
            ->where('id_proprietario', $idVipe)
            ->whereNotNull('placa')
            ->whereRaw("TRIM(placa) <> ''")
            ->orderBy('placa')
            ->pluck('placa')
            ->map(fn ($p) => trim((string) $p))
            ->unique()
            ->values();

        // Motoristas que aparecem nos abastecimentos da frota VIPE.
        $motoristas = \Illuminate\Support\Facades\DB::table('abastecimentos')
            ->whereNull('deleted_at')
            ->whereRaw("LOWER(COALESCE(status, '')) <> 'inativo'")
            ->where('id_proprietario', $idVipe)
            ->whereNotNull('nome_motorista')
            ->whereRaw("TRIM(nome_motorista) <> ''")
            ->distinct()
            ->orderBy('nome_motorista')
            ->pluck('nome_motorista')
            ->map(fn ($m) => trim((string) $m))
            ->unique()
            ->values();

        return new JsonResponse([
            'placas'     => $placas,
            'motoristas' => $motoristas,
        ]);
    }

    /** Reenvia um abastecimento específico (limpa o erro e tenta de novo). */
    public function reenviar(string $id, AtuaAbastecidaService $service): JsonResponse
    {
        // Reenvio liberado para administradores e visualizadores.
        $user = auth()->user();
        if (!$user || !in_array(mb_strtolower((string) ($user->tipo ?? '')), ['admin', 'visualizador'], true)) {
            return new JsonResponse(['message' => 'Disponível para administradores e visualizadores.'], 403);
        }

        $abastecimento = Abastecimento::with('veiculo:id_veiculo,placa')->find($id);
        if (!$abastecimento) {
            return new JsonResponse(['message' => 'Abastecimento não encontrado.'], 404);
        }

        $jaIntegrado = !empty($abastecimento->atua_caixa);

        $novoEstado = [
            'atua_enviado_em' => null,
            'atua_erro'       => null,
        ];

        // Já tinha sido integrado (e provavelmente foi excluído dentro da Atua):
        // precisa de um nrNota novo, senão a Atua ignora como duplicado.
        if ($jaIntegrado) {
            try {
                $novoEstado['atua_nr_nota'] = (int) \Illuminate\Support\Facades\DB::selectOne(
                    "SELECT nextval('abastecimentos_atua_seq') AS seq"
                )->seq;
                $novoEstado['atua_caixa'] = null;
            } catch (\Throwable) {
                // Sem número novo, segue com o atual (a Atua pode ignorar).
            }
        }

        $abastecimento->forceFill($novoEstado)->saveQuietly();

        $r = $service->enviar(collect([$abastecimento]));
        $abastecimento->refresh();

        return new JsonResponse([
            'message'    => $r['enviados'] > 0
                ? ($jaIntegrado
                    ? "Reenviado para a Atua (Caixa {$abastecimento->atua_caixa})."
                    : "Integrado na Atua (Caixa {$abastecimento->atua_caixa}).")
                : 'Não foi possível integrar. Veja o erro.',
            'relancado'  => $jaIntegrado,
            'situacao'   => $abastecimento->atua_caixa ? 'enviado' : 'erro',
            'atua_caixa' => $abastecimento->atua_caixa,
            'erro'       => $abastecimento->atua_erro,
            'mensagens'  => $r['mensagens'],
        ], $r['enviados'] > 0 ? 200 : 422);
    }
}
