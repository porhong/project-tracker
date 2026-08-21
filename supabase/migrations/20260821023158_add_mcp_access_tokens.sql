-- Long-lived MCP personal access tokens for AI agents.
--
-- Supabase Auth JWTs expire in about an hour (max one week), which is too short
-- for MCP clients. These tokens are app-issued secrets: plaintext is shown once
-- at creation; only a SHA-256 hash is stored. Auth for /api/mcp accepts either
-- a Bearer `ptmcp_…` token from this table or a normal Supabase access JWT.

create table public.mcp_access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default 'MCP token',
  token_prefix text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mcp_access_tokens_name_length check (
    char_length(btrim(name)) between 1 and 80
  ),
  constraint mcp_access_tokens_prefix_length check (
    char_length(token_prefix) between 8 and 24
  ),
  constraint mcp_access_tokens_hash_length check (char_length(token_hash) = 64)
);

comment on table public.mcp_access_tokens is
  'Hashed admin MCP Bearer tokens (ptmcp_…). Plaintext is never stored.';

create unique index mcp_access_tokens_token_hash_key
  on public.mcp_access_tokens (token_hash);

create index mcp_access_tokens_user_id_idx
  on public.mcp_access_tokens (user_id);

create index mcp_access_tokens_user_active_idx
  on public.mcp_access_tokens (user_id, expires_at desc)
  where revoked_at is null;

alter table public.mcp_access_tokens enable row level security;

-- Admins manage only their own tokens. Lookups by hash for /api/mcp use the
-- service-role client and bypass RLS.
create policy "mcp_access_tokens_select_own_admin"
  on public.mcp_access_tokens
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select private.is_admin())
  );

create policy "mcp_access_tokens_insert_own_admin"
  on public.mcp_access_tokens
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select private.is_admin())
  );

create policy "mcp_access_tokens_update_own_admin"
  on public.mcp_access_tokens
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select private.is_admin())
  )
  with check (
    (select auth.uid()) = user_id
    and (select private.is_admin())
  );

create policy "mcp_access_tokens_delete_own_admin"
  on public.mcp_access_tokens
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select private.is_admin())
  );

grant select, insert, update, delete on public.mcp_access_tokens to authenticated;
