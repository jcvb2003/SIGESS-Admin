ALTER TABLE billing_summary
  ADD COLUMN IF NOT EXISTS next_plan_name text,
  ADD COLUMN IF NOT EXISTS next_plan_effective_date date;
