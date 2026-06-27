<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

/**
 * Integração com o Sofit (sofitview.com.br).
 * Lança o abastecimento como despesa via upsert — o campo "name"
 * (data + veículo) é a chave de idempotência, então relançar não duplica.
 */
class SofitController extends Controller
{
    private const BASE_URL = 'https://sofitview.com.br/api';
    private const ITEM_ID = 'Diesel S10 - Garagem';
    private const SUPPLIER_ID = 'VIPE TRANSPORTES MULTIMODAIS LTDA';

    private function garantirColunas(): void
    {
        DB::statement('ALTER TABLE abastecimentos ADD COLUMN IF NOT EXISTS sofit_id VARCHAR(120) NULL');
        DB::statement("ALTER TABLE abastecimentos ADD COLUMN IF NOT EXISTS sofit_status VARCHAR(30) NULL");
        DB::statement('ALTER TABLE abastecimentos ADD COLUMN IF NOT EXISTS sofit_retorno TEXT NULL');
        DB::statement('ALTER TABLE abastecimentos ADD COLUMN IF NOT EXISTS sofit_lancado_em TIMESTAMPTZ NULL');
        DB::statement('ALTER TABLE abastecimentos ADD COLUMN IF NOT EXISTS sofit_trip_id VARCHAR(120) NULL');

        // Vínculos "nosso motorista" → "nome do Colaborador no Sofit"
        DB::statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS sofit_alias_motoristas (
                id SERIAL PRIMARY KEY,
                nome_origem VARCHAR(160) NOT NULL,
                nome_origem_normalizado VARCHAR(160) NOT NULL UNIQUE,
                nome_sofit VARCHAR(160) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        SQL);
    }

    private function normalizarNome(?string $nome): string
    {
        $n = mb_strtoupper(trim((string) $nome));
        $n = \Illuminate\Support\Str::ascii($n);
        return preg_replace('/\s+/', ' ', $n) ?? '';
    }

    private function buscarAliasMotorista(?string $nome): ?string
    {
        $norm = $this->normalizarNome($nome);
        if ($norm === '') return null;
        $row = DB::table('sofit_alias_motoristas')->where('nome_origem_normalizado', $norm)->first();
        return $row->nome_sofit ?? null;
    }

    private function salvarAliasMotorista(string $nomeOrigem, string $nomeSofit): void
    {
        $norm = $this->normalizarNome($nomeOrigem);
        if ($norm === '' || trim($nomeSofit) === '') return;
        DB::table('sofit_alias_motoristas')->upsert(
            [[
                'nome_origem' => trim($nomeOrigem),
                'nome_origem_normalizado' => $norm,
                'nome_sofit' => trim($nomeSofit),
                'updated_at' => now(),
            ]],
            ['nome_origem_normalizado'],
            ['nome_sofit', 'nome_origem', 'updated_at']
        );
    }

