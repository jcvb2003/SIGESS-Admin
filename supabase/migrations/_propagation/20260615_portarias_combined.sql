-- portarias: segmentacao funcional de socios por portaria de defeso
-- Equivalente a localidades: filtro operacional, nunca fronteira de RLS/isolamento
-- unit_id NULLABLE: preenchido quando ha polos, NULL em topologias sem polo

BEGIN;

CREATE TABLE IF NOT EXISTS public.portarias (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  unit_id          uuid,
  codigo_portaria  text NOT NULL,
  nome             text NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS portarias_uniq_with_unit
  ON public.portarias (tenant_id, unit_id, codigo_portaria)
  WHERE unit_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS portarias_uniq_without_unit
  ON public.portarias (tenant_id, codigo_portaria)
  WHERE unit_id IS NULL;

ALTER TABLE public.portarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portarias_select ON public.portarias;
CREATE POLICY portarias_select ON public.portarias
  FOR SELECT TO authenticated
  USING (
    public.is_tenant_owner(tenant_id)
    OR (unit_id IS NULL AND tenant_id IN (
      SELECT m.tenant_id FROM public.user_unit_memberships m
      WHERE m.user_id = auth.uid() AND m.is_active = true
    ))
    OR EXISTS (
      SELECT 1 FROM public.user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = portarias.tenant_id
        AND m.unit_id = portarias.unit_id
        AND m.is_active = true
    )
  );

DROP POLICY IF EXISTS portarias_insert ON public.portarias;
CREATE POLICY portarias_insert ON public.portarias
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_tenant_owner(tenant_id)
    OR (unit_id IS NULL AND tenant_id IN (
      SELECT m.tenant_id FROM public.user_unit_memberships m
      WHERE m.user_id = auth.uid() AND m.is_active = true
    ))
    OR EXISTS (
      SELECT 1 FROM public.user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = portarias.tenant_id
        AND m.unit_id = portarias.unit_id
        AND m.is_active = true
    )
  );

DROP POLICY IF EXISTS portarias_update ON public.portarias;
CREATE POLICY portarias_update ON public.portarias
  FOR UPDATE TO authenticated
  USING (
    public.is_tenant_owner(tenant_id)
    OR (unit_id IS NULL AND tenant_id IN (
      SELECT m.tenant_id FROM public.user_unit_memberships m
      WHERE m.user_id = auth.uid() AND m.is_active = true
    ))
    OR EXISTS (
      SELECT 1 FROM public.user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = portarias.tenant_id
        AND m.unit_id = portarias.unit_id
        AND m.is_active = true
    )
  )
  WITH CHECK (
    public.is_tenant_owner(tenant_id)
    OR (unit_id IS NULL AND tenant_id IN (
      SELECT m.tenant_id FROM public.user_unit_memberships m
      WHERE m.user_id = auth.uid() AND m.is_active = true
    ))
    OR EXISTS (
      SELECT 1 FROM public.user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = portarias.tenant_id
        AND m.unit_id = portarias.unit_id
        AND m.is_active = true
    )
  );

DROP POLICY IF EXISTS portarias_delete ON public.portarias;
CREATE POLICY portarias_delete ON public.portarias
  FOR DELETE TO authenticated
  USING (
    public.is_tenant_owner(tenant_id)
    OR (unit_id IS NULL AND tenant_id IN (
      SELECT m.tenant_id FROM public.user_unit_memberships m
      WHERE m.user_id = auth.uid() AND m.is_active = true
    ))
    OR EXISTS (
      SELECT 1 FROM public.user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = portarias.tenant_id
        AND m.unit_id = portarias.unit_id
        AND m.is_active = true
    )
  );

-- Adiciona portaria_id em socios como FK opcional
ALTER TABLE public.socios
  ADD COLUMN IF NOT EXISTS portaria_id uuid REFERENCES public.portarias(id) ON DELETE SET NULL;

COMMIT;
