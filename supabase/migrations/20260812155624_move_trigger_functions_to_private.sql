-- Move trigger functions out of the exposed API schema.
--
-- `public.handle_new_user()` is SECURITY DEFINER, and Postgres grants EXECUTE
-- to PUBLIC by default, so PostgREST exposed it at /rest/v1/rpc/handle_new_user
-- to anon and authenticated (database linter 0028/0029). Trigger functions have
-- no business being reachable over the API at all, so they move to `private`
-- rather than merely having their grants revoked.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
drop function if exists public.set_updated_at();

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- The role is read from app_metadata, which is writable only by the service
-- role -- never from user_metadata, which the user can edit themselves.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_app_meta_data ->> 'role')::public.app_role, 'viewer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Belt and braces: `private` is not an exposed schema, but revoke anyway so a
-- future change to the exposed schema list cannot surface these.
revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;
