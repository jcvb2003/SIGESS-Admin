-- Permite que cada usuário autenticado atualize apenas o próprio perfil.
-- NÃO toca na policy de SELECT — ela já existe com is_tenant_owner(...).

grant update on public.user_profiles to authenticated;

alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_update_self" on public.user_profiles;
create policy "user_profiles_update_self"
  on public.user_profiles
  for update
  to authenticated
  using  (id = auth.uid())
  with check (id = auth.uid());
