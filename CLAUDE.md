# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Merclo is an open-source, self-hosted tool for embedding a `<script>` snippet into a Shopify storefront theme. The snippet renders a chat widget backed by an AI agent that acts on the shopper's behalf *within that storefront* (search products, read page context, manage cart, apply discounts, navigate). The operator configures bots through a dashboard.

The app is **single-tenant and has no login**: there is no Supabase Auth, no multi-user accounts, and no RLS-based ownership. The dashboard is unauthenticated by design — anyone who can reach it can manage bots — so deployments are expected to gate access at the infrastructure layer (e.g. a reverse proxy, VPN, or hosting platform's own auth) if that's needed.

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

Environment: copy `.env.example` → `.env.local`. Needs a Supabase URL + service-role key, an OpenRouter API key, and `AGENT_MODEL`. Apply the numbered migrations in `supabase/migrations/` in order (SQL editor or `supabase db push`) to create the `bots` / `conversations` tables (RLS is disabled as of `0006_remove_auth_rls.sql` — all access goes through the service-role client).

## Architecture

The defining constraint: there is **no Shopify App / OAuth**. The embed is a plain public `<script>`, so the backend has no access to the shopper's Shopify session, cart, or cookies — only the storefront page in the browser does. This forces a **remote tool-execution** design:

- The **agent loop runs server-side** (`src/lib/agent/runtime.ts`, `POST /api/chat/turn`) using the raw `openai` SDK pointed at OpenRouter's OpenAI-compatible endpoint. (`@openai/agents` is installed but not used for the loop — it wants to run tools in-process, which fights the remote model.)
- **Tools execute client-side**, inside the widget on the storefront page (`public/widget.js`), against Shopify's public browser APIs (`/cart.js`, `/cart/add.js`, `/search/suggest.json`, JSON-LD, `window.location`).
- The server never executes a tool. When the model calls one, `/api/chat/turn` returns the tool calls to the browser (`{type:'tool_calls', ...}`, conversation status `awaiting_tool`), the widget runs them and POSTs results back, and the loop resumes on the next request. Final replies return `{type:'message', content}`. Conversation history/status is persisted in Supabase so the loop can pause/resume across stateless HTTP requests.

**The tool contract in `src/lib/tools/schema.ts` is the single source of truth** shared by both ends: the server builds the LLM tool-calling schema from it (`src/lib/agent/tools.ts`), and the widget maps each tool name to a browser implementation. Changing a tool means updating this file *and* the widget executor.

Layout:
- `src/lib/supabase/admin.ts` — the single service-role Supabase client (bypasses RLS). Every server-side read/write, dashboard or public chat runtime, goes through this one client — there's no cookie-bound or browser client.
- `src/lib/db/constants.ts` — `DEFAULT_OWNER_ID`, the single fixed owner UUID every row is attributed to (single-tenant model, no real multi-user support).
- `src/lib/db/{bots,conversations,analytics,knowledge,feedback}.ts` — data access, all via the admin client.
- `src/app/(dashboard)/**` — dashboard UI, ungated (no auth); bot CRUD lives under `dashboard/bots`.
- `src/app/api/bots/**` — bot CRUD API. `src/app/api/chat/turn` — the public, CORS-enabled, origin-checked agent endpoint.
- `public/widget.js` — self-contained embeddable widget (Shadow DOM, no build step). `public/demo/index.html` — a fake storefront for local widget testing.

Security: `/api/chat/turn` validates the request `Origin` against the bot's `allowed_origins` (empty = allow any, dev only) and reflects CORS headers, since it's called cross-origin from public storefronts.

## Project status

Foundational scaffold plus the four dashboard panels are in place: bot CRUD, **analytics overview** (`src/lib/db/analytics.ts`), **conversations viewer** (`/dashboard/conversations`), **bot playground** (`/dashboard/bots/[id]/playground` + `/api/playground/turn`, uses client-side mock storefront tools), and a minimal **settings** page (`/dashboard/settings`, informational only — there's no account to manage). Not yet exercised end-to-end against a live Shopify store.

Note: `.env.local` (gitignored) holds real secrets — never paste keys into the tracked `.env.example`.

## Design system

The UI follows an Apple-inspired design system. Tokens live in `src/app/globals.css` (`@theme` → utilities like `bg-canvas`, `bg-surface`, `text-ink`, `text-muted`, `border-hairline`, `bg-accent`, plus `--shadow-*` and radius scales); they auto-switch light/dark via `prefers-color-scheme`, so **do not add `dark:` variants or raw zinc/neutral palettes** — use the tokens. Reusable primitives are in `src/components/ui/` (`Button`/`ButtonLink`, `Card`, `Input`/`Textarea`, `Field`, `Badge`) with `cn()` in `src/lib/cn.ts`. New pages should compose these rather than hand-rolling styles. The embeddable widget (`public/widget.js`) carries its own self-contained styles (Shadow DOM) mirroring the same aesthetic.

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
