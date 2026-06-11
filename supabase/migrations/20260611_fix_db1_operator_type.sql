-- Migration: tighten operator_type CHECK on tenant_users
-- Root cause: member with operator_type NULL was accepted — no layer handled this state
-- Fix: owner must have NULL operator_type; member must have 'presidente' or 'auxiliar'

ALTER TABLE tenant_users DROP CONSTRAINT IF EXISTS tenant_users_operator_type_check;

ALTER TABLE tenant_users ADD CONSTRAINT tenant_users_operator_type_check CHECK (
  (tenant_role = 'owner' AND operator_type IS NULL)
  OR
  (tenant_role = 'member' AND operator_type IN ('presidente', 'auxiliar'))
);
