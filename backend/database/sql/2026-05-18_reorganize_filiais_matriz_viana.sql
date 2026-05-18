ALTER TABLE public.proprietarios
  ADD COLUMN IF NOT EXISTS local text NOT NULL DEFAULT 'Viana';

ALTER TABLE public.motoristas
  ADD COLUMN IF NOT EXISTS local text NOT NULL DEFAULT 'Viana';

ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS local text NOT NULL DEFAULT 'Viana';

UPDATE public.abastecimentos
SET local = CASE WHEN id_proprietario = '1' THEN 'Matriz' ELSE 'Viana' END;

UPDATE public.proprietarios
SET local = CASE WHEN id_proprietario = '1' THEN 'Matriz' ELSE 'Viana' END;

UPDATE public.motoristas
SET local = CASE WHEN id_proprietario = '1' THEN 'Matriz' ELSE 'Viana' END;

UPDATE public.veiculos
SET local = CASE WHEN id_proprietario = '1' THEN 'Matriz' ELSE 'Viana' END;

UPDATE public.usuarios
SET filiais_acesso = (
  SELECT jsonb_agg(DISTINCT filial)
  FROM (
    SELECT CASE
      WHEN value = 'Cariacica' THEN 'Matriz'
      WHEN value = 'Matriz' THEN 'Viana'
      WHEN value IN ('Viana') THEN value
      ELSE NULL
    END AS filial
    FROM jsonb_array_elements_text(filiais_acesso)
  ) mapped
  WHERE filial IS NOT NULL
)
WHERE filiais_acesso IS NOT NULL;

UPDATE public.usuarios
SET filiais_acesso = '["Matriz","Viana"]'::jsonb
WHERE filiais_acesso IS NULL
   OR jsonb_typeof(filiais_acesso) <> 'array'
   OR jsonb_array_length(filiais_acesso) = 0;

CREATE INDEX IF NOT EXISTS idx_proprietarios_local ON public.proprietarios (local);
CREATE INDEX IF NOT EXISTS idx_motoristas_local ON public.motoristas (local);
CREATE INDEX IF NOT EXISTS idx_veiculos_local ON public.veiculos (local);
