-- Nova Baixa por Comprovante
-- Tabelas: comprovantes_pagamento, alias_proprietarios, api_keys
-- Executado em: 2026-06-10

CREATE TABLE IF NOT EXISTS comprovantes_pagamento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    arquivo_url TEXT NOT NULL,
    arquivo_tipo VARCHAR(20) NOT NULL DEFAULT 'image',
    arquivo_hash VARCHAR(64) NULL,
    valor_extraido NUMERIC(12,2) NULL,
    data_pagamento_extraida DATE NULL,
    remetente_extraido TEXT NULL,
    proprietario_id VARCHAR(120) NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'aguardando_confirmacao',
    confianca_ia NUMERIC(5,4) NULL,
    dados_ia JSONB NULL,
    nota_entrada VARCHAR(200) NULL,
    usuario VARCHAR(255) NULL,
    usuario_id VARCHAR(120) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comprovantes_status ON comprovantes_pagamento (status);
CREATE INDEX IF NOT EXISTS idx_comprovantes_hash ON comprovantes_pagamento (arquivo_hash);
CREATE INDEX IF NOT EXISTS idx_comprovantes_proprietario ON comprovantes_pagamento (proprietario_id);

CREATE TABLE IF NOT EXISTS alias_proprietarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_alias TEXT NOT NULL,
    nome_alias_original TEXT NOT NULL,
    proprietario_id VARCHAR(120) NOT NULL,
    usuario_id VARCHAR(120) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(nome_alias)
);

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    chave_hash VARCHAR(64) NOT NULL UNIQUE,
    chave_preview VARCHAR(20) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_uso_em TIMESTAMPTZ NULL,
    usuario_id VARCHAR(120) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
