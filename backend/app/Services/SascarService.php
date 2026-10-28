<?php

namespace App\Services;

use DOMDocument;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Cliente SOAP mínimo do SasIntegra (Sascar), portado do projeto de coleta.
 * Usado para buscar o odômetro mais recente de um veículo ao vivo.
 */
class SascarService
{
    private const NS = 'http://webservice.web.integracao.sascar.com.br/';

    private function endpoint(): string
    {
        return (string) config('sascar.endpoint');
    }

    public function credenciaisConfiguradas(): bool
    {
        return !empty(config('sascar.user')) && !empty(config('sascar.pass'));
    }

    /**
     * Odômetro mais recente do veículo (por placa), consultado ao vivo na Sascar.
     * Retorna ['odometro' => int, 'data_posicao' => string, 'id_veiculo' => int]
     * ou null se não houver posição com odômetro na janela consultada.
     */
    public function odometroAtualPorPlaca(string $placa): ?array
    {
        if (!$this->credenciaisConfiguradas()) {
            throw new RuntimeException('Credenciais da Sascar (SASCAR_USER/SASCAR_PASS) não configuradas no servidor.');
        }

        $idVeiculo = $this->idVeiculoPorPlaca($placa);
        if ($idVeiculo === null) {
            throw new RuntimeException("Placa {$placa} não encontrada na frota Sascar.");
        }

        $horas = max(1, (int) config('sascar.historico_horas', 24));
        $fim = new \DateTimeImmutable('now', new \DateTimeZone('America/Sao_Paulo'));
        $inicio = $fim->sub(new \DateInterval("PT{$horas}H"));
        $fmt = fn (\DateTimeImmutable $d) => $d->format('Y-m-d H:i:s');

        $posicoes = $this->soapCall('obterPacotePosicaoHistorico', [
            'usuario' => config('sascar.user'),
            'senha' => config('sascar.pass'),
            'dataInicio' => $fmt($inicio),
            'dataFinal' => $fmt($fim),
            'idVeiculo' => $idVeiculo,
        ]);

        $melhor = null;
        foreach ($posicoes as $p) {
            $odo = isset($p['odometro']) ? (float) $p['odometro'] : 0;
            $data = $p['dataPosicao'] ?? '';
            if ($odo > 0 && $data !== '') {
                if ($melhor === null || $data > $melhor['data_posicao']) {
                    $melhor = ['odometro' => (int) round($odo), 'data_posicao' => $data, 'id_veiculo' => $idVeiculo];
                }
            }
        }

        return $melhor;
    }

    /** Mapeia placa (normalizada) -> idVeiculo, com cache. */
    private function idVeiculoPorPlaca(string $placa): ?int
    {
        $alvo = $this->normalizarPlaca($placa);
        $ttl = max(60, (int) config('sascar.cache_veiculos_ttl', 1800));

        $mapa = Cache::remember('sascar:placa_idveiculo', $ttl, function () {
            $veiculos = $this->soapCall('obterVeiculos', [
                'usuario' => config('sascar.user'),
                'senha' => config('sascar.pass'),
                'quantidade' => 1000,
                'idVeiculo' => 0,
            ]);
            $mapa = [];
            foreach ($veiculos as $v) {
                $pl = $this->normalizarPlaca($v['placa'] ?? '');
                $id = isset($v['idVeiculo']) ? (int) $v['idVeiculo'] : 0;
                if ($pl !== '' && $id > 0) {
                    $mapa[$pl] = $id;
                }
            }
            return $mapa;
        });

        return $mapa[$alvo] ?? null;
    }

    private function normalizarPlaca(?string $placa): string
    {
        $p = strtoupper(trim((string) $placa));
        $p = preg_replace('/-\d+$/', '', $p);          // remove sufixo "-N"
        return preg_replace('/[^A-Z0-9]/', '', $p) ?? '';
    }

    /** Chamada SOAP com retry em erros transitórios (a própria Sascar pede refazer). */
    private function soapCall(string $method, array $params, int $tentativas = 4): array
    {
        $ultimoErro = null;
        for ($i = 0; $i < $tentativas; $i++) {
            try {
                return $this->soapCallUmaVez($method, $params);
            } catch (\Throwable $e) {
                $ultimoErro = $e;
                if ($i < $tentativas - 1 && $this->ehErroTransitorio($e->getMessage())) {
                    usleep(2_000_000 * ($i + 1));
                    continue;
                }
                throw $e;
            }
        }
        throw $ultimoErro ?? new RuntimeException('Falha desconhecida na Sascar.');
    }

    private function soapCallUmaVez(string $method, array $params): array
    {
        $body = '';
        foreach ($params as $k => $v) {
            if ($v === null || $v === '') {
                continue;
            }
            $body .= "<{$k}>" . $this->escapeXml((string) $v) . "</{$k}>";
        }

        $envelope = '<?xml version="1.0" encoding="UTF-8"?>'
            . '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="' . self::NS . '">'
            . '<soapenv:Header/><soapenv:Body>'
            . "<web:{$method}>{$body}</web:{$method}>"
            . '</soapenv:Body></soapenv:Envelope>';

        $resp = Http::withHeaders([
            'Content-Type' => 'text/xml; charset=utf-8',
            'SOAPAction' => '',
        ])->timeout(30)->withBody($envelope, 'text/xml')->post($this->endpoint());

        $texto = $resp->body();

        $dom = new DOMDocument();
        if (!@$dom->loadXML($texto)) {
            throw new RuntimeException("Resposta SOAP inválida da Sascar (HTTP {$resp->status()}).");
        }

        // Fault?
        $faults = $dom->getElementsByTagNameNS('*', 'Fault');
        if ($faults->length > 0) {
            $fs = $faults->item(0)->getElementsByTagName('faultstring');
            $msg = $fs->length > 0 ? $fs->item(0)->nodeValue : 'Fault';
            throw new RuntimeException("SasIntegra Fault: {$msg}");
        }

        // Cada <return> vira um array associativo pelos nomes locais dos filhos.
        $out = [];
        foreach ($dom->getElementsByTagNameNS('*', 'return') as $ret) {
            $item = [];
            foreach ($ret->childNodes as $child) {
                if ($child->nodeType === XML_ELEMENT_NODE) {
                    $item[$child->localName] = $child->nodeValue;
                }
            }
            if ($item) {
                $out[] = $item;
            }
        }
        return $out;
    }

    private function ehErroTransitorio(string $msg): bool
    {
        $m = mb_strtolower($msg);
        return str_contains($m, 'erro interno')
            || str_contains($m, 'refazer a chamada')
            || str_contains($m, '(14)')
            || str_contains($m, 'timeout')
            || str_contains($m, 'try again');
    }

    private function escapeXml(string $s): string
    {
        return str_replace(['&', '<', '>'], ['&amp;', '&lt;', '&gt;'], $s);
    }
}
