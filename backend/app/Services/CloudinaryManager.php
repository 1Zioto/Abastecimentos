<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Gerencia uma POOL de contas Cloudinary com troca automática por uso.
 *
 * - A pool é montada, em ordem de prioridade, a partir das variáveis de ambiente:
 *     CLOUDINARY_URL        (índice 0 — conta principal/nova)
 *     CLOUDINARY_URL_2      (índice 1 — reserva)
 *     CLOUDINARY_URL_3 ...  (e assim por diante)
 *   Também aceita CLOUDINARY_URLS com várias URLs separadas por vírgula/linha.
 *
 * - A conta ativa é a PRIMEIRA da pool cujo uso esteja abaixo de THRESHOLD (95%).
 *   Assim, enquanto a conta nova (índice 0) estiver < 95%, ela é sempre usada;
 *   ao atingir 95%, o sistema passa automaticamente para a próxima conta livre.
 *
 * - O uso é consultado na Admin API do Cloudinary (GET /usage) no máximo a cada
 *   RECHECK_TTL segundos (30 min). A decisão é persistida em configuracoes_sistema,
 *   então uploads normais não pagam latência extra.
 *
 * - Se um upload falhar por estouro de limite, a conta é marcada como esgotada
 *   na hora e o upload é repetido na próxima conta da pool.
 */
class CloudinaryManager
{
    /** Troca de conta quando o uso atinge/ultrapassa este percentual (0–1). */
    private const THRESHOLD = 0.95;

    /** Intervalo mínimo entre consultas de uso à Admin API (segundos). */
    private const RECHECK_TTL = 1800; // 30 minutos

    private const KEY_INDEX   = 'cloudinary_active_index';
    private const KEY_CHECKED = 'cloudinary_usage_checked_at';
    private const KEY_USAGE   = 'cloudinary_usage_cache';

    /**
     * Faz upload de um arquivo para a conta ativa, com failover automático.
     *
     * @param string $fileBytes        Conteúdo binário do arquivo.
     * @param string $originalName      Nome original (apenas informativo p/ Cloudinary).
     * @param string $folder            Pasta de destino no Cloudinary.
     * @return array{id:?string,downloadUrl:?string,account:string,bytes:int}
     */
    public function upload(string $fileBytes, string $originalName, string $folder): array
    {
        $accounts = $this->accounts();
        if (empty($accounts)) {
            throw new \RuntimeException('Nenhuma conta Cloudinary configurada (CLOUDINARY_URL).');
        }

        $startIndex = $this->activeIndex();
        $tentativas = count($accounts);
        $ultimoErro = null;

        // Tenta a conta ativa e, em caso de estouro de limite/erro, as seguintes.
        for ($i = 0; $i < $tentativas; $i++) {
            $index = ($startIndex + $i) % count($accounts);
            $conta = $accounts[$index];

            try {
                $resultado = $this->enviarParaConta($conta, $fileBytes, $originalName, $folder);
                $resultado['account'] = $conta['cloud'];
                // Sucesso: fixa esta conta como ativa para os próximos uploads.
                if ($index !== $startIndex) {
                    $this->setActiveIndex($index);
                }
                return $resultado;
            } catch (\Throwable $e) {
                $ultimoErro = $e;
                // Se foi estouro de limite, marca esta conta como esgotada e segue.
                if ($this->ehErroDeLimite($e->getMessage())) {
                    $this->marcarEsgotada($index, $accounts);
                    continue;
                }
                // Outro erro (rede, arquivo etc.): também tenta a próxima conta.
                continue;
            }
        }

        throw new \RuntimeException(
            'Falha ao enviar para todas as contas Cloudinary da pool. Último erro: '
            . ($ultimoErro ? $ultimoErro->getMessage() : 'desconhecido')
        );
    }

