-- 0003_bot_appearance
-- Per-bot widget appearance/config (accent, position, launcher, greeting,
-- quick replies, product cards, proactive greeting). Stored as JSON so the
-- shape can evolve without migrations; defaults are applied in application code
-- (src/lib/bots/appearance.ts).

alter table public.bots
  add column if not exists appearance jsonb not null default '{}'::jsonb;
