-- Round 2: adicionar campos de bloqueio de billing à projeção billing_summary.
-- ADD COLUMN IF NOT EXISTS: idempotente, seguro de re-executar.

ALTER TABLE public.billing_summary
  ADD COLUMN IF NOT EXISTS is_billing_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_blocked_reason text
    CHECK (billing_blocked_reason IN ('billing_delinquent', 'manual_suspend'));

COMMENT ON COLUMN public.billing_summary.is_billing_blocked IS
  'Projeção de billing_accounts.is_billing_blocked. True = acesso bloqueado por billing.';

COMMENT ON COLUMN public.billing_summary.billing_blocked_reason IS
  'billing_delinquent: inadimplência. manual_suspend: suspensão pelo Admin.';
