-- Foto de perfil de usuário: coluna avatar_path + bucket avatars privado + policies.
-- Salva o caminho (não a URL) para desacoplar o banco do modo de entrega.

-- 1. Coluna avatar_path em user_profiles
alter table public.user_profiles
  add column if not exists avatar_path text;

-- 2. Bucket avatars (privado)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- 3. Policy: insert próprio arquivo
drop policy if exists "avatars_insert_self" on storage.objects;
create policy "avatars_insert_self"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg');

-- 4. Policy: update próprio arquivo
drop policy if exists "avatars_update_self" on storage.objects;
create policy "avatars_update_self"
  on storage.objects for update to authenticated
  using     (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg')
  with check (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg');

-- 5. Policy: delete próprio arquivo
drop policy if exists "avatars_delete_self" on storage.objects;
create policy "avatars_delete_self"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg');

-- 6. Policy: select próprio arquivo (necessário para signed URL funcionar)
drop policy if exists "avatars_select_self" on storage.objects;
create policy "avatars_select_self"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg');
