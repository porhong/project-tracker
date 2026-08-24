-- Track whether a non-admin user must change their password before using the app.
-- Admins are never forced; the flag is managed by admin provisioning and the
-- self-service password-change action.

alter table public.profiles
  add column force_password_change boolean not null default false;

comment on column public.profiles.force_password_change is
  'When true, viewer/user accounts are redirected to change their password on login.';
