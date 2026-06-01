-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 7 — Rename entidades → projetos + criar clientes
-- Data: 2026-06-01
--
-- O que faz:
--   1. Renomeia entidades → projetos (mantém IDs/FKs por OID)
--   2. Renomeia nome_entidade → project_name
--   3. Adiciona e popula coluna topology (derivada de deployment_mode+shared_mode)
--   4. Adiciona supabase_account_id (estava só no tipo TS)
--   5. Renomeia constraints entidades_* → projetos_*
--   6. Renomeia RLS policy
--   7. Cria tabela clientes com FK → projetos
--   8. Backfill clientes a partir dos dados comerciais ainda em projetos
--   9. Remove colunas comerciais de projetos (email, assinatura, etc.)
--  10. Remove colunas de topology legadas (deployment_mode, shared_mode, etc.)
--  11. Habilita RLS em clientes
--  12. Renomeia onboarding_jobs.entidade_id → projeto_id e recria FK
--  13. Expande CHECK de status do onboarding_jobs (adiciona finalizing_setup, etc.)
--
-- ATENÇÃO: irreversível. Fazer backup antes de aplicar em produção.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Rename tabela ─────────────────────────────────────────────────────────
ALTER TABLE public.entidades RENAME TO projetos;


-- ── 2. Rename coluna principal ───────────────────────────────────────────────
ALTER TABLE public.projetos RENAME COLUMN nome_entidade TO project_name;


-- ── 3. Topology: adicionar coluna nullable, popular, tornar NOT NULL ─────────
--    Começamos nullable para poder fazer UPDATE sem violar NOT NULL.

ALTER TABLE public.projetos ADD COLUMN topology text;

UPDATE public.projetos SET topology = CASE
  WHEN deployment_mode = 'shared' AND shared_mode = 'multi_polo' THEN 'shared_multi_polo'
  WHEN deployment_mode = 'shared' AND shared_mode = 'single'     THEN 'shared_multi_single'
  WHEN deployment_mode = 'shared' AND shared_mode = 'polo'       THEN 'shared_multi_polo'
  WHEN deployment_mode = 'shared' AND shared_mode = 'hybrid'     THEN 'shared_hybrid'
  WHEN deployment_mode = 'shared'                                THEN 'shared_multi_single'
  ELSE 'isolated_single'
END;

ALTER TABLE public.projetos
  ALTER COLUMN topology SET NOT NULL,
  ALTER COLUMN topology SET DEFAULT 'unconfigured',
  ADD CONSTRAINT projetos_topology_check CHECK (topology IN (
    'unconfigured',
    'isolated_single',
    'isolated_polo',
    'shared_multi_single',
    'shared_multi_polo',
    'shared_hybrid'
  ));


-- ── 4. Adicionar supabase_account_id ─────────────────────────────────────────
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS supabase_account_id uuid;


-- ── 5. Renomear constraints herdadas de entidades_* → projetos_* ─────────────
ALTER TABLE public.projetos RENAME CONSTRAINT entidades_pkey                             TO projetos_pkey;
ALTER TABLE public.projetos RENAME CONSTRAINT entidades_tenant_code_key                  TO projetos_tenant_code_key;
ALTER TABLE public.projetos RENAME CONSTRAINT entidades_key_status_check                 TO projetos_key_status_check;
ALTER TABLE public.projetos RENAME CONSTRAINT entidades_supabase_publishable_key_not_blank TO projetos_supabase_publishable_key_not_blank;
ALTER TABLE public.projetos RENAME CONSTRAINT entidades_supabase_url_not_blank           TO projetos_supabase_url_not_blank;
ALTER TABLE public.projetos RENAME CONSTRAINT entidades_tenant_code_not_blank            TO projetos_tenant_code_not_blank;
-- entidades_shared_mode_check será eliminada automaticamente com DROP COLUMN shared_mode


-- ── 6. Renomear RLS policy ───────────────────────────────────────────────────
ALTER POLICY "Admins can do everything on entidades"
  ON public.projetos
  RENAME TO "Admins can do everything on projetos";


