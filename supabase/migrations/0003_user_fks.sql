-- 0003_user_fks.sql
-- Add FK constraints from public tables to Better Auth's user table.
-- Better Auth created public."user" via migration 0002.

alter table theses
  add constraint theses_user_id_fkey
  foreign key (user_id)
  references public."user"(id)
  on delete cascade;

alter table universes
  add constraint universes_created_by_fkey
  foreign key (created_by)
  references public."user"(id)
  on delete set null;
