-- Combined propagation script -- 20260611 package
-- Apply to: Z2, OEIRAS, ELAINE, BREVES

-- ============================================================
-- 20260611_fix_db1_operator_type.sql
-- ============================================================
-- Migration: tighten operator_type CHECK on tenant_users
-- Root cause: member with operator_type NULL was accepted — no layer handled this state
-- Fix: owner must have NULL operator_type; member must have 'presidente' or 'auxiliar'

ALTER TABLE tenant_users DROP CONSTRAINT IF EXISTS tenant_users_operator_type_check;

ALTER TABLE tenant_users ADD CONSTRAINT tenant_users_operator_type_check CHECK (
  (tenant_role = 'owner' AND operator_type IS NULL)
  OR
  (tenant_role = 'member' AND operator_type IN ('presidente', 'auxiliar'))
);


-- ============================================================
-- 20260611_fix_db2_db4_owner_memberships.sql
-- ============================================================
-- Migration: enforce owner has no unit memberships (DB-2 + DB-4)
-- DB-2: block INSERT/UPDATE into user_unit_memberships when user is owner
-- DB-4: block UPDATE that attempts to change tenant_role between owner and member

-- DB-2: prevent owner from having unit memberships
CREATE OR REPLACE FUNCTION chk_no_owner_membership()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = NEW.user_id
      AND tenant_id = NEW.tenant_id
      AND tenant_role = 'owner'
  ) THEN
    RAISE EXCEPTION 'owner cannot have a unit membership';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_owner_membership ON user_unit_memberships;
CREATE TRIGGER trg_no_owner_membership
BEFORE INSERT OR UPDATE ON user_unit_memberships
FOR EACH ROW EXECUTE FUNCTION chk_no_owner_membership();

-- DB-4: reject any attempt to change tenant_role between owner and member
CREATE OR REPLACE FUNCTION chk_no_role_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.tenant_role = 'owner' AND NEW.tenant_role <> 'owner') OR
     (OLD.tenant_role <> 'owner' AND NEW.tenant_role = 'owner') THEN
    RAISE EXCEPTION 'tenant_role transition between owner and member is not allowed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_role_transition ON tenant_users;
CREATE TRIGGER trg_no_role_transition
BEFORE UPDATE ON tenant_users
FOR EACH ROW EXECUTE FUNCTION chk_no_role_transition();


-- ============================================================
-- 20260611_fix_cross_tenant_rls.sql
-- ============================================================
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


-- ============================================================
-- 20260611_fix_db5_auxiliar_limit.sql
-- ============================================================
-- Migration: enforce auxiliar has at most one active unit membership (DB-5)
-- UI already prevents this but no DB-level guarantee exists

CREATE OR REPLACE FUNCTION chk_auxiliar_single_membership()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_active = true
    AND EXISTS (
      SELECT 1 FROM tenant_users
      WHERE user_id = NEW.user_id
        AND tenant_id = NEW.tenant_id
        AND operator_type = 'auxiliar'
    )
    AND (
      SELECT COUNT(*) FROM user_unit_memberships
      WHERE user_id = NEW.user_id
        AND tenant_id = NEW.tenant_id
        AND is_active = true
        AND id IS DISTINCT FROM NEW.id
    ) > 0
  THEN
    RAISE EXCEPTION 'auxiliar can only have one active unit membership';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auxiliar_single_membership ON user_unit_memberships;
CREATE TRIGGER trg_auxiliar_single_membership
BEFORE INSERT OR UPDATE ON user_unit_memberships
FOR EACH ROW EXECUTE FUNCTION chk_auxiliar_single_membership();


-- ============================================================
-- 20260611_fix_foto_upload_tokens_rls.sql
-- ============================================================
-- Migration: add isolation to foto_upload_tokens (DB-7)
-- The table stores socio_cpf + foto_base64 (biometric PII) with no tenant/unit scope.
-- Fix: scope via socio_cpf -> socios join, same pattern as financeiro_*, reap, requerimentos.

DROP POLICY IF EXISTS foto_upload_tokens_select ON foto_upload_tokens;
DROP POLICY IF EXISTS foto_upload_tokens_insert ON foto_upload_tokens;
DROP POLICY IF EXISTS foto_upload_tokens_update ON foto_upload_tokens;

