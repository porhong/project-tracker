-- Seed default retrospective questions for sprints and auto-seed for newly created sprints.

create or replace function private.seed_default_sprint_retrospective_questions(
  p_sprint_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.sprint_retrospective_questions
    where sprint_id = p_sprint_id
  ) then
    insert into public.sprint_retrospective_questions (
      sprint_id,
      question,
      description,
      order_index
    )
    values
      (
        p_sprint_id,
        'What went well during this sprint?',
        'Highlight successes, team wins, smooth deliveries, and positive collaboration.',
        0
      ),
      (
        p_sprint_id,
        'What could have gone better or caused friction?',
        'Identify bottlenecks, blockers, tech debt, scope creep, or communication gaps.',
        1
      ),
      (
        p_sprint_id,
        'What concrete commitments will we make for the next sprint?',
        'Actionable takeaways, process adjustments, or experiments to adopt next sprint.',
        2
      );
  end if;
end;
$$;

revoke all on function private.seed_default_sprint_retrospective_questions(uuid)
  from public, anon, authenticated;

-- Backfill default retrospective questions for any existing sprint that has none.
do $$
declare
  r record;
begin
  for r in select id from public.sprints loop
    perform private.seed_default_sprint_retrospective_questions(r.id);
  end loop;
end;
$$;

-- Trigger function to auto-seed default questions whenever a sprint is created.
create or replace function private.on_sprint_created_seed_retrospective_questions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_default_sprint_retrospective_questions(new.id);
  return new;
end;
$$;

revoke all on function private.on_sprint_created_seed_retrospective_questions()
  from public, anon, authenticated;

drop trigger if exists sprints_seed_default_retrospective_questions on public.sprints;

create trigger sprints_seed_default_retrospective_questions
  after insert on public.sprints
  for each row execute function private.on_sprint_created_seed_retrospective_questions();