    public function lancar(Request $request, string $id): JsonResponse
    {
        $this->garantirColunas();

        $dados = $request->validate([
            'trip_id'         => 'nullable|string|max:120',
            'odometro'        => 'nullable|numeric',
            'motorista_sofit' => 'nullable|string|max:160',
            // Data/hora TEMPORÁRIA: usada apenas para o lançamento no Sofit
            // (campos date/name do payload). NÃO é gravada no abastecimento.
            'data_hora'       => 'nullable|date',
        ]);

        $a = DB::table('abastecimentos as a')
            ->leftJoin('veiculos as v', 'v.id_veiculo', '=', 'a.id_veiculo')
            ->leftJoin('motoristas as m', 'm.id_motorista', '=', 'a.id_motorista')
            ->where('a.id_abastecimento', $id)
            ->first([
                'a.id_abastecimento', 'a.data', 'a.data_hora', 'a.quantidade_litros',
                'a.valor_total', 'a.odometro', 'a.nome_motorista', 'a.sofit_id',
                'a.sofit_status', 'a.sofit_trip_id', 'v.placa', 'm.nome as motorista_cadastro',
            ]);

        if (!$a) {
            return new JsonResponse(['message' => 'Abastecimento não encontrado.'], 404);
        }

        // Persiste Cód. da Viagem e KM editado antes do lançamento
        $tripId = isset($dados['trip_id']) && trim((string) $dados['trip_id']) !== ''
            ? trim((string) $dados['trip_id'])
            : ($a->sofit_trip_id ?: null);
        $odometro = array_key_exists('odometro', $dados) && $dados['odometro'] !== null
            ? (float) $dados['odometro']
            : $this->num($a->odometro);

        $persistir = [];
        if ($tripId !== ($a->sofit_trip_id ?: null)) {
            $persistir['sofit_trip_id'] = $tripId;
        }
        if ($odometro !== null && (float) ($a->odometro ?? -1) !== $odometro) {
            $persistir['odometro'] = $odometro;
        }
        if ($persistir) {
            DB::table('abastecimentos')->where('id_abastecimento', $id)->update($persistir);
        }
        if (($a->sofit_status ?? '') === 'lancado' && $a->sofit_id) {
            return new JsonResponse([
                'message' => 'Já lançado no Sofit.',
                'sofit_id' => $a->sofit_id,
                'sofit_status' => 'lancado',
            ]);
        }
        if (!$a->placa) {
            return new JsonResponse(['message' => 'Abastecimento sem placa — não é possível lançar.'], 422);
        }

        // Se veio uma data/hora temporária no request, ela tem prioridade APENAS
        // para o lançamento no Sofit (não altera o registro do abastecimento).
        $dataHoraTemp = isset($dados['data_hora']) && trim((string) $dados['data_hora']) !== ''
            ? $dados['data_hora']
            : null;
        $dataHora = $this->formatarData($dataHoraTemp ?: ($a->data_hora ?: $a->data));
        if (!$dataHora) {
            return new JsonResponse(['message' => 'Abastecimento sem data válida.'], 422);
        }

        try {
            $token = $this->loginSofit();
        } catch (\Throwable $e) {
            return new JsonResponse(['message' => 'Falha no login do Sofit: ' . $e->getMessage()], 502);
        }

        $motoristaOriginal = trim((string) ($a->nome_motorista ?: $a->motorista_cadastro)) ?: null;
        $motoristaSofitInformado = trim((string) ($dados['motorista_sofit'] ?? '')) ?: null;

        if ($motoristaSofitInformado && $motoristaOriginal) {
            // Usuário informou o nome correto: usa e LEMBRA para as próximas ocorrências
            $this->salvarAliasMotorista($motoristaOriginal, $motoristaSofitInformado);
            $motorista = $motoristaSofitInformado;
        } else {
            // Traduz automaticamente se já houver vínculo salvo
            $motorista = $this->buscarAliasMotorista($motoristaOriginal) ?? $motoristaOriginal;
        }

        $montarValues = function (bool $incluirMotorista) use ($a, $dataHora, $odometro, $tripId, $motorista): array {
            $values = [];
            $add = function (string $field, $value) use (&$values) {
                if ($value !== null && $value !== '' && !(is_float($value) && is_nan($value))) {
                    $values[] = ['field' => $field, 'value' => $value];
                }
            };
            $add('name', "{$dataHora} - {$a->placa}");
            $add('date', $dataHora);
            $add('vehicle_id', $a->placa);
            $add('item_id', self::ITEM_ID);
            $add('quantity', $this->num($a->quantidade_litros));
            $add('total_value', $this->num($a->valor_total));
            $add('odometer', $odometro);
            if ($incluirMotorista) {
                $add('employee_id', $motorista);
            }
            $add('supplier_id', self::SUPPLIER_ID);
            $add('trip_id', $tripId);
            return $values;
        };

        $url = self::BASE_URL . '/v1/integrations/upsert/expense';
        $payload = ['upsert_field' => 'name', 'values' => $montarValues(true)];

        $resp = $this->postSofit($token, $url, $payload);

        // Renova token em 401/403 (mesma lógica do robô Python)
        if (in_array($resp->status(), [401, 403], true)) {
            try {
                $token = $this->loginSofit();
                $resp = $this->postSofit($token, $url, $payload);
            } catch (\Throwable $e) {
                return new JsonResponse(['message' => 'Token Sofit expirado e relogin falhou: ' . $e->getMessage()], 502);
            }
        }

        $body = $resp->json() ?? [];

        // Colaborador (motorista) não encontrado no Sofit → devolve status
        // específico para a tela abrir o campo de vínculo do nome correto.
        $avisoMotorista = null;
        if (!in_array($resp->status(), [200, 201], true) && $motorista) {
            $erroTexto = mb_strtolower($this->tratarErroSofit($body));
            if (str_contains($erroTexto, 'colaborador')) {
                $msg = "Motorista '{$motorista}' não encontrado no Sofit. Informe o nome exatamente como está cadastrado lá — vou lembrar do vínculo nas próximas vezes.";
                DB::table('abastecimentos')->where('id_abastecimento', $id)->update([
                    'sofit_status' => 'erro_motorista',
                    'sofit_retorno' => mb_substr($msg, 0, 500),
                ]);
                $this->logoffSofit($token);
                return new JsonResponse([
                    'message' => $msg,
                    'sofit_status' => 'erro_motorista',
                    'motorista_tentado' => $motorista,
                ], 422);
            }
        }

        if (in_array($resp->status(), [200, 201], true)) {
            $sofitId = (string) ($body['id'] ?? $body['expense_id'] ?? 'ok');
            DB::table('abastecimentos')->where('id_abastecimento', $id)->update([
                'sofit_id' => $sofitId,
                'sofit_status' => 'lancado',
                'sofit_retorno' => $avisoMotorista ?: $sofitId,
                'sofit_lancado_em' => now(),
            ]);
            $this->logoffSofit($token);
            return new JsonResponse([
                'message' => $avisoMotorista
                    ? 'Lançado no Sofit. ' . $avisoMotorista
                    : 'Lançado no Sofit com sucesso.',
                'sofit_id' => $sofitId,
                'sofit_status' => 'lancado',
                'aviso' => $avisoMotorista,
            ]);
        }

        $erro = $this->tratarErroSofit($body);
        DB::table('abastecimentos')->where('id_abastecimento', $id)->update([
            'sofit_status' => 'erro',
            'sofit_retorno' => mb_substr($erro, 0, 500),
        ]);
        $this->logoffSofit($token);
        return new JsonResponse([
            'message' => $erro,
            'sofit_status' => 'erro',
        ], 422);
    }

