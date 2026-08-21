-- A generated column evaluates its helper function with the inserting
-- database role. The capacity helper is safe, immutable, and already lives in
-- the private schema, so grant only the roles that create sprints through the
-- application while keeping it unavailable to anonymous callers.

grant execute on function private.sprint_working_day_count(date, date, smallint[])
  to authenticated, service_role;
