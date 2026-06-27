<?php

require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$notas = App\Models\EntradaNota::whereNotNull('foto_nota')->where('foto_nota', 'like', '%cloudinary.com%')->count();
$abast_foto = App\Models\Abastecimento::whereNotNull('foto_odometro')->where('foto_odometro', 'like', '%cloudinary.com%')->count();
$abast_anexo = App\Models\Abastecimento::whereNotNull('anexo')->where('anexo', 'like', '%cloudinary.com%')->count();
$comprovantes = Illuminate\Support\Facades\DB::table('comprovantes_pagamento')->whereNotNull('arquivo_url')->where('arquivo_url', 'like', '%cloudinary.com%')->count();

echo "--- RELATÓRIO DO QUE FALTA MIGRAR ---\n";
echo "Entrada Notas (foto_nota): " . $notas . "\n";
echo "Abastecimentos (foto_odometro): " . $abast_foto . "\n";
echo "Abastecimentos (anexo): " . $abast_anexo . "\n";
echo "Comprovantes (arquivo_url): " . $comprovantes . "\n";
echo "Total restante: " . ($notas + $abast_foto + $abast_anexo + $comprovantes) . "\n";
