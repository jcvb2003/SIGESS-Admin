CREATE TABLE IF NOT EXISTS public.billing_provider_settings (
  id                  text PRIMARY KEY DEFAULT 'default',
  provider            text NOT NULL DEFAULT 'stub',
  asaas_api_key       text,
  asaas_sandbox       boolean NOT NULL DEFAULT true,
  asaas_webhook_token text,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          text
);

ALTER TABLE public.billing_provider_settings ENABLE ROW LEVEL SECURITY;
-- No RLS policies: access exclusively via service_role (edge functions).
-- UI reads via billing-action get_provider_settings — never direct.