    // ── Helpers ──────────────────────────────────

    private function loginSofit(): string
    {
        $user = env('SOFIT_USER', 'powerdataconsultoria@gmail.com');
        $pass = env('SOFIT_PASSWORD', '635241@Abcde');

        $ultimoErro = 'desconhecido';
        for ($t = 1; $t <= 3; $t++) {
            try {
                $r = Http::timeout(30)->post(self::BASE_URL . '/v1/users/login', [
                    'user_name' => $user,
                    'password' => $pass,
                ]);
                $token = $r->json('token');
                if ($r->successful() && $token) {
                    return $token;
                }
                $ultimoErro = 'HTTP ' . $r->status();
            } catch (\Throwable $e) {
                $ultimoErro = $e->getMessage();
            }
            sleep(min(5, $t * 2));
        }
        throw new \RuntimeException($ultimoErro);
    }

    private function logoffSofit(string $token): void
    {
        try {
            Http::timeout(10)->withToken($token)->post(self::BASE_URL . '/v1/users/logout');
        } catch (\Throwable $e) {
            // ignorado, como no script original
        }
    }

    private function postSofit(string $token, string $url, array $payload)
    {
        return Http::timeout(30)
            ->withToken($token)
            ->acceptJson()
            ->post($url, $payload);
    }

    private function tratarErroSofit(array $data): string
    {
        $errors = $data['errors'] ?? [];
        if (empty($errors)) {
            return 'Erro desconhecido no Sofit';
        }
        $raw = html_entity_decode((string) ($errors[0]['message'] ?? ''));
        $rawLower = mb_strtolower($raw);
        if (str_contains($rawLower, 'já possui transação') || str_contains($rawLower, 'ja possui transacao')) {
            return 'Despesa já existente no Sofit';
        }
        if (str_contains($rawLower, 'combinação inválida') || str_contains($rawLower, 'combinacao invalida')) {
            return 'Combinação inválida de veículo/data/hodômetro';
        }
        return trim($raw) !== '' ? trim($raw) : 'Erro desconhecido no Sofit';
    }

    private function formatarData($valor): ?string
    {
        if (!$valor) return null;
        try {
            // Formato exigido pelo Sofit: 2019-09-17 10:30:55
            return \Carbon\Carbon::parse($valor)->format('Y-m-d H:i:s');
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function num($v): ?float
    {
        if ($v === null || $v === '') return null;
        $n = (float) str_replace(',', '.', (string) $v);
        return is_finite($n) ? $n : null;
    }
}
