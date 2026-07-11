-- 0004_knowledge_sources
-- Merchant-provided knowledge the bot answers from, retrieved via Postgres
-- full-text search (no vector embeddings in v1).

create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  title text not null,
  content text not null,
  kind text not null default 'note', -- faq | policy | note
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Generated full-text vector over title + content (title weighted higher).
  tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) stored
);

create index if not exists knowledge_sources_bot_id_idx
  on public.knowledge_sources (bot_id);
create index if not exists knowledge_sources_tsv_idx
  on public.knowledge_sources using gin (tsv);

alter table public.knowledge_sources enable row level security;

-- Merchants manage knowledge for bots they own (dashboard, user JWT).
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

-- The chat runtime retrieves knowledge with the service-role key (bypasses RLS).
