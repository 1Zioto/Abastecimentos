<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\Rule;

class ComprovanteAnalysisController extends Controller
{
    public function analyze(Request $request): JsonResponse
    {
        $data = $request->validate([
            'image_url' => 'required|string',
            'kind' => ['required', Rule::in(['odometro', 'bomba'])],
            'expected' => 'nullable|array',
            'expected.odometro' => 'nullable|numeric',
            'expected.quantidadeLitros' => 'nullable|numeric',
            'expected.valorPorLitro' => 'nullable|numeric',
            'expected.valorTotal' => 'nullable|numeric',
            'expected.placa' => 'nullable|string',
            'ai_orientation' => 'nullable|string|max:3000',
        ]);

        $expected = $data['expected'] ?? [];
        $kind = (string) $data['kind'];
        $aiOrientation = trim((string) ($data['ai_orientation'] ?? ''));
        return new JsonResponse($this->analyzeImage(
            (string) $data['image_url'],
            $kind,
            $expected,
            $aiOrientation !== '' ? $aiOrientation : $this->globalAiOrientation()
        ));
    }

    public function analyzeImage(string $imageUrl, string $kind, array $expected, string $aiOrientation = ''): array
    {
        if ($this->globalAnalysisEngine() !== 'ai') {
            return [
                'kind' => $kind,
                'engine' => 'ocr',
                'text' => '',
                'numbers' => [],
                'extracted' => ['image_type' => null],
                'checks' => [[
                    'field' => 'analysis_engine',
                    'severity' => 'info',
                    'message' => 'Análise por IA desativada na configuração global.',
                ]],
                'inconsistent' => false,
            ];
        }

        $apiKey = (string) env('OPENAI_API_KEY', '');
        if ($apiKey === '') {
            throw new HttpResponseException(new JsonResponse([
                'message' => 'OPENAI_API_KEY não configurada no backend.',
            ], 422));
        }

        $aiOrientation = trim($aiOrientation) !== '' ? $aiOrientation : $this->globalAiOrientation();
        $json = $this->callOpenAi($apiKey, $imageUrl, $kind, $expected, $aiOrientation);
        $checks = $this->buildChecks($kind, $expected, $json);

        return [
            'kind' => $kind,
            'engine' => 'ai',
            'text' => (string) ($json['raw_text'] ?? ''),
            'numbers' => [],
            'extracted' => $json,
            'checks' => $checks,
            'inconsistent' => collect($checks)->contains(fn ($check) => ($check['severity'] ?? '') === 'warning'),
        ];
    }

