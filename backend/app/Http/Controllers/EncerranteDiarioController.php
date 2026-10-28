<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Crypt;
use App\Models\EntradaNota;
use App\Models\Abastecimento;

class EncerranteDiarioController extends Controller
{
    public function saldo(Request $request): JsonResponse
    {
        $local = $this->local($request);
        // Mesmos filtros de registros ativos do dashboard, sem suas rotinas de escrita.
        $cleanRequest = new Request();
        $entradas = $this->aplicarFiltroAtivos(EntradaNota::query()->where('local', $local), 'entrada_notas', $cleanRequest);
        $this->aplicarFiltroNotasAjusteEntradaNotas($entradas);
        $saidas = $this->aplicarFiltroAtivos(Abastecimento::query()->where('local', $local), 'abastecimentos', $cleanRequest);
        // Uma única instrução SQL usa o mesmo snapshot para entradas e saídas.
        $totais = DB::query()->selectSub($entradas->selectRaw('COALESCE(SUM(quantidade), 0)'), 'entradas')
            ->selectSub($saidas->selectRaw('COALESCE(SUM(quantidade_litros), 0)'), 'saidas')->first();
        $capturadoEm = now();
        $snapshot = [
            'local' => $local,
            'usuario_id' => (string) auth('api')->id(),
            'saldo_sistema' => round((float) $totais->entradas - (float) $totais->saidas, 2),
            'saldo_consultado_em' => $capturadoEm->toIso8601String(),
            'data' => $capturadoEm->toDateString(),
        ];
        return new JsonResponse([...$snapshot, 'saldo_snapshot' => Crypt::encryptString(json_encode($snapshot))], 200, ['Cache-Control' => 'no-store']);
    }

    public static function registrationRules(): array
    {
        return [
            'data' => 'required|date_format:Y-m-d|before_or_equal:today',
            'quantidade_tanque' => 'required|numeric|min:0|max:99999999999.999',
            'foto_regua' => 'required|url:http,https|max:4096',
            'foto_medidor' => 'required|url:http,https|max:4096',
            '_client_request_id' => 'required|string|max:120',
            'saldo_snapshot' => 'nullable|string|max:8192',
        ];
    }

    private function local(Request $request): string
    {
        $request->validate(['local' => 'required|in:Matriz,Viana']);
        $local = (string) $request->input('local');
        abort_unless(in_array($local, auth('api')->user()->filiaisAcesso(), true), 403);
        return $local;
    }

    public function index(Request $request): JsonResponse
    {
        $local = $this->local($request);
        $filters = $request->validate([
            'data_inicio' => 'nullable|date_format:Y-m-d',
            'data_fim' => 'nullable|date_format:Y-m-d'.($request->filled('data_inicio') ? '|after_or_equal:data_inicio' : ''),
        ]);
        $query = DB::table('encerrantes_diarios')->where('local', $local);
        if (!empty($filters['data_inicio'])) $query->where('data', '>=', $filters['data_inicio']);
        if (!empty($filters['data_fim'])) $query->where('data', '<=', $filters['data_fim']);
        return new JsonResponse($query->orderByDesc('data')->orderByDesc('created_at')->paginate(50));
    }

    public function store(Request $request): JsonResponse
    {
        // Restrição de canal; a autorização real continua sendo usuário e filial.
        abort_unless(str_starts_with($request->userAgent() ?? '', 'AbastecimentoVipe-Flutter/'), 403, 'Cadastro disponível somente no APK.');
        $local = $this->local($request);
        $data = $request->validate(self::registrationRules());
        $user = auth('api')->user();
        $snapshot = null;
        if (!empty($data['saldo_snapshot'])) {
            try {
                $snapshot = json_decode(Crypt::decryptString($data['saldo_snapshot']), true, 512, JSON_THROW_ON_ERROR);
            } catch (\Throwable $e) {
                abort(422, 'Referência de saldo inválida.');
            }
            abort_unless(is_array($snapshot) && ($snapshot['local'] ?? null) === $local && ($snapshot['usuario_id'] ?? null) === (string) $user->getAuthIdentifier() && ($snapshot['data'] ?? null) === $data['data'] && isset($snapshot['saldo_sistema'], $snapshot['saldo_consultado_em']), 422, 'O saldo consultado não corresponde à filial, data ou usuário.');
        }
        $row = [
            'id' => (string) Str::uuid(), 'local' => $local,
            'data' => $data['data'], 'quantidade_tanque' => $data['quantidade_tanque'],
            'foto_regua' => $data['foto_regua'], 'foto_medidor' => $data['foto_medidor'],
            'usuario_id' => (string) $user->getAuthIdentifier(),
            'usuario_nome' => $user->nome ?? $user->login,
            'client_request_id' => $data['_client_request_id'], 'created_at' => now(),
            'saldo_sistema' => $snapshot['saldo_sistema'] ?? null,
            'saldo_consultado_em' => $snapshot['saldo_consultado_em'] ?? null,
        ];
        // client_request_id único protege contra solicitações duplicadas por reenvio ou instabilidade de rede.
        $inserted = DB::table('encerrantes_diarios')->insertOrIgnore($row);
        $record = DB::table('encerrantes_diarios')->where('client_request_id', $row['client_request_id'])->first();
        abort_unless($record, 500, 'Não foi possível salvar o encerrante.');
        if ($inserted) {
            \App\Services\NotificacaoCriticaService::aoRegistrarEncerranteDiario($record);
        }
        return new JsonResponse($record, $inserted ? 201 : 200);
    }
}
