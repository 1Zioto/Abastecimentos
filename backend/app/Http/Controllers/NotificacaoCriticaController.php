<?php

namespace App\Http\Controllers;

use App\Services\NotificacaoCriticaService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NotificacaoCriticaController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        NotificacaoCriticaService::ensureSchema();
        NotificacaoCriticaService::sincronizarHistoricoOutubroSeVazio();

        $user = auth('api')->user() ?? auth()->user();
        if (!$user || strtolower((string) $user->tipo) !== 'admin') {
            return new JsonResponse(['message' => 'Acesso restrito a administradores.'], 403);
        }

        $usuarioId = (string) $user->getAuthIdentifier();

        $query = DB::table('notificacoes_criticas as n')
            ->leftJoin('notificacoes_criticas_leituras as ml', function ($join) use ($usuarioId) {
                $join->on('ml.notificacao_id', '=', 'n.id')
                    ->where('ml.usuario_id', '=', $usuarioId);
            })
            ->select([
                'n.*',
                'ml.vista_em as minha_leitura_em',
                'ml.usuario_nome as minha_leitura_nome',
            ]);

        if ($request->filled('categoria')) {
            $query->where('n.categoria', (string) $request->query('categoria'));
        }
        if ($request->filled('tipo')) {
            $query->where('n.tipo', (string) $request->query('tipo'));
        }
        if ($request->filled('prioridade')) {
            $query->where('n.prioridade', (string) $request->query('prioridade'));
        }
        if ($request->filled('local')) {
            $query->where('n.local', (string) $request->query('local'));
        }
        if ($request->filled('after_id')) {
            $query->where('n.id', '>', (int) $request->query('after_id'));
        }

        $statusLeitura = strtolower((string) $request->query('status_leitura', 'todas'));
        if ($statusLeitura === 'nao_vistas') {
            $query->whereNull('ml.id');
        } elseif ($statusLeitura === 'vistas') {
            $query->whereNotNull('ml.id');
        }

        $perPage = min(max((int) $request->query('per_page', 50), 1), 100);
        $paginator = $query
            ->orderByDesc('n.created_at')
            ->orderByDesc('n.id')
            ->paginate($perPage);

        $items = collect($paginator->items());
        $ids = $items->pluck('id')->map(fn ($v) => (int) $v)->all();

        $leiturasPorNotificacao = [];
        if (!empty($ids)) {
            $leituras = DB::table('notificacoes_criticas_leituras')
                ->whereIn('notificacao_id', $ids)
                ->orderBy('vista_em')
                ->get();

            foreach ($leituras as $l) {
                $leiturasPorNotificacao[(int) $l->notificacao_id][] = [
                    'usuario_id'    => $l->usuario_id,
                    'usuario_nome'  => $l->usuario_nome,
                    'usuario_login' => $l->usuario_login,
                    'dispositivo'   => $l->dispositivo,
                    'vista_em'      => $this->iso($l->vista_em),
                ];
            }
        }

        $dadosFormatados = $items->map(function ($row) use ($leiturasPorNotificacao) {
            $id = (int) $row->id;
            $dadosJson = null;
            if (!empty($row->dados_json)) {
                try {
                    $dadosJson = json_decode($row->dados_json, true);
                } catch (\Throwable) {
                    $dadosJson = null;
                }
            }

            return [
                'id'                => $id,
                'tipo'              => $row->tipo,
                'categoria'         => $row->categoria,
                'prioridade'        => $row->prioridade,
                'titulo'            => $row->titulo,
                'mensagem'          => $row->mensagem,
                'local'             => $row->local,
                'tabela_origem'     => $row->tabela_origem,
                'registro_id'       => $row->registro_id,
                'autor_id'          => $row->autor_id,
                'autor_nome'        => $row->autor_nome,
                'dados'             => $dadosJson,
                'created_at'        => $this->iso($row->created_at),
                'vista_em'          => $this->iso($row->vista_em),
                'vista_por_id'      => $row->vista_por_id,
                'vista_por_nome'    => $row->vista_por_nome,
                'vista_por_login'   => $row->vista_por_login,
                'vista_por_mim'     => $row->minha_leitura_em !== null,
                'minha_leitura_em'  => $this->iso($row->minha_leitura_em),
                'leituras'          => $leiturasPorNotificacao[$id] ?? [],
            ];
        })->values()->all();

        $naoVistasPorMim = (int) DB::table('notificacoes_criticas as n')
            ->leftJoin('notificacoes_criticas_leituras as ml', function ($join) use ($usuarioId) {
                $join->on('ml.notificacao_id', '=', 'n.id')
                    ->where('ml.usuario_id', '=', $usuarioId);
            })
            ->whereNull('ml.id')
            ->count();

        $ultimoId = (int) (DB::table('notificacoes_criticas')->max('id') ?? 0);

        $payload = $paginator->toArray();
        $payload['data'] = $dadosFormatados;
        $payload['nao_vistas_count'] = $naoVistasPorMim;
        $payload['ultimo_id'] = $ultimoId;

        return new JsonResponse($payload);
    }

    /**
     * Endpoint leve para o APK consultar badge de não lidas, checar tanques de
     * todas as filiais do admin (independente da filial selecionada) e obter
     * alertas novos para disparar notificação local no aparelho.
     */
    public function resumo(Request $request): JsonResponse
    {
        NotificacaoCriticaService::ensureSchema();
        NotificacaoCriticaService::sincronizarHistoricoOutubroSeVazio();

        $user = auth('api')->user() ?? auth()->user();
        if (!$user || strtolower((string) $user->tipo) !== 'admin') {
            return new JsonResponse(['message' => 'Acesso restrito a administradores.'], 403);
        }

        if ($request->boolean('check_tanques')) {
            // Verifica todas as filiais a que o admin tem acesso (Matriz e Viana),
            // independentemente da filial selecionada na tela do app.
            $filiaisAdmin = method_exists($user, 'filiaisAcesso') ? $user->filiaisAcesso() : ['Matriz', 'Viana'];
            foreach ($filiaisAdmin as $filial) {
                NotificacaoCriticaService::verificarSaldoTanque((string) $filial);
            }
        }

        $usuarioId = (string) $user->getAuthIdentifier();
        $afterId = (int) $request->query('after_id', 0);

        $naoVistasPorMim = (int) DB::table('notificacoes_criticas as n')
            ->leftJoin('notificacoes_criticas_leituras as ml', function ($join) use ($usuarioId) {
                $join->on('ml.notificacao_id', '=', 'n.id')
                    ->where('ml.usuario_id', '=', $usuarioId);
            })
            ->whereNull('ml.id')
            ->count();

        $ultimoId = (int) (DB::table('notificacoes_criticas')->max('id') ?? 0);

        $novasQuery = DB::table('notificacoes_criticas as n')
            ->leftJoin('notificacoes_criticas_leituras as ml', function ($join) use ($usuarioId) {
                $join->on('ml.notificacao_id', '=', 'n.id')
                    ->where('ml.usuario_id', '=', $usuarioId);
            })
            ->whereNull('ml.id')
            ->orderByDesc('n.id')
            ->limit(10)
            ->select(['n.id', 'n.tipo', 'n.categoria', 'n.prioridade', 'n.titulo', 'n.mensagem', 'n.local', 'n.autor_nome', 'n.created_at']);

        if ($afterId > 0) {
            $novasQuery->where('n.id', '>', $afterId);
        }

        $novas = $novasQuery->get()->map(fn ($r) => [
            'id'         => (int) $r->id,
            'tipo'       => $r->tipo,
            'categoria'  => $r->categoria,
            'prioridade' => $r->prioridade,
            'titulo'     => $r->titulo,
            'mensagem'   => $r->mensagem,
            'local'      => $r->local,
            'autor_nome' => $r->autor_nome,
            'created_at' => $this->iso($r->created_at),
        ])->values()->all();

        return new JsonResponse([
            'nao_vistas_count'   => $naoVistasPorMim,
            'ultimo_id'          => $ultimoId,
            'novas_para_disparo' => $novas,
        ]);
    }

    public function marcarVista(Request $request, string $id): JsonResponse
    {
        NotificacaoCriticaService::ensureSchema();
        $user = auth('api')->user() ?? auth()->user();
        if (!$user || strtolower((string) $user->tipo) !== 'admin') {
            return new JsonResponse(['message' => 'Acesso restrito a administradores.'], 403);
        }

        $dispositivo = (string) ($request->input('dispositivo') ?: 'APK Android');
        NotificacaoCriticaService::marcarVistas([(int) $id], $user, $dispositivo);

        $leitura = DB::table('notificacoes_criticas_leituras')
            ->where('notificacao_id', (int) $id)
            ->where('usuario_id', (string) $user->getAuthIdentifier())
            ->first();

        return new JsonResponse([
            'message'        => 'Notificação marcada como vista.',
            'notificacao_id' => (int) $id,
            'usuario_id'     => (string) $user->getAuthIdentifier(),
            'usuario_nome'   => (string) ($user->nome ?? $user->login ?? 'Administrador'),
            'vista_em'       => $leitura ? $this->iso($leitura->vista_em) : now()->toIso8601String(),
        ]);
    }

    public function marcarVistasLote(Request $request): JsonResponse
    {
        NotificacaoCriticaService::ensureSchema();
        $user = auth('api')->user() ?? auth()->user();
        if (!$user || strtolower((string) $user->tipo) !== 'admin') {
            return new JsonResponse(['message' => 'Acesso restrito a administradores.'], 403);
        }

        $usuarioId = (string) $user->getAuthIdentifier();
        $dispositivo = (string) ($request->input('dispositivo') ?: 'APK Android');

        if ($request->boolean('todas')) {
            $ids = DB::table('notificacoes_criticas as n')
                ->leftJoin('notificacoes_criticas_leituras as ml', function ($join) use ($usuarioId) {
                    $join->on('ml.notificacao_id', '=', 'n.id')
                        ->where('ml.usuario_id', '=', $usuarioId);
                })
                ->whereNull('ml.id')
                ->pluck('n.id')
                ->map(fn ($v) => (int) $v)
                ->all();
        } else {
            $ids = (array) $request->input('ids', []);
        }

        $marcadas = NotificacaoCriticaService::marcarVistas($ids, $user, $dispositivo);

        return new JsonResponse([
            'message'      => 'Notificações marcadas como vistas.',
            'marcadas'     => $marcadas,
            'usuario_id'   => $usuarioId,
            'usuario_nome' => (string) ($user->nome ?? $user->login ?? 'Administrador'),
            'vista_em'     => now()->toIso8601String(),
        ]);
    }

    private function iso(mixed $val): ?string
    {
        if ($val === null || $val === '') {
            return null;
        }
        try {
            return Carbon::parse($val, config('app.timezone', 'America/Sao_Paulo'))->toIso8601String();
        } catch (\Throwable) {
            return (string) $val;
        }
    }
}

