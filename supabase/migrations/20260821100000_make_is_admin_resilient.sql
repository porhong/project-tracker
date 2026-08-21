-- Make private.is_admin() resilient to a missing user_role claim.
--
-- Every admin policy in the database (~40 across projects, sprints, profiles,
-- workspace_settings, avatars storage, mcp_access_tokens, ...) gates on this
-- one function. It read only the user_role JWT claim, which is baked in by
-- public.custom_access_token_hook -- but that hook must be enabled separately
-- in Dashboard > Authentication > Hooks. While the hook is disabled, every
-- JWT lacks user_role and is_admin() returns false for everyone: admins are
-- locked out of all writes ("new row violates row-level security policy").
--
-- Fall back to the profiles row when the claim is absent. The row is the same
-- source of truth the hook reads and the app's requireProfile() authorizes
-- from, so behavior is identical with the hook on or off; the claim remains
-- the fast path and the per-statement profile lookup is a single PK read.
--
-- The function becomes SECURITY DEFINER for exactly one reason: several
-- profiles policies themselves call is_admin(), so a SECURITY INVOKER read of
-- public.profiles would recurse into those policies. Running as the owner
-- bypasses RLS on that one lookup. The function takes no arguments and
-- returns a boolean, so the definer surface cannot be abused, and search_path
-- stays pinned.

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'user_role') = 'admin', false)
      or exists (
        select 1
          from public.profiles p
         where p.id = (select auth.uid())
           and p.role = 'admin'
      );
$$;

-- Grants carry over from the original definition; restate for clarity.
grant execute on function private.is_admin() to authenticated;
