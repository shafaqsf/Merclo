# Dashboard Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-dashboard AI copilot (persistent right-side panel) that performs CRUD on the logged-in user's bots/knowledge/conversations and reads analytics, running server-side under their RLS-scoped session via the OpenAI Agents SDK pointed at OpenRouter.

**Architecture:** The copilot runs entirely server-side inside a cookie-bound Next.js route, so `src/lib/db/*` calls are RLS-scoped to the logged-in user. The agent loop is `@openai/agents` with `OpenAIChatCompletionsModel` wrapping the existing OpenRouter client. Mutating tools use the SDK's `needsApproval` (true in "accept" mode, false in "auto"); when a run interrupts for approval, the serialized `RunState` is persisted so the approval resumes on a later HTTP request.

**Tech Stack:** Next.js 16 (App Router), TypeScript, `@openai/agents` + `@openai/agents-openai`, `openai` SDK (OpenRouter), Supabase (SSR cookie client + RLS), Zod, Vitest, shadcn-style `src/components/ui/*` + design tokens.

## Global Constraints

- **Design system:** use tokens/utilities from `src/app/globals.css` (`bg-surface`, `text-ink`, `text-muted`, `border-hairline`, `bg-accent`, etc.) and compose `src/components/ui/*`. **No `dark:` variants, no raw zinc/neutral palettes.**
- **No account-level operations.** The copilot exposes no tool that deletes the account or changes billing/identity/auth. Scope is bots, knowledge, conversations (CRUD) + analytics (read).
- **RLS is the tenancy boundary.** All data access goes through the existing `src/lib/db/*` cookie-bound helpers (or the new owner-scoped delete helper). Never use the admin client in copilot code paths for user-scoped reads/writes.
- **TDD:** write the failing test first, watch it fail, implement minimally, watch it pass, commit.
- **Model/base URL:** reuse `createOpenRouterClient()` and `getAgentModel()` from `src/lib/agent/openrouter.ts`. Never construct a raw OpenAI client elsewhere.
- **Disable SDK tracing** once, at agent build time, via `setTracingDisabled(true)` so the SDK never calls OpenAI's tracing backend.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File Structure

- Create `supabase/migrations/0009_copilot_conversations.sql` — table + RLS (verify the next free number at implementation time).
- Create `src/lib/db/copilot-conversations.ts` — persistence for the single per-user copilot thread.
- Create `src/lib/db/copilot-conversations.test.ts` — mapper/default tests.
- Modify `src/lib/db/conversations.ts` — add `deleteConversationForOwner(id)`.
- Modify `src/lib/db/conversations.test.ts` — test the new helper's ownership guard.
- Create `src/lib/copilot/tools.ts` — `buildCopilotTools(mode)` returning SDK `tool()` defs over `src/lib/db/*`.
- Create `src/lib/copilot/tools.test.ts`.
- Create `src/lib/copilot/agent.ts` — `buildCopilotAgent({ mode, model? })`.
- Create `src/lib/copilot/runtime.ts` — `runCopilotTurn(...)` orchestration with an injectable `run` seam.
- Create `src/lib/copilot/runtime.test.ts`.
- Create `src/app/api/copilot/turn/route.ts` — POST endpoint.
- Create `src/app/(dashboard)/_components/CopilotProvider.tsx` — open/collapsed + mode context.
- Create `src/app/(dashboard)/_components/CopilotPanel.tsx` — the panel UI.
- Modify `src/app/(dashboard)/layout.tsx` — mount provider + panel.
- Modify `src/lib/docs.ts` + `src/lib/docs.test.ts` — document the copilot.

---

### Task 1: Migration + copilot-conversations data layer

**Files:**
- Create: `supabase/migrations/0009_copilot_conversations.sql`
- Create: `src/lib/db/copilot-conversations.ts`
- Test: `src/lib/db/copilot-conversations.test.ts`

**Interfaces:**
- Produces:
  - `type CopilotMode = "accept" | "auto"`
  - `interface CopilotThread { id: string; owner_id: string; items: unknown[]; pending_state: string | null; mode: CopilotMode; created_at: string; updated_at: string }`
  - `function mapRowToCopilotThread(row: Record<string, unknown>): CopilotThread` (pure)
  - `async function getOrCreateCopilotThread(): Promise<CopilotThread>`
  - `async function saveCopilotThread(patch: { items: unknown[]; pending_state: string | null }): Promise<CopilotThread>`
  - `async function setCopilotMode(mode: CopilotMode): Promise<CopilotThread>`

- [ ] **Step 1: Write the migration**

Confirm the next migration number first: `ls supabase/migrations` and use the next integer (this plan assumes `0009`).

Create `supabase/migrations/0009_copilot_conversations.sql`:

```sql
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
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/db/copilot-conversations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapRowToCopilotThread } from "./copilot-conversations";

describe("mapRowToCopilotThread", () => {
  it("maps a full row into a typed thread", () => {
    const t = mapRowToCopilotThread({
      id: "t1",
      owner_id: "u1",
      items: [{ role: "user", content: "hi" }],
      pending_state: null,
      mode: "auto",
      created_at: "2026-07-12T00:00:00Z",
      updated_at: "2026-07-12T00:00:00Z",
    });
    expect(t.id).toBe("t1");
    expect(t.owner_id).toBe("u1");
    expect(t.items).toEqual([{ role: "user", content: "hi" }]);
    expect(t.pending_state).toBeNull();
    expect(t.mode).toBe("auto");
  });

  it("defaults items to [] and mode to 'accept' for missing/invalid values", () => {
    const t = mapRowToCopilotThread({
      id: "t2",
      owner_id: "u1",
      items: null,
      pending_state: "state-string",
      mode: "bogus",
      created_at: "x",
      updated_at: "x",
    });
    expect(t.items).toEqual([]);
    expect(t.mode).toBe("accept");
    expect(t.pending_state).toBe("state-string");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/db/copilot-conversations.test.ts`
