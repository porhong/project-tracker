-- Allocation values are totals for the entire sprint, not hours per day.
-- Convert existing daily values using each member's actual available days,
-- including their recorded time off, so historical plans retain their meaning.
alter table public.sprint_member_allocations
  rename column hours_per_day to hours;
alter table public.sprint_member_allocations
  drop constraint sprint_member_allocations_hours_check;
alter table public.sprint_member_allocations
  alter column hours type numeric(8, 2);

alter table public.sprint_member_allocations
  disable trigger validate_sprint_member_allocation;

update public.sprint_member_allocations allocation
set hours = allocation.hours * (
  select count(*)::numeric as days
  from generate_series(sprint.start_date, sprint.end_date, interval '1 day') as calendar_day(day)
  where extract(isodow from calendar_day.day)::smallint = any(sprint.working_days)
    and not exists (
      select 1
      from public.sprint_member_time_off time_off
      where time_off.sprint_id = allocation.sprint_id
        and time_off.user_id = allocation.user_id
        and calendar_day.day::date between time_off.start_date and time_off.end_date
    )
)
from public.sprints sprint
where sprint.id = allocation.sprint_id;

alter table public.sprint_member_allocations
  enable trigger validate_sprint_member_allocation;
alter table public.sprint_member_allocations
  add constraint sprint_member_allocations_hours_check
  check (hours > 0);

-- A single private assertion owns the exact-total invariant.  It is called at
-- the end of atomic replacement functions, after incoming time off and
-- allocations have both been written, so the same availability calculation is
-- used by admin and User workflows.
create or replace function private.assert_sprint_member_plan_totals(
  p_sprint_id uuid,
  p_user_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sprint public.sprints%rowtype;
  v_user_id uuid;
  v_available_hours numeric;
  v_allocated_hours numeric;
begin
  select * into v_sprint
  from public.sprints
  where id = p_sprint_id;

  if not found then
    raise exception 'Sprint not found.';
  end if;

  foreach v_user_id in array p_user_ids loop
    select count(*)::numeric * v_sprint.daily_work_hours
      into v_available_hours
    from generate_series(v_sprint.start_date, v_sprint.end_date, interval '1 day') as calendar_day(day)
    where extract(isodow from calendar_day.day)::smallint = any(v_sprint.working_days)
      and not exists (
        select 1
        from public.sprint_member_time_off time_off
        where time_off.sprint_id = p_sprint_id
          and time_off.user_id = v_user_id
          and calendar_day.day::date between time_off.start_date and time_off.end_date
      );

    select coalesce(sum(hours), 0)
      into v_allocated_hours
    from public.sprint_member_allocations
    where sprint_id = p_sprint_id and user_id = v_user_id;

    if v_allocated_hours <> v_available_hours then
      raise exception
        'Allocated hours (%) must exactly match available hours (%) for each sprint member.',
        v_allocated_hours, v_available_hours;
    end if;
  end loop;
end;
$$;

revoke all on function private.assert_sprint_member_plan_totals(uuid, uuid[])
  from public, anon, authenticated;

-- Self-service changes must be atomic.  The function owns the authenticated
-- identity, validates that it is an active User in an active project sprint,
-- and checks the exact total after the replacement.  Direct User DML policies
-- are removed below, so this is the only User write path.
create or replace function public.replace_my_active_sprint_plan(
  p_sprint_id uuid,
  p_allocations jsonb,
  p_time_off jsonb,
  p_activity_notes jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  if jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_time_off, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_activity_notes, '[]'::jsonb)) <> 'array' then
    raise exception 'Sprint activity data must be arrays.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and role = 'user' and status = 'active'
  ) then
    raise exception 'Only active User accounts can manage sprint activity.';
  end if;
  if not exists (
    select 1
    from public.sprints sprint
    join public.project_members member on member.project_id = sprint.project_id
    where sprint.id = p_sprint_id
      and sprint.status = 'active'
      and member.user_id = v_user_id
  ) then
    raise exception 'You can only manage your activity for an active sprint in a current project.';
  end if;

  delete from public.sprint_member_allocations
  where sprint_id = p_sprint_id and user_id = v_user_id;
  delete from public.sprint_member_time_off
  where sprint_id = p_sprint_id and user_id = v_user_id;
  delete from public.sprint_member_activity_notes
  where sprint_id = p_sprint_id and user_id = v_user_id;

  insert into public.sprint_member_allocations (sprint_id, user_id, activity_id, hours)
  select p_sprint_id, v_user_id, allocation.activity_id, allocation.hours
  from jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as allocation(
    activity_id uuid,
    hours numeric
  );
  insert into public.sprint_member_time_off (sprint_id, user_id, start_date, end_date)
  select p_sprint_id, v_user_id, time_off.start_date, time_off.end_date
  from jsonb_to_recordset(coalesce(p_time_off, '[]'::jsonb)) as time_off(
    start_date date,
    end_date date
  );
  insert into public.sprint_member_activity_notes (sprint_id, user_id, activity, note)
  select p_sprint_id, v_user_id, activity_note.activity, activity_note.note
  from jsonb_to_recordset(coalesce(p_activity_notes, '[]'::jsonb)) as activity_note(
    activity text,
    note text
  );

  perform private.assert_sprint_member_plan_totals(p_sprint_id, array[v_user_id]);
