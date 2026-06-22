BEGIN;

DROP POLICY IF EXISTS parametros_financeiros_select ON public.parametros_financeiros;
CREATE POLICY parametros_financeiros_select
ON public.parametros_financeiros
FOR SELECT
USING (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = parametros_financeiros.tenant_id
      AND m.unit_id = parametros_financeiros.unit_id
      AND m.is_active = true
  )
);

DROP POLICY IF EXISTS parametros_financeiros_insert ON public.parametros_financeiros;
CREATE POLICY parametros_financeiros_insert
ON public.parametros_financeiros
FOR INSERT
WITH CHECK (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = parametros_financeiros.tenant_id
      AND m.unit_id = parametros_financeiros.unit_id
      AND m.is_active = true
  )
);

DROP POLICY IF EXISTS parametros_financeiros_update ON public.parametros_financeiros;
CREATE POLICY parametros_financeiros_update
ON public.parametros_financeiros
FOR UPDATE
USING (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = parametros_financeiros.tenant_id
      AND m.unit_id = parametros_financeiros.unit_id
      AND m.is_active = true
  )
)
WITH CHECK (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = parametros_financeiros.tenant_id
      AND m.unit_id = parametros_financeiros.unit_id
      AND m.is_active = true
  )
);

DROP POLICY IF EXISTS portarias_select ON public.portarias;
CREATE POLICY portarias_select
ON public.portarias
FOR SELECT
TO authenticated
USING (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = portarias.tenant_id
      AND m.unit_id = portarias.unit_id
      AND m.is_active = true
  )
);

DROP POLICY IF EXISTS portarias_insert ON public.portarias;
CREATE POLICY portarias_insert
ON public.portarias
FOR INSERT
TO authenticated
WITH CHECK (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = portarias.tenant_id
      AND m.unit_id = portarias.unit_id
      AND m.is_active = true
  )
);

DROP POLICY IF EXISTS portarias_update ON public.portarias;
CREATE POLICY portarias_update
ON public.portarias
FOR UPDATE
TO authenticated
USING (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = portarias.tenant_id
      AND m.unit_id = portarias.unit_id
      AND m.is_active = true
  )
)
WITH CHECK (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = portarias.tenant_id
      AND m.unit_id = portarias.unit_id
      AND m.is_active = true
  )
);

DROP POLICY IF EXISTS portarias_delete ON public.portarias;
CREATE POLICY portarias_delete
ON public.portarias
FOR DELETE
TO authenticated
USING (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = portarias.tenant_id
      AND m.unit_id = portarias.unit_id
      AND m.is_active = true
  )
);

COMMIT;
