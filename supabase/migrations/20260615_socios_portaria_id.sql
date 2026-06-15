-- Adiciona portaria_id em socios como FK opcional para segmentacao por portaria
-- Nullable: nao obriga backfill; obrigatoriedade eh regra de UI (quando >= 2 portarias)

BEGIN;

ALTER TABLE public.socios
  ADD COLUMN IF NOT EXISTS portaria_id uuid REFERENCES public.portarias(id) ON DELETE SET NULL;

COMMIT;
