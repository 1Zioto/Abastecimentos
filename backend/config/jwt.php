<?php

/*
 * Configuração do tymon/jwt-auth.
 *
 * Este arquivo antes não existia — o pacote caía nos defaults, sendo o mais
 * problemático o TTL de 60 minutos: o token do usuário expirava 1h após o
 * login e, no meio do expediente, a sincronização passava a falhar com 401
 * (visto na tabela app_erros: 103 ocorrências durante o sync).
 *
 * Os valores de tempo/blacklist são FIXOS aqui de propósito (não lidos do env)
 * para garantir que a correção suba com um único redeploy, sem depender de
 * variável no painel da Vercel (onde havia um JWT_TTL antigo de 1440 min).
 *
 * Só sobrescrevemos estas chaves. Todas as demais (secret, keys, algo,
 * providers, blacklist_enabled, required_claims, leeway, etc.) continuam
 * vindo dos defaults do pacote via mergeConfigFrom.
 */

return [

    // Tempo de vida do token de acesso, em MINUTOS.
    // 43200 min = 30 dias. Longo o suficiente para o token nunca expirar
    // durante um turno de trabalho, eliminando os 401 de sessão no sync.
    'ttl' => 43200,

    // Janela em que um token expirado ainda pode ser renovado, em MINUTOS.
    // 129600 min = 90 dias. Permite que um aparelho que ficou dias sem rede
    // ainda consiga renovar o token ao voltar, sem forçar novo login.
    'refresh_ttl' => 129600,

    // Período de graça após um refresh, em SEGUNDOS, em que o token ANTIGO
    // ainda é aceito. Protege contra a corrida em rede instável: se o app
    // renova mas não recebe a resposta com o novo token, o token antigo
    // continua funcionando por esta janela, evitando o "trava em 401".
    'blacklist_grace_period' => 600,

];
