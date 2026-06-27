<?php

require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$drive = app(\App\Services\GoogleDriveService::class);

echo "Criando pasta Notas na raiz do Drive...\n";
$notasId = $drive->findOrCreateFolder('Notas', 'root');
echo "ID Notas: $notasId\n";

echo "Criando pasta Abastecimentos na raiz do Drive...\n";
$abastecimentosId = $drive->findOrCreateFolder('Abastecimentos', 'root');
echo "ID Abastecimentos: $abastecimentosId\n";

echo "Criando pasta Baixas na raiz do Drive...\n";
$baixasId = $drive->findOrCreateFolder('Baixas', 'root');
echo "ID Baixas: $baixasId\n";

echo "\nAs 3 pastas foram criadas (ou encontradas) com sucesso na raiz do seu Drive!\n";
