<?php

use App\Http\Controllers\ComprovanteAnalysisController;
use Illuminate\Contracts\Console\Kernel;

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$controller = new ComprovanteAnalysisController();
$method = new ReflectionMethod($controller, 'buildChecks');
$method->setAccessible(true);

$expected = [
    'quantidadeLitros' => 550,
    'valorPorLitro' => 6.4,
    'valorTotal' => 3520,
    'placa' => 'MRW2H38',
];

$cases = [
    'bomba_lendo_550' => [
        'image_type' => 'bomba_fisica',
        'quantidade_litros' => 550,
        'valor_total' => null,
        'raw_text' => 'Wayne LITROS TOTAL 550',
    ],
    'bomba_lendo_55_escala_implicita' => [
        'image_type' => 'bomba_fisica',
        'quantidade_litros' => 55,
        'valor_total' => null,
        'raw_text' => 'Wayne LITROS TOTAL 55',
    ],
    'bomba_sem_leitura_clara' => [
        'image_type' => 'bomba_fisica',
        'quantidade_litros' => null,
        'valor_total' => null,
        'raw_text' => 'Wayne LITROS TOTAL',
    ],
    'imagem_preta_sem_texto' => [
        'image_type' => 'outro',
        'quantidade_litros' => null,
        'valor_total' => null,
        'raw_text' => '',
        'confidence' => 0.05,
    ],
    'recibo_papel_lendo_550' => [
        'image_type' => 'recibo_papel',
        'quantidade_litros' => 550,
        'valor_total' => null,
        'placa' => null,
        'raw_text' => 'LT 550,0',
    ],
    'recibo_divergente' => [
        'image_type' => 'recibo_papel',
        'quantidade_litros' => 680,
        'valor_total' => 4406,
        'placa' => 'OPA4572',
        'raw_text' => 'LT 680 R$ 4406 PLACA OPA4572',
    ],
];

$out = [];
foreach ($cases as $name => $found) {
    $checks = $method->invoke($controller, 'bomba', $expected, $found);
    $out[$name] = [
        'inconsistent' => collect($checks)->contains(fn ($check) => ($check['severity'] ?? '') === 'warning'),
        'checks' => $checks,
    ];
}

echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
