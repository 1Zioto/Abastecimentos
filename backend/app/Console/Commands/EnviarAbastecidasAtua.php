<?php

namespace App\Console\Commands;

use App\Services\AtuaAbastecidaService;
use Illuminate\Console\Command;

class EnviarAbastecidasAtua extends Command
{
    protected $signature = 'atua:enviar
                            {--limite= : quantos abastecimentos enviar nesta execução}
                            {--dry-run : apenas mostra o que seria enviado}';

    protected $description = 'Envia para a Atua os abastecimentos da frota VIPE ainda não integrados';

    public function handle(AtuaAbastecidaService $service): int
    {
        $limite = $this->option('limite') ? (int) $this->option('limite') : null;
        $pendentes = $service->pendentes($limite);

        if ($pendentes->isEmpty()) {
            $this->info('Nenhum abastecimento pendente de envio para a Atua.');
            return self::SUCCESS;
        }

        $this->info("Pendentes: {$pendentes->count()}");
        $this->table(
            ['ID', 'Data', 'Placa', 'Litros', 'Valor'],
            $pendentes->map(fn ($a) => [
                $a->atua_id,
                optional($a->data_hora)->format('d/m/Y H:i'),
                $a->veiculo?->placa ?? '-',
                number_format((float) $a->quantidade_litros, 2, ',', '.'),
                'R$ ' . number_format((float) $a->valor_total, 2, ',', '.'),
            ])->all()
        );

        if ($this->option('dry-run')) {
            $this->comment('[dry-run] Nada foi enviado.');
            $this->line(json_encode(
                ['abastecimentos' => $pendentes->map(fn ($a) => $service->montarItem($a))->all()],
                JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            ));
            return self::SUCCESS;
        }

        $r = $service->enviar($pendentes);

        $this->info("Enviados: {$r['enviados']} | Falhas: {$r['falhas']}");
        foreach ($r['mensagens'] as $m) {
            $this->warn($m);
        }

        return $r['falhas'] > 0 && $r['enviados'] === 0 ? self::FAILURE : self::SUCCESS;
    }
}
