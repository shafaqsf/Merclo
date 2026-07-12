-- 0006_remove_auth_rls
-- This app is single-tenant and has no login/auth: every request is served
-- by the service-role client (which bypasses RLS), so the `auth.uid() =
-- owner_id` policies from earlier migrations no longer apply to anything and
-- would only block direct anon/authenticated access. Drop them and disable
-- RLS on the affected tables rather than editing the old migrations in place.

drop policy if exists "owners manage their bots" on public.bots;
drop policy if exists "owners read their bots' conversations" on public.conversations;
drop policy if exists "owners manage their bots' knowledge" on public.knowledge_sources;
drop policy if exists "owners read their feedback" on public.message_feedback;

alter table public.bots disable row level security;
alter table public.conversations disable row level security;
alter table public.knowledge_sources disable row level security;
alter table public.message_feedback disable row level security;
