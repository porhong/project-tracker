-- Preserve sprint plan records for members who have been removed from a project.
--
-- The previous replace_sprint_member_plan implementation deleted every plan row
-- for the sprint and then re-inserted only the payload supplied by the caller.
-- The dashboard builds that payload from current active project members, so the
-- first save after removing a member silently erased that member's allocations,
-- time-off, and activity notes for that sprint.
--
-- The fixed implementation only replaces records for users who are currently
-- active members of the sprint's project. Records for removed (or suspended)
-- members are left untouched, while current members can still be cleared by
-- sending empty arrays for them.

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

  -- Only remove plan rows for users who are still active members of the
  -- project. Rows for removed or suspended members become historical records
  -- and are preserved across future plan saves.
  delete from public.sprint_member_allocations
  where sprint_id = p_sprint_id
    and user_id in (
      select project_members.user_id
      from public.project_members
      join public.profiles on profiles.id = project_members.user_id
      where project_members.project_id = v_project_id
        and profiles.status = 'active'
    );

  delete from public.sprint_member_time_off
  where sprint_id = p_sprint_id
    and user_id in (
      select project_members.user_id
      from public.project_members
      join public.profiles on profiles.id = project_members.user_id
      where project_members.project_id = v_project_id
        and profiles.status = 'active'
    );

  delete from public.sprint_member_activity_notes
  where sprint_id = p_sprint_id
    and user_id in (
      select project_members.user_id
      from public.project_members
      join public.profiles on profiles.id = project_members.user_id
      where project_members.project_id = v_project_id
        and profiles.status = 'active'
    );

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
end;
$$;
