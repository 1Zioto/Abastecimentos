-- Incremental sync token for mobile/web clients
-- Safe to run multiple times (idempotent).

DO $$
BEGIN
  -- proprietarios
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'proprietarios'
      AND column_name = 'sync_token_at'
  ) THEN
    ALTER TABLE public.proprietarios
      ADD COLUMN sync_token_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  -- veiculos
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'veiculos'
      AND column_name = 'sync_token_at'
  ) THEN
    ALTER TABLE public.veiculos
      ADD COLUMN sync_token_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  -- motoristas
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'motoristas'
      AND column_name = 'sync_token_at'
  ) THEN
    ALTER TABLE public.motoristas
      ADD COLUMN sync_token_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  -- abastecimentos
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'abastecimentos'
      AND column_name = 'sync_token_at'
  ) THEN
    ALTER TABLE public.abastecimentos
      ADD COLUMN sync_token_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  -- entrada_notas
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'entrada_notas'
      AND column_name = 'sync_token_at'
  ) THEN
    ALTER TABLE public.entrada_notas
      ADD COLUMN sync_token_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  -- valores_combustivel
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'valores_combustivel'
      AND column_name = 'sync_token_at'
  ) THEN
    ALTER TABLE public.valores_combustivel
      ADD COLUMN sync_token_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  -- baixa_abastecimento
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'baixa_abastecimento'
      AND column_name = 'sync_token_at'
  ) THEN
    ALTER TABLE public.baixa_abastecimento
      ADD COLUMN sync_token_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  -- usuarios
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usuarios'
      AND column_name = 'sync_token_at'
  ) THEN
    ALTER TABLE public.usuarios
      ADD COLUMN sync_token_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_proprietarios_sync_token_at
  ON public.proprietarios (sync_token_at);

CREATE INDEX IF NOT EXISTS idx_veiculos_sync_token_at
  ON public.veiculos (sync_token_at);

CREATE INDEX IF NOT EXISTS idx_motoristas_sync_token_at
  ON public.motoristas (sync_token_at);

CREATE INDEX IF NOT EXISTS idx_abastecimentos_sync_token_at
  ON public.abastecimentos (sync_token_at);

CREATE INDEX IF NOT EXISTS idx_entrada_notas_sync_token_at
  ON public.entrada_notas (sync_token_at);

CREATE INDEX IF NOT EXISTS idx_valores_combustivel_sync_token_at
  ON public.valores_combustivel (sync_token_at);

CREATE INDEX IF NOT EXISTS idx_baixa_abastecimento_sync_token_at
  ON public.baixa_abastecimento (sync_token_at);

CREATE INDEX IF NOT EXISTS idx_usuarios_sync_token_at
  ON public.usuarios (sync_token_at);
