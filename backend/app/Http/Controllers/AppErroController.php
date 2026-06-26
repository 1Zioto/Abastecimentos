<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AppErroController extends Controller
{
    private function ensureSchema(): void
    {
        DB::statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS app_erros (
                id BIGSERIAL PRIMARY KEY,
                level VARCHAR(20) NOT NULL DEFAULT 'error',
                tipo VARCHAR(80) NULL,
                origem VARCHAR(80) NULL,
                tela VARCHAR(120) NULL,
                mensagem TEXT NOT NULL,
                detalhe TEXT NULL,
                stack_trace TEXT NULL,
                contexto TEXT NULL,
                app_version VARCHAR(80) NULL,
                platform VARCHAR(80) NULL,
                os_version VARCHAR(500) NULL,
                local VARCHAR(40) NULL,
                usuario_id VARCHAR(120) NULL,
                usuario_nome VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        SQL);

        DB::statement('CREATE INDEX IF NOT EXISTS app_erros_created_at_idx ON app_erros (created_at DESC)');
        DB::statement('CREATE INDEX IF NOT EXISTS app_erros_tipo_idx ON app_erros (tipo)');
        DB::statement('CREATE INDEX IF NOT EXISTS app_erros_level_idx ON app_erros (level)');
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensureSchema();

        $data = $request->validate([
            'level'       => 'nullable|string|max:20',
            'tipo'        => 'nullable|string|max:80',
            'origem'      => 'nullable|string|max:80',
            'tela'        => 'nullable|string|max:120',
            'mensagem'    => 'required|string',
            'detalhe'     => 'nullable|string',
            'stack_trace' => 'nullable|string',
            'contexto'    => 'nullable',
            'app_version' => 'nullable|string|max:80',
            'platform'    => 'nullable|string|max:80',
            'os_version'  => 'nullable|string|max:500',
            'local'       => 'nullable|string|max:40',
        ]);

        $user = auth('api')->user();
        $contexto = $data['contexto'] ?? null;
        if ($contexto !== null && !is_string($contexto)) {
            $contexto = json_encode($contexto, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }

        $id = DB::table('app_erros')->insertGetId([
            'level'        => $this->limit($data['level'] ?? 'error', 20),
            'tipo'         => $this->limit($data['tipo'] ?? null, 80),
            'origem'       => $this->limit($data['origem'] ?? null, 80),
            'tela'         => $this->limit($data['tela'] ?? null, 120),
            'mensagem'     => $this->limit($data['mensagem'], 4000),
            'detalhe'      => $this->limit($data['detalhe'] ?? null, 8000),
            'stack_trace'  => $this->limit($data['stack_trace'] ?? null, 12000),
            'contexto'     => $this->limit($contexto, 12000),
            'app_version'  => $this->limit($data['app_version'] ?? null, 80),
            'platform'     => $this->limit($data['platform'] ?? null, 80),
            'os_version'   => $this->limit($data['os_version'] ?? null, 500),
            'local'        => $this->limit($data['local'] ?? null, 40),
            'usuario_id'   => $user ? (string) $user->getAuthIdentifier() : null,
            'usuario_nome' => $user?->nome ?? $user?->login ?? null,
            'created_at'   => now(),
        ]);

        return new JsonResponse(['id' => $id, 'message' => 'Erro registrado.'], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $this->ensureSchema();

        $query = DB::table('app_erros');

        if ($request->filled('level')) {
            $query->where('level', $request->query('level'));
        }
        if ($request->filled('tipo')) {
            $query->where('tipo', $request->query('tipo'));
        }
        if ($request->filled('origem')) {
            $query->where('origem', $request->query('origem'));
        }
        if ($request->filled('usuario')) {
            $term = '%' . mb_strtolower((string) $request->query('usuario')) . '%';
            $query->whereRaw('LOWER(COALESCE(usuario_nome, usuario_id, \'\')) LIKE ?', [$term]);
        }
        if ($request->filled('data_inicio')) {
            $query->whereDate('created_at', '>=', $request->query('data_inicio'));
        }
        if ($request->filled('data_fim')) {
            $query->whereDate('created_at', '<=', $request->query('data_fim'));
        }

        return new JsonResponse(
            $query->orderByDesc('created_at')
                ->orderByDesc('id')
                ->paginate((int) $request->get('per_page', 50))
        );
    }

    public function destroyAll(): JsonResponse
    {
        $this->ensureSchema();
        DB::table('app_erros')->delete();

        return new JsonResponse(['message' => 'Erros do app limpos com sucesso.']);
    }

    private function limit(?string $value, int $max): ?string
    {
        if ($value === null) {
            return null;
        }
        return mb_strlen($value) > $max ? mb_substr($value, 0, $max) . '...[truncado]' : $value;
    }
}
