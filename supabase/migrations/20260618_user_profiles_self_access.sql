-- Permite que cada usuário autenticado atualize apenas o próprio perfil.
-- Contexto: user_profiles não tinha GRANT UPDATE nem policy RLS de UPDATE para
-- authenticated, bloqueando a edição de nome na aba Perfil (Settings > Perfil).
--
-- NÃO toca na policy de SELECT (user_profiles_select_self) — ela já existe no
-- schema vivo com cláusula is_tenant_owner(...) além de id = auth.uid(), e
-- recriar aqui causaria regressão de leitura para owner/admin.

grant update on public.user_profiles to authenticated;

alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_update_self" on public.user_profiles;
create policy "user_profiles_update_self"
  on public.user_profiles
  for update
  to authenticated
  using  (id = auth.uid())
  with check (id = auth.uid());
