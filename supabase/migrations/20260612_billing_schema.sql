BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- billing_plans
-- Faixas de preço vigentes. Renovação usa o plano ativo na data de renovação.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_plans (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text    NOT NULL,
  max_socios_from int    NOT NULL,
  max_socios_to   int,                      -- NULL = sem limite superior
  price_monthly  numeric(10,2) NOT NULL,
  price_annual   numeric(10,2) NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  effective_from date    NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_plans_prices_positive CHECK (price_monthly > 0 AND price_annual > 0),
  CONSTRAINT billing_plans_range_valid     CHECK (
    max_socios_from >= 0
    AND (max_socios_to IS NULL OR max_socios_to > max_socios_from)
  )
);

COMMENT ON TABLE  public.billing_plans IS
  'Faixas de preço vigentes. Renovação sempre usa o plano ativo na data de renovação. '
  'CAVEAT: o banco não impede sobreposição de faixas (ex: dois planos ativos cobrindo o mesmo intervalo). '
  'A aplicação deve garantir não-sobreposição ao inserir ou ativar planos.';
COMMENT ON COLUMN public.billing_plans.max_socios_to IS 'NULL = sem limite superior (faixa aberta).';
COMMENT ON COLUMN public.billing_plans.effective_from IS 'Data a partir da qual este plano/faixa entra em vigor para novas renovações.';

-- ─────────────────────────────────────────────────────────────────────────────
-- billing_accounts
-- Conta de cobrança por cliente. Uma conta por tenant. Fonte de verdade do domínio.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_accounts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_client_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  provider             text NOT NULL DEFAULT 'asaas',
  provider_customer_id text,
  lifecycle_status     text NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_status IN (
      'draft','provisioning','trial_active','payment_pending',
      'active','past_due','suspended','cancelled'
    )),
  trial_starts_at      timestamptz,
  trial_ends_at        timestamptz,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  current_plan_id      uuid REFERENCES public.billing_plans(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_accounts_one_per_tenant  UNIQUE (admin_client_id),
  CONSTRAINT billing_accounts_trial_valid     CHECK (
    trial_ends_at IS NULL OR trial_starts_at IS NULL OR trial_ends_at > trial_starts_at
  ),
  CONSTRAINT billing_accounts_period_valid    CHECK (
    current_period_end IS NULL OR current_period_start IS NULL OR current_period_end > current_period_start
  )
);

COMMENT ON TABLE  public.billing_accounts IS 'Conta de cobrança por cliente SIGESS. Fonte de verdade do domínio billing. Uma conta por tenant.';
COMMENT ON COLUMN public.billing_accounts.admin_client_id IS 'FK para tenants.id no Admin DB. NÃO é runtime_tenant_id.';
COMMENT ON COLUMN public.billing_accounts.current_plan_id IS 'Plano vigente na ativação — somente para exibição. Renovação recalcula pela tabela billing_plans ativa na data.';

-- ─────────────────────────────────────────────────────────────────────────────
-- billing_subscriptions
-- Assinatura recorrente vinculada a uma conta.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id       uuid NOT NULL REFERENCES public.billing_accounts(id) ON DELETE RESTRICT,
  provider_subscription_id text,
  plan_id                  uuid NOT NULL REFERENCES public.billing_plans(id),
  billing_status           text NOT NULL DEFAULT 'pending_payment'
    CHECK (billing_status IN ('trialing','pending_payment','active','overdue','cancelled')),
  interval                 text NOT NULL CHECK (interval IN ('monthly','annual')),
  amount                   numeric(10,2) NOT NULL,
  next_billing_date        date,
  starts_at                timestamptz,
  ends_at                  timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_subscriptions_amount_positive CHECK (amount > 0),
  CONSTRAINT billing_subscriptions_period_valid    CHECK (
    ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at
  )
);

COMMENT ON TABLE public.billing_subscriptions IS 'Assinatura recorrente. Status atualizado por webhook via billing-webhook edge function.';

