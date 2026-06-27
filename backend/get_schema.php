<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$cols = \Illuminate\Support\Facades\Schema::getColumnListing('abastecimentos');
echo "Abastecimentos: " . implode(', ', $cols) . "\n";

$cols2 = \Illuminate\Support\Facades\Schema::getColumnListing('entrada_notas');
echo "Entrada_notas: " . implode(', ', $cols2) . "\n";

$cols3 = \Illuminate\Support\Facades\Schema::getColumnListing('comprovantes_pagamento');
echo "Comprovantes: " . implode(', ', $cols3) . "\n";
