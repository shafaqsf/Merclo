# Merclo

**Embeddable AI shopping assistants for Shopify storefronts.**

Merclo lets a merchant create an AI chatbot in a dashboard, then drop a single
`<script>` snippet into their Shopify theme. The snippet renders a chat widget
backed by an AI agent that acts **on the shopper's behalf inside that
storefront** — searching products, reading the current page, managing the cart,
applying discount codes, and navigating — all through the browser's public
Shopify APIs. One merchant can run many bots, each with its own persona, tools,
knowledge base, and appearance.

There is deliberately **no Shopify App and no OAuth**: the embed is a plain
public script, so onboarding is copy-paste and Merclo never needs access to a
store's admin or a shopper's session.

---

## How it works

The defining constraint shapes the whole architecture: because the embed is a
public script, the backend has **no access to the shopper's Shopify session,
cart, or cookies** — only the storefront page in the browser does. This forces a
**remote tool-execution** design:

- **The agent loop runs server-side** (`src/lib/agent/runtime.ts`,
  `POST /api/chat/turn`) using the OpenAI SDK pointed at
  [OpenRouter](https://openrouter.ai)'s OpenAI-compatible endpoint.
- **Tools execute client-side**, inside the widget on the storefront page
  (`public/widget.js`), against Shopify's public browser APIs (`/cart.js`,
  `/cart/add.js`, `/search/suggest.json`, JSON-LD, `window.location`).
- **The server never executes a storefront tool.** When the model calls one,
  `/api/chat/turn` returns the tool calls to the browser, the widget runs them
  and POSTs the results back, and the loop resumes on the next request.
  Conversation state is persisted in Supabase so the loop can pause and resume
  across stateless HTTP requests.

The tool contract in `src/lib/tools/schema.ts` is the single source of truth
shared by both ends — the server builds the LLM tool-calling schema from it, and
the widget maps each tool name to a browser implementation.

Security note: `/api/chat/turn` is public and CORS-enabled, so it validates the
request `Origin` against each bot's **allowed storefront origins** (an empty
list allows any origin — intended for local development only).

---

## The dashboard

Merchants sign in with Supabase Auth and manage everything from a dashboard:

- **Bots** — create and configure bots: persona, enabled tools, allowed
  origins, appearance (accent, launcher, greeting, quick replies), and an avatar.
- **Knowledge** — per-bot FAQ / policy / note entries the agent answers from,
  retrieved with Postgres full-text search.
- **Playground** — drive the real agent loop against mocked storefront tools, so
  you can test a bot end-to-end without any store.
- **Conversations** — browse real shopper transcripts.
- **Analytics** — conversation volume, tool usage, CSAT, and unanswered chats.
- **Copilot** — an in-dashboard AI assistant (right-side panel) that performs
  CRUD on **your own** bots, knowledge, and conversations in natural language,
  running under your session (so it can only ever touch your data). It offers an
  *Accept* mode (you approve each change) and an *Auto* mode (changes apply
  immediately). Built on the OpenAI Agents SDK via OpenRouter.
- **Docs & Settings** — an in-app setup guide and account settings.

---

## Tech stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Supabase** — Postgres, Auth, Storage, and Row Level Security
- **OpenRouter** — OpenAI-compatible LLM gateway (`openai` SDK + `@openai/agents`)
- **Tailwind CSS v4** with a shadcn/ui-based component library
- **Vitest** for tests

---

## Getting started

### Prerequisites

- **Node.js 20+** and npm
- A **Supabase** project (free tier is fine) — you'll need its URL, anon key,
  and service-role key
- An **OpenRouter** API key with credits (the agent returns HTTP 402 without them)

### 1. Install and configure

```bash
git clone <your-fork-url> merclo && cd merclo
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | What it is |
|----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-only; **never** exposed to the browser) |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `OPENROUTER_BASE_URL` | Defaults to `https://openrouter.ai/api/v1` |
| `AGENT_MODEL` | Model slug routed through OpenRouter, e.g. `openai/gpt-4o-mini` |
| `NEXT_PUBLIC_APP_URL` | Public base URL of this app (used by the embed snippet), e.g. `http://localhost:3000` |

