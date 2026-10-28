<?php

return [
    // Credenciais do web service SasIntegra (as mesmas do projeto de coleta Sascar).
    // Defina SASCAR_USER e SASCAR_PASS no .env / variáveis de ambiente da Vercel.
    'user' => env('SASCAR_USER'),
    'pass' => env('SASCAR_PASS'),

    // Endpoint oficial do SasIntegra.
    'endpoint' => env('SASCAR_ENDPOINT', 'https://sasintegra.sascar.com.br/SasIntegra/SasIntegraWSService'),

    // Cache (segundos) do mapeamento placa -> idVeiculo (obterVeiculos é pesado).
    'cache_veiculos_ttl' => (int) env('SASCAR_CACHE_VEICULOS_TTL', 1800),

    // Janela (horas) do histórico consultado para achar a posição mais recente.
    'historico_horas' => (int) env('SASCAR_HISTORICO_HORAS', 24),
];
