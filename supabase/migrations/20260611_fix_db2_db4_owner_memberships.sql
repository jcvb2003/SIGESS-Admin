-- Migration: enforce owner has no unit memberships (DB-2 + DB-4)
-- DB-2: block INSERT/UPDATE into user_unit_memberships when user is owner
-- DB-4: clean memberships when a member is promoted to owner

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

-- DB-4: when promoted to owner, remove all existing memberships
CREATE OR REPLACE FUNCTION cleanup_owner_memberships()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_role = 'owner' AND OLD.tenant_role <> 'owner' THEN
    DELETE FROM user_unit_memberships
    WHERE user_id = NEW.user_id AND tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_owner_memberships ON tenant_users;
CREATE TRIGGER trg_cleanup_owner_memberships
AFTER UPDATE ON tenant_users
FOR EACH ROW EXECUTE FUNCTION cleanup_owner_memberships();
