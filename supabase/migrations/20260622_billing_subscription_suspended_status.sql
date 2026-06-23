ALTER TABLE billing_subscriptions
  DROP CONSTRAINT IF EXISTS billing_subscriptions_billing_status_check;
ALTER TABLE billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_billing_status_check
  CHECK (billing_status IN ('trialing', 'pending_payment', 'active', 'overdue', 'cancelled', 'suspended'));
