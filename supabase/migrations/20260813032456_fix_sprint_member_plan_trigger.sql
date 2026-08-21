-- This trigger is shared by allocations and time off.  Referencing
-- NEW.activity_id in a compound condition makes PostgreSQL try to resolve the
-- column even for a sprint_member_time_off row, where that field does not
-- exist.  Keep each table's NEW fields inside its own branch.
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

  if tg_table_name = 'sprint_member_allocations' then
    if not exists (
      select 1
      from public.activity_types
      where id = new.activity_id and is_active
    ) then
      raise exception 'Choose an active activity.';
    end if;
  elsif tg_table_name = 'sprint_member_time_off' then
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

revoke all on function private.validate_sprint_member_plan_record()
  from public, anon, authenticated;
