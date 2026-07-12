# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Merclo is an open-source platform where Shopify merchants embed a `<script>` snippet into their storefront theme. The snippet renders a chat widget backed by an AI agent that acts on the shopper's behalf *within that storefront* (search products, read page context, manage cart, apply discounts, navigate). Merchants create and configure bots (one merchant → many bots) through a dashboard.

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

Environment: copy `.env.example` → `.env.local`. Needs Supabase keys, an OpenRouter API key, and `AGENT_MODEL`. Apply the numbered migrations in `supabase/migrations/` in order (SQL editor or `supabase db push`) to create the `bots` / `conversations` tables and their RLS policies.

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

Foundational scaffold plus the four dashboard panels are in place: bot CRUD, **analytics overview** (`src/lib/db/analytics.ts`), **conversations viewer** (`/dashboard/conversations`), **bot playground** (`/dashboard/bots/[id]/playground` + `/api/playground/turn`, uses client-side mock storefront tools), and **account settings** (`/dashboard/settings` + `/api/account`). A merchant-facing **Docs panel** (`/dashboard/docs`, content in `src/lib/docs.ts`) explains how the app works and the steps to a running bot. Not yet exercised end-to-end against a live Shopify store.

Note: `.env.local` (gitignored) holds real secrets — never paste keys into the tracked `.env.example`.

## Design system

The UI follows an Apple-inspired design system. Tokens live in `src/app/globals.css` (`@theme` → utilities like `bg-canvas`, `bg-surface`, `text-ink`, `text-muted`, `border-hairline`, `bg-accent`, plus `--shadow-*` and radius scales); they auto-switch light/dark via `prefers-color-scheme`, so **do not add `dark:` variants or raw zinc/neutral palettes** — use the tokens. Reusable primitives are in `src/components/ui/` (`Button`/`ButtonLink`, `Card`, `Input`/`Textarea`, `Field`, `Badge`) with `cn()` in `src/lib/cn.ts`. New pages should compose these rather than hand-rolling styles. The embeddable widget (`public/widget.js`) carries its own self-contained styles (Shadow DOM) mirroring the same aesthetic.

## Development workflow

- **Test-driven development**: write a failing test before implementing the corresponding code, for all new features and bug fixes.
- **Commit frequently**: make small commits with clear, meaningful messages as work progresses, rather than one large commit at the end.
- **Keep the in-app Docs panel current**: the merchant-facing guide at `/dashboard/docs` (content in `src/lib/docs.ts`, unit-tested via `src/lib/docs.test.ts`) explains how Merclo works and the steps to a running bot. Whenever a feature changes what merchants do or how they set up a bot, update `src/lib/docs.ts` **as part of the same feature** — don't wait to be asked. This is a required part of "done" for any merchant-facing feature.
- **Non-feature changes** (small fixes, config, docs not tied to a specific feature) may be committed and pushed directly to `main` from the `main` worktree — no branch/worktree needed.

### Feature workflow, via worktrees

Every feature is developed on its own dedicated branch, never directly on `main`, and each branch gets its **own `git worktree`** (a separate folder checked out on that branch, sharing the same `.git` history) instead of being checked out in place. This is the default now — don't ask whether to use a worktree, just do it. It avoids `git stash`/`checkout` juggling in one folder when work overlaps.

**Setup (one-time):** keep one worktree permanently on `main` as the base — e.g. this repo's original folder stays on `main`. Every feature gets a **new sibling folder**, never reusing the `main` folder for feature work.

1. **Start a feature** from the `main` worktree, up to date with `origin/main`:
   `git worktree add ../merclo-<feature> -b feature/<name>`
   Then work inside `../merclo-<feature>`. It needs its own `npm install` and `.env.local` — worktrees don't share `node_modules` or gitignored files.
2. **List active worktrees** any time: `git worktree list`.
3. **Finish the feature**: commit, push, `gh pr create`, verify `tsc`/`lint`/`vitest` are clean, then merge the PR (`gh pr merge <n> --merge`).
4. **Sync**: `git fetch origin main` + `git merge --ff-only origin/main` (or `git pull --ff-only`) in the `main` worktree.
5. **Clean up** — from a *different* worktree than the one being removed (you can't remove the worktree you're standing in):
   `git worktree remove ../merclo-<feature>` (git refuses if there are uncommitted changes, so it won't silently discard work), then `git branch -d feature/<name>`.

**Gotchas learned the hard way:**
- The folder a repo was originally cloned/created in is the **primary worktree** — it holds `.git` itself and `git worktree remove` cannot target it, even when it's checked out on a feature branch. If a feature ends up developed in the primary folder instead of a proper linked worktree, "cleanup" means switching that folder back to `main` (`git checkout main`) and deleting the branch — not removing the folder.
- On Windows, a running dev server or editor can hold a lock on a worktree's directory handle, making `git worktree remove` (or even `rm -rf`) fail with `Permission denied` even after all the files inside were deleted — leaving an empty, unregistered leftover folder. This is not data loss; just close whatever's watching that folder and retry.
- Never force through a stash/worktree-removal permission denial by deleting things another way — treat it as a signal to stop and check what's actually holding the lock or whether the target is really disposable (e.g. the primary worktree) first.
