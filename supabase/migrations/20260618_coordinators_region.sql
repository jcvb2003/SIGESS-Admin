BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'coordinators'
  ) THEN
    ALTER TABLE public.coordinators
      ADD COLUMN IF NOT EXISTS region text;

    COMMENT ON COLUMN public.coordinators.region IS
      'Localidade ou regiao operacional atendida pelo coordenador dentro da unidade.';
  END IF;
END $$;

COMMIT;
