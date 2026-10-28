<?php

namespace App\Services;

use App\Models\Abastecimento;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Integração com a API Abastecidas da Atua (layout "mais_postos").
 *
 * Regra de negócio: todo abastecimento da frota própria VIPE é lançado
 * automaticamente na Atua. O identificador "Vipe-XXXXXX" do abastecimento vai
 * no campo descritivo (complemento) e o número da sequência vai como `nrNota`
 * — que é a chave de deduplicação da Atua, garantindo que um reenvio nunca
 * gere lançamento duplicado.
 */
class AtuaAbastecidaService
{
    /** Timeout (s) da chamada HTTP; menor no envio inline para não travar o app. */
    private ?int $timeout = null;

    /** Abastecimentos da frota VIPE ainda não enviados. */
    public function pendentes(int $limite = null): Collection
    {
        $limite = $limite ?: (int) config('atua.lote', 50);

        return Abastecimento::query()
            ->with('veiculo:id_veiculo,placa')
            ->whereNull('deleted_at')
            ->whereRaw("LOWER(COALESCE(status, '')) <> 'inativo'")
            ->where('id_proprietario', (string) config('atua.id_proprietario_vipe', '1'))
            ->whereNull('atua_enviado_em')
            ->whereNotNull('atua_seq')
            ->orderBy('data_hora')
            ->limit($limite)
            ->get();
    }

    /**
     * Envia UM abastecimento assim que ele é criado no backend, junto com
     * alguns pendentes antigos (retentativa de falhas anteriores).
     *
     * Nunca lança exceção: falhar aqui não pode impedir a gravação do
     * abastecimento. O que não for enviado fica pendente e é reprocessado no
     * próximo abastecimento ou pelo cron diário.
     */
    public function enviarImediato(Abastecimento $abastecimento, ?int $retentativas = null): void
    {
        $retentativas ??= (int) config('atua.retentativas_inline', 4);

        try {
            if (!config('atua.habilitado', true)) {
                return;
            }
            if ((string) $abastecimento->id_proprietario !== (string) config('atua.id_proprietario_vipe', '1')) {
                return; // só frota própria VIPE
            }
            if (!empty($abastecimento->atua_enviado_em)) {
                return;
            }

            // Inline: timeout curto para não segurar a resposta do app.
            $this->timeout = (int) config('atua.timeout_imediato', 20);

            $abastecimento->loadMissing('veiculo:id_veiculo,placa');
            $fila = collect([$abastecimento]);

            // Aproveita a chamada para reprocessar pendências anteriores.
            if ($retentativas > 0) {
                $antigos = Abastecimento::query()
                    ->with('veiculo:id_veiculo,placa')
                    ->whereNull('deleted_at')
                    ->whereRaw("LOWER(COALESCE(status, '')) <> 'inativo'")
                    ->where('id_proprietario', (string) config('atua.id_proprietario_vipe', '1'))
                    ->whereNull('atua_enviado_em')
                    ->whereNotNull('atua_seq')
                    ->where('id_abastecimento', '<>', $abastecimento->id_abastecimento)
                    ->orderBy('data_hora')
                    ->limit($retentativas)
                    ->get();
                $fila = $fila->concat($antigos);
            }

            $this->enviar($fila);
        } catch (\Throwable $e) {
            Log::warning('[Atua] Falha no envio imediato', [
                'abastecimento' => $abastecimento->id_abastecimento ?? null,
                'erro' => $e->getMessage(),
            ]);
        }
    }

    /** Monta o item JSON de uma abastecida no formato esperado pela Atua. */
    public function montarItem(Abastecimento $a): array
    {
        $tipo = mb_strtoupper(trim((string) $a->tipo_combustivel));
        [$nrProduto, $nmProduto] = config('atua.produtos')[$tipo]
            ?? config('atua.produto_padrao', ['11', 'DIESEL S-10']);

        $placa = $a->veiculo?->placa ?: $a->placa1;
        $dataHora = $a->data_hora ?: $a->data;

        return [
            'nrProduto'         => (string) $nrProduto,
            'nmProduto'         => (string) $nmProduto,
            'Placa'             => (string) $placa,
            'dtNota'            => $dataHora?->format('Y-m-d\TH:i:s'),
            'nrNota'            => (string) ($a->atua_nr_nota ?: $a->atua_seq),
            'vlNota'            => number_format((float) $a->valor_total, 2, '.', ''),
            'qtProduto'         => number_format((float) $a->quantidade_litros, 5, '.', ''),
            'vlUnitario'        => number_format((float) $a->valor_por_litro, 5, '.', ''),
            'vlOdometro'        => (string) ((int) $a->odometro),
            'cnpjPosto'         => (string) config('atua.cnpj_posto'),
            'razaoSocialPosto'  => (string) config('atua.razao_social_posto'),
            'nomeFantasiaPosto' => (string) config('atua.nome_fantasia_posto'),
            // Campo descritivo: leva o identificador do abastecimento.
            'complemento'       => (string) $a->atua_id,
        ];
    }