    /**
     * Baixa um ativo de qualquer conta configurada na pool.
     * Tenta primeiro a URL pública e usa a API assinada quando a conta bloqueia
     * a entrega direta de PDFs/ZIPs.
     *
     * @return array{body:string,contentType:string,filename:string,bytes:int}
     */
    public function download(string $url): array
    {
        $asset = $this->parseAssetUrl($url);

        $publicResponse = null;
        try {
            $req = Http::connectTimeout(10)->timeout(35);
            if (PHP_OS_FAMILY === 'Windows') {
                $req = $req->withoutVerifying();
            }
            $publicResponse = $req->get($url);
        } catch (\Throwable) {
            // Falhas de rede/TLS na entrega publica nao devem impedir o
            // fallback autenticado para a conta Cloudinary correspondente.
        }

        if ($publicResponse?->successful()) {
            return $this->downloadResult($publicResponse, $asset['filename']);
        }

        $conta = collect($this->accounts())
            ->first(fn (array $item) => $item['cloud'] === $asset['cloud']);
        if (!$conta) {
            throw new \RuntimeException(
                "A conta Cloudinary {$asset['cloud']} não está configurada na pool."
            );
        }

        $timestamp = time();
        $params = [
            'attachment' => 'true',
            'format' => $asset['format'],
            'public_id' => $asset['publicId'],
            'timestamp' => (string) $timestamp,
            'type' => $asset['deliveryType'],
        ];
        ksort($params);
        $toSign = collect($params)->map(fn ($value, $key) => $key . '=' . $value)->implode('&');
        $params['api_key'] = $conta['key'];
        $params['signature'] = sha1($toSign . $conta['secret']);

        $req = Http::connectTimeout(10)->timeout(35);
        if (PHP_OS_FAMILY === 'Windows') {
            $req = $req->withoutVerifying();
        }

        $signedResponse = $req->get(
            "https://api.cloudinary.com/v1_1/{$asset['cloud']}/{$asset['resourceType']}/download",
            $params
        );

        if (!$signedResponse->successful()) {
            throw new \RuntimeException(
                'Falha ao baixar arquivo do Cloudinary: HTTP ' . $signedResponse->status()
            );
        }

        return $this->downloadResult($signedResponse, $asset['filename']);
    }

    /**
     * Retorna o índice da conta ativa, reavaliando o uso quando o cache expira.
     */
    public function activeIndex(): int
    {
        $this->ensureTable();
        $accounts = $this->accounts();
        if (empty($accounts)) {
            return 0;
        }

        $index     = (int) ($this->getConfig(self::KEY_INDEX) ?? 0);
        $checkedAt = (int) ($this->getConfig(self::KEY_CHECKED) ?? 0);
        $index     = max(0, min($index, count($accounts) - 1));

        $expirado = (time() - $checkedAt) >= self::RECHECK_TTL;
        if ($expirado) {
            $index = $this->reavaliar($accounts);
        }

        return $index;
    }

    /**
     * Reavalia toda a pool: escolhe a PRIMEIRA conta abaixo do limite.
     * Persiste o índice escolhido, o cache de uso e o timestamp.
     */
    public function reavaliar(?array $accounts = null): int
    {
        $this->ensureTable();
        $accounts = $accounts ?? $this->accounts();
        if (empty($accounts)) {
            return 0;
        }

        $usoCache  = [];
        $escolhido = null;

        foreach ($accounts as $idx => $conta) {
            $pct = $this->consultarUsoPercentual($conta);
            $usoCache[$conta['cloud']] = $pct;
            // pct === null => não foi possível consultar; tratamos como utilizável.
            if ($escolhido === null && ($pct === null || $pct < self::THRESHOLD)) {
                $escolhido = $idx;
                // Não interrompe o loop: ainda coletamos o uso das demais p/ status,
                // mas só consultamos as necessárias para decidir + as já vistas.
                // Para economizar chamadas, paramos aqui se a conta está claramente OK.
                if ($pct !== null && $pct < self::THRESHOLD) {
                    break;
                }
            }
        }

        // Se todas estouraram, usa a última (menos pior) para não travar uploads.
        if ($escolhido === null) {
            $escolhido = count($accounts) - 1;
        }

        $this->setConfig(self::KEY_INDEX, (string) $escolhido);
        $this->setConfig(self::KEY_CHECKED, (string) time());
        $this->setConfig(self::KEY_USAGE, json_encode($usoCache, JSON_UNESCAPED_SLASHES));

        return $escolhido;
    }

    /**
     * Retorna um panorama do uso de todas as contas (para endpoint de status).
     */
    public function status(): array
    {
        $this->ensureTable();
        $accounts = $this->accounts();
        $ativo    = $this->activeIndex();

        $contas = [];
        foreach ($accounts as $idx => $conta) {
            $pct = $this->consultarUsoPercentual($conta);
            $contas[] = [
                'index'        => $idx,
                'cloud_name'   => $conta['cloud'],
                'uso_percent'  => $pct === null ? null : round($pct * 100, 2),
                'acima_limite' => $pct !== null && $pct >= self::THRESHOLD,
                'ativa'        => $idx === $ativo,
            ];
        }

        return [
            'threshold_percent' => self::THRESHOLD * 100,
            'recheck_ttl_seg'   => self::RECHECK_TTL,
            'conta_ativa_index' => $ativo,
            'conta_ativa_cloud' => $accounts[$ativo]['cloud'] ?? null,
            'contas'            => $contas,
        ];
    }

