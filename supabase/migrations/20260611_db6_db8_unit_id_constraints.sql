-- Migration: DB-6 + DB-8
-- DB-6: adiciona NOT NULL em parametros.unit_id (confirmado: 0 NULLs em todos os projetos)
-- DB-8: remove OR unit_id IS NULL das 3 policies de parametros_financeiros (dead code confirmado)

-- ── DB-6 ────────────────────────────────────────────────────────────────────
ALTER TABLE public.parametros
  ALTER COLUMN unit_id SET NOT NULL;

-- ── DB-8 ────────────────────────────────────────────────────────────────────
ALTER POLICY parametros_financeiros_select ON public.parametros_financeiros
  USING (
    is_tenant_owner(tenant_id)
    OR EXISTS (
      SELECT 1 FROM tenant_users tu
      WHERE tu.tenant_id = parametros_financeiros.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.is_active = true
        AND (tu.tenant_role = 'owner' OR tu.operator_type = 'presidente')
    )
    OR EXISTS (
      SELECT 1 FROM user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = parametros_financeiros.tenant_id
        AND m.unit_id = parametros_financeiros.unit_id
        AND m.is_active = true
    )
  );

ALTER POLICY parametros_financeiros_insert ON public.parametros_financeiros
  WITH CHECK (
    is_tenant_owner(tenant_id)
    OR EXISTS (
      SELECT 1 FROM tenant_users tu
      WHERE tu.tenant_id = parametros_financeiros.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.is_active = true
        AND (tu.tenant_role = 'owner' OR tu.operator_type = 'presidente')
    )
    OR EXISTS (
      SELECT 1 FROM user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = parametros_financeiros.tenant_id
        AND m.unit_id = parametros_financeiros.unit_id
        AND m.is_active = true
    )
  );

ALTER POLICY parametros_financeiros_update ON public.parametros_financeiros
  USING (
    is_tenant_owner(tenant_id)
    OR EXISTS (
      SELECT 1 FROM tenant_users tu
      WHERE tu.tenant_id = parametros_financeiros.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.is_active = true
        AND (tu.tenant_role = 'owner' OR tu.operator_type = 'presidente')
    )
    OR EXISTS (
      SELECT 1 FROM user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = parametros_financeiros.tenant_id
        AND m.unit_id = parametros_financeiros.unit_id
        AND m.is_active = true
    )
  )
  WITH CHECK (
    is_tenant_owner(tenant_id)
    OR EXISTS (
      SELECT 1 FROM tenant_users tu
      WHERE tu.tenant_id = parametros_financeiros.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.is_active = true
        AND (tu.tenant_role = 'owner' OR tu.operator_type = 'presidente')
    )
    OR EXISTS (
      SELECT 1 FROM user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = parametros_financeiros.tenant_id
        AND m.unit_id = parametros_financeiros.unit_id
        AND m.is_active = true
    )
  );