`.env.local` is gitignored and holds real secrets — never paste keys into the
tracked `.env.example`.

### 2. Set up the database

Apply the schema to your Supabase project. The entire schema (tables, RLS
policies, and the avatar storage bucket) lives in a single migration:

```bash
supabase db push        # or paste supabase/migrations/0001_initial_schema.sql
                        # into the Supabase SQL editor and run it
```

### 3. Run

```bash
npm run dev             # http://localhost:3000
```

Sign up, create a bot, and open **Bots → your bot → Test in playground** to try
the agent immediately — no storefront required.

### Commands

```bash
npm run dev          # dev server (Turbopack)
npm run build        # production build (also runs a full TypeScript check)
npm run lint         # ESLint
npm test             # Vitest (single run)
npm run test:watch   # Vitest (watch mode)
npx tsc --noEmit     # typecheck only
```

---

## Testing the embed on a real storefront

The embed snippet points at `NEXT_PUBLIC_APP_URL`. On a live Shopify store
(HTTPS), a raw `http://localhost:3000` snippet fails two ways: browsers block
mixed content, and `localhost` only resolves on your own machine. To test the
real embed against your local dev server you need a public **HTTPS tunnel** to
`localhost:3000`.

Using **ngrok**:

```bash
npm run dev                     # 1. start the dev server
ngrok http 3000                 # 2. in another terminal, tunnel to it
#   → copy the https URL, e.g. https://abc123.ngrok-free.app
```

Then:

1. Set `NEXT_PUBLIC_APP_URL=https://abc123.ngrok-free.app` in `.env.local` and
   **restart `npm run dev`** (`NEXT_PUBLIC_*` values are inlined at compile
   time). The tunnel host is permitted via `allowedDevOrigins` in
   `next.config.ts` (add others through `DEV_ALLOWED_ORIGINS`).
2. In the dashboard, open your bot — the **Embed snippet** now points at the
   tunnel URL. Copy it into your Shopify theme (`theme.liquid`, before
   `</body>`).
3. Add your store's domain (e.g. `https://your-store.myshopify.com`) to the
   bot's **Allowed storefront origins**, or leave it empty to allow any origin
   during development.
4. Make sure your **OpenRouter** account has credits, otherwise the agent
   returns 402 and the bot can't reply.

Notes:

- Free ngrok URLs change every restart — re-set `NEXT_PUBLIC_APP_URL` and
  re-copy the snippet each time (or use an ngrok reserved domain).
- If ngrok's free browser-warning page interferes with loading `widget.js`,
  switch to a Cloudflare quick tunnel, which has no interstitial:
  `cloudflared tunnel --url http://localhost:3000`.

---

## Project structure

```
src/
  app/
    (dashboard)/          merchant dashboard (auth-gated by src/middleware.ts)
    api/
      chat/turn/          public, CORS-enabled, origin-checked agent endpoint
      copilot/turn/       dashboard copilot endpoint (cookie-bound, RLS-scoped)
      bots/ account/ ...  dashboard CRUD APIs
  lib/
    agent/                server-side agent runtime + OpenRouter client
    copilot/              in-dashboard copilot (agent, tools, runtime)
    tools/schema.ts       shared storefront tool contract (server + widget)
    db/                   Supabase data access (RLS-scoped and service-role)
    supabase/             SSR, browser, and admin (service-role) clients
public/
  widget.js               self-contained embeddable widget (Shadow DOM)
  demo/                    a fake storefront for local widget testing
supabase/
  migrations/             database schema (single consolidated migration)
```

See `CLAUDE.md` for a deeper architecture tour and contributor conventions.

---

## Security model

Every dashboard read/write is scoped to the signed-in merchant by **Postgres Row
Level Security** via a cookie-bound Supabase client. The public chat runtime uses
the service-role key (which bypasses RLS) but only after resolving a bot by its
public id and validating the request origin. The service-role key is server-only
and is never shipped to the browser. See `docs/security-review-2026-07-12.md` for
a full security review.
