<?php

namespace App\Http\Controllers;

use App\Services\SascarService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Consulta ao vivo do odômetro do veículo na Sascar (SasIntegra).
 * Se a consulta ao vivo falhar ou não houver posição recente, usa o
 * último odômetro já sincronizado no banco (veiculos.odometro).
 */
class SascarController extends Controller
{
    public function odometro(Request $request, SascarService $sascar): JsonResponse
    {
        $placa = trim((string) $request->query('placa', ''));
        if ($placa === '') {
            return response()->json(['message' => 'Informe a placa do veículo.'], 422);
        }

        $sincronizado = $this->odometroSincronizado($placa);

        try {
            $res = $sascar->odometroAtualPorPlaca($placa);

            if ($res !== null) {
                return response()->json([
                    'placa' => $placa,
                    'odometro' => $res['odometro'],
                    'data_posicao' => $res['data_posicao'],
                    'fonte' => 'sascar_live',
                ]);
            }

            // Sem posição com odômetro na janela consultada -> cai para o sincronizado.
            if ($sincronizado !== null) {
                return response()->json([
                    'placa' => $placa,
                    'odometro' => $sincronizado,
                    'data_posicao' => null,
                    'fonte' => 'sincronizado',
                    'aviso' => 'Sem posição recente na Sascar; usando o último odômetro sincronizado.',
                ]);
            }

            return response()->json(['message' => 'Sem odômetro disponível para esta placa na Sascar.'], 404);
        } catch (\Throwable $e) {
            if ($sincronizado !== null) {
                return response()->json([
                    'placa' => $placa,
                    'odometro' => $sincronizado,
                    'data_posicao' => null,
                    'fonte' => 'sincronizado',
                    'aviso' => 'Consulta ao vivo indisponível; usando o último odômetro sincronizado.',
                ]);
            }
            return response()->json(['message' => 'Falha ao consultar a Sascar: ' . $e->getMessage()], 502);
        }
    }

    private function odometroSincronizado(string $placa): ?int
    {
        $normal = preg_replace('/[^A-Z0-9]/', '', preg_replace('/-\d+$/', '', strtoupper(trim($placa))) ?? '') ?? '';
        if ($normal === '') {
            return null;
        }
        $valor = DB::table('veiculos')
            ->whereNull('deleted_at')
            ->whereRaw("regexp_replace(upper(placa), '[^A-Z0-9]', '', 'g') = ?", [$normal])
            ->value('odometro');

        return $valor !== null ? (int) $valor : null;
    }
}
