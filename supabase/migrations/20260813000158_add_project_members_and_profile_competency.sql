-- Add an optional competency to each user and a normalized many-to-many
-- project membership relation.  Memberships are intentionally separate from
-- profiles and projects: a user can work on many projects and a project can
-- have many users without duplicating either entity.

alter table public.profiles
  add column competency text;

alter table public.profiles
  add constraint profiles_competency_not_blank
  check (competency is null or btrim(competency) <> '');

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

comment on column public.profiles.competency is
  'Optional primary competency selected by an administrator.';
comment on table public.project_members is
  'Admin-managed assignments of users to projects.';

-- The primary key indexes project_id. This additional index supports the
-- inverse lookup used when a user is updated and protects profile cascades.
create index project_members_user_id_idx on public.project_members (user_id);

alter table public.project_members enable row level security;

create policy "project_members_admin_all" on public.project_members
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
