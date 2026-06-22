-- Coordinators + auditoria de socios + detalhamento de escolaridade
-- Escopo:
-- 1) nova tabela public.coordinators
-- 2) socios.coordinator_id nullable
-- 3) socios.created_by / updated_by com trigger de carimbo por auth.uid()
-- 4) backfill de escolaridade legado

BEGIN;

CREATE TABLE IF NOT EXISTS public.coordinators (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  unit_id     uuid NOT NULL,
  name        text NOT NULL,
  phone       text,
  email       text,
  notes       text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS coordinators_uniq_per_unit
  ON public.coordinators (tenant_id, unit_id, name);

ALTER TABLE public.coordinators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coordinators_select ON public.coordinators;
CREATE POLICY coordinators_select ON public.coordinators
  FOR SELECT TO authenticated
  USING (
    public.is_tenant_owner(tenant_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = coordinators.tenant_id
        AND m.unit_id = coordinators.unit_id
        AND m.is_active = true
    )
  );

DROP POLICY IF EXISTS coordinators_insert ON public.coordinators;
CREATE POLICY coordinators_insert ON public.coordinators
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_tenant_owner(tenant_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = coordinators.tenant_id
        AND m.unit_id = coordinators.unit_id
        AND m.is_active = true
    )
  );

DROP POLICY IF EXISTS coordinators_update ON public.coordinators;
CREATE POLICY coordinators_update ON public.coordinators
  FOR UPDATE TO authenticated
  USING (
    public.is_tenant_owner(tenant_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = coordinators.tenant_id
        AND m.unit_id = coordinators.unit_id
        AND m.is_active = true
    )
  )
  WITH CHECK (
    public.is_tenant_owner(tenant_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = coordinators.tenant_id
        AND m.unit_id = coordinators.unit_id
        AND m.is_active = true
    )
  );

DROP POLICY IF EXISTS coordinators_delete ON public.coordinators;
CREATE POLICY coordinators_delete ON public.coordinators
  FOR DELETE TO authenticated
  USING (
    public.is_tenant_owner(tenant_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = coordinators.tenant_id
        AND m.unit_id = coordinators.unit_id
        AND m.is_active = true
    )
  );

ALTER TABLE public.socios
  ADD COLUMN IF NOT EXISTS coordinator_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'socios_coordinator_id_fkey'
  ) THEN
    ALTER TABLE public.socios
      ADD CONSTRAINT socios_coordinator_id_fkey
      FOREIGN KEY (coordinator_id)
      REFERENCES public.coordinators(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'socios_created_by_fkey'
  ) THEN
    ALTER TABLE public.socios
      ADD CONSTRAINT socios_created_by_fkey
      FOREIGN KEY (created_by)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'socios_updated_by_fkey'
  ) THEN
    ALTER TABLE public.socios
      ADD CONSTRAINT socios_updated_by_fkey
      FOREIGN KEY (updated_by)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS socios_coordinator_id_idx
  ON public.socios (coordinator_id);

CREATE INDEX IF NOT EXISTS socios_created_by_idx
  ON public.socios (created_by);

CREATE INDEX IF NOT EXISTS socios_updated_by_idx
  ON public.socios (updated_by);

UPDATE public.socios
SET escolaridade = 'FUNDAMENTAL I INCOMPLETO'
WHERE escolaridade = 'FUNDAMENTAL INCOMPLETO';

UPDATE public.socios
SET escolaridade = 'FUNDAMENTAL II COMPLETO'
WHERE escolaridade = 'FUNDAMENTAL COMPLETO';

CREATE OR REPLACE FUNCTION public.set_socios_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := auth.uid();

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_at IS NULL THEN
      NEW.created_at := now();
    END IF;

    IF NEW.updated_at IS NULL THEN
      NEW.updated_at := NEW.created_at;
    END IF;

    IF NEW.created_by IS NULL THEN
      NEW.created_by := v_actor;
    END IF;

    IF NEW.updated_by IS NULL THEN
      NEW.updated_by := COALESCE(v_actor, NEW.created_by);
    END IF;
  ELSE
    NEW.updated_at := now();
    NEW.updated_by := COALESCE(v_actor, OLD.updated_by, OLD.created_by, NEW.updated_by);
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_socios_audit_fields ON public.socios;
CREATE TRIGGER trg_set_socios_audit_fields
BEFORE INSERT OR UPDATE ON public.socios
FOR EACH ROW
EXECUTE FUNCTION public.set_socios_audit_fields();

COMMENT ON TABLE public.coordinators IS
  'Coordenadores operacionais da entidade. Cada socio pode pertencer a exatamente um coordenador.';

COMMENT ON COLUMN public.coordinators.unit_id IS
  'Unidade responsavel pelo coordenador. Em entidades sem polos, deve apontar para a Sede.';

COMMENT ON COLUMN public.socios.coordinator_id IS
  'Coordenador responsavel pelo socio. Relacao 1 socio -> 1 coordenador.';

COMMENT ON COLUMN public.socios.created_by IS
  'Usuario autenticado que criou o cadastro do socio.';

COMMENT ON COLUMN public.socios.updated_by IS
  'Usuario autenticado que realizou a ultima alteracao no cadastro do socio.';

COMMIT;
