-- 0005_message_feedback
-- Thumbs up/down on assistant messages (CSAT) + a per-conversation fallback
-- flag the runtime sets when the bot could not help (feeds the "unanswered"
-- analytics metric).

create table if not exists public.message_feedback (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  message_index integer not null,
  rating text not null, -- up | down
  created_at timestamptz not null default now(),
  unique (conversation_id, message_index)
);

create index if not exists message_feedback_conversation_idx
  on public.message_feedback (conversation_id);

alter table public.message_feedback enable row level security;

-- Merchants read feedback for their own bots' conversations (analytics).
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

-- Inserts come from the chat/feedback endpoints using the service-role key.

-- Per-conversation resolution flag: false once the bot emits its "couldn't
-- help" fallback, so analytics can list unanswered conversations.
alter table public.conversations
  add column if not exists unresolved boolean not null default false;