Expected: FAIL — `mapRowToCopilotThread` is not exported / module not found.

- [ ] **Step 4: Write the data layer**

Create `src/lib/db/copilot-conversations.ts`:

```ts
/**
 * Data access for `public.copilot_conversations` — the single per-user AI
 * copilot thread. Runs through the cookie-bound server client, so RLS scopes
 * every row to the signed-in user (owner_id = auth.uid()).
 */
import { createServerSupabase } from "@/lib/supabase/server";

export type CopilotMode = "accept" | "auto";

export interface CopilotThread {
  id: string;
  owner_id: string;
  /** Opaque OpenAI Agents SDK history items (AgentInputItem[]). */
  items: unknown[];
  /** Serialized RunState while awaiting tool approval, else null. */
  pending_state: string | null;
  mode: CopilotMode;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  "id, owner_id, items, pending_state, mode, created_at, updated_at";

function normalizeMode(v: unknown): CopilotMode {
  return v === "auto" ? "auto" : "accept";
}

/** Map an untyped DB row into a typed thread. Pure — unit tested. */
export function mapRowToCopilotThread(
  row: Record<string, unknown>
): CopilotThread {
  return {
    id: String(row.id),
    owner_id: String(row.owner_id),
    items: Array.isArray(row.items) ? (row.items as unknown[]) : [],
    pending_state:
      typeof row.pending_state === "string" ? row.pending_state : null,
    mode: normalizeMode(row.mode),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function currentUserId(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>
): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw new Error(`Failed to resolve user: ${error.message}`);
  if (!user) throw new Error("Not authenticated.");
  return user.id;
}

/** Load the user's copilot thread, creating an empty one on first use. */
export async function getOrCreateCopilotThread(): Promise<CopilotThread> {
  const supabase = await createServerSupabase();
  const ownerId = await currentUserId(supabase);

  const { data, error } = await supabase
    .from("copilot_conversations")
    .select(COLUMNS)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load copilot thread: ${error.message}`);
  if (data) return mapRowToCopilotThread(data as Record<string, unknown>);

  const { data: created, error: insertError } = await supabase
    .from("copilot_conversations")
    .insert({ owner_id: ownerId })
    .select(COLUMNS)
    .single();
  if (insertError)
    throw new Error(`Failed to create copilot thread: ${insertError.message}`);
  return mapRowToCopilotThread(created as Record<string, unknown>);
}

/** Persist the thread's items + pending approval state. */
export async function saveCopilotThread(patch: {
  items: unknown[];
  pending_state: string | null;
}): Promise<CopilotThread> {
  const supabase = await createServerSupabase();
  const ownerId = await currentUserId(supabase);

  const { data, error } = await supabase
    .from("copilot_conversations")
    .update({
      items: patch.items,
      pending_state: patch.pending_state,
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", ownerId)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`Failed to save copilot thread: ${error.message}`);
  return mapRowToCopilotThread(data as Record<string, unknown>);
}

/** Update the user's write mode (accept | auto). */
export async function setCopilotMode(mode: CopilotMode): Promise<CopilotThread> {
  const supabase = await createServerSupabase();
  const ownerId = await currentUserId(supabase);

  const { data, error } = await supabase
    .from("copilot_conversations")
    .update({ mode, updated_at: new Date().toISOString() })
    .eq("owner_id", ownerId)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`Failed to set copilot mode: ${error.message}`);
  return mapRowToCopilotThread(data as Record<string, unknown>);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/db/copilot-conversations.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0009_copilot_conversations.sql src/lib/db/copilot-conversations.ts src/lib/db/copilot-conversations.test.ts
git commit -m "Add copilot_conversations table and data layer"
```

---

### Task 2: Owner-scoped conversation delete helper

**Files:**
- Modify: `src/lib/db/conversations.ts`
- Test: `src/lib/db/conversations.test.ts`

**Interfaces:**
- Consumes: `getConversationForOwner(id)` (existing, RLS-scoped, returns null if not the user's).
- Produces: `async function deleteConversationForOwner(id: string): Promise<boolean>` — returns `false` if the conversation isn't the user's (or doesn't exist), `true` after a successful delete.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/db/conversations.test.ts` (create the file if it doesn't exist, mirroring the existing db test style — mock `@/lib/supabase/server` and `@/lib/supabase/admin`). The behavior to lock in: when `getConversationForOwner` returns null, `deleteConversationForOwner` must NOT issue a delete and must return `false`.

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const del = vi.fn();
const eqDel = vi.fn(() => ({ error: null }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: () => ({ delete: () => ({ eq: eqDel }) }),
  }),
}));

// getConversationForOwner uses the server (cookie) client; stub the module fn.
vi.mock("./conversations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./conversations")>();
  return actual;
});

