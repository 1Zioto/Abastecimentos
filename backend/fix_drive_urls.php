<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

// Abastecimentos
$abastecimentos = DB::table('abastecimentos')->whereRaw("anexo::text LIKE '%uc?id=%'")
    ->orWhereRaw("foto_odometro::text LIKE '%uc?id=%'")
    ->orWhereRaw("bomba::text LIKE '%uc?id=%'")
    ->get();

foreach ($abastecimentos as $abast) {
    $updates = [];
    if (str_contains((string)$abast->anexo, 'uc?id=')) {
        $updates['anexo'] = str_replace('uc?id=', 'uc?export=view&id=', $abast->anexo);
    }
    if (str_contains((string)$abast->foto_odometro, 'uc?id=')) {
        $updates['foto_odometro'] = str_replace('uc?id=', 'uc?export=view&id=', $abast->foto_odometro);
    }
    if (str_contains((string)$abast->bomba, 'uc?id=')) {
        $updates['bomba'] = str_replace('uc?id=', 'uc?export=view&id=', $abast->bomba);
    }
    if (!empty($updates)) {
        DB::table('abastecimentos')->where('id_abastecimento', $abast->id_abastecimento)->update($updates);
    }
}

// Entrada Notas
$notas = DB::table('entrada_notas')->whereRaw("foto_nota::text LIKE '%uc?id=%'")->get();
foreach ($notas as $nota) {
    $updates = [];
    if (str_contains((string)$nota->foto_nota, 'uc?id=')) {
        $updates['foto_nota'] = str_replace('uc?id=', 'uc?export=view&id=', $nota->foto_nota);
        DB::table('entrada_notas')->where('id_financeiro', $nota->id_financeiro)->update($updates);
    }
}

// Comprovantes Pagamento
$comprovantes = DB::table('comprovantes_pagamento')->where('arquivo_url', 'like', '%uc?id=%')->get();
foreach ($comprovantes as $comp) {
    $updates = [];
    if (str_contains((string)$comp->arquivo_url, 'uc?id=')) {
        $updates['arquivo_url'] = str_replace('uc?id=', 'uc?export=view&id=', $comp->arquivo_url);
        DB::table('comprovantes_pagamento')->where('id', $comp->id)->update($updates);
    }
}

echo "URLs atualizadas com sucesso usando PHP!\n";
