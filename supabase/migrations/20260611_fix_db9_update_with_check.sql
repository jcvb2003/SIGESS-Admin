-- Migration: make WITH CHECK explicit on all per-polo UPDATE policies (DB-9)
-- PostgreSQL defaults WITH CHECK = USING for UPDATE when not specified.
-- Making it explicit improves legibility and prevents silent drift if USING is ever changed.
-- No behavior change — expressions are identical to USING.

ALTER POLICY socios_update ON socios
  USING (
    is_tenant_owner(tenant_id)
    OR EXISTS (
      SELECT 1 FROM user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.unit_id = socios.unit_id
        AND m.tenant_id = socios.tenant_id
        AND m.is_active = true
    )
  )
  WITH CHECK (
    is_tenant_owner(tenant_id)
    OR EXISTS (
      SELECT 1 FROM user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.unit_id = socios.unit_id
        AND m.tenant_id = socios.tenant_id
        AND m.is_active = true
    )
  );

ALTER POLICY financeiro_cobrancas_geradas_update ON financeiro_cobrancas_geradas
  USING (
    EXISTS (
      SELECT 1 FROM socios s
      WHERE s.cpf = financeiro_cobrancas_geradas.socio_cpf
        AND (is_tenant_owner(s.tenant_id) OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        ))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM socios s
      WHERE s.cpf = financeiro_cobrancas_geradas.socio_cpf
        AND (is_tenant_owner(s.tenant_id) OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        ))
    )
  );

ALTER POLICY financeiro_lancamentos_update ON financeiro_lancamentos
  USING (
    EXISTS (
      SELECT 1 FROM socios s
      WHERE s.cpf = financeiro_lancamentos.socio_cpf
        AND (is_tenant_owner(s.tenant_id) OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        ))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM socios s
      WHERE s.cpf = financeiro_lancamentos.socio_cpf
        AND (is_tenant_owner(s.tenant_id) OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        ))
    )
  );

ALTER POLICY financeiro_dae_update ON financeiro_dae
  USING (
    EXISTS (
      SELECT 1 FROM socios s
      WHERE s.cpf = financeiro_dae.socio_cpf
        AND (is_tenant_owner(s.tenant_id) OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        ))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM socios s
      WHERE s.cpf = financeiro_dae.socio_cpf
        AND (is_tenant_owner(s.tenant_id) OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        ))
    )
  );

ALTER POLICY financeiro_config_socio_update ON financeiro_config_socio
  USING (
    EXISTS (
      SELECT 1 FROM socios s
      WHERE s.cpf = financeiro_config_socio.cpf
        AND (is_tenant_owner(s.tenant_id) OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        ))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM socios s
      WHERE s.cpf = financeiro_config_socio.cpf
        AND (is_tenant_owner(s.tenant_id) OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        ))
    )
  );

ALTER POLICY financeiro_historico_regime_update ON financeiro_historico_regime
  USING (
    EXISTS (
      SELECT 1 FROM socios s
      WHERE s.cpf = financeiro_historico_regime.socio_cpf
        AND (is_tenant_owner(s.tenant_id) OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        ))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM socios s
      WHERE s.cpf = financeiro_historico_regime.socio_cpf
        AND (is_tenant_owner(s.tenant_id) OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        ))
    )
  );

ALTER POLICY reap_update ON reap
  USING (
    EXISTS (
      SELECT 1 FROM socios s
      WHERE s.cpf = reap.cpf
        AND (is_tenant_owner(s.tenant_id) OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        ))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM socios s
      WHERE s.cpf = reap.cpf
        AND (is_tenant_owner(s.tenant_id) OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        ))
    )
  );

ALTER POLICY requerimentos_update ON requerimentos
  USING (
    (cpf IS NOT NULL) AND EXISTS (
      SELECT 1 FROM socios s
      WHERE s.cpf = requerimentos.cpf
        AND (is_tenant_owner(s.tenant_id) OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        ))
    )
  )
  WITH CHECK (
    (cpf IS NOT NULL) AND EXISTS (
      SELECT 1 FROM socios s
      WHERE s.cpf = requerimentos.cpf
        AND (is_tenant_owner(s.tenant_id) OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        ))
    )
  );
