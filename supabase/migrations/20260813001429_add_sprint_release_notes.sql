-- Tiptap documents are kept as structured JSON rather than rendered HTML.
-- This preserves the editor's semantics and avoids treating user-authored HTML
-- as a trusted database value.
alter table public.sprints
  add column release_notes jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb;

comment on column public.sprints.release_notes is
  'Validated Tiptap JSON document containing the sprint release notes.';