end;
$$;

revoke all on function public.replace_my_active_sprint_plan(uuid, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.replace_my_active_sprint_plan(uuid, jsonb, jsonb, jsonb)
  to authenticated;

-- Admin plan replacement follows the same atomic invariant for every active
-- project member.  Draft and active sprint plans remain admin-editable.
create or replace function public.replace_sprint_member_plan(
  p_sprint_id uuid,
  p_allocations jsonb,
  p_time_off jsonb,
  p_activity_notes jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_project_id uuid;
  v_user_ids uuid[];
begin
  if v_admin_id is null then
    raise exception 'Authentication is required.';
  end if;
  if jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_time_off, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_activity_notes, '[]'::jsonb)) <> 'array' then
    raise exception 'Sprint plan data must be arrays.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = v_admin_id and role = 'admin' and status = 'active'
  ) then
    raise exception 'Administrator access is required.';
  end if;

  select project_id into v_project_id
  from public.sprints
  where id = p_sprint_id and status <> 'completed';
  if not found then
    raise exception 'Editable sprint not found.';
  end if;

  select coalesce(array_agg(member.user_id order by member.user_id), array[]::uuid[])
    into v_user_ids
  from public.project_members member
  join public.profiles profile on profile.id = member.user_id
  where member.project_id = v_project_id and profile.status = 'active';

  delete from public.sprint_member_allocations where sprint_id = p_sprint_id;
  delete from public.sprint_member_time_off where sprint_id = p_sprint_id;
  delete from public.sprint_member_activity_notes where sprint_id = p_sprint_id;

  insert into public.sprint_member_allocations (sprint_id, user_id, activity_id, hours)
  select p_sprint_id, allocation.user_id, allocation.activity_id, allocation.hours
  from jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as allocation(
    user_id uuid,
    activity_id uuid,
    hours numeric
  );
  insert into public.sprint_member_time_off (sprint_id, user_id, start_date, end_date)
  select p_sprint_id, time_off.user_id, time_off.start_date, time_off.end_date
  from jsonb_to_recordset(coalesce(p_time_off, '[]'::jsonb)) as time_off(
    user_id uuid,
    start_date date,
    end_date date
  );
  insert into public.sprint_member_activity_notes (sprint_id, user_id, activity, note)
  select p_sprint_id, activity_note.user_id, activity_note.activity, activity_note.note
  from jsonb_to_recordset(coalesce(p_activity_notes, '[]'::jsonb)) as activity_note(
    user_id uuid,
    activity text,
    note text
  );

  perform private.assert_sprint_member_plan_totals(p_sprint_id, v_user_ids);
end;
$$;

revoke all on function public.replace_sprint_member_plan(uuid, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.replace_sprint_member_plan(uuid, jsonb, jsonb, jsonb)
  to authenticated;

drop policy if exists "sprint_member_allocations_user_insert_active_own" on public.sprint_member_allocations;
drop policy if exists "sprint_member_allocations_user_update_active_own" on public.sprint_member_allocations;
drop policy if exists "sprint_member_allocations_user_delete_active_own" on public.sprint_member_allocations;
drop policy if exists "sprint_member_time_off_user_insert_active_own" on public.sprint_member_time_off;
drop policy if exists "sprint_member_time_off_user_update_active_own" on public.sprint_member_time_off;
drop policy if exists "sprint_member_time_off_user_delete_active_own" on public.sprint_member_time_off;
drop policy if exists "sprint_member_activity_notes_user_insert_active_own" on public.sprint_member_activity_notes;
drop policy if exists "sprint_member_activity_notes_user_update_active_own" on public.sprint_member_activity_notes;
drop policy if exists "sprint_member_activity_notes_user_delete_active_own" on public.sprint_member_activity_notes;
