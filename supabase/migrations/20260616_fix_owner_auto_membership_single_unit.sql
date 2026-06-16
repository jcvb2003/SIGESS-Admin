BEGIN;

CREATE OR REPLACE FUNCTION public.auto_membership_single_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_id uuid;
  v_unit_count integer;
BEGIN
  SELECT count(*)
  INTO v_unit_count
  FROM public.tenant_units
  WHERE tenant_id = NEW.tenant_id
    AND is_active = true;

  IF v_unit_count <> 1 THEN
    RETURN NEW;
  END IF;

  -- owner governa o tenant inteiro e nunca recebe membership de unit.
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

COMMIT;
