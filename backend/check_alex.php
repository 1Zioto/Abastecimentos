<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$abastecimentos = DB::table('abastecimentos')
    ->whereRaw('LOWER(nome_proprietario) LIKE ?', ['%alex%'])
    ->get(['id_abastecimento', 'nome_proprietario', 'foto_odometro', 'anexo']);

echo "Abastecimentos:\n";
foreach ($abastecimentos as $a) {
    echo "ID: $a->id_abastecimento, NOME: $a->nome_proprietario, ODO: $a->foto_odometro, ANEXO: $a->anexo\n";
}

$baixas = DB::table('comprovantes_pagamento')
    ->leftJoin('proprietarios', 'comprovantes_pagamento.proprietario_id', '=', 'proprietarios.id_proprietario')
    ->whereRaw('LOWER(proprietarios.nome) LIKE ?', ['%alex%'])
    ->get(['comprovantes_pagamento.id', 'proprietarios.nome', 'comprovantes_pagamento.arquivo_url']);

echo "\nComprovantes de Baixa:\n";
foreach ($baixas as $b) {
    echo "ID: $b->id, NOME: $b->nome, ARQUIVO: $b->arquivo_url\n";
}
