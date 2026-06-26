<?php

namespace App\Http\Controllers;

use App\Models\Abastecimento;
use App\Models\EncerranteBomba;
use App\Models\EntradaNota;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class EncerranteBombaController extends Controller
{
    private const HORA_PADRAO = '07:00';
    private const LIMITE_ENCERRANTE = 100000.0;
    private const DIA_OBRIGATORIO = CarbonInterface::SATURDAY;

    public function index(Request $request): JsonResponse
    {
        $this->ensureSchema();

        $query = EncerranteBomba::query();
        $this->aplicarFiltroSyncToken($query, $request, 'encerrantes_bomba');

        if ($request->filled('local')) {
            $query->where('local', $this->normalizarLocal($request->query('local')));
        }

        if ($request->filled('data_inicio')) {
            $query->whereDate('data', '>=', $request->query('data_inicio'));
        }

        if ($request->filled('data_fim')) {
            $query->whereDate('data', '<=', $request->query('data_fim'));
        }

        if ($this->suportaSyncIncremental($request, 'encerrantes_bomba')) {
            return new JsonResponse(
                $query->orderBy('sync_token_at')->orderBy('id_encerrante')->paginate($request->get('per_page', 100))
            );
        }

        return new JsonResponse(
            $query->orderByDesc('data')->orderByDesc('created_at')->paginate($request->get('per_page', 100))
        );
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensureSchema();

        $data = $request->validate([
            'data' => 'required|date',
            'local' => 'required|string',
            'quantidade_tanque' => 'required|numeric|min:0',
            'litros_bomba' => 'required|numeric|min:0',
            'foto' => 'required|string',
        ]);

        $data['local'] = $this->normalizarLocal($data['local']);
        $user = auth('api')->user();
        $data['usuario_id'] = $user ? (string) $user->getAuthIdentifier() : null;
        $data['usuario_nome'] = $user?->nome ?? $user?->login ?? 'Sistema';

        $registro = EncerranteBomba::create($data);

        return new JsonResponse($registro, 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $this->ensureSchema();

        if ($adminResponse = $this->ensureAdmin()) {
            return $adminResponse;
        }

        $registro = EncerranteBomba::query()->findOrFail($id);
        $data = $request->validate([
            'data' => 'sometimes|required|date',
            'local' => 'sometimes|required|string',
            'quantidade_tanque' => 'sometimes|required|numeric|min:0',
            'litros_bomba' => 'sometimes|required|numeric|min:0',
            'foto' => 'sometimes|required|string',
        ]);

        if (array_key_exists('local', $data)) {
            $data['local'] = $this->normalizarLocal($data['local']);
        }

        $registro->fill($data);
        $registro->save();

        return new JsonResponse($registro);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->ensureSchema();

        if ($adminResponse = $this->ensureAdmin()) {
            return $adminResponse;
        }

        $registro = EncerranteBomba::query()->findOrFail($id);
        $currentUser = auth('api')->user();

        if (Schema::hasColumn('encerrantes_bomba', 'deleted_at')) {
            $registro->deleted_at = now();
            $registro->deleted_by = $currentUser?->nome ?? $currentUser?->login ?? 'Sistema';
            $registro->deleted_by_id = $currentUser ? (string) $currentUser->getAuthIdentifier() : null;
            $registro->save();
        } else {
            $registro->delete();
        }

        return new JsonResponse(['message' => 'Encerrante removido.']);
    }

    public function status(Request $request): JsonResponse
    {
        $this->ensureSchema();

        $local = $this->normalizarLocal($request->query('local', 'Matriz'));
        $user = auth('api')->user();
        $tipo = strtolower((string) ($user?->tipo ?? ''));
        $hora = $this->getHoraObrigatoria();
        $agora = CarbonImmutable::now(config('app.timezone', 'America/Sao_Paulo'));
        $momentoObrigatorio = $this->ultimoMomentoObrigatorio($agora, $hora);

        $ultimo = EncerranteBomba::query()
            ->where('local', $local)
            ->whereDate('data', '>=', $momentoObrigatorio->toDateString())
            ->orderByDesc('data')
            ->orderByDesc('created_at')
            ->first();

        $obrigatorio = in_array($tipo, ['admin', 'operador'], true)
            && $agora->greaterThanOrEqualTo($momentoObrigatorio)
            && !$ultimo;

        return new JsonResponse([
            'local' => $local,
            'hora_obrigatoria' => $hora,
            'dia_obrigatorio' => 'sabado',
            'inicio_semana' => $momentoObrigatorio->toDateString(),
            'inicio_periodo' => $momentoObrigatorio->toDateString(),
            'proximo_limite' => $momentoObrigatorio->toIso8601String(),
            'obrigatorio' => $obrigatorio,
            'pode_abastecer' => !$obrigatorio,
            'ultimo' => $ultimo,
        ]);
    }

    public function config(): JsonResponse
    {
        $this->ensureSchema();

        return new JsonResponse([
            'hora_obrigatoria' => $this->getHoraObrigatoria(),
        ]);
    }

    public function updateConfig(Request $request): JsonResponse
    {
        $this->ensureSchema();

        if ($adminResponse = $this->ensureAdmin()) {
            return $adminResponse;
        }

        $data = $request->validate([
            'hora_obrigatoria' => ['required', 'regex:/^\d{2}:\d{2}$/'],
        ]);

        [$h, $m] = array_map('intval', explode(':', $data['hora_obrigatoria']));
        if ($h < 0 || $h > 23 || $m < 0 || $m > 59) {
            return new JsonResponse(['message' => 'Horário inválido.'], 422);
        }

        DB::table('configuracoes_sistema')->updateOrInsert(
            ['chave' => 'encerrante_bomba_hora'],
            ['valor' => sprintf('%02d:%02d', $h, $m), 'updated_at' => now()]
        );

        return $this->config();
    }

    public function analisePrivada(Request $request): JsonResponse
    {
        $this->ensureSchema();

        if ($privateResponse = $this->ensurePrivateAccess()) {
            return $privateResponse;
        }

        $local = $this->normalizarLocal($request->query('local', 'Matriz'));
        $query = EncerranteBomba::query()
            ->where('local', $local);

        if (Schema::hasColumn('encerrantes_bomba', 'deleted_at')) {
            $query->whereNull('encerrantes_bomba.deleted_at');
        }

        if ($request->filled('data_inicio')) {
            $query->whereDate('data', '>=', $request->query('data_inicio'));
        }

        if ($request->filled('data_fim')) {
            $query->whereDate('data', '<=', $request->query('data_fim'));
        }

        $registros = $query
            ->orderBy('data')
            ->orderBy('created_at')
            ->get();

        $analises = [];
        $anterior = null;
        $totalDivergencias = 0;

        foreach ($registros as $registro) {
            $encerranteAtual = (float) $registro->litros_bomba;
            $tanqueAtual = (float) $registro->quantidade_tanque;
            $linha = [
                'id_encerrante' => $registro->id_encerrante,
                'data' => optional($registro->data)->toDateString() ?? (string) $registro->data,
                'local' => $registro->local,
                'quantidade_tanque' => round($tanqueAtual, 2),
                'litros_bomba' => round($encerranteAtual, 2),
                'foto' => $registro->foto,
                'usuario_nome' => $registro->usuario_nome,
                'created_at' => optional($registro->created_at)->toIso8601String(),
                'anterior' => null,
                'reset_detectado' => false,
                'delta_encerrante' => null,
                'saida_abastecimentos' => null,
                'entradas_combustivel' => null,
                'tanque_estimado' => null,
                'diferenca_encerrante_saida' => null,
                'diferenca_tanque' => null,
                'divergente' => false,
            ];

            if ($anterior) {
                $encerranteAnterior = (float) $anterior->litros_bomba;
                $dataInicio = optional($anterior->data)->toDateString() ?? (string) $anterior->data;
                $dataFim = optional($registro->data)->toDateString() ?? (string) $registro->data;
                $resetDetectado = $encerranteAtual < $encerranteAnterior;
                $deltaEncerrante = $resetDetectado
                    ? (self::LIMITE_ENCERRANTE - $encerranteAnterior) + $encerranteAtual
                    : $encerranteAtual - $encerranteAnterior;

                $saidaAbastecimentos = $this->somaAbastecimentosPeriodo($local, $dataInicio, $dataFim, $request);
                $entradasCombustivel = $this->somaEntradasPeriodo($local, $dataInicio, $dataFim, $request);
                $tanqueEstimado = ((float) $anterior->quantidade_tanque) + $entradasCombustivel - $saidaAbastecimentos;
                $diferencaEncerranteSaida = $deltaEncerrante - $saidaAbastecimentos;
                $diferencaTanque = $tanqueAtual - $tanqueEstimado;
                $divergente = abs($diferencaEncerranteSaida) > 0.5 || abs($diferencaTanque) > 0.5;

                if ($divergente) {
                    $totalDivergencias++;
                }

                $linha = array_merge($linha, [
                    'anterior' => [
                        'id_encerrante' => $anterior->id_encerrante,
                        'data' => optional($anterior->data)->toDateString() ?? (string) $anterior->data,
                        'quantidade_tanque' => round((float) $anterior->quantidade_tanque, 2),
                        'litros_bomba' => round($encerranteAnterior, 2),
                    ],
                    'reset_detectado' => $resetDetectado,
                    'delta_encerrante' => round($deltaEncerrante, 2),
                    'saida_abastecimentos' => round($saidaAbastecimentos, 2),
                    'entradas_combustivel' => round($entradasCombustivel, 2),
                    'tanque_estimado' => round($tanqueEstimado, 2),
                    'diferenca_encerrante_saida' => round($diferencaEncerranteSaida, 2),
                    'diferenca_tanque' => round($diferencaTanque, 2),
                    'divergente' => $divergente,
                ]);
            }

            $analises[] = $linha;
            $anterior = $registro;
        }

        return new JsonResponse([
            'local' => $local,
            'limite_encerrante' => self::LIMITE_ENCERRANTE,
            'total_registros' => count($analises),
            'total_divergencias' => $totalDivergencias,
            'analises' => $analises,
        ]);
    }

    private function ensureSchema(): void
    {
        DB::statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS configuracoes_sistema (
                chave VARCHAR(120) PRIMARY KEY,
                valor TEXT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        SQL);

        DB::statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS encerrantes_bomba (
                id_encerrante VARCHAR(120) PRIMARY KEY,
                data DATE NOT NULL,
                local VARCHAR(80) NOT NULL,
                quantidade_tanque NUMERIC(12,2) NOT NULL,
                litros_bomba NUMERIC(12,2) NOT NULL,
                foto TEXT NOT NULL,
                usuario_id VARCHAR(120) NULL,
                usuario_nome VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sync_token_at TIMESTAMP NULL,
                deleted_at TIMESTAMP NULL,
                deleted_by VARCHAR(255) NULL,
                deleted_by_id VARCHAR(120) NULL
            )
        SQL);

        DB::table('configuracoes_sistema')->insertOrIgnore([
            [
                'chave' => 'encerrante_bomba_hora',
                'valor' => self::HORA_PADRAO,
                'updated_at' => now(),
            ],
        ]);
    }

    private function getHoraObrigatoria(): string
    {
        $valor = DB::table('configuracoes_sistema')
            ->where('chave', 'encerrante_bomba_hora')
            ->value('valor');

        return preg_match('/^\d{2}:\d{2}$/', (string) $valor)
            ? (string) $valor
            : self::HORA_PADRAO;
    }

    private function ultimoMomentoObrigatorio(CarbonImmutable $agora, string $hora): CarbonImmutable
    {
        $momento = $agora->setTimeFromTimeString($hora . ':00');

        while ($momento->dayOfWeek !== self::DIA_OBRIGATORIO || $momento->greaterThan($agora)) {
            $momento = $momento->subDay();
        }

        return $momento;
    }

    private function normalizarLocal(?string $local): string
    {
        $valor = trim((string) $local);
        if ($valor === '' || strcasecmp($valor, 'Garagem') === 0 || strcasecmp($valor, 'Cariacica') === 0) {
            return 'Matriz';
        }
        if (strcasecmp($valor, 'Garagem Viana') === 0) {
            return 'Viana';
        }
        return $valor;
    }

    private function ensureAdmin(): ?JsonResponse
    {
        $currentUser = auth('api')->user();
        if (!$currentUser || $currentUser->tipo !== 'admin') {
            return new JsonResponse(['message' => 'Somente administradores podem alterar configurações'], 403);
        }

        return null;
    }

    private function ensurePrivateAccess(): ?JsonResponse
    {
        $currentUser = auth('api')->user();
        $tipo = strtolower((string) ($currentUser?->tipo ?? ''));
        $login = strtolower(trim((string) ($currentUser?->login ?? '')));
        $nome = strtolower(trim((string) ($currentUser?->nome ?? '')));

        if (!$currentUser || $tipo !== 'admin' || ($login !== 'admin' && !str_contains($login . ' ' . $nome, 'douglas'))) {
            return new JsonResponse(['message' => 'Acesso restrito.'], 403);
        }

        return null;
    }

    private function somaAbastecimentosPeriodo(string $local, string $dataInicio, string $dataFim, Request $request): float
    {
        $query = Abastecimento::query()
            ->where('local', $local)
            ->whereDate('data', '>', $dataInicio)
            ->whereDate('data', '<=', $dataFim);

        $this->aplicarFiltroAtivos($query, 'abastecimentos', $request);

        return (float) $query->sum('quantidade_litros');
    }

    private function somaEntradasPeriodo(string $local, string $dataInicio, string $dataFim, Request $request): float
    {
        $query = EntradaNota::query()
            ->where('local', $local)
            ->whereDate('data', '>', $dataInicio)
            ->whereDate('data', '<=', $dataFim);

        $this->aplicarFiltroAtivos($query, 'entrada_notas', $request);

        return (float) $query->sum('quantidade');
    }
}
