-- Migration: fix cross-tenant leak in per-polo RLS policies
-- Affected tables: socios, financeiro_*, reap, requerimentos, logs_eventos_requerimento
-- Root cause: user_unit_memberships EXISTS check was missing m.tenant_id = <table>.tenant_id
-- Fix: add tenant boundary to every membership check

-- ============================================================
-- socios
-- ============================================================

DROP POLICY IF EXISTS socios_select ON socios;
CREATE POLICY socios_select ON socios FOR SELECT USING (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1 FROM user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.unit_id = socios.unit_id
      AND m.tenant_id = socios.tenant_id
      AND m.is_active = true
  )
);

DROP POLICY IF EXISTS socios_insert ON socios;
CREATE POLICY socios_insert ON socios FOR INSERT WITH CHECK (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1 FROM user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.unit_id = socios.unit_id
      AND m.tenant_id = socios.tenant_id
      AND m.is_active = true
  )
);

DROP POLICY IF EXISTS socios_update ON socios;
CREATE POLICY socios_update ON socios FOR UPDATE USING (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1 FROM user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.unit_id = socios.unit_id
      AND m.tenant_id = socios.tenant_id
      AND m.is_active = true
  )
);

-- ============================================================
-- financeiro_lancamentos
-- ============================================================

DROP POLICY IF EXISTS financeiro_lancamentos_select ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_select ON financeiro_lancamentos FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = financeiro_lancamentos.socio_cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS financeiro_lancamentos_insert ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_insert ON financeiro_lancamentos FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = financeiro_lancamentos.socio_cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS financeiro_lancamentos_update ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_update ON financeiro_lancamentos FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = financeiro_lancamentos.socio_cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

-- ============================================================
-- financeiro_cobrancas_geradas
-- ============================================================

DROP POLICY IF EXISTS financeiro_cobrancas_geradas_select ON financeiro_cobrancas_geradas;
CREATE POLICY financeiro_cobrancas_geradas_select ON financeiro_cobrancas_geradas FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = financeiro_cobrancas_geradas.socio_cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS financeiro_cobrancas_geradas_insert ON financeiro_cobrancas_geradas;
CREATE POLICY financeiro_cobrancas_geradas_insert ON financeiro_cobrancas_geradas FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = financeiro_cobrancas_geradas.socio_cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS financeiro_cobrancas_geradas_update ON financeiro_cobrancas_geradas;
CREATE POLICY financeiro_cobrancas_geradas_update ON financeiro_cobrancas_geradas FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = financeiro_cobrancas_geradas.socio_cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

-- ============================================================
-- financeiro_dae
-- ============================================================

DROP POLICY IF EXISTS financeiro_dae_select ON financeiro_dae;
CREATE POLICY financeiro_dae_select ON financeiro_dae FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = financeiro_dae.socio_cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS financeiro_dae_insert ON financeiro_dae;
CREATE POLICY financeiro_dae_insert ON financeiro_dae FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = financeiro_dae.socio_cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS financeiro_dae_update ON financeiro_dae;
CREATE POLICY financeiro_dae_update ON financeiro_dae FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = financeiro_dae.socio_cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

-- ============================================================
-- financeiro_config_socio
-- ============================================================

DROP POLICY IF EXISTS financeiro_config_socio_select ON financeiro_config_socio;
CREATE POLICY financeiro_config_socio_select ON financeiro_config_socio FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = financeiro_config_socio.cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS financeiro_config_socio_insert ON financeiro_config_socio;
CREATE POLICY financeiro_config_socio_insert ON financeiro_config_socio FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = financeiro_config_socio.cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS financeiro_config_socio_update ON financeiro_config_socio;
CREATE POLICY financeiro_config_socio_update ON financeiro_config_socio FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = financeiro_config_socio.cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

-- ============================================================
-- financeiro_historico_regime
-- ============================================================

DROP POLICY IF EXISTS financeiro_historico_regime_select ON financeiro_historico_regime;
CREATE POLICY financeiro_historico_regime_select ON financeiro_historico_regime FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = financeiro_historico_regime.socio_cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS financeiro_historico_regime_insert ON financeiro_historico_regime;
CREATE POLICY financeiro_historico_regime_insert ON financeiro_historico_regime FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = financeiro_historico_regime.socio_cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS financeiro_historico_regime_update ON financeiro_historico_regime;
CREATE POLICY financeiro_historico_regime_update ON financeiro_historico_regime FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = financeiro_historico_regime.socio_cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

-- ============================================================
-- reap
-- ============================================================

DROP POLICY IF EXISTS reap_select ON reap;
CREATE POLICY reap_select ON reap FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = reap.cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS reap_insert ON reap;
CREATE POLICY reap_insert ON reap FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = reap.cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS reap_update ON reap;
CREATE POLICY reap_update ON reap FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = reap.cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

-- ============================================================
-- requerimentos
-- ============================================================

DROP POLICY IF EXISTS requerimentos_select ON requerimentos;
CREATE POLICY requerimentos_select ON requerimentos FOR SELECT USING (
  (cpf IS NOT NULL)
  AND EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = requerimentos.cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS requerimentos_insert ON requerimentos;
CREATE POLICY requerimentos_insert ON requerimentos FOR INSERT WITH CHECK (
  (cpf IS NOT NULL)
  AND EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = requerimentos.cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS requerimentos_update ON requerimentos;
CREATE POLICY requerimentos_update ON requerimentos FOR UPDATE USING (
  (cpf IS NOT NULL)
  AND EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = requerimentos.cpf
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

-- ============================================================
-- logs_eventos_requerimento
-- ============================================================

DROP POLICY IF EXISTS logs_eventos_requerimento_select ON logs_eventos_requerimento;
CREATE POLICY logs_eventos_requerimento_select ON logs_eventos_requerimento FOR SELECT USING (
  (requerimento_id IS NOT NULL)
  AND EXISTS (
    SELECT 1
    FROM requerimentos r
    JOIN socios s ON s.cpf = r.cpf
    WHERE r.id = logs_eventos_requerimento.requerimento_id
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);

DROP POLICY IF EXISTS logs_eventos_requerimento_insert ON logs_eventos_requerimento;
CREATE POLICY logs_eventos_requerimento_insert ON logs_eventos_requerimento FOR INSERT WITH CHECK (
  (requerimento_id IS NOT NULL)
  AND EXISTS (
    SELECT 1
    FROM requerimentos r
    JOIN socios s ON s.cpf = r.cpf
    WHERE r.id = logs_eventos_requerimento.requerimento_id
      AND (
        is_tenant_owner(s.tenant_id)
        OR EXISTS (
          SELECT 1 FROM user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.unit_id = s.unit_id
            AND m.tenant_id = s.tenant_id
            AND m.is_active = true
        )
      )
  )
);
