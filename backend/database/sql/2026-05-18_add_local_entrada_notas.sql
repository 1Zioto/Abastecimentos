ALTER TABLE public.entrada_notas
  ADD COLUMN IF NOT EXISTS local text NOT NULL DEFAULT 'Viana';

CREATE INDEX IF NOT EXISTS idx_entrada_notas_local
  ON public.entrada_notas (local);
