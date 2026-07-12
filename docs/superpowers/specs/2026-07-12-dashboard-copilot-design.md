# Dashboard Copilot — Design

**Date:** 2026-07-12
**Status:** Approved for planning
**Branch (to be created):** `feature/dashboard-copilot`

## Summary

An AI copilot embedded in the merchant dashboard as a persistent, collapsible
right-side panel. The logged-in user chats with it in natural language; it can
**read and write their own data** (bots, knowledge, conversations) and **read**
analytics, by performing CRUD operations through the existing `src/lib/db/*`
layer. It runs entirely server-side under the logged-in user's own session, so
Row-Level Security scopes every operation to that user's rows.

This is the *opposite* architecture from the storefront widget: there, the
server has no shopper session and tools execute remotely in the browser. Here,
the server holds the logged-in user's cookie-bound Supabase session, so tools
execute **in-process**.

## Goals

- Let the logged-in user manage their account's data conversationally, e.g.:
  - "Create a bot for my shoe store and enable product search + cart tools."
  - "Which of my bots had the most conversations this week?"
  - "Add a return-policy knowledge entry to the Acme bot."
  - "Rename bot X and update its greeting."
- Full CRUD across **bots**, **knowledge**, and **conversations**; **read-only**
  analytics.
- Two selectable write modes: **accept** (confirm each mutation) and **auto**
  (execute mutations immediately).

## Non-Goals

- **No account-level operations** — no delete-account, no billing/identity or
  auth changes. The copilot has no tools that touch account settings.
- No storefront/widget changes. This is dashboard-only.
- No multi-user or cross-tenant access — RLS + explicit ownership checks
  guarantee a user only ever sees/edits their own data.

## Technology Decision: OpenAI Agents SDK via OpenRouter

We use `@openai/agents` (already a dependency) to run the loop, configured for
OpenRouter. The installed version exposes exactly what we need:

- **`OpenAIChatCompletionsModel(client, model)`** (from `@openai/agents-openai`)
  — constructs a chat-completions model from our existing
  `createOpenRouterClient()` (`src/lib/agent/openrouter.ts`) and
  `getAgentModel()`. This avoids the SDK's default Responses API (which
  OpenRouter does not speak) with no global monkey-patching — we simply pass the
  model instance into the `Agent`.
- **`tool()`** with Zod parameter schemas to define each CRUD tool.
- **`needsApproval` + `RunToolApprovalItem` + serializable `RunState`** — the
  SDK's built-in human-in-the-loop approval. This directly implements our
  accept/auto modes and lets an approval pause across an HTTP request and
  resume.
- **Tracing disabled** (`setTracingDisabled(true)`) so the SDK never phones the
  OpenAI tracing backend; we run through OpenRouter only.

## Architecture

### Components

```
src/lib/copilot/
  agent.ts        # buildCopilotAgent(mode): Agent — model + tools + instructions
  tools.ts        # CRUD tool definitions (tool() wrappers over src/lib/db/*)
  runtime.ts      # runCopilotTurn(...) — thin wrapper over run()/RunState resume
  tools.test.ts
  runtime.test.ts
src/lib/db/copilot-conversations.ts   # persistence for the copilot thread
src/app/api/copilot/turn/route.ts     # POST endpoint (cookie-bound, RLS)
src/app/(dashboard)/_components/CopilotPanel.tsx     # the panel UI (client)
src/app/(dashboard)/_components/CopilotProvider.tsx  # open/collapsed state
supabase/migrations/00XX_copilot_conversations.sql
```

### Agent definition (`agent.ts`)

`buildCopilotAgent(mode: "accept" | "auto")` returns an `Agent` with:
- `model`: `new OpenAIChatCompletionsModel(createOpenRouterClient(), getAgentModel())`
- `instructions`: a system prompt describing the copilot's role, that it acts on
  the logged-in user's own data, and how to behave (ask before destructive ops,
  summarize what it changed, never fabricate ids — look them up first).
- `tools`: the tools from `tools.ts`. Each **mutating** tool's `needsApproval`
  is `true` when `mode === "accept"`, `false` when `mode === "auto"`. Read-only
  tools never need approval.

### Tools (`tools.ts`)

Each tool is a `tool({ name, description, parameters: z.object({...}), execute })`
that calls the existing data layer. Tools are **thin** — validation and RLS live
in `src/lib/db/*`.

| Tool | Kind | Backing call |
|------|------|--------------|
| `list_bots` | read | `listBots()` |
| `get_bot` | read | `getBot(id)` |
| `create_bot` | write | `createBot(input)` |
| `update_bot` | write | `updateBot(id, patch)` |
| `delete_bot` | write | `deleteBot(id)` |
| `list_knowledge` | read | `listKnowledge(botId)` |
| `add_knowledge` | write | `addKnowledge(...)` |
| `delete_knowledge` | write | `deleteKnowledge(id)` |
| `list_conversations` | read | `listConversationSummaries(...)` (owner-scoped) |
| `get_conversation` | read | `getConversation(id)` (owner-scoped) |
| `delete_conversation` | write | `deleteConversation(id)` (owner-scoped) |
| `get_analytics` | read | `getAnalyticsOverview(...)` |

**Ownership for conversation tools:** `conversations` has no RLS policy and its
helpers use the admin client. The copilot's conversation tools must therefore
enforce ownership explicitly: resolve the set of bot ids the user owns via the
RLS-scoped bots layer, and refuse to read/delete any conversation whose `bot_id`
is not in that set. Bots and knowledge tools rely on RLS directly (cookie-bound
client), as those layers already do.

