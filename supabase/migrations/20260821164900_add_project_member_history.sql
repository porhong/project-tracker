-- Audit trail for project membership changes.
--
-- project_members is a hard-link table with no status or deleted_at column.
-- Once a member is removed, the only evidence that they were ever assigned to
-- the project is the sprint plan data they left behind. This table records
-- every add and remove so membership can be reconstructed historically.

create table public.project_member_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null constraint project_member_history_action_check
    check (action in ('added', 'removed')),
  performed_by uuid references public.profiles(id) on delete set null,
  performed_at timestamptz not null default now()
);

create index project_member_history_project_id_idx
  on public.project_member_history (project_id, performed_at desc);

create index project_member_history_user_id_idx
  on public.project_member_history (user_id, performed_at desc);

comment on table public.project_member_history is
  'Audit trail of project membership additions and removals.';

alter table public.project_member_history enable row level security;

-- Only administrators can read or manage membership history. This mirrors the
-- admin-only access model of project_members itself.
create policy "project_member_history_select_admin"
  on public.project_member_history
  for select
  to authenticated
  using ((select private.is_admin()));

create policy "project_member_history_insert_admin"
  on public.project_member_history
  for insert
  to authenticated
  with check ((select private.is_admin()));

create policy "project_member_history_update_admin"
  on public.project_member_history
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "project_member_history_delete_admin"
  on public.project_member_history
  for delete
  to authenticated
  using ((select private.is_admin()));

grant select, insert, update, delete on public.project_member_history to authenticated;

-- Trigger function runs as the invoker so the admin's RLS privileges apply.
create or replace function private.log_project_member_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.project_member_history (project_id, user_id, action, performed_by)
    values (new.project_id, new.user_id, 'added', (select auth.uid()));
    return new;
  elsif tg_op = 'DELETE' then
    -- When a project is deleted, membership rows cascade with it. History for
    -- that project also cascades, so skip logging — the parent row is already
    -- gone and an insert would fail the project_id foreign key.
    if not exists (
      select 1 from public.projects where id = old.project_id
    ) then
      return old;
    end if;
    insert into public.project_member_history (project_id, user_id, action, performed_by)
    values (old.project_id, old.user_id, 'removed', (select auth.uid()));
    return old;
  end if;
  return null;
end;
$$;

revoke all on function private.log_project_member_change() from public, anon, authenticated;

create trigger project_members_audit_trigger
  after insert or delete on public.project_members
  for each row
  execute function private.log_project_member_change();
