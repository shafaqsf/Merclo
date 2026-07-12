-- One AI-copilot thread per dashboard user. Distinct from public.conversations
-- (which are storefront shopper chats). Scoped to the owner via RLS.
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

alter table public.copilot_conversations enable row level security;

create policy "owners manage their copilot thread"
  on public.copilot_conversations
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
