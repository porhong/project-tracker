-- `user` is deliberately distinct from the existing read-only `viewer` role.
-- This must stay in its own migration: PostgreSQL does not let a newly added
-- enum value be safely used until the transaction that adds it has committed.
alter type public.app_role add value if not exists 'user';
