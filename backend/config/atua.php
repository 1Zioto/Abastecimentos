<?php

return [
    // Endpoint da API Abastecidas (Atua / Mais Frete)
    'url' => env('ATUA_URL', 'https://consulta.maisfrete.com.br/api/abastecimento/index.php'),

    // Credenciais Basic. O usuário precisa da função "abastecedora_autenticacao".
    'usuario' => env('ATUA_USER'),
    'senha'   => env('ATUA_PASS'),

    // CNPJ da base (Filial/Matriz) que recebe as abastecidas — 14 dígitos.
    'cnpj_base' => env('ATUA_CNPJ_BASE', '57312701000183'),

    // CNPJ do "posto". Bomba interna => CNPJ da filial onde a bomba está.
    'cnpj_posto' => env('ATUA_CNPJ_POSTO', '57312701000183'),

    'razao_social_posto'  => env('ATUA_RAZAO_POSTO', 'VIPE TRANSPORTES MULTIMODAIS LTDA'),
    'nome_fantasia_posto' => env('ATUA_FANTASIA_POSTO', 'VIPE TRANSPORTES'),

    'layout' => env('ATUA_LAYOUT', 'mais_postos'),

    // Só abastecimentos deste proprietário são enviados (frota própria VIPE).
    'id_proprietario_vipe' => env('ATUA_ID_PROPRIETARIO', '1'),

    // Liga/desliga o envio automático.
    'habilitado' => filter_var(env('ATUA_HABILITADO', true), FILTER_VALIDATE_BOOL),

    // Quantos registros por execução (a API atende 1 request por vez).
    'lote' => (int) env('ATUA_LOTE', 50),

    // Timeouts (s): o inline é curto para não segurar a resposta do app.
    'timeout'          => (int) env('ATUA_TIMEOUT', 90),
    'timeout_imediato' => (int) env('ATUA_TIMEOUT_IMEDIATO', 20),

    // Quantos pendentes antigos reprocessar junto de cada novo abastecimento.
    'retentativas_inline' => (int) env('ATUA_RETENTATIVAS', 4),

    // Mapa tipo_combustivel -> [nrProduto, nmProduto] da tabela da Atua.
    'produtos' => [
        'OLEO DIESEL S10' => ['11', 'DIESEL S-10'],
        'DIESEL S10'      => ['11', 'DIESEL S-10'],
        'DIESEL S-10'     => ['11', 'DIESEL S-10'],
        'DIESEL'          => ['3',  'DIESEL'],
        'ARLA 32'         => ['12', 'ARLA 32/ADITIVOS'],
        'GASOLINA'        => ['1',  'GASOLINA'],
        'ETANOL'          => ['2',  'ETANOL'],
    ],
    'produto_padrao' => ['11', 'DIESEL S-10'],
];
