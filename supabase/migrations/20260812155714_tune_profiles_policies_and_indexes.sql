-- Address database linter findings on public.profiles.

-- 0006_multiple_permissive_policies: two permissive SELECT policies for
-- `authenticated` both had to be evaluated on every read. Collapse them into
-- one. `select` wrapping keeps auth.uid()/is_admin() evaluated once per
-- statement rather than once per row.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;

create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (
    (select auth.uid()) = id
    or (select private.is_admin())
  );

-- 0005_unused_index: nothing queries profiles by email, so the plain index only
-- cost writes. Replace it with a unique index, which keeps profiles.email from
-- drifting into duplicates and earns its keep as a constraint.
drop index if exists public.profiles_email_idx;
create unique index profiles_email_key on public.profiles (email);

-- profiles_role_idx and profiles_status_idx are reported unused only because
-- the table is new; both back the "is this the last active admin?" check that
-- guards every destructive user-management action. They stay.
