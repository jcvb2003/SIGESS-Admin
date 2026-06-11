-- Align DELETE on requerimentos with the same tenant/unit scope already used by
-- SELECT/INSERT/UPDATE, so presidents can delete requirements from their own unit.

DROP POLICY IF EXISTS requerimentos_delete ON public.requerimentos;

CREATE POLICY requerimentos_delete ON public.requerimentos
FOR DELETE TO authenticated USING (
  (cpf IS NOT NULL)
  AND EXISTS (
    SELECT 1
    FROM socios s
    WHERE s.cpf = requerimentos.cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1
          FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);
