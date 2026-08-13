-- Short, sprint-scoped notes record the work a member has actually performed.
-- They remain separate from capacity allocations: a plan is a forecast, while
-- these notes are management-visible work context.

create table public.sprint_member_activity_notes (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references public.sprints(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  activity text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sprint_member_activity_notes_activity_not_blank check (btrim(activity) <> ''),
  constraint sprint_member_activity_notes_activity_length check (char_length(btrim(activity)) <= 160),
  constraint sprint_member_activity_notes_note_length check (note is null or char_length(note) <= 2000)
);

create index sprint_member_activity_notes_sprint_user_idx
  on public.sprint_member_activity_notes (sprint_id, user_id);
create index sprint_member_activity_notes_user_id_idx
  on public.sprint_member_activity_notes (user_id);

create trigger sprint_member_activity_notes_set_updated_at
  before update on public.sprint_member_activity_notes
  for each row execute function private.set_updated_at();

create or replace function private.validate_sprint_member_activity_note()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sprint_project_id uuid;
  sprint_status text;
begin
  select project_id, status
    into sprint_project_id, sprint_status
  from public.sprints
  where id = new.sprint_id;

  if not found then
    raise exception 'Sprint not found.';
  end if;
  if sprint_status = 'completed' then
    raise exception 'Completed sprint activity notes are read-only.';
  end if;
  if not exists (
    select 1
    from public.project_members
    join public.profiles on profiles.id = project_members.user_id
    where project_members.project_id = sprint_project_id
      and project_members.user_id = new.user_id
      and profiles.status = 'active'
  ) then
    raise exception 'Activity note members must be active members of the sprint project.';
  end if;
  return new;
end;
$$;

create trigger validate_sprint_member_activity_note
  before insert or update on public.sprint_member_activity_notes
  for each row execute function private.validate_sprint_member_activity_note();

revoke all on function private.validate_sprint_member_activity_note() from public, anon, authenticated;

alter table public.sprint_member_activity_notes enable row level security;
grant select, insert, update, delete on public.sprint_member_activity_notes to authenticated;

create policy "sprint_member_activity_notes_select_admin_or_own" on public.sprint_member_activity_notes
  for select to authenticated
  using (
    (select private.is_admin())
    or (
      user_id = (select auth.uid())
      and (select private.is_current_project_member((select project_id from public.sprints where id = sprint_id)))
    )
  );
create policy "sprint_member_activity_notes_admin_insert" on public.sprint_member_activity_notes
  for insert to authenticated with check ((select private.is_admin()));
create policy "sprint_member_activity_notes_admin_update_open" on public.sprint_member_activity_notes
  for update to authenticated
  using (
    (select private.is_admin())
    and exists (select 1 from public.sprints where id = sprint_id and status <> 'completed')
  )
  with check ((select private.is_admin()));
create policy "sprint_member_activity_notes_admin_delete_open" on public.sprint_member_activity_notes
  for delete to authenticated
  using (
    (select private.is_admin())
    and exists (select 1 from public.sprints where id = sprint_id and status <> 'completed')
  );
