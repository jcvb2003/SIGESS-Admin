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
