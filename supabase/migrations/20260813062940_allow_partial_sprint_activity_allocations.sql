-- Sprint allocation is a planning signal, not a completion gate. Keep the
-- existing atomic replacements and authorization checks, but remove the
-- exact-total assertion from both role-specific save paths.

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
end;
$$;

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
end;
$$;

drop function private.assert_sprint_member_plan_totals(uuid, uuid[]);