-- ── 7. Criar tabela clientes ─────────────────────────────────────────────────
CREATE TABLE public.clientes (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL,
  nome_entidade     text        NOT NULL,
  nome_abreviado    text,
  -- tenant_code: fonte canônica no Admin; compat Web até drop de projetos.tenant_code
  tenant_code       text        NOT NULL,
  runtime_tenant_id uuid,
  supports_units    boolean     NOT NULL DEFAULT false,
  email             text,
  telefone          text,
  cnpj_cpf          text,
  logo_url          text,
  assinatura        text        NOT NULL DEFAULT 'trial',
  acesso_expira_em  timestamptz,
  max_socios        integer     NOT NULL DEFAULT 0,
  status            text        NOT NULL DEFAULT 'active',
  data_cadastro     timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT clientes_pkey             PRIMARY KEY (id),
  CONSTRAINT clientes_project_id_fkey  FOREIGN KEY (project_id)
    REFERENCES public.projetos(id) ON DELETE CASCADE,
  CONSTRAINT clientes_tenant_code_key  UNIQUE (tenant_code),
  CONSTRAINT clientes_assinatura_check CHECK (assinatura IN ('trial', 'monthly', 'annual')),
  CONSTRAINT clientes_status_check     CHECK (status IN ('active', 'inactive', 'suspended'))
);

CREATE INDEX clientes_project_id_idx ON public.clientes (project_id);


-- ── 8. Backfill clientes enquanto colunas comerciais ainda existem em projetos ─
--
--    Conversão de assinatura: o legado usava 'mensal'/'anual', o novo usa
--    'monthly'/'annual'/'trial'. Mapeamos aqui para não violar o CHECK.

INSERT INTO public.clientes (
  project_id,
  nome_entidade,
  nome_abreviado,
  tenant_code,
  runtime_tenant_id,
  supports_units,
  email,
  telefone,
  logo_url,
  assinatura,
  acesso_expira_em,
  max_socios,
  status,
  data_cadastro,
  created_at,
  updated_at
)
SELECT
  p.id,
  p.project_name,
  p.nome_abreviado,
  p.tenant_code,
  p.shared_tenant_id,
  CASE
    WHEN p.topology IN ('shared_multi_polo', 'isolated_polo', 'shared_hybrid') THEN true
    ELSE false
  END                                         AS supports_units,
  p.email,
  p.telefone,
  p.logo_url,
  CASE p.assinatura
    WHEN 'mensal'   THEN 'monthly'
    WHEN 'monthly'  THEN 'monthly'
    WHEN 'anual'    THEN 'annual'
    WHEN 'annual'   THEN 'annual'
    WHEN 'trial'    THEN 'trial'
    ELSE                 'trial'
  END                                         AS assinatura,
  p.acesso_expira_em,
  COALESCE(p.max_socios, 0)                   AS max_socios,
  'active'                                    AS status,
  p.data_cadastro,
  p.data_cadastro                             AS created_at,
  now()                                       AS updated_at
FROM public.projetos p;


-- ── 9. Dropar colunas comerciais de projetos (já backfilladas em clientes) ────
ALTER TABLE public.projetos
  DROP COLUMN email,
  DROP COLUMN telefone,
  DROP COLUMN logo_url,
  DROP COLUMN assinatura,
  DROP COLUMN acesso_expira_em,
  DROP COLUMN max_socios,
  DROP COLUMN nome_abreviado;


-- ── 10. Dropar colunas de topology legadas ────────────────────────────────────
--    shared_mode_check é eliminado automaticamente com DROP COLUMN shared_mode
ALTER TABLE public.projetos
  DROP COLUMN deployment_mode,
  DROP COLUMN shared_mode,
  DROP COLUMN shared_project_ref,
  DROP COLUMN shared_tenant_id;


-- ── 11. RLS em clientes ───────────────────────────────────────────────────────
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything on clientes"
  ON public.clientes FOR ALL
  TO authenticated
  USING     (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));


-- ── 12. onboarding_jobs: entidade_id → projeto_id ────────────────────────────
ALTER TABLE public.onboarding_jobs
  DROP CONSTRAINT onboarding_jobs_entidade_id_fkey;

ALTER TABLE public.onboarding_jobs
  RENAME COLUMN entidade_id TO projeto_id;

ALTER TABLE public.onboarding_jobs
  ADD CONSTRAINT onboarding_jobs_projeto_id_fkey
  FOREIGN KEY (projeto_id) REFERENCES public.projetos(id);


-- ── 13. Expandir status CHECK do onboarding_jobs ─────────────────────────────
--    Adiciona: finalizing_setup, configuring_storage, deploying_edge_functions
--    Mantém: todos os valores legados para não quebrar jobs históricos
ALTER TABLE public.onboarding_jobs
  DROP CONSTRAINT onboarding_jobs_status_check;

ALTER TABLE public.onboarding_jobs
  ADD CONSTRAINT onboarding_jobs_status_check CHECK (status IN (
    'pending',
    'fetching_keys',
    'configuring_auth',
    'running_migrations',
    'configuring_storage',
    'deploying_edge_functions',
    'seeding',
    'creating_admin',
    'registering_tenant',
    'finalizing_setup',
    'vercel_setup',
    'completed',
    'failed'
  ));


COMMIT;
