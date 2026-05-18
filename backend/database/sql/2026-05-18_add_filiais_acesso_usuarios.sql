ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS filiais_acesso jsonb NOT NULL DEFAULT '["Matriz","Viana"]'::jsonb;

UPDATE public.usuarios
SET filiais_acesso = '["Matriz","Viana"]'::jsonb
WHERE filiais_acesso IS NULL
   OR jsonb_typeof(filiais_acesso) <> 'array'
   OR jsonb_array_length(filiais_acesso) = 0;
