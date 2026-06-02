-- Permite que o gestor (owner) leia todos os tenant_users da própria entidade.
-- Necessário para o portal /administration resolver operadores e joins por polo.

drop policy if exists tenant_users_select_owner on public.tenant_users;

create policy tenant_users_select_owner
on public.tenant_users
for select
to authenticated
using (public.is_tenant_owner(tenant_id));
