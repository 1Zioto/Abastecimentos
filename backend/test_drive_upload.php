<?php

require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

echo "=== SPECIFIC ENTRADA_NOTA RECORD ===\n";
try {
    $nota = DB::table('entrada_notas')
        ->where('id_financeiro', 'd67aad91-077a-41ad-a1b6-7c392a164257')
        ->first();
    
    if ($nota) {
        echo "id_financeiro: " . $nota->id_financeiro . "\n";
        echo "Data: " . $nota->data . "\n";
        echo "Número NF: " . $nota->numero_nota_fiscal . "\n";
        echo "Fornecedor: " . $nota->fornecedor . "\n";
        echo "Foto Nota: " . $nota->foto_nota . "\n";
        echo "Nota IA Status: " . ($nota->nota_verificacao_status ?? 'N/A') . "\n";
        echo "Nota IA Mensagem: " . ($nota->nota_verificacao_mensagem ?? 'N/A') . "\n";
    } else {
        echo "Nota nao encontrada com esse id_financeiro!\n";
    }
} catch (\Throwable $e) {
    echo "Erro: " . $e->getMessage() . "\n";
}
