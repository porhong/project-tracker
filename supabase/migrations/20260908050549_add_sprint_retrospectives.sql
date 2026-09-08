-- Sprint retrospective questions and responses.
--
-- Allows administrators to configure retrospective questions per sprint,
-- team members to submit and update their retrospective responses, and
-- project viewers to review all responses grouped by member.

create table public.sprint_retrospective_questions (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references public.sprints(id) on delete cascade,
  question text not null,
  description text,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sprint_retrospective_questions_question_not_blank check (btrim(question) <> ''),
  constraint sprint_retrospective_questions_question_length check (char_length(question) <= 300),
  constraint sprint_retrospective_questions_description_length check (description is null or char_length(description) <= 1000),
  constraint sprint_retrospective_questions_order_index_check check (order_index >= 0)
);

comment on table public.sprint_retrospective_questions is 'Configurable retrospective questions for a sprint.';

create index sprint_retrospective_questions_sprint_id_idx
  on public.sprint_retrospective_questions (sprint_id, order_index asc);

create trigger sprint_retrospective_questions_set_updated_at
  before update on public.sprint_retrospective_questions
  for each row execute function private.set_updated_at();

alter table public.sprint_retrospective_questions enable row level security;

create policy "sprint_retrospective_questions_admin_all"
  on public.sprint_retrospective_questions
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "sprint_retrospective_questions_select_current_project_member"
  on public.sprint_retrospective_questions
  for select to authenticated
  using (
    exists (
      select 1
      from public.sprints
      where sprints.id = sprint_retrospective_questions.sprint_id
        and (select private.is_current_project_member(sprints.project_id))
    )
  );

create table public.sprint_retrospective_answers (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references public.sprints(id) on delete cascade,
  question_id uuid not null references public.sprint_retrospective_questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sprint_retrospective_answers_unique unique (question_id, user_id),
  constraint sprint_retrospective_answers_content_not_blank check (btrim(content) <> ''),
  constraint sprint_retrospective_answers_content_length check (char_length(content) <= 3000)
);

comment on table public.sprint_retrospective_answers is 'Member responses to sprint retrospective questions.';

create index sprint_retrospective_answers_sprint_user_idx
  on public.sprint_retrospective_answers (sprint_id, user_id);

create index sprint_retrospective_answers_question_idx
  on public.sprint_retrospective_answers (question_id);

create index sprint_retrospective_answers_user_idx
  on public.sprint_retrospective_answers (user_id);

create trigger sprint_retrospective_answers_set_updated_at
  before update on public.sprint_retrospective_answers
  for each row execute function private.set_updated_at();

alter table public.sprint_retrospective_answers enable row level security;

create policy "sprint_retrospective_answers_admin_all"
  on public.sprint_retrospective_answers
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "sprint_retrospective_answers_select_current_project_member"
  on public.sprint_retrospective_answers
  for select to authenticated
  using (
    exists (
      select 1
      from public.sprints
      where sprints.id = sprint_retrospective_answers.sprint_id
        and (select private.is_current_project_member(sprints.project_id))
    )
  );

create policy "sprint_retrospective_answers_manage_own"
  on public.sprint_retrospective_answers
  for all to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.sprints
      where sprints.id = sprint_retrospective_answers.sprint_id
        and (select private.is_current_project_member(sprints.project_id))
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.sprints
      where sprints.id = sprint_retrospective_answers.sprint_id
        and (select private.is_current_project_member(sprints.project_id))
    )
  );

grant select, insert, update, delete on table public.sprint_retrospective_questions to authenticated;
grant select, insert, update, delete on table public.sprint_retrospective_answers to authenticated;

-- Function for viewers, admins, and members to securely retrieve all responses
-- for a sprint with author profiles (name, competency, avatar) without exposing
-- the rest of the profiles table.
create or replace function public.get_sprint_retrospective_responses(
  p_sprint_id uuid
)
returns table (
  answer_id uuid,
  sprint_id uuid,
  question_id uuid,
  user_id uuid,
  member_name text,
  competency text,
  avatar_path text,
  content text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_project_id uuid;
  v_is_admin boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select project_id into v_project_id
  from public.sprints
  where id = p_sprint_id;

  if v_project_id is null then
    raise exception 'Sprint not found.' using errcode = 'P0002';
  end if;

  select (select private.is_admin()) into v_is_admin;

  if not v_is_admin and not (select private.is_current_project_member(v_project_id)) then
    raise exception 'Project access is required.' using errcode = '42501';
  end if;

  return query
  select
    a.id as answer_id,
    a.sprint_id,
    a.question_id,
    a.user_id,
    p.full_name as member_name,
    p.competency,
    p.avatar_path,
    a.content,
    a.created_at,
    a.updated_at
  from public.sprint_retrospective_answers a
  join public.profiles p on p.id = a.user_id
  where a.sprint_id = p_sprint_id
  order by a.created_at asc;
end;
$$;

revoke all on function public.get_sprint_retrospective_responses(uuid)
  from public, anon, authenticated;
grant execute on function public.get_sprint_retrospective_responses(uuid)
  to authenticated;

-- Function for a user to replace/save their retrospective answers for an active sprint.
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

  if v_sprint_status <> 'active' then
    raise exception 'Retrospectives can only be submitted for active sprints.' using errcode = '42501';
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
