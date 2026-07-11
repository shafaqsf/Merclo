# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Merclo is a SaaS platform where Shopify merchants embed a `<script>` snippet into their storefront theme. The snippet renders a chat widget backed by an AI agent that acts on the shopper's behalf *within that storefront* (search products, read page context, manage cart, apply discounts, navigate). Merchants create and configure bots (one merchant → many bots) through a dashboard.

## Commands

```bash
npm run dev          # Next.js dev server (Turbopack) on :3000
npm run build        # production build (also runs full TypeScript check)
npm run lint         # ESLint
npm test             # Vitest, single run
npm run test:watch   # Vitest, watch mode
npx vitest run src/lib/db/bots.test.ts   # run a single test file
npx tsc --noEmit     # typecheck only (build also does this)
```

Environment: copy `.env.example` → `.env.local`. Needs Supabase keys, an OpenRouter API key, and `AGENT_MODEL`. Apply `supabase/schema.sql` to the Supabase project (SQL editor or `supabase db push`) to create the `bots` / `conversations` tables and their RLS policies.

## Architecture

The defining constraint: there is **no Shopify App / OAuth**. The embed is a plain public `<script>`, so the backend has no access to the shopper's Shopify session, cart, or cookies — only the storefront page in the browser does. This forces a **remote tool-execution** design:

- The **agent loop runs server-side** (`src/lib/agent/runtime.ts`, `POST /api/chat/turn`) using the raw `openai` SDK pointed at OpenRouter's OpenAI-compatible endpoint. (`@openai/agents` is installed but not used for the loop — it wants to run tools in-process, which fights the remote model.)
- **Tools execute client-side**, inside the widget on the storefront page (`public/widget.js`), against Shopify's public browser APIs (`/cart.js`, `/cart/add.js`, `/search/suggest.json`, JSON-LD, `window.location`).
- The server never executes a tool. When the model calls one, `/api/chat/turn` returns the tool calls to the browser (`{type:'tool_calls', ...}`, conversation status `awaiting_tool`), the widget runs them and POSTs results back, and the loop resumes on the next request. Final replies return `{type:'message', content}`. Conversation history/status is persisted in Supabase so the loop can pause/resume across stateless HTTP requests.

**The tool contract in `src/lib/tools/schema.ts` is the single source of truth** shared by both ends: the server builds the LLM tool-calling schema from it (`src/lib/agent/tools.ts`), and the widget maps each tool name to a browser implementation. Changing a tool means updating this file *and* the widget executor.

Layout:
- `src/lib/supabase/{server,client,admin}.ts` — SSR (cookie/RLS), browser, and service-role (bypasses RLS, used by the public chat endpoint) clients. `createServerSupabase()` is **async**.
- `src/lib/db/{bots,conversations}.ts` — data access. Merchant-facing reads/writes go through the cookie-bound client (RLS-scoped to the owner); `getBotForRuntime` and all conversation writes use the admin client.
- `src/app/(dashboard)/**` — merchant dashboard (auth-gated by `src/middleware.ts`); bot CRUD lives under `dashboard/bots`.
- `src/app/api/bots/**` — bot CRUD API. `src/app/api/chat/turn` — the public, CORS-enabled, origin-checked agent endpoint.
- `public/widget.js` — self-contained embeddable widget (Shadow DOM, no build step). `public/demo/index.html` — a fake storefront for local widget testing.

Security: `/api/chat/turn` validates the request `Origin` against the bot's `allowed_origins` (empty = allow any, dev only) and reflects CORS headers, since it's called cross-origin from public storefronts.

## Project status

Foundational scaffold plus the four dashboard panels are in place: bot CRUD, **analytics overview** (`src/lib/db/analytics.ts`), **conversations viewer** (`/dashboard/conversations`), **bot playground** (`/dashboard/bots/[id]/playground` + `/api/playground/turn`, uses client-side mock storefront tools), and **account settings** (`/dashboard/settings` + `/api/account`). Not yet exercised end-to-end against a live Shopify store.

Note: `.env.local` (gitignored) holds real secrets — never paste keys into the tracked `.env.example`.

## Development workflow

- **Test-driven development**: write a failing test before implementing the corresponding code, for all new features and bug fixes.
- **Feature branches**: every feature is developed on its own dedicated branch, never directly on `main`.
- **Commit frequently**: make small commits with clear, meaningful messages as work progresses, rather than one large commit at the end.
- **Feature completion flow**: once a feature is complete and all tests, build checks, and linting pass:
  1. Push the branch to the remote.
  2. Open a pull request.
  3. Merge the pull request into `main`.
  4. Synchronize the local repository with the latest remote `main`.
- **Non-feature changes** (e.g. small fixes, config, docs not tied to a specific feature): commits may be made and pushed directly to `main`.
