-- Fix profile photo uploads: upsert requires UPDATE on storage.objects (legacy policies were INSERT-only).

-- Remove legacy dashboard-created policies (different names from 20260602150000 migration).
drop policy if exists "Avatar public read" on storage.objects;
drop policy if exists "Avatar upload" on storage.objects;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_authenticated_insert_own" on storage.objects;
drop policy if exists "avatars_authenticated_update_own" on storage.objects;
drop policy if exists "avatars_authenticated_delete_own" on storage.objects;

create policy "avatars_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'avatars');

create policy "avatars_authenticated_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and exists (
      select 1
      from public.athletes a
      where a.id::text = (storage.foldername(name))[1]
        and (a.user_id = auth.uid() or a.id = auth.uid())
    )
  );

create policy "avatars_authenticated_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and exists (
      select 1
      from public.athletes a
      where a.id::text = (storage.foldername(name))[1]
        and (a.user_id = auth.uid() or a.id = auth.uid())
    )
  )
  with check (
    bucket_id = 'avatars'
    and exists (
      select 1
      from public.athletes a
      where a.id::text = (storage.foldername(name))[1]
        and (a.user_id = auth.uid() or a.id = auth.uid())
    )
  );

create policy "avatars_authenticated_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and exists (
      select 1
      from public.athletes a
      where a.id::text = (storage.foldername(name))[1]
        and (a.user_id = auth.uid() or a.id = auth.uid())
    )
  );

drop policy if exists "Update own" on public.athletes;

create policy "Update own"
  on public.athletes
  for update
  using (auth.uid() = id or user_id = auth.uid())
  with check (auth.uid() = id or user_id = auth.uid());
