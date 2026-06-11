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
