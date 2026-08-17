-- Sprint delivery milestones and roadmap phases.
--
-- Milestones allow project administrators to define key delivery milestones,
-- track progression (upcoming, in_progress, completed, delayed), and expose
-- a clear milestone roadmap to team members and client viewers.

create table public.sprint_milestones (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references public.sprints(id) on delete cascade,
  title text not null,
  description text,
  target_date date not null,
  status text not null default 'upcoming',
  icon text not null default 'flag',
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sprint_milestones_title_not_blank check (btrim(title) <> ''),
  constraint sprint_milestones_title_length check (char_length(title) <= 120),
  constraint sprint_milestones_description_length check (description is null or char_length(description) <= 1000),
  constraint sprint_milestones_status_check check (status in ('upcoming', 'in_progress', 'completed', 'delayed')),
  constraint sprint_milestones_icon_check check (icon in ('compass', 'sparkles', 'code', 'shield', 'rocket', 'flag', 'check', 'users')),
  constraint sprint_milestones_order_index_check check (order_index >= 0)
);

comment on table public.sprint_milestones is 'Delivery milestones and key phases for project sprints.';

create index sprint_milestones_sprint_id_idx
  on public.sprint_milestones (sprint_id, order_index asc, target_date asc);

create trigger sprint_milestones_set_updated_at
  before update on public.sprint_milestones
  for each row execute function private.set_updated_at();

alter table public.sprint_milestones enable row level security;

create policy "sprint_milestones_admin_all" on public.sprint_milestones
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "sprint_milestones_select_current_project_member" on public.sprint_milestones
  for select to authenticated
  using (
    exists (
      select 1
      from public.sprints
      where sprints.id = sprint_milestones.sprint_id
        and (select private.is_current_project_member(sprints.project_id))
    )
  );
