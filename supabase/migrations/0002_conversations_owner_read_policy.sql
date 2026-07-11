-- 0002_conversations_owner_read_policy
-- Let merchants READ conversations belonging to their own bots (dashboard:
-- conversations viewer + analytics). Read-only; all writes still go through the
-- service-role key from the chat runtime.

create policy "owners read their bots' conversations" on public.conversations
  for select using (
    exists (
      select 1 from public.bots
      where public.bots.id = public.conversations.bot_id
        and public.bots.owner_id = auth.uid()
    )
  );
