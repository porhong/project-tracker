-- Private, user-owned avatar storage. The database stores only the object key;
-- URLs are signed when rendering so an avatar is never publicly exposed.

alter table public.profiles
  add column avatar_path text;

alter table public.profiles
  add constraint profiles_avatar_path_not_blank
  check (avatar_path is null or btrim(avatar_path) <> '');

comment on column public.profiles.avatar_path is
  'Private Storage object key for the user avatar; never a public URL.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Users may update only their own non-authorisation profile fields. Column
-- privileges below prevent changes to email, role, and status even if a client
-- bypasses the app's Server Actions.
revoke update on table public.profiles from authenticated;
grant update (full_name, competency, avatar_path) on table public.profiles to authenticated;

create policy "profiles_update_self_profile_fields" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and (
      avatar_path is null
      or split_part(avatar_path, '/', 1) = (select auth.uid())::text
    )
  );

-- Keep profile photos private. A user's files are confined to their UUID
-- folder; admins can manage any avatar as part of their existing role.
create policy "avatars_select_own_or_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_admin())
    )
  );

create policy "avatars_insert_own_or_admin" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_admin())
    )
  );

create policy "avatars_update_own_or_admin" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_admin())
    )
  )
  with check (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_admin())
    )
  );

create policy "avatars_delete_own_or_admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_admin())
    )
  );
