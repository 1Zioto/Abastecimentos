<?php

namespace App\Http\Controllers;

use App\Services\GoogleDriveService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

/**
 * Resumo semanal automático: coleta os números da semana fechada
 * (segunda a domingo), gera o PDF, sobe no Google Drive e envia
 * texto + documento pelo painel de WhatsApp.
 *
 * Chamado pelo cron da Vercel toda segunda-feira, protegido por
 * CRON_SECRET (query ?secret=...).
 */
class RelatorioSemanalController extends Controller
{
    public function enviar(Request $request): JsonResponse
    {
        // Autoriza via header "Authorization: Bearer <CRON_SECRET>" (padrão do
        // cron da Vercel) ou via ?secret=<CRON_SECRET> (para disparo manual).
        $secret = (string) env('CRON_SECRET', '');
        $bearer = trim(str_ireplace('Bearer ', '', (string) $request->header('Authorization', '')));
        $fornecido = $bearer !== '' ? $bearer : (string) $request->query('secret', '');
        if ($secret === '' || !hash_equals($secret, $fornecido)) {
            return new JsonResponse(['message' => 'Não autorizado.'], 403);
        }

        $token = (string) env('WHATSAPP_PANEL_TOKEN', '');
        $numeros = array_values(array_filter(array_map(
            'trim',
            explode(',', (string) env('RELATORIO_SEMANAL_NUMEROS', ''))
        )));
        if ($token === '' || empty($numeros)) {
            return new JsonResponse(['message' => 'WHATSAPP_PANEL_TOKEN/RELATORIO_SEMANAL_NUMEROS não configurados.'], 422);
        }

        $dados = $this->coletarDados();
        $texto = $this->montarTexto($dados);
        $pdfUrl = $this->gerarESubirPdf($dados);

        $painel = rtrim((string) env('WHATSAPP_PANEL_URL', 'https://vercel-panel-delta.vercel.app'), '/')
            . '/api/envios?api=1';

        // Em ambiente local Windows falta o CA bundle e o cURL rejeita o SSL;
        // na Vercel (Linux) a verificação segue ativa normalmente.
        $req = fn (int $t) => PHP_OS_FAMILY === 'Windows'
            ? Http::timeout($t)->withoutVerifying()
            : Http::timeout($t);

        $envios = [];
        foreach ($numeros as $numero) {
            $r1 = $req(60)->post($painel, [
                'token' => $token,
                'numero' => $numero,
                'mensagem' => $texto,
            ]);
            $r2 = null;
            if ($pdfUrl) {
                $r2 = $req(120)->post($painel, [
                    'token' => $token,
                    'numero' => $numero,
                    'mensagem' => 'Resumo semanal em PDF — ' . $dados['periodo']['ini'] . ' a ' . $dados['periodo']['fim'],
                    'arquivo_url' => $pdfUrl,
                    'nome_arquivo' => 'resumo_semanal.pdf',
                    'como_documento' => true,
                ]);
            }
            $envios[] = [
                'numero' => $numero,
                'texto_ok' => $r1->successful(),
                'pdf_ok' => $r2?->successful(),
            ];
        }

        return new JsonResponse([
            'message' => 'Resumo semanal processado.',
            'periodo' => $dados['periodo'],
            'pdf_url' => $pdfUrl,
            'envios' => $envios,
        ]);
    }

