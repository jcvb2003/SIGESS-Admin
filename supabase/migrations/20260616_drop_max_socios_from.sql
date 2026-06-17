ALTER TABLE public.billing_plans
  DROP CONSTRAINT IF EXISTS billing_plans_range_check;

ALTER TABLE public.billing_plans
  DROP COLUMN IF EXISTS max_socios_from;

ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_to_positive
    CHECK (max_socios_to IS NULL OR max_socios_to > 0);
