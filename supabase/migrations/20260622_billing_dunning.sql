-- past_due_since: rastreia quando a conta entrou em past_due pela primeira vez
-- Setado via codigo (invariante: nunca sobrescrito, apenas cleared ao voltar para active)
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS past_due_since timestamptz;

-- dunning_days_threshold: dias em past_due antes de suspensao automatica (default: 15)
ALTER TABLE billing_provider_settings
  ADD COLUMN IF NOT EXISTS dunning_days_threshold integer NOT NULL DEFAULT 15;
