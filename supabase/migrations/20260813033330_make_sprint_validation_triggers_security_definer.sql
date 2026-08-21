-- These private trigger functions need to inspect membership and profile
-- status as part of an integrity check.  Users correctly have no direct
-- SELECT policy on project_members, so SECURITY INVOKER made every User save
-- look as if they were not a member.  They remain non-callable by application
-- roles, use a fixed empty search path, and contain no dynamic SQL.
alter function private.validate_sprint_member_plan_record() security definer;
alter function private.validate_sprint_member_activity_note() security definer;

revoke all on function private.validate_sprint_member_plan_record()
  from public, anon, authenticated;
revoke all on function private.validate_sprint_member_activity_note()
  from public, anon, authenticated;