    // ─────────────────────────────────────────────────────────────
    // Internos
    // ─────────────────────────────────────────────────────────────

    private function setActiveIndex(int $index): void
    {
        $this->setConfig(self::KEY_INDEX, (string) $index);
        // Não mexe no checked_at: a reavaliação periódica continua valendo.
    }

    /**
     * Marca uma conta como esgotada agora (força avanço para a próxima) e
     * grava no cache de uso 100% para refletir no status.
     */
    private function marcarEsgotada(int $index, array $accounts): void
    {
        $proximo = min($index + 1, count($accounts) - 1);
        $this->setConfig(self::KEY_INDEX, (string) $proximo);
        // Zera o TTL para forçar reavaliação completa no próximo ciclo.
        $this->setConfig(self::KEY_CHECKED, '0');

        $usoCache = json_decode((string) $this->getConfig(self::KEY_USAGE), true) ?: [];
        if (isset($accounts[$index]['cloud'])) {
            $usoCache[$accounts[$index]['cloud']] = 1.0;
        }
        $this->setConfig(self::KEY_USAGE, json_encode($usoCache, JSON_UNESCAPED_SLASHES));
    }

    private function ehErroDeLimite(string $mensagem): bool
    {
        $m = strtolower($mensagem);
        foreach (['limit', 'quota', 'usage', 'exceed', 'plan', '420', 'rate'] as $needle) {
            if (str_contains($m, $needle)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Consulta o uso da conta via Admin API e retorna a maior fração (0–1)
     * entre as métricas relevantes; null se não foi possível consultar.
     */
    private function consultarUsoPercentual(array $conta): ?float
    {
        try {
            $resp = Http::connectTimeout(8)
                ->timeout(15)
                ->withBasicAuth($conta['key'], $conta['secret'])
                ->get("https://api.cloudinary.com/v1_1/{$conta['cloud']}/usage");

            if (!$resp->successful()) {
                return null;
            }

            $json = $resp->json() ?? [];
            $percentuais = [];

            // Modelo novo baseado em créditos.
            if (isset($json['credits']) && is_array($json['credits'])) {
                $c = $json['credits'];
                if (isset($c['used_percent'])) {
                    $percentuais[] = (float) $c['used_percent'] / 100.0;
                } elseif (isset($c['usage'], $c['limit']) && (float) $c['limit'] > 0) {
                    $percentuais[] = (float) $c['usage'] / (float) $c['limit'];
                }
            }

            // Modelo legado: métricas separadas.
            foreach (['storage', 'bandwidth', 'transformations', 'objects', 'requests'] as $metrica) {
                if (!isset($json[$metrica]) || !is_array($json[$metrica])) {
                    continue;
                }
                $m = $json[$metrica];
                if (isset($m['used_percent'])) {
                    $percentuais[] = (float) $m['used_percent'] / 100.0;
                } elseif (isset($m['usage'], $m['limit']) && (float) $m['limit'] > 0) {
                    $percentuais[] = (float) $m['usage'] / (float) $m['limit'];
                }
            }

            if (empty($percentuais)) {
                return null;
            }

            return max($percentuais);
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Upload assinado para uma conta específica.
     *
     * @return array{id:?string,downloadUrl:?string,bytes:int}
     */
    private function enviarParaConta(array $conta, string $fileBytes, string $originalName, string $folder): array
    {
        $timestamp = time();
        $publicId  = (string) Str::uuid();

        $signatureData = [
            'folder'    => $folder,
            'public_id' => $publicId,
            'timestamp' => (string) $timestamp,
        ];
        ksort($signatureData);
        $toSign = collect($signatureData)->map(fn ($v, $k) => $k . '=' . $v)->implode('&');
        $signature = sha1($toSign . $conta['secret']);

        $response = Http::connectTimeout(10)
            ->timeout(30)
            ->attach('file', $fileBytes, $originalName !== '' ? $originalName : 'arquivo')
            ->post("https://api.cloudinary.com/v1_1/{$conta['cloud']}/auto/upload", [
                'api_key'   => $conta['key'],
                'timestamp' => $timestamp,
                'signature' => $signature,
                'public_id' => $publicId,
                'folder'    => $folder,
            ]);

        if (!$response->successful()) {
            throw new \RuntimeException('Falha no Cloudinary: ' . $response->body());
        }

        $json = $response->json() ?? [];
        $url  = $json['secure_url'] ?? ($json['url'] ?? null);

        return [
            'id'          => $json['public_id'] ?? null,
            'downloadUrl' => $url,
            'bytes'       => (int) ($json['bytes'] ?? 0),
        ];
    }

    /** @return array{cloud:string,resourceType:string,deliveryType:string,publicId:string,format:string,filename:string} */
    private function parseAssetUrl(string $url): array
    {
        $parsed = parse_url(trim($url));
        $host = strtolower((string) ($parsed['host'] ?? ''));
        if ($host !== 'res.cloudinary.com') {
            throw new \InvalidArgumentException('Somente URLs do Cloudinary são permitidas.');
        }

        $segments = array_values(array_filter(explode('/', trim((string) ($parsed['path'] ?? ''), '/'))));
        if (count($segments) < 5) {
            throw new \InvalidArgumentException('URL do Cloudinary inválida.');
        }

        [$cloud, $resourceType, $deliveryType] = array_slice($segments, 0, 3);
        if (!in_array($resourceType, ['image', 'video', 'raw'], true)
            || !in_array($deliveryType, ['upload', 'private', 'authenticated'], true)) {
            throw new \InvalidArgumentException('Tipo de ativo Cloudinary não suportado.');
        }

        $versionIndex = null;
        foreach ($segments as $index => $segment) {
            if ($index >= 3 && preg_match('/^v\d+$/', $segment)) {
                $versionIndex = $index;
                break;
            }
        }
        $assetSegments = $versionIndex === null
            ? array_slice($segments, 3)
            : array_slice($segments, $versionIndex + 1);
        $assetPath = rawurldecode(implode('/', $assetSegments));
        $format = strtolower((string) pathinfo($assetPath, PATHINFO_EXTENSION));
        $publicId = $format === ''
            ? $assetPath
            : substr($assetPath, 0, -(strlen($format) + 1));
        if ($publicId === '' || $format === '') {
            throw new \InvalidArgumentException('Identificador do ativo Cloudinary inválido.');
        }

        return [
            'cloud' => $cloud,
            'resourceType' => $resourceType,
            'deliveryType' => $deliveryType,
            'publicId' => $publicId,
            'format' => $format,
            'filename' => basename($assetPath),
        ];
    }

    private function downloadResult($response, string $filename): array
    {
        $body = $response->body();
        return [
            'body' => $body,
            'contentType' => $response->header('Content-Type') ?: 'application/octet-stream',
            'filename' => $filename,
            'bytes' => strlen($body),
        ];
    }

    /**
     * Monta a pool de contas a partir das variáveis de ambiente, em ordem.
     *
     * @return array<int,array{raw:string,cloud:string,key:string,secret:string}>
     */
    private function accounts(): array
    {
        $urls = [];

        // 1) Lista única (CLOUDINARY_URLS) separada por vírgula ou quebra de linha.
        $lista = (string) env('CLOUDINARY_URLS', '');
        if (trim($lista) !== '') {
            foreach (preg_split('/[\r\n,]+/', $lista) as $u) {
                $u = trim($u);
                if ($u !== '') {
                    $urls[] = $u;
                }
            }
        }

        // 2) Variáveis numeradas: CLOUDINARY_URL, CLOUDINARY_URL_2, ... _10.
        $principal = trim((string) env('CLOUDINARY_URL', ''));
        if ($principal !== '') {
            $urls[] = $principal;
        }
        for ($i = 2; $i <= 10; $i++) {
            $extra = trim((string) env('CLOUDINARY_URL_' . $i, ''));
            if ($extra !== '') {
                $urls[] = $extra;
            }
        }

        // Deduplica preservando ordem.
        $urls = array_values(array_unique($urls));

        $accounts = [];
        foreach ($urls as $url) {
            $parsed = parse_url($url);
            $cloud  = $parsed['host'] ?? '';
            $key    = isset($parsed['user']) ? urldecode($parsed['user']) : '';
            $secret = isset($parsed['pass']) ? urldecode($parsed['pass']) : '';
            if ($cloud !== '' && $key !== '' && $secret !== '') {
                $accounts[] = [
                    'raw'    => $url,
                    'cloud'  => $cloud,
                    'key'    => $key,
                    'secret' => $secret,
                ];
            }
        }

        return $accounts;
    }

    // ── Persistência em configuracoes_sistema ──────────────────────

    private function ensureTable(): void
    {
        DB::statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS configuracoes_sistema (
                chave VARCHAR(120) PRIMARY KEY,
                valor TEXT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        SQL);
    }

    private function getConfig(string $chave): ?string
    {
        $valor = DB::table('configuracoes_sistema')->where('chave', $chave)->value('valor');
        return $valor === null ? null : (string) $valor;
    }

    private function setConfig(string $chave, string $valor): void
    {
        DB::table('configuracoes_sistema')->updateOrInsert(
            ['chave' => $chave],
            ['valor' => $valor, 'updated_at' => now()]
        );
    }
}