    private function callOpenAi(string $apiKey, string $imageUrl, string $kind, array $expected, string $aiOrientation): array
    {
        $prompt = <<<PROMPT
Analise a imagem de comprovante/foto de abastecimento enviada.
Retorne apenas JSON válido, sem markdown.
Campos esperados:
- image_type: "bomba_fisica", "recibo_papel", "odometro" ou "outro"
- odometro: número ou null
- quantidade_litros: número ou null
- valor_por_litro: número ou null
- valor_total: número ou null
- placa: texto ou null
- raw_text: resumo curto do que conseguiu ler
- confidence: número de 0 a 1

Regras importantes:
- Se tipo_imagem=bomba, primeiro classifique se a imagem é uma bomba física/medidor mecânico ou um recibo/papel.
- Em bomba física, compare principalmente a quantidade de litros/volume. Não invente valor por litro, valor total em reais ou placa se eles não aparecem.
- Em bomba física antiga, palavras como TOTAL podem indicar totalizador/volume da bomba, não valor monetário.
- A imagem pode estar girada, torta, cortada, empoeirada ou com visor mecânico. Leia os dígitos mesmo quando estiverem de lado.
- Se o visor mostrar um número sem vírgula mas compatível com o esperado com escala implícita, normalize para o valor provável. Exemplos: 6132 pode representar 613.2; 55 pode representar 550 quando o esperado está perto de 550.
- Em recibo/papel, compare LT/litros, R$/valor total, placa e odômetro quando estiverem legíveis. Só preencha valor_por_litro se houver preço unitário explícito.
- Se a imagem for recibo/papel anexado no campo de bomba, não trate como erro por si só; use os campos legíveis para comparação.
- Para tipo_imagem=bomba, a quantidade_litros é obrigatória: se a imagem estiver preta, vazia, sabotada, sem texto/números, ou sem leitura confiável de litros/volume, retorne quantidade_litros=null, confidence baixo e raw_text explicando que não há leitura.
- Para recibo/papel anexado no campo de bomba, procure LT/litros/quantidade e compare com a quantidade lançada. Se não houver número de litros legível, isso deve ser tratado como inconsistência.
- Não marque como divergência apenas porque placa, preço ou valor total não aparecem na imagem. Mas para anexo de bomba, ausência de litros/volume legível é divergência.

Contexto para comparação:
tipo_imagem={$kind}
esperado_json=
PROMPT;

        $prompt .= json_encode($expected, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if ($aiOrientation !== '') {
            $prompt .= "\n\nOrientação operacional configurada pelo sistema:\n" . $aiOrientation;
        }

        $response = Http::withToken($apiKey)
            ->connectTimeout(10)
            ->timeout(45)
            ->post('https://api.openai.com/v1/chat/completions', [
                'model' => (string) env('OPENAI_MODEL', 'gpt-4o-mini'),
                'response_format' => ['type' => 'json_object'],
                'messages' => [[
                    'role' => 'user',
                    'content' => [
                        ['type' => 'text', 'text' => $prompt],
                        ['type' => 'image_url', 'image_url' => ['url' => $imageUrl]],
                    ],
                ]],
            ]);

        if (!$response->successful()) {
            throw new HttpResponseException(new JsonResponse([
                'message' => 'Falha ao analisar comprovante com IA.',
                'error' => $response->body(),
            ], 502));
        }

        $content = $response->json('choices.0.message.content');
        $decoded = is_string($content) ? json_decode($content, true) : null;
        if (!is_array($decoded)) {
            throw new HttpResponseException(new JsonResponse([
                'message' => 'IA retornou uma resposta inválida.',
            ], 502));
        }

        return $decoded;
    }

    private function globalAnalysisEngine(): string
    {
        try {
            $value = DB::table('configuracoes_sistema')
                ->where('chave', 'abastecimento_analysis_engine')
                ->value('valor');
        } catch (\Throwable) {
            return 'ai';
        }

        return $value === 'ocr' ? 'ocr' : 'ai';
    }

    private function globalAiOrientation(): string
    {
        try {
            return trim((string) DB::table('configuracoes_sistema')
                ->where('chave', 'abastecimento_ai_orientation')
                ->value('valor'));
        } catch (\Throwable) {
            return '';
        }
    }

    private function buildChecks(string $kind, array $expected, array $found): array
    {
        if ($kind === 'odometro') {
            return [$this->compare(
                'odometro',
                'odômetro',
                $this->num($expected['odometro'] ?? null),
                $this->num($found['odometro'] ?? null),
                fn (float $expected) => max(2, round($expected * 0.001)),
                0
            )];
        }

        $checks = [];
        $imageType = (string) ($found['image_type'] ?? '');
        $rawText = (string) ($found['raw_text'] ?? '');
        $confidence = $this->num($found['confidence'] ?? null);
        $isPhysicalPump = $kind === 'bomba'
            && ($this->isPhysicalPumpImage($imageType) || $this->looksPhysicalPump($rawText));
        $litrosEsperado = $this->num($expected['quantidadeLitros'] ?? null);
        $litrosEncontrado = $this->scaledNumberForExpected(
            $this->num($found['quantidade_litros'] ?? null),
            $litrosEsperado
        );

        if ($kind === 'bomba' && $litrosEsperado !== null && $litrosEncontrado === null) {
            $message = trim($rawText) === ''
                ? 'Imagem sem texto ou números legíveis. Anexe uma foto da bomba ou recibo/papel com os litros visíveis.'
                : 'Não encontrei litros/volume claro na imagem. Anexe uma foto da bomba ou recibo/papel com a quantidade abastecida legível.';

            if ($confidence !== null && $confidence < 0.35) {
                $message = 'Leitura da imagem com baixa confiança. ' . $message;
            }

            $checks[] = [
                'field' => 'quantidade_litros',
                'expected' => $litrosEsperado,
                'found' => null,
                'severity' => 'warning',
                'message' => $message,
            ];
        } elseif ($kind === 'bomba' && $litrosEsperado !== null) {
            $checks[] = $this->compare(
                'quantidade_litros',
                'litros',
                $litrosEsperado,
                $litrosEncontrado,
                fn (float $expected) => max(0.5, $expected * 0.01),
                2,
                true
            );
        }

        if ($isPhysicalPump) {
            $checks[] = [
                'field' => 'tipo_imagem',
                'expected' => 'bomba_fisica',
                'found' => $imageType ?: 'bomba_fisica',
                'severity' => 'info',
                'message' => 'Imagem classificada como bomba física; preço por litro e valor total só serão comparados se estiverem visíveis.',
            ];

            // Em bomba física antiga, "TOTAL" normalmente é totalizador/volume.
            // Para evitar falso positivo, preço e valor total não geram inconsistência.
        } else {
            if ($this->num($found['valor_por_litro'] ?? null) !== null) {
                $checks[] = $this->compare(
                    'valor_por_litro',
                    'valor por litro',
                    $this->num($expected['valorPorLitro'] ?? null),
                    $this->num($found['valor_por_litro'] ?? null),
                    fn (float $_expected) => 0.08,
                    3,
                    false
                );
            }

            $checks[] = $this->compare(
                'valor_total',
                'valor total',
                $this->num($expected['valorTotal'] ?? null),
                $this->num($found['valor_total'] ?? null),
                fn (float $expected) => max(1, $expected * 0.015),
                2,
                false
            );
        }

        $placaEsperada = trim((string) ($expected['placa'] ?? ''));
        $placaLida = trim((string) ($found['placa'] ?? ''));
        if ($placaEsperada !== '' && $placaLida !== '') {
            $checks[] = [
                'field' => 'placa',
                'expected' => $placaEsperada,
                'found' => $placaLida,
                'severity' => $this->normalizePlate($placaEsperada) === $this->normalizePlate($placaLida) ? 'info' : 'warning',
                'message' => $this->normalizePlate($placaEsperada) === $this->normalizePlate($placaLida)
                    ? "Placa compatível: {$placaLida}."
                    : "Possível divergência na placa: lançada {$placaEsperada}, IA leu {$placaLida}.",
            ];
        }

        return $checks;
    }

    private function compare(string $field, string $label, ?float $expected, ?float $found, callable $tolerance, int $digits, bool $warnWhenMissing = true): array
    {
        if ($expected === null) {
            return [
                'field' => $field,
                'expected' => null,
                'found' => $found,
                'severity' => 'info',
                'message' => "IA leu {$label}, mas o campo ainda não foi informado para comparação.",
            ];
        }

        if ($found === null) {
            return [
                'field' => $field,
                'expected' => $expected,
                'found' => null,
                'severity' => $warnWhenMissing ? 'warning' : 'info',
                'message' => "Não encontrei {$label} claro na imagem; confira manualmente se necessário.",
            ];
        }

        $limit = (float) $tolerance($expected);
        if (abs($found - $expected) <= $limit) {
            return [
                'field' => $field,
                'expected' => $expected,
                'found' => $found,
                'severity' => 'info',
                'message' => ucfirst($label) . ' compatível: ' . $this->formatNumber($found, $digits) . '.',
            ];
        }

        return [
            'field' => $field,
            'expected' => $expected,
            'found' => $found,
            'severity' => 'warning',
            'message' => 'Possível divergência em ' . $label . ': lançado ' . $this->formatNumber($expected, $digits) . ', IA leu ' . $this->formatNumber($found, $digits) . '.',
        ];
    }

    private function num(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }
        return is_numeric($value) ? (float) $value : null;
    }

