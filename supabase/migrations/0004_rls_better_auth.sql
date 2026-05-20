-- 0004_rls_better_auth.sql
-- Enable RLS on Better Auth tables (deny-all by default, parallel to 0001's
-- posture). Better Auth bypasses RLS via its own pg.Pool / DATABASE_URL
-- connection; this only closes the anon-key path.

alter table public."user"         enable row level security;
alter table public.session        enable row level security;
alter table public.account        enable row level security;
alter table public.verification   enable row level security;