    private function coletarDados(): array
    {
        $fimSemana = now()->startOfWeek()->subDay();
        $iniSemana = $fimSemana->copy()->subDays(6);
        $fimAnterior = $iniSemana->copy()->subDay();
        $iniAnterior = $fimAnterior->copy()->subDays(6);

        $semana = fn ($ini, $fim) => DB::table('abastecimentos')
            ->whereNull('deleted_at')
            ->whereBetween('data', [$ini->toDateString(), $fim->toDateString()])
            ->selectRaw("
                COUNT(*) as qtde,
                COALESCE(SUM(quantidade_litros), 0) as litros,
                COALESCE(SUM(valor_total), 0) as valor,
                COALESCE(SUM(quantidade_litros) FILTER (WHERE local = 'Matriz'), 0) as litros_matriz,
                COALESCE(SUM(valor_total) FILTER (WHERE local = 'Matriz'), 0) as valor_matriz,
                COALESCE(SUM(quantidade_litros) FILTER (WHERE local = 'Viana'), 0) as litros_viana,
                COALESCE(SUM(valor_total) FILTER (WHERE local = 'Viana'), 0) as valor_viana,
                COUNT(*) FILTER (WHERE baixa_abastecimento IS TRUE) as pagos,
                COALESCE(SUM(valor_total) FILTER (WHERE baixa_abastecimento IS TRUE), 0) as valor_pago
            ")->first();

        $pend = DB::table('abastecimentos')->whereNull('deleted_at')
            ->whereRaw('baixa_abastecimento IS NOT TRUE')
            ->selectRaw('COUNT(*) as qtde, COALESCE(SUM(valor_total),0) as valor, COALESCE(SUM(quantidade_litros),0) as litros')
            ->first();

        $devedores = DB::table('abastecimentos')->whereNull('deleted_at')
            ->whereRaw('baixa_abastecimento IS NOT TRUE')
            ->selectRaw("COALESCE(nome_proprietario, 'Sem proprietário') as nome, COUNT(*) as qtde, COALESCE(SUM(valor_total),0) as valor, MIN(data) as mais_antigo")
            ->groupBy('nome')->orderByDesc('valor')->limit(10)->get();

        $esquecidos = DB::table('comprovantes_pagamento')
            ->where('status', '<>', 'aplicado')
            ->where('created_at', '<', now()->subDays(3))
            ->selectRaw('remetente_extraido, valor_extraido, status, created_at::date as desde')
            ->orderBy('created_at')->get();

        return [
            'periodo' => [
                'ini' => $iniSemana->format('d/m'),
                'fim' => $fimSemana->format('d/m/Y'),
            ],
            'atual' => (array) $semana($iniSemana, $fimSemana),
            'anterior' => (array) $semana($iniAnterior, $fimAnterior),
            'pendencias' => (array) $pend,
            'devedores' => $devedores,
            'esquecidos' => $esquecidos,
        ];
    }

    private function br($v, int $dec = 2): string
    {
        return number_format((float) $v, $dec, ',', '.');
    }

    private function pct($atual, $anterior): string
    {
        $a = (float) $atual;
        $b = (float) $anterior;
        if ($b == 0.0) return '';
        $p = ($a - $b) / $b * 100;
        return sprintf(' (%s%.1f%%)', $p >= 0 ? '+' : '', $p);
    }

    private function montarTexto(array $d): string
    {
        $at = $d['atual'];
        $an = $d['anterior'];
        $pe = $d['pendencias'];

        $linhas = [
            '📊 *Resumo Semanal — Abastecimento Vipe*',
            "Semana {$d['periodo']['ini']} a {$d['periodo']['fim']} (vs anterior)",
            '',
            '*A semana em números:*',
            "⛽ Abastecimentos: {$at['qtde']}" . $this->pct($at['qtde'], $an['qtde']),
            '🛢 Litros: ' . $this->br($at['litros']) . ' L' . $this->pct($at['litros'], $an['litros']),
            '💰 Vendido: R$ ' . $this->br($at['valor']) . $this->pct($at['valor'], $an['valor']),
            '✅ Recebido (da semana): R$ ' . $this->br($at['valor_pago']) . $this->pct($at['valor_pago'], $an['valor_pago']),
            '',
            '*Por filial:*',
            '• Matriz: ' . $this->br($at['litros_matriz']) . ' L — R$ ' . $this->br($at['valor_matriz']),
            '• Viana: ' . $this->br($at['litros_viana']) . ' L — R$ ' . $this->br($at['valor_viana']),
            '',
            "⚠️ *Pendências (acumulado):* {$pe['qtde']} em aberto = R$ " . $this->br($pe['valor']),
            '',
            '*Top 5 devedores:*',
        ];

        foreach ($d['devedores']->take(5) as $dev) {
            $antigo = substr(implode('/', array_reverse(explode('-', (string) $dev->mais_antigo))), 0, 5);
            $linhas[] = "• {$dev->nome}: R$ " . $this->br($dev->valor) . " ({$dev->qtde}x, desde {$antigo})";
        }

        $linhas[] = '';
        $linhas[] = $d['esquecidos']->isEmpty()
            ? '🧾 Comprovantes: fila em dia ✔'
            : '🧾 *' . $d['esquecidos']->count() . ' comprovante(s) aguardando há +3 dias!*';

        return implode("\n", $linhas);
    }

    private function gerarESubirPdf(array $d): ?string
    {
        try {
            $html = $this->montarHtmlPdf($d);
            $pdf = Pdf::loadHTML($html)->setPaper('a4');
            $tmp = tempnam(sys_get_temp_dir(), 'resumo_') . '.pdf';
            file_put_contents($tmp, $pdf->output());

            $drive = app(GoogleDriveService::class);
            $up = $drive->uploadComprovante(
                $tmp,
                'resumo_semanal_' . str_replace('/', '-', $d['periodo']['ini']) . '_a_' . str_replace('/', '-', $d['periodo']['fim']) . '.pdf',
                'application/pdf'
            );
            @unlink($tmp);

            $fileId = $up['file_id'] ?? $up['id'] ?? null;
            return $fileId
                ? 'https://drive.google.com/uc?export=download&id=' . $fileId
                : null;
        } catch (\Throwable $e) {
            // Sem PDF, o texto ainda é enviado.
            return null;
        }
    }

    private function montarHtmlPdf(array $d): string
    {
        $at = $d['atual'];
        $an = $d['anterior'];
        $pe = $d['pendencias'];

        $devedoresHtml = '';
        foreach ($d['devedores'] as $dev) {
            $antigo = implode('/', array_reverse(explode('-', (string) $dev->mais_antigo)));
            $devedoresHtml .= '<tr><td>' . htmlspecialchars($dev->nome) . "</td><td class='num'>{$dev->qtde}</td><td class='num'>R$ " . $this->br($dev->valor) . "</td><td class='num'>{$antigo}</td></tr>";
        }

        $esquecidosHtml = $d['esquecidos']->isEmpty()
            ? "<p class='ok'>Nenhum comprovante aguardando há mais de 3 dias — fila em dia.</p>"
            : '<p class="warn">' . $d['esquecidos']->count() . ' comprovante(s) aguardando há mais de 3 dias.</p>';

        return "<!DOCTYPE html><html><head><meta charset='utf-8'><style>
            body { font-family: DejaVu Sans, sans-serif; font-size: 11px; color: #0f172a; }
            h1 { font-size: 17px; margin-bottom: 2px; }
            .sub { color: #64748b; margin-bottom: 12px; }
            h2 { font-size: 13px; margin: 14px 0 6px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
            th { background: #0f172a; color: #fff; padding: 5px; text-align: left; font-size: 10px; }
            td { border: 0.5px solid #cbd5e1; padding: 4px 5px; }
            .num { text-align: right; }
            .devedores th { background: #b91c1c; }
            .filial th { background: #1d4ed8; }
            .ok { color: #15803d; } .warn { color: #b45309; font-weight: bold; }
        </style></head><body>
            <h1>Resumo Semanal — Abastecimento Vipe</h1>
            <div class='sub'>Semana de {$d['periodo']['ini']} a {$d['periodo']['fim']}</div>
            <h2>1. A semana em números</h2>
            <table><tr><th>Indicador</th><th>Esta semana</th><th>Semana anterior</th></tr>
            <tr><td>Abastecimentos</td><td class='num'>{$at['qtde']}" . $this->pct($at['qtde'], $an['qtde']) . "</td><td class='num'>{$an['qtde']}</td></tr>
            <tr><td>Litros vendidos</td><td class='num'>" . $this->br($at['litros']) . ' L' . $this->pct($at['litros'], $an['litros']) . "</td><td class='num'>" . $this->br($an['litros']) . " L</td></tr>
            <tr><td>Valor vendido</td><td class='num'>R$ " . $this->br($at['valor']) . $this->pct($at['valor'], $an['valor']) . "</td><td class='num'>R$ " . $this->br($an['valor']) . "</td></tr>
            <tr><td>Já recebido (da semana)</td><td class='num'>R$ " . $this->br($at['valor_pago']) . " ({$at['pagos']})</td><td class='num'>R$ " . $this->br($an['valor_pago']) . " ({$an['pagos']})</td></tr>
            </table>
            <h2>2. Por filial (semana atual)</h2>
            <table class='filial'><tr><th>Filial</th><th>Litros</th><th>Valor</th></tr>
            <tr><td>Matriz</td><td class='num'>" . $this->br($at['litros_matriz']) . " L</td><td class='num'>R$ " . $this->br($at['valor_matriz']) . "</td></tr>
            <tr><td>Viana</td><td class='num'>" . $this->br($at['litros_viana']) . " L</td><td class='num'>R$ " . $this->br($at['valor_viana']) . "</td></tr>
            </table>
            <h2>3. Pendências de baixa (acumulado)</h2>
            <p><b>{$pe['qtde']}</b> abastecimentos em aberto, somando <b>R$ " . $this->br($pe['valor']) . '</b> (' . $this->br($pe['litros']) . " L).</p>
            <h2>4. Top devedores (valor em aberto)</h2>
            <table class='devedores'><tr><th>Proprietário</th><th>Qtde</th><th>Valor em aberto</th><th>Mais antigo</th></tr>
            {$devedoresHtml}
            </table>
            <h2>5. Comprovantes aguardando há mais de 3 dias</h2>
            {$esquecidosHtml}
        </body></html>";
    }
}
