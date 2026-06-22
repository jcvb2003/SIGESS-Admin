-- Tabela de presença de usuários para funcionalidade "quem está online".
-- Heartbeat: cada cliente faz upsert a cada 45s.
-- Online = last_seen_at > now() - interval '2 minutes'.
-- Sem cleanup ativo — user_id como PK garante 1 linha por usuário.

create table if not exists public.user_presence (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  tenant_id     uuid,
  unit_id       uuid,               -- null legítimo em tenants sem polo
  user_name     text,               -- snapshot leve; corrigido a cada heartbeat
  last_seen_at  timestamptz not null default now(),
  current_route text
);

alter table public.user_presence enable row level security;

-- Write: cada usuário gerencia apenas a própria linha
drop policy if exists "user_presence_write_self" on public.user_presence;
create policy "user_presence_write_self"
  on public.user_presence
  for all
  to authenticated
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Read: ver peers do mesmo tenant (filtro de polo fica na query da aplicação)
drop policy if exists "user_presence_select_tenant" on public.user_presence;
create policy "user_presence_select_tenant"
  on public.user_presence
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_users tu
      where tu.user_id = auth.uid()
        and tu.is_active = true
        and tu.tenant_id = user_presence.tenant_id
    )
  );
