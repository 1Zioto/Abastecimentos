<?php

require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$results = [];

// Checando entrada_notas
$countEntrada = DB::table('entrada_notas')
    ->where('foto_nota', 'like', '%res.cloudinary.com%')
    ->count();
if ($countEntrada > 0) {
    $results[] = "$countEntrada registros em entrada_notas (coluna foto_nota)";
}

// Checando abastecimentos (foto_odometro)
$countAbastOdometro = DB::table('abastecimentos')
    ->where('foto_odometro', 'like', '%res.cloudinary.com%')
    ->count();
if ($countAbastOdometro > 0) {
    $results[] = "$countAbastOdometro registros em abastecimentos (coluna foto_odometro)";
}

// Checando abastecimentos (anexo)
$countAbastAnexo = DB::table('abastecimentos')
    ->where('anexo', 'like', '%res.cloudinary.com%')
    ->count();
if ($countAbastAnexo > 0) {
    $results[] = "$countAbastAnexo registros em abastecimentos (coluna anexo)";
}

// Verifica se a tabela comprovantes_pagamento tem alguma coluna de arquivo (ex: comprovante, arquivo, anexo)
$hasComprovantes = \Illuminate\Support\Facades\Schema::hasTable('comprovantes_pagamento');
if ($hasComprovantes) {
    $columns = \Illuminate\Support\Facades\Schema::getColumnListing('comprovantes_pagamento');
    foreach (['comprovante', 'anexo', 'arquivo', 'foto'] as $col) {
        if (in_array($col, $columns)) {
            $count = DB::table('comprovantes_pagamento')
                ->where($col, 'like', '%res.cloudinary.com%')
                ->count();
            if ($count > 0) {
                $results[] = "$count registros em comprovantes_pagamento (coluna $col)";
            }
        }
    }
}

// Output
if (empty($results)) {
    echo "NENHUM link do Cloudinary foi encontrado no banco de dados nas tabelas principais!\n";
} else {
    echo "Foram encontrados os seguintes links do Cloudinary pendentes:\n";
    foreach ($results as $r) {
        echo "- $r\n";
    }
}
