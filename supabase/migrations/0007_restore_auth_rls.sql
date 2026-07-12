-- 0007_restore_auth_rls
-- Reinstates the auth model that 0006_remove_auth_rls (already applied)
-- turned off. Supabase Auth + RLS-scoped ownership are back, so re-enable
-- RLS and recreate the exact policies 0006 dropped.

alter table public.bots enable row level security;
alter table public.conversations enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.message_feedback enable row level security;

create policy "owners manage their bots" on public.bots
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "owners read their bots' conversations" on public.conversations
  for select using (
    exists (
      select 1 from public.bots
      where public.bots.id = public.conversations.bot_id
        and public.bots.owner_id = auth.uid()
    )
  );

create policy "owners manage their bots' knowledge" on public.knowledge_sources
  for all using (
    exists (
      select 1 from public.bots
      where public.bots.id = public.knowledge_sources.bot_id
        and public.bots.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.bots
      where public.bots.id = public.knowledge_sources.bot_id
        and public.bots.owner_id = auth.uid()
    )
  );

create policy "owners read their feedback" on public.message_feedback
  for select using (
    exists (
      select 1
      from public.conversations c
      join public.bots b on b.id = c.bot_id
      where c.id = public.message_feedback.conversation_id
        and b.owner_id = auth.uid()
    )
  );