-- ─────────────────────────────────────────────────────────────────────────────
-- billing_charges
-- Cobranças individuais: geradas por assinatura ou avulsas (ajuste/complementar).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_charges (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id uuid NOT NULL REFERENCES public.billing_accounts(id) ON DELETE RESTRICT,
  subscription_id    uuid REFERENCES public.billing_subscriptions(id),  -- NULL = cobrança avulsa
  provider_charge_id text,
  type               text NOT NULL
    CHECK (type IN ('subscription_renewal','tier_upgrade','one_off','adjustment')),
  status             text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','overdue','cancelled','failed')),
  amount             numeric(10,2) NOT NULL,
  due_date           date NOT NULL,
  paid_at            timestamptz,
  description        text,
  payment_url        text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_charges_amount_positive   CHECK (amount > 0),
  CONSTRAINT billing_charges_paid_after_create CHECK (paid_at IS NULL OR paid_at >= created_at)
);

COMMENT ON TABLE  public.billing_charges IS 'Cobranças individuais (recorrentes ou avulsas). Status atualizado por webhook ou pelo Admin.';
COMMENT ON COLUMN public.billing_charges.subscription_id IS 'NULL indica cobrança avulsa/complementar sem assinatura associada.';
COMMENT ON COLUMN public.billing_charges.payment_url IS 'Link direto para pagamento gerado pelo provider (boleto/pix).';

-- ─────────────────────────────────────────────────────────────────────────────
-- billing_events
-- Inbox idempotente de webhooks do provider.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         text NOT NULL,
  provider_event_id text NOT NULL,
  event_type       text NOT NULL,
  payload          jsonb NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processed','failed')),
  processed_at     timestamptz,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_events_idempotency UNIQUE (provider, provider_event_id)
);

COMMENT ON TABLE  public.billing_events IS 'Inbox idempotente de webhooks. Escrita feita pela edge function billing-webhook via service_role.';
COMMENT ON COLUMN public.billing_events.payload IS 'Payload bruto preservado. Nunca truncar — necessário para reprocessamento.';
COMMENT ON CONSTRAINT billing_events_idempotency ON public.billing_events IS 'Garante idempotência: o mesmo evento do provider nunca é processado duas vezes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- billing_portal_tokens
-- Tokens de acesso ao portal público de pagamento.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_portal_tokens (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id uuid NOT NULL REFERENCES public.billing_accounts(id) ON DELETE CASCADE,
  charge_id          uuid REFERENCES public.billing_charges(id),  -- NULL = portal geral da conta
  token              uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  expires_at         timestamptz NOT NULL,
  used_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_portal_tokens_expiry_valid CHECK (expires_at > created_at)
);

COMMENT ON TABLE  public.billing_portal_tokens IS
  'Tokens de acesso ao portal público /pagar/:token no Web. Expiram e registram uso. '
  'OBJETO SENSÍVEL: materializa acesso público indireto. Geração e consumo devem ocorrer '
  'via Edge Function; nunca expor token bruto em logs ou respostas de API.';
