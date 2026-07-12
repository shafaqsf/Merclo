# Dashboard Redesign + Feature Enhancements — Design

Date: 2026-07-12
Status: Approved (design), pending spec review

## Context

Merclo is an embeddable AI shopping-assistant platform for Shopify storefronts.
The foundation exists: Supabase auth + data, an agent runtime (`/api/chat/turn`)
using OpenRouter with **remote client-side tool execution**, an embeddable
widget (`public/widget.js`), and a dashboard with bot CRUD + four panels
(overview/analytics, conversations, playground, settings), freshly restyled to
an Apple-like token system (`src/app/globals.css`, `src/components/ui/*`).

This project delivers, **in one coordinated pass**, a dashboard redesign plus
four feature bundles. It is intentionally large; the build is parallelizable
(see "Build strategy") but ships as one feature branch.

## Goals

1. Redesign the dashboard shell + Overview to the reference aesthetic (dark
   sidebar, global search, greeting + date range, KPI cards with deltas, charts
   row, activity feed, donut, quick actions) — adapted to our domain.
2. **Widget experience**: merchant-configurable appearance, quick-reply chips,
   in-chat product cards, proactive greeting.
3. **Knowledge base (RAG)**: merchant content the bot answers from, via Postgres
   full-text search (no embeddings in v1).
4. **Analytics & insights**: top questions, unanswered questions, cart
   attribution, CSAT (👍/👎).
5. **Onboarding & polish**: first-run wizard + refined empty states.

## Non-goals (explicit)

- No Shopify OAuth app / product sync (widget still uses public storefront APIs).
- No billing/subscriptions; any "upgrade" UI is cosmetic.
- No vector embeddings in v1 (Postgres FTS instead; pgvector is a future upgrade).
- No realtime infra; notifications = a simple recent-events dropdown.

## Approved assumptions

1. RAG = Postgres full-text search in v1.
2. Global search (⌘K) scoped to bots + conversations; notifications = recent
   events dropdown.
3. Upgrade/Pro UI is cosmetic (no billing).
4. Dark sidebar replaces the current light one; the rest of the token system
   (`globals.css`, `src/components/ui/*`) stays and is extended.

---

## A. Dashboard redesign

### Shell (`src/app/(dashboard)/layout.tsx`, `_components/*`)
- **Dark sidebar**: logo, nav (Overview, Bots, Conversations, Analytics,
  Knowledge, Settings), a cosmetic "Need help? / docs" card, user block. Add
  dark-sidebar tokens to `globals.css` (e.g. `--sidebar`, `--sidebar-ink`,
  `--sidebar-muted`) so it is theme-stable.
- **Top bar** (`_components/TopBar.tsx`): global search input (⌘K opens a command
  palette), notifications bell (dropdown), user menu (email + sign out).
- **Command palette** (`_components/CommandPalette.tsx`, client): fuzzy list over
  the merchant's bots + recent conversations; keyboard `⌘/Ctrl+K`. Data via a
  lightweight `/api/search?q=` route (owner-scoped).
- **Notifications** (`_components/Notifications.tsx`): reads recent activity
  (latest conversations + low-OpenRouter-credit warning if detectable) — no new
  table; derived server-side.

### Overview page (`src/app/(dashboard)/dashboard/page.tsx`)
- Greeting (time-of-day + user email/name) + **date-range picker** (client;
  presets 7/30/90 days; drives the stats query via `?range=`).
- **KPI cards** (4) with value + delta vs previous period: Conversations, Active
  bots, Messages, Cart-adds via bot. Extend `getDashboardStats` to accept a
  range and compute deltas.
- **Charts row**: Conversations-over-time line (CSS/SVG, no chart lib),
  Messages-by-bot or top-tools bar, **Live status** panel (Supabase reachable /
  OpenRouter configured / agent OK — best-effort checks).
- **Recent activity** feed (latest conversations across bots), **Top questions**
  donut (from analytics), **Quick actions** grid (Create bot, Copy embed, Open
  playground, Docs).

Charts remain dependency-free (inline SVG/flex bars), consistent with today.

---

## B. Widget experience

### Data (migration `0003`)
- Add `bots.appearance jsonb not null default '{}'` holding:
  `{ accent, position: 'right'|'left', launcher: 'chat'|'sparkle'|'cart',
     greeting, subtitle, quick_replies: string[], show_product_cards: bool,
     proactive: { enabled: bool, delay_ms: number, message } }`.
- Typed accessor + defaults in `src/lib/bots/appearance.ts` (pure, unit-tested).

### Dashboard
- New **Appearance** tab on the bot editor (`bots/[id]/appearance/page.tsx` or a
  tabbed section) with form controls + a **live preview** component
  (`_components/WidgetPreview.tsx`) that renders a static mock of the widget
  using the chosen config.
- Appearance persists via the existing `PATCH /api/bots/[id]` (extend to accept
  `appearance`).

