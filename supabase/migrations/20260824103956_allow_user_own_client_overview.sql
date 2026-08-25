-- Let assigned `user` accounts read the same client overview projection as
-- viewers, but only their own sprint progress rows. Viewers still see the
-- full delivery team (non-viewer members) for projects they are assigned to.

create or replace function public.get_client_project_sprint_progress(
  p_project_id uuid
)
returns table (
  sprint_id uuid,
  sprint_number integer,
  version text,
  start_date date,
  end_date date,
  sprint_status text,
  member_name text,
  competency text,
  planned_allocations jsonb,
  activity_notes jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_role public.app_role;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select role
    into v_role
  from public.profiles
  where id = v_user_id
    and status = 'active'
    and role in ('viewer', 'user');

  if v_role is null then
    raise exception 'Overview access is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.project_members
    where project_id = p_project_id
      and user_id = v_user_id
  ) then
    raise exception 'Project access is required.' using errcode = '42501';
  end if;

  return query
  select
    sprint.id,
    sprint.sprint_number,
    sprint.version,
    sprint.start_date,
    sprint.end_date,
    sprint.status,
    profile.full_name,
    profile.competency,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'activity', activity.name,
          'hours', allocation.hours
        )
        order by activity.name
      )
      from public.sprint_member_allocations allocation
      join public.activity_types activity on activity.id = allocation.activity_id
      where allocation.sprint_id = sprint.id
        and allocation.user_id = profile.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'activity', activity_note.activity,
          'note', activity_note.note,
          'updated_at', activity_note.updated_at
        )
        order by activity_note.updated_at desc, activity_note.id
      )
      from public.sprint_member_activity_notes activity_note
      where activity_note.sprint_id = sprint.id
        and activity_note.user_id = profile.id
    ), '[]'::jsonb)
  from public.sprints sprint
  join public.project_members member on member.project_id = sprint.project_id
  join public.profiles profile on profile.id = member.user_id
  where sprint.project_id = p_project_id
    and sprint.status in ('active', 'completed')
    and profile.status = 'active'
    and profile.role <> 'viewer'
    and (
      v_role = 'viewer'
      or profile.id = v_user_id
    )
  order by sprint.start_date desc, profile.full_name nulls last, profile.id;
end;
$$;

revoke all on function public.get_client_project_sprint_progress(uuid)
  from public, anon, authenticated;
grant execute on function public.get_client_project_sprint_progress(uuid)
  to authenticated;
