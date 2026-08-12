-- Authentication + role-based access control (admin / viewer).
--
-- Users are provisioned by admins only; there is no public sign-up. Each
-- auth.users row gets a matching public.profiles row via trigger, and the
-- profile's role/status are copied into the access token by a custom access
-- token hook so route protection needs no database round-trip.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('admin', 'viewer');
create type public.user_status as enum ('active', 'suspended');

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  role       public.app_role    not null default 'viewer',
  status     public.user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Application profile and authorization state for each auth user.';

create index profiles_role_idx on public.profiles (role);
create index profiles_status_idx on public.profiles (status);
create index profiles_email_idx on public.profiles (email);

create or replace function public.set_updated_at()
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
  for each row execute function public.set_updated_at();

-- Every auth user gets a profile. The role is read from app_metadata, which is
-- writable only by the service role -- never from user_metadata, which the user
-- can edit themselves.
create or replace function public.handle_new_user()
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
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Role helper
-- ---------------------------------------------------------------------------

-- Lives outside the exposed API schema. Deliberately security invoker: it only
-- reads the JWT, so it needs no elevated privileges and cannot be abused to
-- bypass RLS.
create schema if not exists private;
revoke all on schema private from public, anon;

create or replace function private.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'user_role') = 'admin', false);
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

-- Everyone can read their own profile.
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

-- Admins can read every profile.
create policy "profiles_select_admin" on public.profiles
  for select to authenticated
  using ((select private.is_admin()));

-- Admins can edit every profile. Viewers get no update policy at all, so they
-- cannot promote themselves.
create policy "profiles_update_admin" on public.profiles
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- No insert/delete policies for `authenticated`: profile creation happens via
-- the on_auth_user_created trigger and deletion via the auth.users cascade,
-- both driven by the service role, which bypasses RLS.

-- ---------------------------------------------------------------------------
-- Custom access token hook
-- ---------------------------------------------------------------------------

-- Adds `user_role` and `user_status` claims to every issued access token.
-- Must be enabled at Dashboard > Authentication > Hooks after this migration.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims   jsonb;
  v_role   public.app_role;
  v_status public.user_status;
begin
  select role, status
    into v_role, v_status
    from public.profiles
   where id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{user_role}', coalesce(to_jsonb(v_role), 'null'::jsonb));
  claims := jsonb_set(claims, '{user_status}', coalesce(to_jsonb(v_status), 'null'::jsonb));

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

grant select on table public.profiles to supabase_auth_admin;

create policy "profiles_select_auth_admin" on public.profiles
  as permissive for select to supabase_auth_admin
  using (true);