    private function scaledNumberForExpected(?float $value, ?float $expected): ?float
    {
        if ($value === null || $expected === null || $expected <= 0) {
            return $value;
        }

        $candidates = array_unique([
            $value,
            $value * 10,
            $value * 100,
            $value / 10,
            $value / 100,
        ]);

        $maxAllowed = max($expected * 5, $expected + 500);
        $candidates = array_values(array_filter(
            $candidates,
            fn ($candidate) => is_numeric($candidate) && $candidate >= 0 && $candidate <= $maxAllowed
        ));

        usort($candidates, fn ($a, $b) => abs($a - $expected) <=> abs($b - $expected));
        return empty($candidates) ? $value : (float) $candidates[0];
    }

    private function formatNumber(float $value, int $digits): string
    {
        return number_format($value, $digits, ',', '.');
    }

    private function normalizePlate(string $value): string
    {
        return preg_replace('/[^A-Z0-9]/', '', strtoupper($value)) ?? '';
    }

    private function isPhysicalPumpImage(string $imageType): bool
    {
        $normalized = strtolower(trim($imageType));
        return in_array($normalized, ['bomba_fisica', 'bomba', 'pump', 'fuel_pump', 'medidor'], true);
    }

    private function looksPhysicalPump(string $rawText): bool
    {
        $normalized = strtolower($rawText);
        $hasPumpWords = str_contains($normalized, 'wayne')
            || str_contains($normalized, 'litros')
            || str_contains($normalized, 'medidor')
            || str_contains($normalized, 'bomba');

        $hasReceiptWords = str_contains($normalized, 'placa')
            || str_contains($normalized, 'mot:')
            || str_contains($normalized, 'motorista')
            || str_contains($normalized, 'r$');

        return $hasPumpWords && !$hasReceiptWords;
    }
}
