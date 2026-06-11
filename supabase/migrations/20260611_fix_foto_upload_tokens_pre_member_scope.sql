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
