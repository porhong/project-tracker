-- Allow retrospective answers to be submitted or updated on active and completed (closed) sprints.

create or replace function public.replace_my_sprint_retrospective(
  p_sprint_id uuid,
  p_answers jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_sprint_status text;
  v_project_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array' then
    raise exception 'Retrospective answers must be an array.' using errcode = '22023';
  end if;

  select status, project_id
    into v_sprint_status, v_project_id
  from public.sprints
  where id = p_sprint_id;

  if v_sprint_status is null then
    raise exception 'Sprint not found.' using errcode = 'P0002';
  end if;

  if v_sprint_status not in ('active', 'completed') then
    raise exception 'Retrospectives can only be submitted for active or completed sprints.' using errcode = '42501';
  end if;

  if not (select private.is_admin()) and not (select private.is_current_project_member(v_project_id)) then
    raise exception 'You must be a member of this project to submit a retrospective.' using errcode = '42501';
  end if;

  -- Delete existing answers for this user and sprint
  delete from public.sprint_retrospective_answers
  where sprint_id = p_sprint_id
    and user_id = v_user_id;

  -- Insert non-empty answers
  insert into public.sprint_retrospective_answers (
    sprint_id,
    question_id,
    user_id,
    content
  )
  select
    p_sprint_id,
    ans.question_id,
    v_user_id,
    btrim(ans.content)
  from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) as ans(
    question_id uuid,
    content text
  )
  where btrim(coalesce(ans.content, '')) <> ''
    and exists (
      select 1
      from public.sprint_retrospective_questions q
      where q.id = ans.question_id
        and q.sprint_id = p_sprint_id
    );
end;
$$;

revoke all on function public.replace_my_sprint_retrospective(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_my_sprint_retrospective(uuid, jsonb)
  to authenticated;