### Widget (`public/widget.js`) + delivery
- The widget must learn its bot's appearance. Add a public
  `GET /api/bots/[id]/config` route returning **only** safe public fields
  (appearance + enabled tools' display needs), origin-checked/CORS like the chat
  endpoint. Widget fetches config on load and themes itself.
- Render **quick-reply chips** from `quick_replies`; clicking sends that text.
- **Product cards** (decided): the server emits a structured `render_products`
  part alongside the assistant text (`{ content, products: [{title, price,
  image, url, variant_id}] }` in the `/api/chat/turn` message response). The
  runtime populates it when the model returns product data (e.g. from
  `search_products` results the model chose to surface). Rendering is
  deterministic; no extra tool needed, so `src/lib/tools/schema.ts` is unchanged
  for this.
- **Proactive greeting**: after `proactive.delay_ms`, auto-open or show a nudge
  bubble with `proactive.message`.

### Shared tool schema
- Extend `src/lib/tools/schema.ts` if a `show_products` tool is added; keep the
  server/widget contract in sync.

---

## C. Knowledge base (RAG via Postgres FTS)

### Data (migration `0004`)
- `knowledge_sources` (id, bot_id fk cascade, title, content text, kind:
  'faq'|'policy'|'note', created_at, updated_at) with a generated `tsv tsvector`
  column + GIN index over title+content. RLS: owners manage rows for their bots.

### Data access
- `src/lib/db/knowledge.ts`: CRUD (owner-scoped server client) + `searchKnowledge
  (botId, query, limit)` using `websearch_to_tsquery` ranking, called with the
  admin client from the runtime.

### Dashboard
- **Knowledge** nav section: list per bot, add/edit/delete entries
  (`dashboard/knowledge/*` and/or a tab under the bot). Simple forms
  (title + textarea + kind).

### Agent
- New server-side tool `search_knowledge` (executes on the SERVER, unlike
  storefront tools, since it queries our DB): add to the runtime's tool set,
  executed inline in `runAgentStep` rather than delegated to the browser. This
  requires the runtime to support a class of **server-executed** tools alongside
  the existing remote/client tools — a documented extension to the loop.
- System prompt instructs: prefer answering from `search_knowledge` results;
  if nothing relevant, say so (this "no answer" path feeds analytics'
  unanswered metric).

---

## D. Analytics & insights

### Data (migration `0005`)
- `message_feedback` (id, conversation_id fk cascade, message_index int, rating:
  'up'|'down', created_at). RLS: owners read their bots' feedback; inserts via
  the chat endpoints (service role) or a dedicated feedback route.
- Optionally a `conversations.resolved boolean` / fallback flag set by the
  runtime when the bot emits its "couldn't help" fallback.

### Endpoints
- `POST /api/feedback` (widget + playground): `{ conversationId, messageIndex,
  rating }`, origin-checked; writes via service role.

### Analytics computation (`src/lib/db/analytics.ts`, extended)
- **Top questions**: cluster first user messages (normalize + count; simple, no
  ML) → ranked list.
- **Unanswered**: conversations flagged fallback / with a 👎 / with no successful
  tool use → list + count.
- **Cart attribution**: count `add_to_cart` tool calls across conversations.
- **CSAT**: up/(up+down) ratio from `message_feedback`.
- All owner-scoped and range-aware.

### Dashboard
- Redesigned **Analytics** page: CSAT tile, cart-adds tile, Top-questions list,
  Unanswered-questions list, trend charts. (Overview shows the condensed
  version; Analytics is the deep view.)

### Widget & playground
- 👍/👎 controls on assistant messages → `POST /api/feedback`.

---

## E. Onboarding & polish

- **First-run wizard** (`dashboard/onboarding` or a gated overlay) shown when the
  user has 0 bots: Step 1 create bot → Step 2 customize appearance + copy embed
  snippet → Step 3 test in playground. Reuses existing create/appearance/embed
  pieces; dismissible; not shown once ≥1 bot exists.
- Refined empty states across Bots/Conversations/Knowledge/Analytics using the
  card + primary-action pattern.

---

## Cross-cutting

- **Migrations**: `0003_bot_appearance`, `0004_knowledge_sources`,
  `0005_message_feedback` (+ optional conversations flag), each with RLS.
- **Runtime extension**: support server-executed tools (`search_knowledge`)
  alongside client/remote tools; the state machine gains an inline-tool branch
  before returning tool calls to the browser. Unit-tested with a mock LLM.
- **Design tokens**: extend `globals.css` with sidebar + a couple of chart/
  status tokens; add any new primitives (e.g. `Tabs`, `StatCard`, `Donut`,
  `Chip`) to `src/components/ui/`.
- **Security**: new public routes (`/api/bots/[id]/config`, `/api/feedback`)
  reuse the origin allow-list + CORS pattern from `/api/chat/turn`. Knowledge and
  feedback reads in the dashboard are RLS-owner-scoped.

## Testing / verification

- Unit tests (vitest): appearance defaults/merge; FTS query builder (pure parts);
  analytics computations (top questions, unanswered, CSAT, cart attribution) with
  fixtures; runtime server-tool branch with a mock LLM.
- Build/tsc/lint green.
- Visual verification (Playwright) of: redesigned shell + Overview, bot Appearance
  tab + live preview, Knowledge CRUD, redesigned Analytics, onboarding wizard, and
  the themed widget with product cards + quick replies on the demo page.
- Migrations applied to Supabase before end-to-end checks.

## Build strategy (one shot)

Land shared foundations first (migrations, tokens/primitives, runtime
server-tool extension, DB access layers), then fan out parallel agents by area
(shell/overview, appearance+widget, knowledge, analytics, onboarding), each on
disjoint files, reconciling shared contracts (tool schema, config route, feedback
route) centrally. Full verification pass, then PR → merge → sync.

## Resolved placement decisions

- **Product cards**: server-emitted structured `render_products` message part
  (see B) — not a separate client tool.
- **Navigation**: **Knowledge** is a top-level nav section; **Appearance** is a
  tab within the bot editor (co-located with the bot it configures).
- Since `render_products` changes the `/api/chat/turn` response shape, the widget
  and the runtime must land that contract together (reconciled centrally in the
  build).
