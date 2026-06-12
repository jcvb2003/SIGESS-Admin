BEGIN;

ALTER TABLE public.localidades
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN unit_id SET NOT NULL;

DROP POLICY IF EXISTS localidades_select ON public.localidades;
CREATE POLICY localidades_select
ON public.localidades
FOR SELECT
TO authenticated
USING (
  public.is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = localidades.tenant_id
      AND m.unit_id = localidades.unit_id
      AND m.is_active = true
  )
);

DROP POLICY IF EXISTS localidades_insert ON public.localidades;
CREATE POLICY localidades_insert
ON public.localidades
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = localidades.tenant_id
      AND m.unit_id = localidades.unit_id
      AND m.is_active = true
  )
);

DROP POLICY IF EXISTS localidades_update ON public.localidades;
CREATE POLICY localidades_update
ON public.localidades
FOR UPDATE
TO authenticated
USING (
  public.is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = localidades.tenant_id
      AND m.unit_id = localidades.unit_id
      AND m.is_active = true
  )
)
WITH CHECK (
  public.is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = localidades.tenant_id
      AND m.unit_id = localidades.unit_id
      AND m.is_active = true
  )
);

DROP POLICY IF EXISTS localidades_delete ON public.localidades;
CREATE POLICY localidades_delete
ON public.localidades
FOR DELETE
TO authenticated
USING (
  public.is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = localidades.tenant_id
      AND m.unit_id = localidades.unit_id
      AND m.is_active = true
  )
);

COMMIT;
