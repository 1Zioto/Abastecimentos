<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$countBomba = DB::table('abastecimentos')->whereRaw("bomba::text LIKE '%res.cloudinary.com%'")->count();
echo "Total de registros com cloudinary na coluna bomba: $countBomba\n";