COMMENT ON COLUMN public.billing_portal_tokens.charge_id IS 'NULL = token de portal geral da conta, não vinculado a uma cobrança específica.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Índices
-- ─────────────────────────────────────────────────────────────────────────────
-- Lookup / status
CREATE INDEX IF NOT EXISTS idx_billing_accounts_client      ON public.billing_accounts(admin_client_id);
CREATE INDEX IF NOT EXISTS idx_billing_accounts_lifecycle   ON public.billing_accounts(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_acct   ON public.billing_subscriptions(billing_account_id);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_status ON public.billing_subscriptions(billing_status);
CREATE INDEX IF NOT EXISTS idx_billing_charges_acct         ON public.billing_charges(billing_account_id);
CREATE INDEX IF NOT EXISTS idx_billing_charges_status       ON public.billing_charges(status);
CREATE INDEX IF NOT EXISTS idx_billing_charges_sub          ON public.billing_charges(subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_events_status        ON public.billing_events(status);
CREATE INDEX IF NOT EXISTS idx_billing_portal_tokens_token  ON public.billing_portal_tokens(token);

-- Unicidade dos IDs externos do provider (idempotência e reconciliação)
-- Índices parciais: permite NULL enquanto o registro ainda não foi provisionado no provider.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_billing_accounts_provider_customer
  ON public.billing_accounts(provider, provider_customer_id)
  WHERE provider_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_billing_subscriptions_provider_id
  ON public.billing_subscriptions(provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_billing_charges_provider_id
  ON public.billing_charges(provider_charge_id)
  WHERE provider_charge_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- Premissa: Admin DB é backoffice fechado. Qualquer usuário autenticado neste
-- projeto é um operador interno confiável. Não há segmentação entre admins.
-- Edge Functions usam service_role (bypass RLS) para webhook/sync/reconciliação.
-- Se essa premissa mudar (ex: roles diferenciados), rever todas as policies abaixo.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.billing_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_accounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_charges       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_portal_tokens ENABLE ROW LEVEL SECURITY;

-- billing_plans
DROP POLICY IF EXISTS billing_plans_select ON public.billing_plans;
CREATE POLICY billing_plans_select ON public.billing_plans FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS billing_plans_insert ON public.billing_plans;
CREATE POLICY billing_plans_insert ON public.billing_plans FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS billing_plans_update ON public.billing_plans;
CREATE POLICY billing_plans_update ON public.billing_plans FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS billing_plans_delete ON public.billing_plans;
CREATE POLICY billing_plans_delete ON public.billing_plans FOR DELETE TO authenticated USING (true);

-- billing_accounts
DROP POLICY IF EXISTS billing_accounts_select ON public.billing_accounts;
CREATE POLICY billing_accounts_select ON public.billing_accounts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS billing_accounts_insert ON public.billing_accounts;
CREATE POLICY billing_accounts_insert ON public.billing_accounts FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS billing_accounts_update ON public.billing_accounts;
CREATE POLICY billing_accounts_update ON public.billing_accounts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS billing_accounts_delete ON public.billing_accounts;
CREATE POLICY billing_accounts_delete ON public.billing_accounts FOR DELETE TO authenticated USING (true);

-- billing_subscriptions
DROP POLICY IF EXISTS billing_subscriptions_select ON public.billing_subscriptions;
CREATE POLICY billing_subscriptions_select ON public.billing_subscriptions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS billing_subscriptions_insert ON public.billing_subscriptions;
CREATE POLICY billing_subscriptions_insert ON public.billing_subscriptions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS billing_subscriptions_update ON public.billing_subscriptions;
CREATE POLICY billing_subscriptions_update ON public.billing_subscriptions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS billing_subscriptions_delete ON public.billing_subscriptions;
CREATE POLICY billing_subscriptions_delete ON public.billing_subscriptions FOR DELETE TO authenticated USING (true);

-- billing_charges
DROP POLICY IF EXISTS billing_charges_select ON public.billing_charges;
CREATE POLICY billing_charges_select ON public.billing_charges FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS billing_charges_insert ON public.billing_charges;
CREATE POLICY billing_charges_insert ON public.billing_charges FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS billing_charges_update ON public.billing_charges;
CREATE POLICY billing_charges_update ON public.billing_charges FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS billing_charges_delete ON public.billing_charges;
CREATE POLICY billing_charges_delete ON public.billing_charges FOR DELETE TO authenticated USING (true);

-- billing_events: admins leem; escrita é feita por service_role (bypass RLS)
DROP POLICY IF EXISTS billing_events_select ON public.billing_events;
CREATE POLICY billing_events_select ON public.billing_events FOR SELECT TO authenticated USING (true);

-- billing_portal_tokens
DROP POLICY IF EXISTS billing_portal_tokens_select ON public.billing_portal_tokens;
CREATE POLICY billing_portal_tokens_select ON public.billing_portal_tokens FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS billing_portal_tokens_insert ON public.billing_portal_tokens;
CREATE POLICY billing_portal_tokens_insert ON public.billing_portal_tokens FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS billing_portal_tokens_update ON public.billing_portal_tokens;
CREATE POLICY billing_portal_tokens_update ON public.billing_portal_tokens FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS billing_portal_tokens_delete ON public.billing_portal_tokens;
CREATE POLICY billing_portal_tokens_delete ON public.billing_portal_tokens FOR DELETE TO authenticated USING (true);

COMMIT;
