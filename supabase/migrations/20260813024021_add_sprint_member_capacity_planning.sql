-- Reusable work activities and sprint-scoped member capacity plans. Capacity
-- is intentionally planning data, not an individual productivity score.

create table public.activity_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_types_name_not_blank check (btrim(name) <> ''),
  constraint activity_types_name_length check (char_length(btrim(name)) <= 80)
);

create unique index activity_types_name_key
  on public.activity_types (lower(btrim(name)));

create table public.sprint_member_allocations (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references public.sprints(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  activity_id uuid not null references public.activity_types(id) on delete restrict,
  hours_per_day numeric(4, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sprint_member_allocations_hours_check
    check (hours_per_day > 0 and hours_per_day <= 24),
  constraint sprint_member_allocations_sprint_user_activity_key
    unique (sprint_id, user_id, activity_id)
);

create index sprint_member_allocations_sprint_user_idx
  on public.sprint_member_allocations (sprint_id, user_id);
create index sprint_member_allocations_user_id_idx
  on public.sprint_member_allocations (user_id);
create index sprint_member_allocations_activity_id_idx
  on public.sprint_member_allocations (activity_id);

create table public.sprint_member_time_off (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references public.sprints(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sprint_member_time_off_date_range_check check (end_date >= start_date)
);

create index sprint_member_time_off_sprint_user_start_idx
  on public.sprint_member_time_off (sprint_id, user_id, start_date);
create index sprint_member_time_off_user_id_idx
  on public.sprint_member_time_off (user_id);

create trigger activity_types_set_updated_at
  before update on public.activity_types
  for each row execute function private.set_updated_at();
create trigger sprint_member_allocations_set_updated_at
  before update on public.sprint_member_allocations
  for each row execute function private.set_updated_at();
create trigger sprint_member_time_off_set_updated_at
  before update on public.sprint_member_time_off
  for each row execute function private.set_updated_at();

-- Keep cross-table invariants at the database boundary as well as in server
-- actions: only active project members can be planned and completed sprints
-- are historical snapshots.
create or replace function private.validate_sprint_member_plan_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sprint_project_id uuid;
  sprint_status text;
  sprint_start_date date;
  sprint_end_date date;
begin
  select project_id, status, start_date, end_date
    into sprint_project_id, sprint_status, sprint_start_date, sprint_end_date
  from public.sprints
  where id = new.sprint_id;

  if not found then
    raise exception 'Sprint not found.';
  end if;
  if sprint_status = 'completed' then
    raise exception 'Completed sprint plans are read-only.';
  end if;
  if not exists (
    select 1
    from public.project_members
    join public.profiles on profiles.id = project_members.user_id
    where project_members.project_id = sprint_project_id
      and project_members.user_id = new.user_id
      and profiles.status = 'active'
  ) then
    raise exception 'Sprint plan members must be active members of the sprint project.';
  end if;

  if tg_table_name = 'sprint_member_allocations' and not exists (
    select 1 from public.activity_types
    where id = new.activity_id and is_active
  ) then
    raise exception 'Choose an active activity.';
  end if;

  if tg_table_name = 'sprint_member_time_off' then
    if new.start_date < sprint_start_date or new.end_date > sprint_end_date then
      raise exception 'Time off must fall within the sprint date range.';
    end if;
    if exists (
      select 1
      from public.sprint_member_time_off existing
      where existing.sprint_id = new.sprint_id
        and existing.user_id = new.user_id
        and existing.id <> coalesce(new.id, gen_random_uuid())
        and daterange(existing.start_date, existing.end_date, '[]')
          && daterange(new.start_date, new.end_date, '[]')
    ) then
      raise exception 'Time-off dates for a member cannot overlap.';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_sprint_member_allocation
  before insert or update on public.sprint_member_allocations
  for each row execute function private.validate_sprint_member_plan_record();
create trigger validate_sprint_member_time_off
  before insert or update on public.sprint_member_time_off
  for each row execute function private.validate_sprint_member_plan_record();

create or replace function private.is_current_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.project_members
      where project_id = target_project_id
        and user_id = (select auth.uid())
    );
$$;

revoke all on function private.validate_sprint_member_plan_record() from public, anon, authenticated;
revoke all on function private.is_current_project_member(uuid) from public, anon;
grant execute on function private.is_current_project_member(uuid) to authenticated;

alter table public.activity_types enable row level security;
alter table public.sprint_member_allocations enable row level security;
alter table public.sprint_member_time_off enable row level security;

grant select on public.activity_types to authenticated;
grant select, insert, update, delete on public.sprint_member_allocations to authenticated;
grant select, insert, update, delete on public.sprint_member_time_off to authenticated;

create policy "activity_types_select_authenticated" on public.activity_types
  for select to authenticated using (true);
create policy "activity_types_admin_insert" on public.activity_types
  for insert to authenticated with check ((select private.is_admin()));
create policy "activity_types_admin_update" on public.activity_types
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "sprint_member_allocations_select_admin_or_own" on public.sprint_member_allocations
  for select to authenticated
  using (
    (select private.is_admin())
    or (
      user_id = (select auth.uid())
      and (select private.is_current_project_member((select project_id from public.sprints where id = sprint_id)))
    )
  );
create policy "sprint_member_allocations_admin_insert" on public.sprint_member_allocations
  for insert to authenticated with check ((select private.is_admin()));
create policy "sprint_member_allocations_admin_update_open" on public.sprint_member_allocations
  for update to authenticated
  using (
    (select private.is_admin())
    and exists (select 1 from public.sprints where id = sprint_id and status <> 'completed')
  )
  with check ((select private.is_admin()));
create policy "sprint_member_allocations_admin_delete_open" on public.sprint_member_allocations
  for delete to authenticated
  using (
    (select private.is_admin())
    and exists (select 1 from public.sprints where id = sprint_id and status <> 'completed')
  );

create policy "sprint_member_time_off_select_admin_or_own" on public.sprint_member_time_off
  for select to authenticated
  using (
    (select private.is_admin())
    or (
      user_id = (select auth.uid())
      and (select private.is_current_project_member((select project_id from public.sprints where id = sprint_id)))
    )
  );
create policy "sprint_member_time_off_admin_insert" on public.sprint_member_time_off
  for insert to authenticated with check ((select private.is_admin()));
create policy "sprint_member_time_off_admin_update_open" on public.sprint_member_time_off
  for update to authenticated
  using (
    (select private.is_admin())
    and exists (select 1 from public.sprints where id = sprint_id and status <> 'completed')
  )
  with check ((select private.is_admin()));
create policy "sprint_member_time_off_admin_delete_open" on public.sprint_member_time_off
  for delete to authenticated
  using (
    (select private.is_admin())
    and exists (select 1 from public.sprints where id = sprint_id and status <> 'completed')
  );

-- Members need sprint and project names to read their own allocation. They do
-- not receive access to other members' plan rows.
create policy "projects_select_current_member" on public.projects
  for select to authenticated
  using ((select private.is_current_project_member(id)));
create policy "sprints_select_current_project_member" on public.sprints
  for select to authenticated
  using ((select private.is_current_project_member(project_id)));

insert into public.activity_types (name)
values
  ('Development'),
  ('Design'),
  ('Testing / QA'),
  ('Review'),
  ('Support / Incidents'),
  ('Meetings / Admin')
on conflict do nothing;
