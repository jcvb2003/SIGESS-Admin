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
