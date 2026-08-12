-- Let `authenticated` evaluate the sprint capacity expression.
--
-- `sprints.planned_capacity_hours` is a stored generated column, and Postgres
-- evaluates a generated expression with the privileges of the role performing
-- the INSERT/UPDATE -- not the table owner.  The blanket revoke that shipped
-- with the column therefore made every sprint write fail with
-- "permission denied for function sprint_working_day_count".
--
-- This is the one place the revoke pattern used for `private.set_updated_at()`
-- and `private.handle_new_user()` does not carry over: those are trigger
-- functions, whose EXECUTE privilege is checked once at CREATE TRIGGER time and
-- never again when the trigger fires.
--
-- Granting EXECUTE is safe here.  The function is IMMUTABLE, SECURITY INVOKER
-- calendar arithmetic over its own arguments -- it reads no table and returns
-- nothing the caller did not already supply -- and `private` is not an exposed
-- schema, so it remains unreachable over the Data API.

grant execute on function private.sprint_working_day_count(date, date, smallint[]) to authenticated;
