BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Round 2: modelo comercial de billing (Admin → Cliente)
-- Adiciona commercial_mode, campos de plano agendado e bloqueio de billing.
-- ─────────────────────────────────────────────────────────────────────────────

-- Passo 1: colunas nullable (sem DEFAULT em commercial_mode para não contaminar
-- as 3 contas Asaas existentes com valor errado antes do UPDATE abaixo)
ALTER TABLE public.billing_accounts
  ADD COLUMN commercial_mode text
    CHECK (commercial_mode IN ('manual', 'recorrente_mensal', 'anual')),
  ADD COLUMN next_plan_id uuid REFERENCES public.billing_plans(id),
  ADD COLUMN next_plan_effective_date date,
  ADD COLUMN is_billing_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN billing_blocked_reason text
    CHECK (billing_blocked_reason IN ('billing_delinquent', 'manual_suspend'));

COMMENT ON COLUMN public.billing_accounts.commercial_mode IS
  'Modo de cobrança: manual (avulso), recorrente_mensal, anual. '
  'manual = sem assinatura Asaas; Admin emite cobranças avulsas. '
  'Transição recorrente/anual → manual é rejeitada pelo billing-action.';

COMMENT ON COLUMN public.billing_accounts.next_plan_id IS
  'Plano agendado para o próximo ciclo. NULL = sem troca agendada.';

COMMENT ON COLUMN public.billing_accounts.next_plan_effective_date IS
  'Data de vigência do next_plan_id. NULL quando next_plan_id é NULL.';

COMMENT ON COLUMN public.billing_accounts.is_billing_blocked IS
  'True = acesso bloqueado por motivo de billing (inadimplência ou suspensão manual). '
  'Projetado em billing_summary para o Web.';

COMMENT ON COLUMN public.billing_accounts.billing_blocked_reason IS
  'billing_delinquent: cliente inadimplente (não muda lifecycle_status). '
  'manual_suspend: suspensão manual pelo Admin (muda lifecycle_status para suspended).';

-- Passo 2: contas Asaas existentes (SINPESCA OEIRAS, ASPRG, FAFER-PA)
-- Todas têm provider = 'asaas' e representam clientes com assinatura recorrente.
UPDATE public.billing_accounts
  SET commercial_mode = 'recorrente_mensal'
  WHERE provider = 'asaas';

-- Passo 3: NOT NULL após todas as linhas existentes terem valor
ALTER TABLE public.billing_accounts
  ALTER COLUMN commercial_mode SET NOT NULL;

-- Passo 4: criar billing_accounts para as 8 cooperativas reais sem conta.
-- Regra de negócio: todo cliente comercialmente gerenciado tem billing_account.
-- Exclusão explícita de 3 tenants de teste identificados em 2026-06-21.
-- ATENÇÃO: se houver novos tenants de teste no futuro, atualizar esta lista
-- ou converter para allowlist de tenants reais — esta exclusão é heurística de momento.
-- provider = 'stub': campo texto livre sem CHECK constraint (validado 2026-06-21).
INSERT INTO public.billing_accounts (admin_client_id, provider, commercial_mode, lifecycle_status)
SELECT id, 'stub', 'manual', 'draft'
FROM public.tenants
WHERE id NOT IN (SELECT admin_client_id FROM public.billing_accounts)
  AND tenant_code NOT IN ('genilson-cordeiro', 'marcos-junior', 'sinpesca-elaine');

COMMIT;
