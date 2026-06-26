<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AppConfigController extends Controller
{
    private const ANALYSIS_ENGINE_KEY = 'abastecimento_analysis_engine';
    private const AI_ORIENTATION_KEY = 'abastecimento_ai_orientation';
    private const NOTA_FISCAL_AI_PROMPT_KEY = 'nota_fiscal_ai_prompt';
    private const ENCERRANTE_HORA_KEY = 'encerrante_bomba_hora';
    private const DEFAULT_ANALYSIS_ENGINE = 'ai';
    private const DEFAULT_ENCERRANTE_HORA = '08:00';
    private const DEFAULT_AI_ORIENTATION = <<<'TEXT'
Se nada for encontrado, tente encontrar na imagem a quantidade em litros.
Primeiro classifique a imagem: bomba/medidor mecânico, recibo/papel, odômetro ou outro.
Regra geral: compare apenas dados visíveis e legíveis. Não invente placa, preço por litro, valor total ou odômetro ausentes.
Se for bomba/medidor, compare principalmente litros/volume. Em bombas antigas, "TOTAL" pode indicar volume totalizado, não valor em reais. Considere imagem girada, cortada, empoeirada ou com visor lateral. Leia os dígitos mesmo tortos. Se o visor mostrar número sem vírgula compatível com 1 decimal implícito, normalize. Ex.: 6132 = 613,2 L.
Se for recibo/papel, compare LT/litros, R$/valor total, placa e odômetro somente quando legíveis. Compare preço unitário apenas se ele aparecer explicitamente.
Se um recibo/papel estiver anexado no campo da bomba, não marque erro por isso; use os campos legíveis para validar o abastecimento.
TEXT;
    private const DEFAULT_NOTA_FISCAL_AI_PROMPT = <<<'TEXT'
Classifique a imagem enviada no campo de nota fiscal.
Ela deve parecer uma nota fiscal, DANFE, comprovante fiscal, documento de entrada de combustível ou imagem legível de documento fiscal.
Considere fotos giradas, cortadas, com sombra ou baixa qualidade, desde que exista estrutura de documento fiscal ou dados fiscais legíveis.
Retorne como válida se houver indícios claros de documento fiscal: número da nota, emitente/destinatário, chave de acesso, DANFE, NF-e, valores, data, produtos ou quantidade.
Retorne como suspeita se a imagem for tela preta, foto sem documento, bomba de combustível, odômetro, recibo manuscrito simples, selfie, paisagem, imagem vazia ou qualquer arquivo que não pareça nota/documento fiscal.
Não exija que todos os campos estejam legíveis; o objetivo principal é validar se a imagem parece uma nota fiscal ou documento fiscal de entrada.
TEXT;

    public function abastecimentoAnalise(): JsonResponse
    {
        $this->ensureSchema();

        return new JsonResponse($this->analysisPayload());
    }

    public function updateAbastecimentoAnalise(Request $request): JsonResponse
    {
        $this->ensureSchema();

        $data = $request->validate([
            'analysis_engine' => 'required|in:ai,ocr',
            'ai_orientation' => 'nullable|string',
            'nota_fiscal_ai_prompt' => 'nullable|string',
        ]);

        DB::table('configuracoes_sistema')->updateOrInsert(
            ['chave' => self::ANALYSIS_ENGINE_KEY],
            ['valor' => $data['analysis_engine'], 'updated_at' => now()]
        );

        if (array_key_exists('ai_orientation', $data)) {
            $orientation = trim((string) ($data['ai_orientation'] ?? ''));
            DB::table('configuracoes_sistema')->updateOrInsert(
                ['chave' => self::AI_ORIENTATION_KEY],
                ['valor' => $orientation !== '' ? $orientation : self::DEFAULT_AI_ORIENTATION, 'updated_at' => now()]
            );
        }

        if (array_key_exists('nota_fiscal_ai_prompt', $data)) {
            $prompt = trim((string) ($data['nota_fiscal_ai_prompt'] ?? ''));
            DB::table('configuracoes_sistema')->updateOrInsert(
                ['chave' => self::NOTA_FISCAL_AI_PROMPT_KEY],
                ['valor' => $prompt !== '' ? $prompt : self::DEFAULT_NOTA_FISCAL_AI_PROMPT, 'updated_at' => now()]
            );
        }

        return new JsonResponse($this->analysisPayload());
    }

    private function analysisPayload(): array
    {
        $values = DB::table('configuracoes_sistema')
            ->whereIn('chave', [self::ANALYSIS_ENGINE_KEY, self::AI_ORIENTATION_KEY, self::NOTA_FISCAL_AI_PROMPT_KEY])
            ->pluck('valor', 'chave');

        $engine = (string) ($values[self::ANALYSIS_ENGINE_KEY] ?? self::DEFAULT_ANALYSIS_ENGINE);
        if (!in_array($engine, ['ai', 'ocr'], true)) {
            $engine = self::DEFAULT_ANALYSIS_ENGINE;
        }

        $orientation = trim((string) ($values[self::AI_ORIENTATION_KEY] ?? ''));
        $notaFiscalPrompt = trim((string) ($values[self::NOTA_FISCAL_AI_PROMPT_KEY] ?? ''));

        return [
            'analysis_engine' => $engine,
            'use_ai_analysis' => $engine === 'ai',
            'ai_orientation' => $orientation !== '' ? $orientation : self::DEFAULT_AI_ORIENTATION,
            'nota_fiscal_ai_prompt' => $notaFiscalPrompt !== '' ? $notaFiscalPrompt : self::DEFAULT_NOTA_FISCAL_AI_PROMPT,
        ];
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

        DB::table('configuracoes_sistema')->insertOrIgnore([
            [
                'chave' => self::ANALYSIS_ENGINE_KEY,
                'valor' => self::DEFAULT_ANALYSIS_ENGINE,
                'updated_at' => now(),
            ],
            [
                'chave' => self::AI_ORIENTATION_KEY,
                'valor' => self::DEFAULT_AI_ORIENTATION,
                'updated_at' => now(),
            ],
            [
                'chave' => self::NOTA_FISCAL_AI_PROMPT_KEY,
                'valor' => self::DEFAULT_NOTA_FISCAL_AI_PROMPT,
                'updated_at' => now(),
            ],
            [
                'chave' => self::ENCERRANTE_HORA_KEY,
                'valor' => self::DEFAULT_ENCERRANTE_HORA,
                'updated_at' => now(),
            ],
        ]);
    }
}
