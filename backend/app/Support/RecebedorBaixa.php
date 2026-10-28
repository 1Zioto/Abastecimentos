<?php

namespace App\Support;

class RecebedorBaixa
{
    public const VIPE = 'VIPE TRANSPORTES MULTIMODAIS LTDA';
    public const AUGUSTO = 'Augusto';
    public const VIPE_AUGUSTO = 'VIPE TRANSPORTES MULTIMODAIS LTDA / Augusto';

    public static function normalizar(mixed $valor): ?string
    {
        $raw = trim((string) ($valor ?? ''));
        if ($raw === '' || strtolower($raw) === 'null') {
            return null;
        }

        $norm = self::semAcento($raw);
        $temVipe = str_contains($norm, 'vipe')
            || str_contains($norm, 'vipi')
            || str_contains($norm, 'multimodais')
            || str_contains(preg_replace('/\D+/', '', $raw) ?? '', '57312701000183');
        $temAugusto = str_contains($norm, 'augusto');

        if ($temVipe && $temAugusto) {
            return self::VIPE_AUGUSTO;
        }

        if (
            $temVipe
        ) {
            return self::VIPE;
        }

        if ($temAugusto) {
            return self::AUGUSTO;
        }

        return null;
    }

    public static function permitidos(): array
    {
        return [self::VIPE, self::AUGUSTO, self::VIPE_AUGUSTO];
    }

    private static function semAcento(string $valor): string
    {
        $valor = mb_strtolower(trim($valor), 'UTF-8');
        $trans = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $valor);
        return preg_replace('/[^a-z0-9]+/', ' ', $trans !== false ? $trans : $valor) ?? $valor;
    }
}
