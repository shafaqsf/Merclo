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
        persona: z.string().nullable().optional(),
        allowed_tools: z.array(z.string()).nullable().optional(),
        allowed_origins: z.array(z.string()).nullable().optional(),
      }),
      needsApproval: approve,
      execute: async (args) =>
        out(
          await createBot({
            ...args,
            persona: args.persona ?? undefined,
            allowed_tools: args.allowed_tools ?? undefined,
            allowed_origins: args.allowed_origins ?? undefined,
          })
        ),
    }),
    tool({
      name: "update_bot",
      description: "Update fields on an existing bot.",
      parameters: z.object({
        id: z.string(),
        name: z.string().nullable().optional(),
        persona: z.string().nullable().optional(),
        allowed_tools: z.array(z.string()).nullable().optional(),
        allowed_origins: z.array(z.string()).nullable().optional(),
      }),
      needsApproval: approve,
      execute: async ({ id, ...rest }) => {
        const patch = {
          ...rest,
          name: rest.name ?? undefined,
          persona: rest.persona ?? undefined,
          allowed_tools: rest.allowed_tools ?? undefined,
          allowed_origins: rest.allowed_origins ?? undefined,
        };
        return out(await updateBot(id, patch));
      },
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
        kind: z.enum(["faq", "policy", "note"]).nullable().optional(),
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
