-- Merclo schema. Apply via the Supabase SQL editor or `supabase db push`.
-- Merchants are represented by Supabase Auth users (auth.users); the `bots`
-- and `conversations` tables reference them.

create extension if not exists "pgcrypto";

-- A merchant's configured chatbot. The `id` is what the embed snippet carries
-- as data-bot-id, so it is a public identifier.
create table if not exists public.bots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  persona text not null default '',           -- system-prompt / instructions
  allowed_tools text[] not null default '{}', -- tool names this bot may use
  allowed_origins text[] not null default '{}',-- storefront domains allowed to embed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One chat session between a shopper and a bot. Message/tool-call history is
-- stored as an ordered JSON array so the server-side agent loop can pause on a
-- pending client tool-call and resume on the next request.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  messages jsonb not null default '[]'::jsonb, -- OpenAI Agents SDK items
  status text not null default 'active',       -- active | awaiting_tool | closed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_bot_id_idx on public.conversations (bot_id);

-- Row Level Security -------------------------------------------------------
alter table public.bots enable row level security;
alter table public.conversations enable row level security;

-- Merchants manage only their own bots (dashboard, uses user JWT).
create policy "owners manage their bots" on public.bots
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Conversations are written by the server using the service-role key, which
-- bypasses RLS. No anon policy is defined, so the public anon key cannot read
-- or write conversations directly.

-- Merchants may READ conversations belonging to their own bots (dashboard:
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
