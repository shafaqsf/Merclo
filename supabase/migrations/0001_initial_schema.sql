-- 0001_initial_schema
--
-- Complete Merclo database schema in a single migration. Apply to a FRESH
-- Supabase project via the SQL editor or `supabase db push`.
--
-- Merchants are Supabase Auth users (auth.users). Every table is protected by
-- Row Level Security so the dashboard's cookie-bound (user-JWT) client can only
-- ever touch the signed-in merchant's own rows. The public chat runtime uses
-- the service-role key, which bypasses RLS by design (see notes per table).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- bots
-- A merchant's configured chatbot. `id` is what the embed snippet carries as
-- data-bot-id, so it is a public identifier. `appearance` holds widget config
-- as JSON so its shape can evolve without migrations (defaults applied in
-- src/lib/bots/appearance.ts).
-- ---------------------------------------------------------------------------
create table if not exists public.bots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  persona text not null default '',            -- system-prompt / instructions
  allowed_tools text[] not null default '{}',  -- tool names this bot may use
  allowed_origins text[] not null default '{}',-- storefront domains allowed to embed
  appearance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- conversations
-- One chat session between a shopper and a bot. Message/tool-call history is an
-- ordered JSON array so the server-side agent loop can pause on a pending
-- client tool-call and resume on the next request. `unresolved` flips true once
-- the bot emits its "couldn't help" fallback (feeds the "unanswered" metric).
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  messages jsonb not null default '[]'::jsonb, -- OpenAI chat message items
  status text not null default 'active',       -- active | awaiting_tool | closed
  unresolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_bot_id_idx
  on public.conversations (bot_id);

-- ---------------------------------------------------------------------------
-- knowledge_sources
-- Merchant-provided knowledge the bot answers from, retrieved via Postgres
-- full-text search (no vector embeddings in v1). `tsv` is a generated,
-- weighted full-text vector over title (A) + content (B).
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  title text not null,
  content text not null,
  kind text not null default 'note', -- faq | policy | note
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) stored
);

create index if not exists knowledge_sources_bot_id_idx
  on public.knowledge_sources (bot_id);
create index if not exists knowledge_sources_tsv_idx
  on public.knowledge_sources using gin (tsv);

-- ---------------------------------------------------------------------------
-- message_feedback
-- Thumbs up/down on assistant messages (CSAT). Inserts come from the
-- chat/feedback endpoints using the service-role key.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- copilot_conversations
-- One AI-copilot thread per dashboard user (the in-dashboard assistant that
-- performs CRUD on the merchant's own data). Distinct from public.conversations
-- (storefront shopper chats). `pending_state` holds a serialized Agents-SDK
-- RunState while an accept-mode tool approval is outstanding.
-- ---------------------------------------------------------------------------
create table if not exists public.copilot_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  pending_state jsonb,
  mode text not null default 'accept' check (mode in ('accept', 'auto')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id)
);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.bots enable row level security;
alter table public.conversations enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.message_feedback enable row level security;
alter table public.copilot_conversations enable row level security;

-- Merchants manage only their own bots (dashboard, user JWT).
create policy "owners manage their bots" on public.bots
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Merchants READ conversations belonging to their own bots (conversations
-- viewer + analytics). All conversation writes go through the service-role key
-- from the chat runtime, which bypasses RLS; no anon policy exists, so the
-- public anon key cannot read or write conversations directly.
create policy "owners read their bots' conversations" on public.conversations
  for select using (
    exists (
      select 1 from public.bots
      where public.bots.id = public.conversations.bot_id
        and public.bots.owner_id = auth.uid()
    )
  );

-- Merchants manage knowledge for bots they own. The chat runtime retrieves
-- knowledge with the service-role key (bypasses RLS).
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

-- Merchants read feedback for their own bots' conversations (analytics).
-- Inserts come from the chat/feedback endpoints using the service-role key.
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

-- Each merchant manages only their own copilot thread.
create policy "owners manage their copilot thread" on public.copilot_conversations
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ===========================================================================
-- Storage: bot avatars
-- Public bucket — files are served directly by URL to the (anonymous) chat
-- widget, so read is public. Writes are scoped to the owning merchant via a
-- path convention: <bot_id>/<filename>, checked against bots.owner_id.
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('bot-avatars', 'bot-avatars', true)
on conflict (id) do nothing;

create policy "anyone can read bot avatars"
  on storage.objects for select
  using (bucket_id = 'bot-avatars');

create policy "owners upload their bot avatars"
  on storage.objects for insert
  with check (
    bucket_id = 'bot-avatars'
    and exists (
      select 1 from public.bots
      where public.bots.id::text = (storage.foldername(name))[1]
        and public.bots.owner_id = auth.uid()
    )
  );

create policy "owners update their bot avatars"
  on storage.objects for update
  using (
    bucket_id = 'bot-avatars'
    and exists (
      select 1 from public.bots
      where public.bots.id::text = (storage.foldername(name))[1]
        and public.bots.owner_id = auth.uid()
    )
  );

create policy "owners delete their bot avatars"
  on storage.objects for delete
  using (
    bucket_id = 'bot-avatars'
    and exists (
      select 1 from public.bots
      where public.bots.id::text = (storage.foldername(name))[1]
        and public.bots.owner_id = auth.uid()
    )
  );