The valid tool set for `allowed_tools` on bots (`src/lib/tools/schema.ts`) is
unrelated to these copilot tools and is untouched.

### Runtime (`runtime.ts`)

`runCopilotTurn` wraps the SDK's `run()`:
- **New message:** `run(agent, historyItems.concat(userMessage))`.
- If the result has interruptions (pending `RunToolApprovalItem`s), return them
  to the caller as proposed actions and persist the serialized `RunState`.
- **Approval/rejection:** rehydrate `RunState` from storage, apply
  `state.approve(item)` / `state.reject(item)` for each decision, call `run(agent,
  state)` to resume, repeat until no interruptions remain.
- On completion, persist the updated history items and clear pending state.

An injectable seam (a factory for the `Agent`/model) keeps `runtime.test.ts`
runnable against a fake model without network access, mirroring the existing
`runtime.ts` `LLM` seam.

### Endpoint (`src/app/api/copilot/turn/route.ts`)

`POST` only, **not** CORS-exposed (dashboard-only; contrast `/api/chat/turn`).
Auth-gated by the existing dashboard middleware; uses the cookie-bound Supabase
client so all `src/lib/db/*` calls are RLS-scoped to the logged-in user.

Request bodies (discriminated union):
- `{ kind: "message", text }`
- `{ kind: "decision", decisions: [{ approvalId, approve: boolean }] }`

Response (discriminated union):
- `{ type: "message", content }` — final assistant reply.
- `{ type: "approvals", pending: [{ approvalId, toolName, summary, arguments }] }`
  — mutations awaiting confirmation (accept mode).

### Persistence (`copilot-conversations` + migration)

One copilot thread per user (singleton per `owner_id`), storing:
- `owner_id` (FK to `auth.users`, unique)
- `items jsonb` — the SDK history items (opaque, like `conversations.messages`)
- `pending_state jsonb` — serialized `RunState` when awaiting approval, else null
- `mode text` — `'accept' | 'auto'`, the user's chosen write mode (default
  `'accept'`)
- `created_at`, `updated_at`

RLS: policies scoping all operations to `auth.uid() = owner_id`. Data access in
`src/lib/db/copilot-conversations.ts` via the cookie-bound client.

### UI (`CopilotPanel` + `CopilotProvider`)

- A collapsible panel docked on the right, integrated in
  `src/app/(dashboard)/layout.tsx` alongside the existing sidebar + `TopBar`.
  Collapsed by default to a slim rail/toggle; open state persisted (localStorage)
  so it stays put across navigation.
- Composed from `src/components/ui/*` primitives and design tokens
  (`bg-surface`, `text-ink`, `border-hairline`, etc.) — no raw palettes, no
  `dark:` variants, per the design system.
- Contents: a chat thread; a composer input; a **mode toggle** (Accept / Auto)
  wired to the persisted `mode`; and, in accept mode, **approval cards** for
  pending mutations (tool name + human summary + Approve / Reject).
- Streaming is out of scope for v1 — request/response turns with a thinking
  indicator. (The SDK supports streaming; we can add it later without changing
  the tool/approval design.)

## Data Flow

1. User types a message → `POST /api/copilot/turn { kind: "message" }`.
2. Route loads the user's copilot thread (items + mode), builds the agent for
   that mode, calls `runCopilotTurn`.
3. Read tools execute in-process immediately. In **auto** mode, write tools also
   execute immediately. The final reply is returned as `{ type: "message" }`.
4. In **accept** mode, when the model calls a write tool the run interrupts; the
   route persists `RunState` and returns `{ type: "approvals", pending }`.
5. The panel renders approval cards. On Approve/Reject → `POST { kind:
   "decision" }`; the route resumes the run from `RunState`, executing approved
   mutations, and returns the next `message` or `approvals`.

## Error Handling

- Tool execution errors (DB/RLS failures) are caught and returned to the model
  as tool error results so it can explain the failure, not crash the turn. The
  route never leaks raw errors to the client beyond a generic message + status.
- Missing/invalid `OPENROUTER_API_KEY` surfaces as a 500 with a safe message
  (mirrors existing behavior).
- Unauthenticated requests → 401 (middleware + explicit `getUser()` guard).
- A `decision` request with no persisted `pending_state` → 409 (stale approval).
- Ownership violations in conversation tools → the tool returns an error result
  ("not found or not yours"); it never operates cross-tenant.

## Testing (TDD)

Write failing tests first for each unit:
- `tools.test.ts`: each tool calls the right db function with mapped args, and
  read-only vs mutating classification is correct; conversation tools reject
  non-owned ids (mocked ownership set).
- `runtime.test.ts`: with a fake model — a plain reply returns `message`; a
  mutating tool in accept mode returns an approval interruption and persists
  state; resuming with approve executes it; resuming with reject skips it; auto
  mode executes without interruption.
- `copilot-conversations.test.ts`: pure mappers (row → typed object), mode
  defaulting.
- Update `src/lib/docs.ts` (+ `docs.test.ts`) to document the copilot for
  merchants — required for a merchant-facing feature.

## Rollout / Sequencing

1. Migration + `copilot-conversations` data layer (+ tests).
2. `tools.ts` (+ tests).
3. `agent.ts` + `runtime.ts` (+ tests).
4. `/api/copilot/turn` route.
5. `CopilotProvider` + `CopilotPanel` UI, wired into the dashboard layout.
6. Docs update.

## Open Questions / Future Work

- Streaming responses (SDK-supported; deferred).
- Per-tool granular permissions or an allow-list of copilot capabilities per
  user (deferred; v1 is all-or-nothing within the non-account scope).
- Multiple named copilot threads (v1 is a single thread per user).