-- SELECT: only who can see the socio can see their upload token
CREATE POLICY foto_upload_tokens_select ON foto_upload_tokens
FOR SELECT USING (
  (socio_cpf IS NOT NULL) AND EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = foto_upload_tokens.socio_cpf
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

-- INSERT: only who can manage the socio can create an upload token for them
CREATE POLICY foto_upload_tokens_insert ON foto_upload_tokens
FOR INSERT WITH CHECK (
  (socio_cpf IS NOT NULL) AND EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = foto_upload_tokens.socio_cpf
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

-- UPDATE: only who can see the token can consume it (mark as used)
CREATE POLICY foto_upload_tokens_update ON foto_upload_tokens
FOR UPDATE USING (
  (socio_cpf IS NOT NULL) AND EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = foto_upload_tokens.socio_cpf
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
) WITH CHECK (
  (socio_cpf IS NOT NULL) AND EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = foto_upload_tokens.socio_cpf
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

-- DELETE: owner only (same pattern as other per-polo tables)
-- Note: no existing DELETE policy was present; adding for completeness.
CREATE POLICY foto_upload_tokens_delete ON foto_upload_tokens
FOR DELETE USING (
  (socio_cpf IS NOT NULL) AND EXISTS (
    SELECT 1 FROM socios s
    WHERE s.cpf = foto_upload_tokens.socio_cpf
      AND is_tenant_owner(s.tenant_id)
  )
);


-- ============================================================
-- 20260611_fix_db9_update_with_check.sql
-- ============================================================
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


-- ============================================================
-- 20260611_d1_invariant_comments.sql
-- ============================================================
-- Migration: D1 — Formalizar Formulação A do invariante de membership
-- Declaração oficial: todo tenant tem >=1 unit; todo operador (presidente/auxiliar) tem >=1 membership ativa; owner NÃO tem membership.
-- Sem alteração de comportamento — apenas COMMENT ON para persistir a regra no schema.

COMMENT ON TABLE public.tenant_units IS
  'Polos ou unidades de um tenant. Invariante: todo tenant tem sempre >=1 unit ativa (a "Sede" em topologias sem polos de negócio). Nenhum tenant pode ficar com 0 units.';

COMMENT ON TABLE public.tenant_users IS
  'Vínculo de um usuário com um tenant. tenant_role=''owner'' governa o tenant; tenant_role=''member'' opera dentro de polos via user_unit_memberships. Transição owner<->member é proibida por domínio.';

COMMENT ON TABLE public.user_unit_memberships IS
  'Mapeamento de autorização entre usuários operadores e as units que podem acessar. Formulação A (oficial): todo operador (operator_type IN (''presidente'',''auxiliar'')) tem >=1 membership ativa; owner NÃO pertence a esta tabela.';

COMMENT ON TRIGGER trg_no_owner_membership ON public.user_unit_memberships IS
  'Formulação A — lado negativo: bloqueia INSERT/UPDATE que associaria um owner a uma unit. owner governa o tenant pelo tenant_role, não pelo polo.';

COMMENT ON TRIGGER trg_auto_membership_single_unit ON public.tenant_users IS
  'Formulação A — lado positivo: quando um tenant tem exatamente 1 unit, cria membership automaticamente para o novo usuário operador. Cobre topologias isolated_single e shared_multi_single (Sede).';

COMMENT ON TRIGGER trg_auxiliar_single_membership ON public.user_unit_memberships IS
  'Garante que auxiliar nunca tenha mais de 1 membership ativa simultaneamente. presidente pode ter N (um por polo).';

COMMENT ON TRIGGER trg_no_role_transition ON public.tenant_users IS
  'Bloqueia qualquer transição owner<->member. A fronteira entre dono do tenant e operador de polo é permanente — não existe "promoção" ou "rebaixamento".';


-- ============================================================
-- 20260611_db6_db8_unit_id_constraints.sql
-- ============================================================
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


-- ============================================================
-- 20260611_f1_tenant_units_guardrail.sql
-- ============================================================
-- Migration: F1 — Guardrail "tenant nunca fica com 0 units ativas"
-- Cobre: DELETE da última unit ativa + UPDATE is_active=false na última unit ativa
-- Cobre: múltiplas linhas na mesma transação (trigger BEFORE por linha, exclui OLD.id do count)
-- Não bloqueia: DELETE de unit inativa (sem impacto no invariante)
-- Não bloqueia: UPDATE de outros campos (timing, name, etc.)

CREATE OR REPLACE FUNCTION public.fn_tenant_units_min_one()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id uuid;
  v_remaining integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Só relevante se a unit deletada estava ativa
    IF NOT OLD.is_active THEN
      RETURN OLD;
    END IF;
    v_tenant_id := OLD.tenant_id;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Só relevante se estamos desativando uma unit ativa
    IF NOT (OLD.is_active = true AND NEW.is_active = false) THEN
      RETURN NEW;
    END IF;
    v_tenant_id := OLD.tenant_id;
  END IF;

  -- Conta units ativas restantes excluindo a linha atual (que ainda existe no BEFORE)
  SELECT count(*) INTO v_remaining
  FROM public.tenant_units
  WHERE tenant_id = v_tenant_id
    AND is_active = true
    AND id <> OLD.id;

  IF v_remaining = 0 THEN
    RAISE EXCEPTION
      'tenant_id % must have at least one active unit', v_tenant_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenant_units_min_one
BEFORE DELETE OR UPDATE ON public.tenant_units
FOR EACH ROW EXECUTE FUNCTION public.fn_tenant_units_min_one();

COMMENT ON TRIGGER trg_tenant_units_min_one ON public.tenant_units IS
  'F1 guardrail: bloqueia DELETE e UPDATE is_active=false que deixariam o tenant sem nenhuma unit ativa. Cobre múltiplas linhas na mesma transação.';


-- ============================================================
-- 20260611_f2_auto_membership_single_unit.sql
-- ============================================================
-- Migration: F2 — Migração canônica para auto_membership_single_unit
-- Origem: Web/supabase/migrations/20260609_membership_guardrail_trigger.sql (descartado)
-- Razão: arquivo estava em local incorreto (Web/); Admin é o repositório canônico.
-- Correção adicional: removido coalesce(is_active, true) — coluna é NOT NULL DEFAULT true.

BEGIN;

-- Unique constraint (idempotente)
DO $$ BEGIN
  ALTER TABLE public.user_unit_memberships
    ADD CONSTRAINT user_unit_memberships_user_tenant_unit_unique
    UNIQUE (user_id, tenant_id, unit_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Função (idempotente via CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION public.auto_membership_single_unit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_id    uuid;
  v_unit_count int;
BEGIN
  SELECT count(*)
  INTO v_unit_count
  FROM public.tenant_units
  WHERE tenant_id = NEW.tenant_id
    AND is_active = true;

  -- Só auto-atribui quando o tenant tem exatamente 1 unit ativa (isolated_single, shared_multi_single).
  -- Tenants multi-polo exigem atribuição explícita via Web.
  IF v_unit_count <> 1 THEN
    RETURN NEW;
  END IF;

  -- owner governa o tenant e nao participa de user_unit_memberships.
  IF NEW.tenant_role = 'owner' THEN
    RETURN NEW;
  END IF;

  SELECT id
  INTO v_unit_id
  FROM public.tenant_units
  WHERE tenant_id = NEW.tenant_id
    AND is_active = true
  LIMIT 1;

  INSERT INTO public.user_unit_memberships (user_id, tenant_id, unit_id, is_active)
  VALUES (NEW.user_id, NEW.tenant_id, v_unit_id, true)
  ON CONFLICT ON CONSTRAINT user_unit_memberships_user_tenant_unit_unique DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger (idempotente via DROP IF EXISTS)
DROP TRIGGER IF EXISTS trg_auto_membership_single_unit ON public.tenant_users;
CREATE TRIGGER trg_auto_membership_single_unit
AFTER INSERT ON public.tenant_users
FOR EACH ROW
WHEN (NEW.is_active = true)
EXECUTE FUNCTION public.auto_membership_single_unit();

COMMIT;


-- ============================================================
-- 20260611_fix_foto_upload_tokens_pre_member_scope.sql
-- ============================================================
-- Fix pre-member QR photo uploads without weakening tenant/unit isolation.
-- Tokens need their own scope because the socio row may not exist yet.

ALTER TABLE public.foto_upload_tokens
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS unit_id uuid;

CREATE INDEX IF NOT EXISTS idx_foto_upload_tokens_scope
  ON public.foto_upload_tokens (tenant_id, unit_id);

DROP POLICY IF EXISTS foto_upload_tokens_select ON public.foto_upload_tokens;
DROP POLICY IF EXISTS foto_upload_tokens_insert ON public.foto_upload_tokens;
DROP POLICY IF EXISTS foto_upload_tokens_update ON public.foto_upload_tokens;
DROP POLICY IF EXISTS foto_upload_tokens_delete ON public.foto_upload_tokens;

CREATE POLICY foto_upload_tokens_select ON public.foto_upload_tokens
FOR SELECT USING (
  tenant_id IS NOT NULL
  AND (
    is_tenant_owner(tenant_id)
    OR EXISTS (
      SELECT 1
      FROM user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = foto_upload_tokens.tenant_id
        AND m.is_active = true
        AND (
          foto_upload_tokens.unit_id IS NULL
          OR m.unit_id = foto_upload_tokens.unit_id
        )
    )
  )
);

CREATE POLICY foto_upload_tokens_insert ON public.foto_upload_tokens
FOR INSERT WITH CHECK (
  tenant_id IS NOT NULL
  AND (
    is_tenant_owner(tenant_id)
    OR EXISTS (
      SELECT 1
      FROM user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = foto_upload_tokens.tenant_id
        AND m.is_active = true
        AND (
          foto_upload_tokens.unit_id IS NULL
          OR m.unit_id = foto_upload_tokens.unit_id
        )
    )
  )
);

CREATE POLICY foto_upload_tokens_update ON public.foto_upload_tokens
FOR UPDATE
USING (
  tenant_id IS NOT NULL
  AND (
    is_tenant_owner(tenant_id)
    OR EXISTS (
      SELECT 1
      FROM user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = foto_upload_tokens.tenant_id
        AND m.is_active = true
        AND (
          foto_upload_tokens.unit_id IS NULL
          OR m.unit_id = foto_upload_tokens.unit_id
        )
    )
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND (
    is_tenant_owner(tenant_id)
    OR EXISTS (
      SELECT 1
      FROM user_unit_memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = foto_upload_tokens.tenant_id
        AND m.is_active = true
        AND (
          foto_upload_tokens.unit_id IS NULL
          OR m.unit_id = foto_upload_tokens.unit_id
        )
    )
  )
);

CREATE POLICY foto_upload_tokens_delete ON public.foto_upload_tokens
FOR DELETE USING (
  tenant_id IS NOT NULL
  AND is_tenant_owner(tenant_id)
);


-- ============================================================
-- 20260611_fix_socios_delete_scope.sql
-- ============================================================
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


-- ============================================================
-- 20260611_fix_requerimentos_delete_scope.sql
-- ============================================================
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


-- ============================================================
-- 20260611_fix_finance_and_reap_delete_scope.sql
-- ============================================================
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


-- ============================================================
-- 20260611_fix_finance_purge_authorization.sql
-- ============================================================
-- Replace legacy app_metadata.role = 'admin' gate with the current
-- tenant_users authorization model: owner or presidente.

CREATE OR REPLACE FUNCTION public.purge_cancelled_bulk_v1(p_older_than_days integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_count int;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.tenant_users tu
        WHERE tu.user_id = auth.uid()
          AND tu.is_active = true
          AND (
            tu.tenant_role = 'owner'
            OR tu.operator_type = 'presidente'
          )
    ) THEN
        RAISE EXCEPTION 'Acesso negado: Requer privilegios de administrador.';
    END IF;

    INSERT INTO public.audit_log_financeiro (
        table_name, record_id, operation, old_data, changed_by
    )
    SELECT
        'financeiro_lancamentos', l.id, 'PURGE_BULK', to_jsonb(l.*), auth.uid()
    FROM public.financeiro_lancamentos l
    WHERE l.status = 'cancelado'
      AND l.cancelado_em < (now() - (p_older_than_days || ' days')::interval);

    UPDATE public.financeiro_cobrancas_geradas
    SET lancamento_id = NULL
    WHERE lancamento_id IN (
        SELECT l.id FROM public.financeiro_lancamentos l
        WHERE l.status = 'cancelado'
          AND l.cancelado_em < (now() - (p_older_than_days || ' days')::interval)
    );

    WITH deleted AS (
        DELETE FROM public.financeiro_lancamentos
        WHERE status = 'cancelado'
          AND cancelado_em < (now() - (p_older_than_days || ' days')::interval)
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM deleted;

    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_payment_v1(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_old_data jsonb;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.tenant_users tu
        WHERE tu.user_id = auth.uid()
          AND tu.is_active = true
          AND (
            tu.tenant_role = 'owner'
            OR tu.operator_type = 'presidente'
          )
    ) THEN
        RAISE EXCEPTION 'Acesso negado: Requer privilégios de administrador.';
    END IF;

    SELECT to_jsonb(l.*) INTO v_old_data
    FROM public.financeiro_lancamentos l
    WHERE l.id = p_id;

    IF v_old_data IS NULL THEN
        RAISE EXCEPTION 'Lançamento não encontrado.';
    END IF;

    IF (v_old_data->>'status') != 'cancelado' THEN
        RAISE EXCEPTION 'Apenas lançamentos com status "cancelado" podem ser excluídos permanentemente.';
    END IF;

    UPDATE public.financeiro_cobrancas_geradas
    SET lancamento_id = NULL
    WHERE lancamento_id = p_id;

    INSERT INTO public.audit_log_financeiro (
        table_name, record_id, operation, old_data, changed_by
    ) VALUES (
        'financeiro_lancamentos', p_id, 'PURGE', v_old_data, auth.uid()
    );

    DELETE FROM public.financeiro_lancamentos WHERE id = p_id;
END;
$$;


