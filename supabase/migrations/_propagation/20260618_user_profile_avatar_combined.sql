alter table public.user_profiles
  add column if not exists avatar_path text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

drop policy if exists "avatars_insert_self" on storage.objects;
create policy "avatars_insert_self"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg');

drop policy if exists "avatars_update_self" on storage.objects;
create policy "avatars_update_self"
  on storage.objects for update to authenticated
  using     (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg')
  with check (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg');

drop policy if exists "avatars_delete_self" on storage.objects;
create policy "avatars_delete_self"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg');

drop policy if exists "avatars_select_self" on storage.objects;
create policy "avatars_select_self"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg');
