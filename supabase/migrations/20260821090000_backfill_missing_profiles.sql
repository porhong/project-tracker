-- Backfill public.profiles for auth users whose profile row is missing.
--
-- The on_auth_user_created trigger only fires for users created after it was
-- installed. If the public schema is ever rebuilt while auth.users survives
-- (or a profile row is deleted out from under a user), the user can still sign
-- in but has no profile -- the app then redirect-loops between /dashboard
-- (no profile) and /login (proxy bounces signed-in users back). Heal any such
-- drift here; role comes from app_metadata, mirroring private.handle_new_user().

insert into public.profiles (id, email, full_name, role)
select
  u.id,
  u.email,
  nullif(u.raw_user_meta_data ->> 'full_name', ''),
  coalesce((u.raw_app_meta_data ->> 'role')::public.app_role, 'viewer')
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;
