import { describe, expect, it, vi, beforeEach } from "vitest";

const { createBot } = vi.hoisted(() => ({
  createBot: vi.fn(async (input: unknown) => ({ id: "b1", ...(input as object) })),
}));
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

  it("requires approval for mutating tools only in accept mode", async () => {
    // `needsApproval` is always normalized to a function by the SDK's `tool()`
    // helper (see @openai/agents-core dist/tool.js), so resolve it to check the
    // actual boolean rather than testing function-truthiness.
    const accept = buildCopilotTools("accept");
    for (const t of accept) {
      const needsApproval = await t.needsApproval({} as never, undefined as never);
      expect(needsApproval).toBe(MUTATING.has(t.name));
    }
    const auto = buildCopilotTools("auto");
    for (const t of auto) {
      const needsApproval = await t.needsApproval({} as never, undefined as never);
      expect(needsApproval).toBe(false);
    }
  });

  it("create_bot invokes the bots data layer", async () => {
    const tool = buildCopilotTools("auto").find((t) => t.name === "create_bot")!;
    // FunctionTool exposes invoke(runContext, argsJson); pass a null-ish context.
    await tool.invoke({} as never, JSON.stringify({ name: "Shoes" }));
    expect(createBot).toHaveBeenCalledWith({ name: "Shoes" });
  });
});
