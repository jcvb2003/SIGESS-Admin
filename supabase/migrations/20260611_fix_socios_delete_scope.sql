-- Align DELETE on socios with the same tenant/unit scope already used by
-- SELECT/INSERT/UPDATE, so presidents can delete members from their own unit.

DROP POLICY IF EXISTS socios_delete ON public.socios;

CREATE POLICY socios_delete ON public.socios
FOR DELETE USING (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.unit_id = socios.unit_id
      AND m.tenant_id = socios.tenant_id
      AND m.is_active = true
  )
);