describe("deleteConversationForOwner", () => {
  beforeEach(() => {
    del.mockClear();
    eqDel.mockClear();
  });

  it("returns false and does not delete when the user does not own it", async () => {
    const mod = await import("./conversations");
    const spy = vi
      .spyOn(mod, "getConversationForOwner")
      .mockResolvedValue(null);

    const result = await mod.deleteConversationForOwner("c1");

    expect(result).toBe(false);
    expect(eqDel).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

> Note: if spying on a same-module export proves awkward under the project's Vitest config, extract the ownership check by having `deleteConversationForOwner` call the exported `getConversationForOwner` and keep this test; otherwise assert via the mocked server client returning null. Match whatever mocking pattern `bots.test.ts` already uses.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/db/conversations.test.ts`
Expected: FAIL — `deleteConversationForOwner` is not a function.

- [ ] **Step 3: Implement the helper**

Add to `src/lib/db/conversations.ts` (after `getConversationForOwner`):

```ts
/**
 * Delete a conversation the signed-in user owns. Confirms ownership via
 * getConversationForOwner (RLS-scoped) before deleting; returns false if the
 * conversation isn't visible to this user. The delete itself uses the admin
 * client because conversations have no owner DELETE RLS policy.
 */
export async function deleteConversationForOwner(id: string): Promise<boolean> {
  const owned = await getConversationForOwner(id);
  if (!owned) return false;

  const supabase = createAdminSupabase();
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete conversation: ${error.message}`);
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/db/conversations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/conversations.ts src/lib/db/conversations.test.ts
git commit -m "Add owner-scoped deleteConversationForOwner helper"
```

---

### Task 3: Copilot tools

**Files:**
- Create: `src/lib/copilot/tools.ts`
- Test: `src/lib/copilot/tools.test.ts`

**Interfaces:**
- Consumes: `CopilotMode` (Task 1); db functions `listBots, getBot, createBot, updateBot, deleteBot` (`@/lib/db/bots`), `listKnowledge, createKnowledge, deleteKnowledge` (`@/lib/db/knowledge`), `listConversationsForOwner, getConversationForOwner, deleteConversationForOwner` (`@/lib/db/conversations`), `getDashboardStats` (`@/lib/db/analytics`).
- Produces: `function buildCopilotTools(mode: CopilotMode): Tool[]` where mutating tools carry `needsApproval: mode === "accept"`. Tool names: `list_bots, get_bot, create_bot, update_bot, delete_bot, list_knowledge, add_knowledge, delete_knowledge, list_conversations, get_conversation, delete_conversation, get_analytics`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/copilot/tools.test.ts`. Mock the db modules so tools can be exercised without Supabase, and assert (a) tool names/count, (b) mutating tools require approval in accept mode and not in auto mode, (c) a representative write tool calls the right db function.

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const createBot = vi.fn(async (input: unknown) => ({ id: "b1", ...(input as object) }));
vi.mock("@/lib/db/bots", () => ({
  listBots: vi.fn(async () => []),
  getBot: vi.fn(async () => null),
  createBot,
  updateBot: vi.fn(async () => ({ id: "b1" })),
  deleteBot: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db/knowledge", () => ({
  listKnowledge: vi.fn(async () => []),
  createKnowledge: vi.fn(async () => ({ id: "k1" })),
  deleteKnowledge: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db/conversations", () => ({
  listConversationsForOwner: vi.fn(async () => []),
  getConversationForOwner: vi.fn(async () => null),
  deleteConversationForOwner: vi.fn(async () => true),
}));
vi.mock("@/lib/db/analytics", () => ({
  getDashboardStats: vi.fn(async () => ({ total: 0 })),
}));

import { buildCopilotTools } from "./tools";

const MUTATING = new Set([
  "create_bot",
  "update_bot",
  "delete_bot",
  "add_knowledge",
  "delete_knowledge",
  "delete_conversation",
]);

describe("buildCopilottools", () => {
  beforeEach(() => createBot.mockClear());

  it("exposes the full non-account tool set", () => {
    const names = buildCopilotTools("accept").map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "add_knowledge",
        "create_bot",
        "delete_bot",
        "delete_conversation",
        "delete_knowledge",
        "get_analytics",
        "get_bot",
        "get_conversation",
        "list_bots",
        "list_conversations",
        "list_knowledge",
        "update_bot",
      ].sort()
    );
    // No account-level tools.
    expect(names).not.toContain("delete_account");
  });

  it("requires approval for mutating tools only in accept mode", () => {
    const accept = buildCopilotTools("accept");
    for (const t of accept) {
      expect(Boolean(t.needsApproval)).toBe(MUTATING.has(t.name));
    }
    const auto = buildCopilotTools("auto");
    for (const t of auto) {
      expect(Boolean(t.needsApproval)).toBe(false);
    }
  });

  it("create_bot invokes the bots data layer", async () => {
    const tool = buildCopilotTools("auto").find((t) => t.name === "create_bot")!;
    // FunctionTool exposes invoke(runContext, argsJson); pass a null-ish context.
    await tool.invoke({} as never, JSON.stringify({ name: "Shoes" }));
    expect(createBot).toHaveBeenCalledWith({ name: "Shoes" });
  });
});
```

> If `FunctionTool`'s runtime invoke signature differs in this SDK version, adjust the invocation in the third test to match `node_modules/@openai/agents-core/dist/tool.d.ts` (look for the `invoke`/`execute` member). The first two tests do not depend on invocation.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/copilot/tools.test.ts`
Expected: FAIL — module `./tools` not found.

- [ ] **Step 3: Implement the tools**

Create `src/lib/copilot/tools.ts`:

```ts
/**
 * Copilot tool definitions. Each tool is a thin `@openai/agents` wrapper over an
 * existing `src/lib/db/*` function; validation and RLS live in the data layer.
 * Mutating tools carry `needsApproval` based on the user's write mode.
 *
 * SCOPE: no account-level tools exist here by design.
 */
import { tool, type Tool } from "@openai/agents";
import { z } from "zod";
import type { CopilotMode } from "@/lib/db/copilot-conversations";
import {
  listBots,
  getBot,
  createBot,
  updateBot,
  deleteBot,
} from "@/lib/db/bots";
import {
  listKnowledge,
  createKnowledge,
  deleteKnowledge,
} from "@/lib/db/knowledge";
import {
  listConversationsForOwner,
  getConversationForOwner,
  deleteConversationForOwner,
} from "@/lib/db/conversations";
import { getDashboardStats } from "@/lib/db/analytics";

/** JSON-stringify any tool result; tool outputs are strings for the model. */
const out = (v: unknown): string => JSON.stringify(v ?? null);

export function buildCopilotTools(mode: CopilotMode): Tool[] {
  const approve = mode === "accept"; // mutating tools need approval in accept mode

  return [
    // ---- bots (read) ----
    tool({
      name: "list_bots",
      description: "List all of the user's bots (id, name, tools, settings).",
      parameters: z.object({}),
      execute: async () => out(await listBots()),
    }),
    tool({
      name: "get_bot",
      description: "Get a single bot by id.",
      parameters: z.object({ id: z.string() }),
      execute: async ({ id }) => out(await getBot(id)),
    }),
    // ---- bots (write) ----
    tool({
      name: "create_bot",
      description: "Create a new bot.",
      parameters: z.object({
        name: z.string(),
        persona: z.string().optional(),
        allowed_tools: z.array(z.string()).optional(),
        allowed_origins: z.array(z.string()).optional(),
      }),
      needsApproval: approve,
      execute: async (args) => out(await createBot(args)),
    }),
    tool({
      name: "update_bot",
      description: "Update fields on an existing bot.",
      parameters: z.object({
        id: z.string(),
        name: z.string().optional(),
        persona: z.string().optional(),
        allowed_tools: z.array(z.string()).optional(),
        allowed_origins: z.array(z.string()).optional(),
      }),
      needsApproval: approve,
      execute: async ({ id, ...patch }) => out(await updateBot(id, patch)),
    }),
    tool({
      name: "delete_bot",
      description: "Permanently delete a bot by id.",
      parameters: z.object({ id: z.string() }),
      needsApproval: approve,
      execute: async ({ id }) => {
        await deleteBot(id);
        return out({ deleted: id });
      },
    }),
    // ---- knowledge ----
    tool({
      name: "list_knowledge",
      description: "List knowledge sources for a bot.",
      parameters: z.object({ bot_id: z.string() }),
      execute: async ({ bot_id }) => out(await listKnowledge(bot_id)),
    }),
    tool({
      name: "add_knowledge",
      description: "Add a knowledge source (faq | policy | note) to a bot.",
      parameters: z.object({
        bot_id: z.string(),
        title: z.string(),
        content: z.string(),
        kind: z.enum(["faq", "policy", "note"]).optional(),
      }),
      needsApproval: approve,
      execute: async ({ bot_id, title, content, kind }) =>
        out(
          await createKnowledge({
            botId: bot_id,
            title,
            content,
            kind: kind ?? "note",
          })
        ),
    }),
    tool({
      name: "delete_knowledge",
      description: "Delete a knowledge source by id.",
      parameters: z.object({ id: z.string() }),
      needsApproval: approve,
      execute: async ({ id }) => {
        await deleteKnowledge(id);
        return out({ deleted: id });
      },
    }),
    // ---- conversations ----
    tool({
      name: "list_conversations",
      description: "List the user's storefront conversations (summaries).",
      parameters: z.object({}),
      execute: async () => out(await listConversationsForOwner()),
    }),
    tool({
      name: "get_conversation",
      description: "Get a full storefront conversation transcript by id.",
      parameters: z.object({ id: z.string() }),
      execute: async ({ id }) => out(await getConversationForOwner(id)),
    }),
    tool({
      name: "delete_conversation",
      description: "Delete a storefront conversation by id.",
      parameters: z.object({ id: z.string() }),
      needsApproval: approve,
      execute: async ({ id }) => {
        const ok = await deleteConversationForOwner(id);
        return out({ deleted: ok ? id : null, ok });
      },
    }),
    // ---- analytics (read) ----
    tool({
      name: "get_analytics",
      description: "Get the dashboard analytics overview for the user.",
      parameters: z.object({}),
      execute: async () => out(await getDashboardStats()),
    }),
  ];
}
```

> Verify the exact `createKnowledge` input shape against `src/lib/db/knowledge.ts:58` (it takes `{ botId, title, content, kind }`); adjust the mapping if the field names differ.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/copilot/tools.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/copilot/tools.ts src/lib/copilot/tools.test.ts
git commit -m "Add copilot CRUD tools over the db layer"
```

---

### Task 4: Agent builder

**Files:**
- Create: `src/lib/copilot/agent.ts`

**Interfaces:**
- Consumes: `buildCopilotTools` (Task 3); `createOpenRouterClient`, `getAgentModel` (`@/lib/agent/openrouter`); `CopilotMode` (Task 1).
- Produces: `function buildCopilotAgent(opts: { mode: CopilotMode; model?: Model }): Agent` — uses the injected `model` when provided (for tests), else `new OpenAIChatCompletionsModel(createOpenRouterClient(), getAgentModel())`.

- [ ] **Step 1: Implement the agent builder**

Create `src/lib/copilot/agent.ts`:

```ts
/**
 * Builds the dashboard copilot Agent: OpenRouter chat-completions model +
 * CRUD tools + instructions. `model` is injectable so the runtime can be unit
 * tested without network access.
 */
import { Agent, setTracingDisabled, type Model } from "@openai/agents";
import { OpenAIChatCompletionsModel } from "@openai/agents-openai";
import { createOpenRouterClient, getAgentModel } from "@/lib/agent/openrouter";
import { buildCopilotTools } from "./tools";
import type { CopilotMode } from "@/lib/db/copilot-conversations";

// The SDK's tracing exporter phones OpenAI; we run only through OpenRouter.
setTracingDisabled(true);

const INSTRUCTIONS = `You are Merclo's dashboard copilot. You act on behalf of the currently logged-in user, operating ONLY on their own data (their bots, knowledge sources, storefront conversations, and analytics).

Guidelines:
- Use tools to read real data before answering; never invent ids, names, or numbers. To act on a bot/conversation, look it up first (e.g. list_bots) to get its id.
- You cannot perform account-level operations (deleting the account, billing, or auth). If asked, say so.
- For destructive actions (delete_bot, delete_knowledge, delete_conversation), confirm the target with the user in your wording and proceed via the tool.
- After making changes, briefly summarize what you did.
- Be concise.`;

export function buildCopilotAgent(opts: {
  mode: CopilotMode;
  model?: Model;
}): Agent {
  const model =
    opts.model ??
    new OpenAIChatCompletionsModel(createOpenRouterClient(), getAgentModel());

  return new Agent({
    name: "Merclo Copilot",
    instructions: INSTRUCTIONS,
    model,
    tools: buildCopilotTools(opts.mode),
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/lib/copilot/agent.ts`. (If `Model` is not exported from `@openai/agents`, import it from `@openai/agents-core` — confirm via that package's `index.d.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/copilot/agent.ts
git commit -m "Add copilot Agent builder (OpenRouter chat-completions model)"
```

---

### Task 5: Runtime orchestration

**Files:**
- Create: `src/lib/copilot/runtime.ts`
- Test: `src/lib/copilot/runtime.test.ts`

**Interfaces:**
- Consumes: `buildCopilotAgent` (Task 4); SDK `run`, `RunState` (`@openai/agents`).
- Produces:
  - `interface PendingApproval { approvalId: string; toolName: string; arguments: string }`
  - `type CopilotTurnOutput = { type: "message"; content: string } | { type: "approvals"; pending: PendingApproval[] }`
  - `interface CopilotTurnInput { mode: CopilotMode; priorItems: unknown[]; pendingState: string | null; turn: { kind: "message"; text: string } | { kind: "decision"; decisions: { approvalId: string; approve: boolean }[] }; runFn?: RunFn; agentFactory?: (mode: CopilotMode) => Agent }`
  - `interface CopilotTurnResult { output: CopilotTurnOutput; items: unknown[]; pendingState: string | null }`
  - `async function runCopilotTurn(input: CopilotTurnInput): Promise<CopilotTurnResult>`
  - `type RunFn = (agent: Agent, input: unknown) => Promise<RunLike>` where `RunLike = { finalOutput?: unknown; interruptions?: ApprovalLike[]; state: StateLike; history: unknown[] }`, `ApprovalLike = { rawItem?: { name?: string; arguments?: string; callId?: string } }`, `StateLike = { toString(): string; getInterruptions(): ApprovalLike[]; approve(i: ApprovalLike): void; reject(i: ApprovalLike): void }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/copilot/runtime.test.ts`. Inject a fake `runFn` and `agentFactory` so no network/SDK model is needed. Cover: (a) a plain message reply, (b) accept-mode interruption returns approvals + persists state, (c) a decision resumes and approves.

```ts
import { describe, expect, it, vi } from "vitest";
import { runCopilotTurn } from "./runtime";

const fakeAgentFactory = () => ({}) as never;

function approval(callId: string, name: string, args: string) {
  return { rawItem: { callId, name, arguments: args } };
}

describe("runCopilotTurn", () => {
  it("returns a plain message when the run completes", async () => {
    const runFn = vi.fn(async () => ({
      finalOutput: "Here are your bots.",
      interruptions: [],
      state: { toString: () => "S", getInterruptions: () => [], approve() {}, reject() {} },
      history: [{ role: "assistant", content: "Here are your bots." }],
    }));

    const res = await runCopilotTurn({
      mode: "auto",
      priorItems: [],
      pendingState: null,
      turn: { kind: "message", text: "list my bots" },
      runFn,
      agentFactory: fakeAgentFactory,
    });

    expect(res.output).toEqual({ type: "message", content: "Here are your bots." });
    expect(res.pendingState).toBeNull();
    expect(res.items).toHaveLength(1);
  });

  it("returns approvals and persists state when the run interrupts", async () => {
    const interruptions = [approval("call_1", "delete_bot", '{"id":"b1"}')];
    const runFn = vi.fn(async () => ({
      finalOutput: undefined,
      interruptions,
      state: {
        toString: () => "SERIALIZED",
        getInterruptions: () => interruptions,
        approve() {},
        reject() {},
      },
      history: [],
    }));

    const res = await runCopilotTurn({
      mode: "accept",
      priorItems: [],
      pendingState: null,
      turn: { kind: "message", text: "delete bot b1" },
      runFn,
      agentFactory: fakeAgentFactory,
    });

    expect(res.output).toEqual({
      type: "approvals",
      pending: [{ approvalId: "call_1", toolName: "delete_bot", arguments: '{"id":"b1"}' }],
    });
    expect(res.pendingState).toBe("SERIALIZED");
  });

  it("resumes from a decision, approving the matching interruption", async () => {
    const approved: string[] = [];
    const interruptions = [approval("call_1", "delete_bot", '{"id":"b1"}')];
    const state = {
      toString: () => "S2",
      getInterruptions: () => interruptions,
      approve: (i: { rawItem?: { callId?: string } }) =>
        approved.push(i.rawItem!.callId!),
      reject() {},
    };
    // First call resolves the resumed run to a final message.
    const runFn = vi.fn(async () => ({
      finalOutput: "Deleted bot b1.",
      interruptions: [],
      state,
      history: [{ role: "assistant", content: "Deleted bot b1." }],
    }));

    // RunState.fromString is stubbed by the runtime seam: pass the state via a
    // fake deserializer through agentFactory-independent injection.
    const res = await runCopilotTurn({
      mode: "accept",
      priorItems: [],
      pendingState: "SERIALIZED",
      turn: {
        kind: "decision",
        decisions: [{ approvalId: "call_1", approve: true }],
      },
      runFn,
      agentFactory: fakeAgentFactory,
      // test-only injection of the deserialized state:
      deserializeState: async () => state,
    } as never);

    expect(approved).toEqual(["call_1"]);
    expect(res.output).toEqual({ type: "message", content: "Deleted bot b1." });
    expect(res.pendingState).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/copilot/runtime.test.ts`
Expected: FAIL — module `./runtime` not found.

- [ ] **Step 3: Implement the runtime**

Create `src/lib/copilot/runtime.ts`:

```ts
/**
 * Orchestrates one copilot turn on top of the Agents SDK `run()` loop.
 *
 * Two entry shapes:
 *  - message: run the agent on prior history + the new user message.
 *  - decision: rehydrate the saved RunState, apply approve/reject per the
 *    user's choices, and resume the run.
 *
 * `runFn`, `agentFactory`, and `deserializeState` are injectable seams so this
 * is unit-testable without a live model.
 */
import { run, RunState, type Agent } from "@openai/agents";
import { buildCopilotAgent } from "./agent";
import type { CopilotMode } from "@/lib/db/copilot-conversations";

export interface PendingApproval {
  approvalId: string;
  toolName: string;
  arguments: string;
}

export type CopilotTurnOutput =
  | { type: "message"; content: string }
  | { type: "approvals"; pending: PendingApproval[] };

interface ApprovalLike {
  rawItem?: { name?: string; arguments?: string; callId?: string };
}
interface StateLike {
  toString(): string;
  getInterruptions(): ApprovalLike[];
  approve(i: ApprovalLike): void;
  reject(i: ApprovalLike): void;
}
interface RunLike {
  finalOutput?: unknown;
  interruptions?: ApprovalLike[];
  state: StateLike;
  history: unknown[];
}

export type RunFn = (agent: Agent, input: unknown) => Promise<RunLike>;

export interface CopilotTurnInput {
  mode: CopilotMode;
  priorItems: unknown[];
  pendingState: string | null;
  turn:
    | { kind: "message"; text: string }
    | { kind: "decision"; decisions: { approvalId: string; approve: boolean }[] };
  runFn?: RunFn;
  agentFactory?: (mode: CopilotMode) => Agent;
  /** Test-only seam; defaults to RunState.fromString. */
  deserializeState?: (agent: Agent, str: string) => Promise<StateLike>;
}

export interface CopilotTurnResult {
  output: CopilotTurnOutput;
  items: unknown[];
  pendingState: string | null;
}

const approvalId = (i: ApprovalLike): string => i.rawItem?.callId ?? "";

function toPending(interruptions: ApprovalLike[]): PendingApproval[] {
  return interruptions.map((i) => ({
    approvalId: approvalId(i),
    toolName: i.rawItem?.name ?? "unknown",
    arguments: i.rawItem?.arguments ?? "{}",
  }));
}

function summarize(result: RunLike): CopilotTurnResult {
  const interruptions = result.interruptions ?? [];
  if (interruptions.length > 0) {
    return {
      output: { type: "approvals", pending: toPending(interruptions) },
      items: result.history,
      pendingState: result.state.toString(),
    };
  }
  return {
    output: {
      type: "message",
      content:
        typeof result.finalOutput === "string"
          ? result.finalOutput
          : JSON.stringify(result.finalOutput ?? ""),
    },
    items: result.history,
    pendingState: null,
  };
}

export async function runCopilotTurn(
  input: CopilotTurnInput
): Promise<CopilotTurnResult> {
  const runFn = input.runFn ?? (run as unknown as RunFn);
  const makeAgent = input.agentFactory ?? ((mode) => buildCopilotAgent({ mode }));
  const deserialize =
    input.deserializeState ??
    ((agent, str) =>
      RunState.fromString(agent as never, str) as unknown as Promise<StateLike>);

  const agent = makeAgent(input.mode);

  if (input.turn.kind === "message") {
    const messages = [
      ...input.priorItems,
      { role: "user", content: input.turn.text },
    ];
    const result = await runFn(agent, messages);
    return summarize(result);
  }

  // decision: rehydrate, apply approvals, resume.
  if (!input.pendingState) {
    throw new Error("No pending approval state to resume.");
  }
  const state = await deserialize(agent, input.pendingState);
  const byId = new Map(input.turn.decisions.map((d) => [d.approvalId, d.approve]));
  for (const item of state.getInterruptions()) {
    const decision = byId.get(approvalId(item));
    if (decision === true) state.approve(item);
    else if (decision === false) state.reject(item);
  }
  const result = await runFn(agent, state);
  return summarize(result);
}
```

> Verify `RunState.fromString`'s argument order and return type against `node_modules/@openai/agents-core/dist/runState.d.ts` (`static fromString(initialAgent, str)`); the `deserializeState` seam isolates any signature difference to one line.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/copilot/runtime.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/copilot/runtime.ts src/lib/copilot/runtime.test.ts
git commit -m "Add copilot turn runtime with approval resume"
```

---

### Task 6: API endpoint

**Files:**
- Create: `src/app/api/copilot/turn/route.ts`

**Interfaces:**
- Consumes: `getOrCreateCopilotThread`, `saveCopilotThread`, `setCopilotMode`, `CopilotMode` (Task 1); `runCopilotTurn` (Task 5); `createServerSupabase` (`@/lib/supabase/server`).
- Produces: `POST /api/copilot/turn`. Request body (JSON), one of:
  - `{ kind: "message", text: string }`
  - `{ kind: "decision", decisions: { approvalId: string; approve: boolean }[] }`
  - `{ kind: "set_mode", mode: "accept" | "auto" }`
  Response: `{ type: "message", content } | { type: "approvals", pending } | { type: "mode", mode }`.

- [ ] **Step 1: Implement the route**

Create `src/app/api/copilot/turn/route.ts`:

```ts
/**
 * Dashboard copilot endpoint. Cookie-bound (RLS-scoped to the logged-in user)
 * and NOT CORS-exposed — this is a first-party dashboard API, unlike the public
 * /api/chat/turn storefront endpoint.
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getOrCreateCopilotThread,
  saveCopilotThread,
  setCopilotMode,
  type CopilotMode,
} from "@/lib/db/copilot-conversations";
import { runCopilotTurn } from "@/lib/copilot/runtime";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const kind = (body as { kind?: string }).kind;

  try {
    if (kind === "set_mode") {
      const mode = (body as { mode?: string }).mode;
      if (mode !== "accept" && mode !== "auto") {
        return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
      }
      const thread = await setCopilotMode(mode as CopilotMode);
      return NextResponse.json({ type: "mode", mode: thread.mode });
    }

    const thread = await getOrCreateCopilotThread();

    if (kind === "message") {
      const text = (body as { text?: string }).text;
      if (typeof text !== "string" || text.trim() === "") {
        return NextResponse.json({ error: "Empty message" }, { status: 400 });
      }
      const result = await runCopilotTurn({
        mode: thread.mode,
        priorItems: thread.items,
        pendingState: thread.pending_state,
        turn: { kind: "message", text },
      });
      await saveCopilotThread({
        items: result.items,
        pending_state: result.pendingState,
      });
      return NextResponse.json(result.output);
    }

    if (kind === "decision") {
      const decisions = (body as { decisions?: unknown }).decisions;
      if (!Array.isArray(decisions)) {
        return NextResponse.json({ error: "Missing decisions" }, { status: 400 });
      }
      if (!thread.pending_state) {
        return NextResponse.json(
          { error: "No pending approval" },
          { status: 409 }
        );
      }
      const result = await runCopilotTurn({
        mode: thread.mode,
        priorItems: thread.items,
        pendingState: thread.pending_state,
        turn: {
          kind: "decision",
          decisions: decisions as { approvalId: string; approve: boolean }[],
        },
      });
      await saveCopilotThread({
        items: result.items,
        pending_state: result.pendingState,
      });
      return NextResponse.json(result.output);
    }

    return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Copilot error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/copilot/turn/route.ts
git commit -m "Add /api/copilot/turn endpoint"
```

---

### Task 7: Copilot panel UI

**Files:**
- Create: `src/app/(dashboard)/_components/CopilotProvider.tsx`
- Create: `src/app/(dashboard)/_components/CopilotPanel.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `POST /api/copilot/turn` (Task 6). Response types: `{ type: "message", content } | { type: "approvals", pending: PendingApproval[] } | { type: "mode", mode }`.
- Produces: a mounted, collapsible right-side panel available on all dashboard pages.

- [ ] **Step 1: Implement the provider (open/collapsed + mode state)**

Create `src/app/(dashboard)/_components/CopilotProvider.tsx`:

```tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Mode = "accept" | "auto";

interface CopilotContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function useCopilot(): CopilotContextValue {
  const ctx = useContext(CopilotContext);
  if (!ctx) throw new Error("useCopilot must be used within CopilotProvider");
  return ctx;
}

export default function CopilotProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpenState] = useState(false);
  const [mode, setModeState] = useState<Mode>("accept");

  // Restore open state (client-only) so the panel persists across navigation.
  useEffect(() => {
    const saved = window.localStorage.getItem("copilot:open");
    if (saved) setOpenState(saved === "1");
  }, []);

  const setOpen = (v: boolean) => {
    setOpenState(v);
    window.localStorage.setItem("copilot:open", v ? "1" : "0");
  };

  const setMode = (m: Mode) => {
    setModeState(m);
    void fetch("/api/copilot/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "set_mode", mode: m }),
    });
  };

  return (
    <CopilotContext.Provider value={{ open, setOpen, mode, setMode }}>
      {children}
    </CopilotContext.Provider>
  );
}
```

- [ ] **Step 2: Implement the panel**

Create `src/app/(dashboard)/_components/CopilotPanel.tsx`. Compose `src/components/ui/*` primitives and design tokens only (no `dark:`, no raw palettes). Behavior: a toggle rail when collapsed; when open, a chat thread, an Accept/Auto mode toggle, a composer, and approval cards when the last response is `{ type: "approvals" }`.

```tsx
"use client";

import { useState } from "react";
import { Sparkles, X, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useCopilot } from "./CopilotProvider";

interface PendingApproval {
  approvalId: string;
  toolName: string;
  arguments: string;
}
type Turn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | { role: "approvals"; pending: PendingApproval[] };

async function post(body: unknown) {
  const res = await fetch("/api/copilot/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function applyResponse(data: unknown, thread: Turn[]): Turn[] {
  if (data && typeof data === "object" && "type" in data) {
    const d = data as
      | { type: "message"; content: string }
      | { type: "approvals"; pending: PendingApproval[] };
    if (d.type === "message")
      return [...thread, { role: "assistant", text: d.content }];
    if (d.type === "approvals")
      return [...thread, { role: "approvals", pending: d.pending }];
  }
  return [
    ...thread,
    { role: "assistant", text: "Something went wrong. Please try again." },
  ];
}

export default function CopilotPanel() {
  const { open, setOpen, mode, setMode } = useCopilot();
  const [thread, setThread] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open copilot"
        className="fixed bottom-6 right-6 z-40 grid h-12 w-12 place-items-center rounded-full bg-accent text-white shadow-md"
      >
        <Sparkles className="h-5 w-5" />
      </button>
    );
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setThread((t) => [...t, { role: "user", text }]);
    setBusy(true);
    try {
      const data = await post({ kind: "message", text });
      setThread((t) => applyResponse(data, t));
    } finally {
      setBusy(false);
    }
  }

  async function decide(approvalId: string, approve: boolean) {
    setBusy(true);
    try {
      const data = await post({
        kind: "decision",
        decisions: [{ approvalId, approve }],
      });
      setThread((t) => applyResponse(data, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-80 shrink-0 flex-col border-l border-hairline bg-surface xl:flex">
      <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Sparkles className="h-4 w-4" /> Copilot
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode(mode === "accept" ? "auto" : "accept")}
            className="rounded-md border border-hairline px-2 py-1 text-xs text-muted"
          >
            {mode === "accept" ? "Accept" : "Auto"}
          </button>
          <button onClick={() => setOpen(false)} aria-label="Close copilot">
            <X className="h-4 w-4 text-muted" />
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
        {thread.map((turn, i) => {
          if (turn.role === "approvals") {
            return (
              <div key={i} className="space-y-2">
                {turn.pending.map((p) => (
                  <div
                    key={p.approvalId}
                    className="rounded-lg border border-hairline p-3"
                  >
                    <p className="mb-2 text-ink">
                      Run <span className="font-medium">{p.toolName}</span>?
                    </p>
                    <pre className="mb-2 overflow-x-auto text-xs text-muted">
                      {p.arguments}
                    </pre>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => decide(p.approvalId, true)}
                        disabled={busy}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => decide(p.approvalId, false)}
                        disabled={busy}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div
              key={i}
              className={
                turn.role === "user" ? "text-ink" : "text-muted"
              }
            >
              {turn.text}
            </div>
          );
        })}
        {busy && <div className="text-muted">Thinking…</div>}
      </div>

      <div className="border-t border-hairline p-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
            placeholder="Ask the copilot…"
            className="min-w-0 flex-1 rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none"
          />
          <Button onClick={() => void send()} disabled={busy} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
```

> Confirm the `Button` import path/casing and its `variant` prop against `src/components/ui/Button.tsx`; adjust `variant="secondary"` to whatever the component actually exposes. Use existing tokens; if `bg-accent`/`text-ink`/`border-hairline` names differ, match `src/app/globals.css`.

- [ ] **Step 3: Wire into the dashboard layout**

Modify `src/app/(dashboard)/layout.tsx`: wrap the existing return in `CopilotProvider` and render `CopilotPanel` as a sibling of the main content column. Add imports at the top:

```tsx
import CopilotProvider from "./_components/CopilotProvider";
import CopilotPanel from "./_components/CopilotPanel";
```

Change the outer structure so the panel sits at the right edge (sibling of the `<div className="flex min-w-0 flex-1 flex-col">` column), all wrapped by the provider:

```tsx
  return (
    <CopilotProvider>
      <div className="flex min-h-screen bg-background text-foreground">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
          {/* ...unchanged sidebar contents... */}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar userEmail={email} />
          <main className="flex-1">
            <div className="mx-auto w-full max-w-[1600px] px-6 py-8 sm:px-10">
              {children}
            </div>
          </main>
        </div>

        <CopilotPanel />
      </div>
    </CopilotProvider>
  );
```

(Keep the sidebar's inner JSX exactly as it is today; only the wrapper + the added `<CopilotPanel />` are new.)

- [ ] **Step 4: Typecheck, lint, and manually verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

Then manually verify (requires `.env.local` with `OPENROUTER_API_KEY` + `AGENT_MODEL`, and the migration applied): `npm run dev`, sign in, open the copilot, send "list my bots" (read path), then in Accept mode ask it to rename a bot and confirm the approval card appears and Approve applies the change. Switch to Auto and confirm a write happens without a card.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/_components/CopilotProvider.tsx" "src/app/(dashboard)/_components/CopilotPanel.tsx" "src/app/(dashboard)/layout.tsx"
git commit -m "Add copilot side panel and wire into dashboard layout"
```

---

### Task 8: Docs update

**Files:**
- Modify: `src/lib/docs.ts`
- Test: `src/lib/docs.test.ts`

**Interfaces:**
- Consumes: the existing docs content structure in `src/lib/docs.ts`.
- Produces: a merchant-facing docs section describing the copilot.

- [ ] **Step 1: Read the current docs structure**

Open `src/lib/docs.ts` and `src/lib/docs.test.ts` to learn the exact shape (section objects, ids, and what the tests assert — e.g. required headings/keys).

- [ ] **Step 2: Write the failing test**

Add a test to `src/lib/docs.test.ts` asserting a copilot section exists. Match the file's existing assertion style; example:

```ts
it("documents the dashboard copilot", () => {
  const all = JSON.stringify(DOCS); // use whatever the file already exports
  expect(all).toMatch(/copilot/i);
  expect(all).toMatch(/accept|auto/i);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/docs.test.ts`
Expected: FAIL.

- [ ] **Step 4: Add the docs content**

Add a section to `src/lib/docs.ts` (matching the existing section object shape) explaining: what the copilot is (an AI assistant in the dashboard that manages your bots, knowledge, and conversations for you), how to open it, and the difference between **Accept** mode (you approve each change) and **Auto** mode (changes apply immediately). Note that it never performs account-level actions.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/docs.test.ts`
Expected: PASS.

- [ ] **Step 6: Full verification + commit**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green.

```bash
git add src/lib/docs.ts src/lib/docs.test.ts
git commit -m "Document the dashboard copilot in the Docs panel"
```

---

## Self-Review Notes

- **Spec coverage:** migration/persistence (Task 1), owner-scoped conversation delete (Task 2), CRUD tools with mode→needsApproval + no account ops (Task 3), OpenRouter chat-completions model + tracing off (Task 4), accept/auto approval-resume runtime (Task 5), cookie-bound non-CORS endpoint with message/decision/set_mode (Task 6), persistent right-side panel from ui/* + tokens (Task 7), docs (Task 8). All spec sections map to a task.
- **Deferred (per spec, intentionally):** streaming responses; multiple named threads; per-tool granular permissions. Not in scope.
- **Type consistency:** `CopilotMode`, `PendingApproval`, `CopilotTurnOutput`, and the `{ type: "message" | "approvals" | "mode" }` response union are used identically across Tasks 1/5/6/7. `approvalId` is always the SDK `rawItem.callId`.
- **Verification seams to confirm at implementation time (called out inline):** `FunctionTool` invoke signature (Task 3), `Model` export location (Task 4), `RunState.fromString` signature (Task 5), `Button` variant prop + token names (Task 7), `createKnowledge` input shape (Task 3). Each is isolated so a signature mismatch touches one line.
