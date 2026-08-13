-- A User can replace only their own plan for one active sprint.  The function
-- is SECURITY INVOKER, so its deletes/inserts are still constrained by the RLS
-- policies below.  It accepts no user id; identity always comes from auth.uid.
create or replace function public.replace_my_active_sprint_plan(
  p_sprint_id uuid,
  p_allocations jsonb,
  p_time_off jsonb,
  p_activity_notes jsonb
)
returns void
language plpgsql
security invoker
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
    select 1
    from public.profiles
    where id = v_user_id
      and role = 'user'
      and status = 'active'
  ) then
    raise exception 'Only active User accounts can manage sprint activity.';
  end if;
  if not exists (
    select 1
    from public.sprints
    where id = p_sprint_id
      and status = 'active'
      and (select private.is_current_project_member(project_id))
  ) then
    raise exception 'You can only manage your activity for an active sprint in a current project.';
  end if;

  delete from public.sprint_member_allocations
  where sprint_id = p_sprint_id and user_id = v_user_id;
  delete from public.sprint_member_time_off
  where sprint_id = p_sprint_id and user_id = v_user_id;
  delete from public.sprint_member_activity_notes
  where sprint_id = p_sprint_id and user_id = v_user_id;

  insert into public.sprint_member_allocations (
    sprint_id, user_id, activity_id, hours_per_day
  )
  select p_sprint_id, v_user_id, allocation.activity_id, allocation.hours_per_day
  from jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as allocation(
    activity_id uuid,
    hours_per_day numeric
  );

  insert into public.sprint_member_time_off (
    sprint_id, user_id, start_date, end_date
  )
  select p_sprint_id, v_user_id, time_off.start_date, time_off.end_date
  from jsonb_to_recordset(coalesce(p_time_off, '[]'::jsonb)) as time_off(
    start_date date,
    end_date date
  );

  insert into public.sprint_member_activity_notes (
    sprint_id, user_id, activity, note
  )
  select p_sprint_id, v_user_id, activity_note.activity, activity_note.note
  from jsonb_to_recordset(coalesce(p_activity_notes, '[]'::jsonb)) as activity_note(
    activity text,
    note text
  );
end;
$$;

revoke all on function public.replace_my_active_sprint_plan(uuid, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.replace_my_active_sprint_plan(uuid, jsonb, jsonb, jsonb)
  to authenticated;

-- Existing select policies continue to provide each project member access to
-- their own records.  These policies add the narrowly scoped self-service
-- write capability for the new User role.  Each operation rechecks the
-- current profile (not JWT metadata), sprint state, membership, and ownership.
create policy "sprint_member_allocations_user_insert_active_own"
  on public.sprint_member_allocations
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'user' and status = 'active'
    )
    and exists (
      select 1 from public.sprints
      where id = sprint_id and status = 'active'
        and (select private.is_current_project_member(project_id))
    )
  );

create policy "sprint_member_allocations_user_update_active_own"
  on public.sprint_member_allocations
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'user' and status = 'active'
    )
    and exists (
      select 1 from public.sprints
      where id = sprint_id and status = 'active'
        and (select private.is_current_project_member(project_id))
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'user' and status = 'active'
    )
    and exists (
      select 1 from public.sprints
      where id = sprint_id and status = 'active'
        and (select private.is_current_project_member(project_id))
    )
  );

create policy "sprint_member_allocations_user_delete_active_own"
  on public.sprint_member_allocations
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'user' and status = 'active'
    )
    and exists (
      select 1 from public.sprints
      where id = sprint_id and status = 'active'
        and (select private.is_current_project_member(project_id))
    )
  );

create policy "sprint_member_time_off_user_insert_active_own"
  on public.sprint_member_time_off
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'user' and status = 'active')
    and exists (select 1 from public.sprints where id = sprint_id and status = 'active' and (select private.is_current_project_member(project_id)))
  );
create policy "sprint_member_time_off_user_update_active_own"
  on public.sprint_member_time_off
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'user' and status = 'active')
    and exists (select 1 from public.sprints where id = sprint_id and status = 'active' and (select private.is_current_project_member(project_id)))
  )
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'user' and status = 'active')
    and exists (select 1 from public.sprints where id = sprint_id and status = 'active' and (select private.is_current_project_member(project_id)))
  );
create policy "sprint_member_time_off_user_delete_active_own"
  on public.sprint_member_time_off
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'user' and status = 'active')
    and exists (select 1 from public.sprints where id = sprint_id and status = 'active' and (select private.is_current_project_member(project_id)))
  );

create policy "sprint_member_activity_notes_user_insert_active_own"
  on public.sprint_member_activity_notes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'user' and status = 'active')
    and exists (select 1 from public.sprints where id = sprint_id and status = 'active' and (select private.is_current_project_member(project_id)))
  );
create policy "sprint_member_activity_notes_user_update_active_own"
  on public.sprint_member_activity_notes
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'user' and status = 'active')
    and exists (select 1 from public.sprints where id = sprint_id and status = 'active' and (select private.is_current_project_member(project_id)))
  )
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'user' and status = 'active')
    and exists (select 1 from public.sprints where id = sprint_id and status = 'active' and (select private.is_current_project_member(project_id)))
  );
create policy "sprint_member_activity_notes_user_delete_active_own"
  on public.sprint_member_activity_notes
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'user' and status = 'active')
    and exists (select 1 from public.sprints where id = sprint_id and status = 'active' and (select private.is_current_project_member(project_id)))
  );
