-- billing_summary: projeção read-only do billing para o Web App
-- Escrita exclusivamente pelo Admin via Management API (service_role)
-- Nunca escrita diretamente pelo Web ou pelo tenant DB

BEGIN;

CREATE TABLE IF NOT EXISTS public.billing_summary (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid,                        -- NULL: isolated topology; preenchido: shared
  subscription_status   text,
  plan_name             text,
  next_billing_date     date,                        -- proxima cobranca/renovacao
  has_pending_charge    boolean NOT NULL DEFAULT false,
  pending_charge_amount numeric(10,2),               -- reais, nao centavos
  payment_url           text,
  last_synced_at        timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- shared topology: 1 linha por tenant; NULLs excluidos (isolated usa NULL como singleton)
CREATE UNIQUE INDEX IF NOT EXISTS billing_summary_tenant_id_uniq
  ON public.billing_summary (tenant_id)
  WHERE tenant_id IS NOT NULL;

ALTER TABLE public.billing_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_summary FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_summary_select_authenticated ON public.billing_summary;
CREATE POLICY billing_summary_select_authenticated
  ON public.billing_summary
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NULL                          -- isolated: 1 DB = 1 tenant
    OR public.is_tenant_owner(tenant_id)
    OR EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid()
        AND tu.tenant_id = billing_summary.tenant_id
        AND tu.is_active = true
    )
  );

COMMENT ON TABLE public.billing_summary IS
  'Projecao read-only do billing SIGESS. Escrita pelo Admin via Management API. Nunca modificar diretamente.';
COMMENT ON COLUMN public.billing_summary.tenant_id IS
  'Discriminador de tenant. NULL para isolated (1 DB = 1 tenant). UUID para shared topology.';
COMMENT ON COLUMN public.billing_summary.next_billing_date IS
  'Proxima data de cobranca ou renovacao de assinatura. Nao e fim de periodo contabil.';

COMMIT;
