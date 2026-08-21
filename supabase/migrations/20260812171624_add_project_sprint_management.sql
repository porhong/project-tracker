-- Projects, project-scoped sprints, and shared planning defaults.
--
-- All public tables are protected by RLS.  The UI performs the lifecycle
-- validation, while the database protects its non-negotiable invariants
-- (valid ranges, one active sprint per project, and draft-only deletion).

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_name_key unique (name),
  constraint projects_name_not_blank check (btrim(name) <> ''),
  constraint projects_status_check check (status in ('active', 'archived'))
);

comment on table public.projects is 'Admin-managed projects that own sprints.';

create table public.workspace_settings (
  id boolean primary key default true,
  working_days smallint[] not null default array[1, 2, 3, 4, 5]::smallint[],
  daily_work_hours numeric(4, 2) not null default 8,
  updated_at timestamptz not null default now(),
  constraint workspace_settings_singleton_check check (id),
  constraint workspace_settings_working_days_check check (
    cardinality(working_days) > 0
    and working_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  ),
  constraint workspace_settings_daily_hours_check check (
    daily_work_hours > 0 and daily_work_hours <= 24
  )
);

comment on table public.workspace_settings is 'Singleton workspace defaults used to prefill new sprint schedules.';

-- The calculation is deterministic and uses ISO weekday numbers (1 = Monday,
-- 7 = Sunday), so it is safe to use in a stored generated column.
create or replace function private.sprint_working_day_count(
  start_on date,
  end_on date,
  days smallint[]
)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from generate_series(start_on, end_on, interval '1 day') as calendar_day(day)
  where extract(isodow from calendar_day.day)::smallint = any(days);
$$;

revoke all on function private.sprint_working_day_count(date, date, smallint[]) from public, anon, authenticated;

create table public.sprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  sprint_number integer not null,
  version text not null,
  name text not null,
  description text,
  start_date date not null,
  end_date date not null,
  working_days smallint[] not null,
  daily_work_hours numeric(4, 2) not null,
  planned_capacity_hours numeric(10, 2) generated always as (
    private.sprint_working_day_count(start_date, end_date, working_days) * daily_work_hours
  ) stored,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sprints_project_number_key unique (project_id, sprint_number),
  constraint sprints_number_positive check (sprint_number > 0),
  constraint sprints_version_not_blank check (btrim(version) <> ''),
  constraint sprints_name_not_blank check (btrim(name) <> ''),
  constraint sprints_date_range_check check (end_date >= start_date),
  constraint sprints_working_days_check check (
    cardinality(working_days) > 0
    and working_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  ),
  constraint sprints_daily_hours_check check (
    daily_work_hours > 0 and daily_work_hours <= 24
  ),
  constraint sprints_status_check check (status in ('draft', 'active', 'completed'))
);

comment on table public.sprints is 'Project sprint plans with an immutable-at-completion schedule snapshot.';

create index sprints_project_status_start_date_idx
  on public.sprints (project_id, status, start_date desc);
create unique index sprints_one_active_per_project_key
  on public.sprints (project_id)
  where status = 'active';

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function private.set_updated_at();

create trigger workspace_settings_set_updated_at
  before update on public.workspace_settings
  for each row execute function private.set_updated_at();

create trigger sprints_set_updated_at
  before update on public.sprints
  for each row execute function private.set_updated_at();

insert into public.workspace_settings (id) values (true)
on conflict (id) do nothing;

alter table public.projects enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.sprints enable row level security;

create policy "projects_admin_all" on public.projects
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "workspace_settings_admin_all" on public.workspace_settings
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "sprints_select_admin" on public.sprints
  for select to authenticated
  using ((select private.is_admin()));

create policy "sprints_insert_admin" on public.sprints
  for insert to authenticated
  with check ((select private.is_admin()));

-- A completed row is excluded from the UPDATE policy based on its existing
-- value.  This preserves the completed sprint record even via the Data API.
create policy "sprints_update_admin_non_completed" on public.sprints
  for update to authenticated
  using ((select private.is_admin()) and status <> 'completed')
  with check ((select private.is_admin()));

create policy "sprints_delete_admin_drafts" on public.sprints
  for delete to authenticated
  using ((select private.is_admin()) and status = 'draft');
