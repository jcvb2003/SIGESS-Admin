-- Align DELETE on finance tables and reap with the same tenant/unit scope
-- already used by SELECT/INSERT/UPDATE.

DROP POLICY IF EXISTS financeiro_cobrancas_geradas_delete ON public.financeiro_cobrancas_geradas;
CREATE POLICY financeiro_cobrancas_geradas_delete ON public.financeiro_cobrancas_geradas
FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.socios s
    WHERE s.cpf = financeiro_cobrancas_geradas.socio_cpf
      AND (
        public.is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1
          FROM public.user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS financeiro_config_socio_delete ON public.financeiro_config_socio;
CREATE POLICY financeiro_config_socio_delete ON public.financeiro_config_socio
FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.socios s
    WHERE s.cpf = financeiro_config_socio.cpf
      AND (
        public.is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1
          FROM public.user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS financeiro_dae_delete ON public.financeiro_dae;
CREATE POLICY financeiro_dae_delete ON public.financeiro_dae
FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.socios s
    WHERE s.cpf = financeiro_dae.socio_cpf
      AND (
        public.is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1
          FROM public.user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS financeiro_historico_regime_delete ON public.financeiro_historico_regime;
CREATE POLICY financeiro_historico_regime_delete ON public.financeiro_historico_regime
FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.socios s
    WHERE s.cpf = financeiro_historico_regime.socio_cpf
      AND (
        public.is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1
          FROM public.user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS financeiro_lancamentos_delete ON public.financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_delete ON public.financeiro_lancamentos
FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.socios s
    WHERE s.cpf = financeiro_lancamentos.socio_cpf
      AND (
        public.is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1
          FROM public.user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS reap_delete ON public.reap;
CREATE POLICY reap_delete ON public.reap
FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.socios s
    WHERE s.cpf = reap.cpf
      AND (
        public.is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1
          FROM public.user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);