    /** Valida o que a API exige como obrigatório. Devolve lista de problemas. */
    public function validar(Abastecimento $a): array
    {
        $erros = [];
        if (!($a->veiculo?->placa ?: $a->placa1)) $erros[] = 'sem placa';
        if (!$a->data_hora && !$a->data)          $erros[] = 'sem data';
        if ((float) $a->quantidade_litros <= 0)   $erros[] = 'litros inválidos';
        if ((float) $a->valor_por_litro <= 0)     $erros[] = 'valor por litro inválido';
        if ((float) $a->valor_total <= 0)         $erros[] = 'valor total inválido';
        if ((int) $a->odometro <= 0)              $erros[] = 'odômetro obrigatório';
        if (empty($a->atua_seq))                  $erros[] = 'sem identificador Vipe-';
        return $erros;
    }

    /**
     * Envia um lote. A API atende um request por vez, então o envio é único
     * com todos os itens do lote dentro do arquivo JSON.
     *
     * @return array{enviados:int, falhas:int, mensagens:array}
     */
    public function enviar(Collection $abastecimentos): array
    {
        $resultado = ['enviados' => 0, 'falhas' => 0, 'mensagens' => []];

        if (!config('atua.habilitado', true)) {
            $resultado['mensagens'][] = 'Integração Atua desabilitada (ATUA_HABILITADO=false).';
            return $resultado;
        }
        if ($abastecimentos->isEmpty()) {
            return $resultado;
        }
        if (!config('atua.usuario') || !config('atua.senha')) {
            $resultado['mensagens'][] = 'Credenciais da Atua não configuradas (ATUA_USER/ATUA_PASS).';
            return $resultado;
        }

        $itens = [];
        $mapa = [];   // nrNota => Abastecimento

        foreach ($abastecimentos as $a) {
            $problemas = $this->validar($a);
            if ($problemas) {
                $msgProb = 'Não enviado: ' . implode(', ', $problemas);
                $a->forceFill([
                    'atua_erro' => $msgProb,
                ])->saveQuietly();
                NotificacaoCriticaService::aoFalharIntegracaoAtua($a, $msgProb);
                $resultado['falhas']++;
                $resultado['mensagens'][] = "{$a->atua_id}: " . implode(', ', $problemas);
                continue;
            }
            $itens[] = $this->montarItem($a);
            $mapa[(string) ($a->atua_nr_nota ?: $a->atua_seq)] = $a;
        }

        if (empty($itens)) {
            return $resultado;
        }

        $json = json_encode(['abastecimentos' => $itens], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        try {
            $resposta = Http::withBasicAuth(config('atua.usuario'), config('atua.senha'))
                ->connectTimeout(10)
                ->timeout($this->timeout ?: (int) config('atua.timeout', 90))
                ->attach('abastecidas', $json, 'abastecidas.json')
                ->post(config('atua.url'), [
                    'conjunto_de_dados' => 'abastecidas',
                    'cnpj'              => config('atua.cnpj_base'),
                    'layout'            => config('atua.layout', 'mais_postos'),
                ]);
        } catch (\Throwable $e) {
            $resultado['falhas'] += count($itens);
            $resultado['mensagens'][] = 'Falha de conexão: ' . $e->getMessage();
            $this->marcarErro($mapa, 'Falha de conexão: ' . $e->getMessage());
            return $resultado;
        }

        $corpo = $resposta->json();

        // Erro de negócio: {"erro":[{"desc":"..."}]}
        if (is_array($corpo) && isset($corpo['erro'])) {
            $desc = collect($corpo['erro'])->pluck('desc')->filter()->implode(' | ');
            $desc = trim(strip_tags($desc)) ?: 'Erro não especificado da Atua.';
            $this->marcarErro($mapa, $desc);
            $resultado['falhas'] += count($itens);
            $resultado['mensagens'][] = $desc;
            Log::warning('[Atua] Erro ao integrar abastecidas', ['desc' => $desc]);
            return $resultado;
        }

        if (!$resposta->successful() || !is_array($corpo)) {
            $msg = 'HTTP ' . $resposta->status() . ': ' . mb_substr((string) $resposta->body(), 0, 300);
            $this->marcarErro($mapa, $msg);
            $resultado['falhas'] += count($itens);
            $resultado['mensagens'][] = $msg;
            return $resultado;
        }

        // Sucesso: { "<cnpj>": [ { "<nrNota>": "<codigo_caixa>" } ] }
        foreach ($corpo as $lista) {
            foreach ((array) $lista as $par) {
                foreach ((array) $par as $nrNota => $caixa) {
                    $a = $mapa[(string) $nrNota] ?? null;
                    if (!$a) {
                        continue;
                    }
                    $a->forceFill([
                        'atua_caixa'      => (string) $caixa,
                        'atua_enviado_em' => now(),
                        'atua_erro'       => null,
                    ])->saveQuietly();
                    unset($mapa[(string) $nrNota]);
                    $resultado['enviados']++;
                }
            }
        }

        // Sobrou item sem retorno: a Atua ignora duplicados, então trata como já integrado.
        foreach ($mapa as $a) {
            $a->forceFill([
                'atua_enviado_em' => now(),
                'atua_erro'       => 'Sem retorno de caixa (possível duplicado já integrado).',
            ])->saveQuietly();
            $resultado['enviados']++;
        }

        return $resultado;
    }

    private function marcarErro(array $mapa, string $erro): void
    {
        foreach ($mapa as $a) {
            $msg = mb_substr($erro, 0, 1000);
            $a->forceFill(['atua_erro' => $msg])->saveQuietly();
            NotificacaoCriticaService::aoFalharIntegracaoAtua($a, $msg);
        }
    }
}
