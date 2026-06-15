-- pg_cron pode não estar disponível em todos os planos do Supabase.
-- Se falhar aqui, habilitar via Dashboard → Database → Extensions → pg_cron
-- e executar manualmente a limpeza:
--   DELETE FROM public.billing_portal_tokens WHERE expires_at < now() - interval '3 days';
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotente: remove job anterior se existir, depois recria
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-billing-portal-tokens') THEN
    PERFORM cron.unschedule('cleanup-billing-portal-tokens');
  END IF;
END$$;

SELECT cron.schedule(
  'cleanup-billing-portal-tokens',
  '0 3 * * *',
  $$
  DELETE FROM public.billing_portal_tokens
  WHERE expires_at < now() - interval '3 days';
  $$
);
