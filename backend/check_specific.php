<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$id = '00287578-9573-4dd6-9601-5021073a8d1a';
$abastecimento = DB::table('abastecimentos')->where('id_abastecimento', $id)->first();
echo "Registro encontrado:\n";
print_r($abastecimento);

$countJsonb = DB::table('abastecimentos')->whereRaw("anexo::text LIKE '%res.cloudinary.com%'")->count();
echo "\nTotal de registros com cloudinary na coluna anexo (jsonb): $countJsonb\n";

$countOdo = DB::table('abastecimentos')->whereRaw("foto_odometro::text LIKE '%res.cloudinary.com%'")->count();
echo "Total de registros com cloudinary na coluna foto_odometro (jsonb): $countOdo\n";

$countNotas = DB::table('entrada_notas')->whereRaw("foto_nota::text LIKE '%res.cloudinary.com%'")->count();
echo "Total de registros com cloudinary em entrada_notas (jsonb): $countNotas\n";

$countBaixas = DB::table('comprovantes_pagamento')->whereRaw("arquivo_url::text LIKE '%res.cloudinary.com%'")->count();
echo "Total de registros com cloudinary em baixas (jsonb): $countBaixas\n";
