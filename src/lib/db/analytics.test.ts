import { describe, it, expect } from "vitest";
import { computeStats } from "./analytics";
import type { Bot } from "./bots";
import type { Conversation } from "./conversations";

const NOW = Date.UTC(2026, 0, 8, 12, 0, 0); // 2026-01-08

function bot(id: string, name: string): Bot {
  return {
    id,
    owner_id: "u1",
    name,
    persona: "",
    allowed_tools: [],
    allowed_origins: [],
    appearance: {},
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function conv(
  id: string,
  botId: string,
  createdAt: string,
  messages: unknown[],
  status: Conversation["status"] = "active"
): Conversation {
  return {
    id,
    bot_id: botId,
    messages,
    status,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

describe("computeStats", () => {
  it("counts bots, conversations, messages, and active conversations", () => {
    const bots = [bot("b1", "Alpha"), bot("b2", "Beta")];
    const convs = [
      conv("c1", "b1", "2026-01-08T09:00:00.000Z", [{}, {}]),
      conv("c2", "b1", "2026-01-07T09:00:00.000Z", [{}], "closed"),
    ];
    const s = computeStats(bots, convs, NOW);
    expect(s.botCount).toBe(2);
    expect(s.conversationCount).toBe(2);
    expect(s.messageCount).toBe(3);
    expect(s.activeConversationCount).toBe(1);
  });

  it("buckets conversations into a 7-day window and ignores older ones", () => {
    const convs = [
      conv("c1", "b1", "2026-01-08T01:00:00.000Z", []),
      conv("c2", "b1", "2026-01-08T05:00:00.000Z", []),
      conv("c3", "b1", "2025-12-01T00:00:00.000Z", []), // outside window
    ];
    const s = computeStats([bot("b1", "Alpha")], convs, NOW);
    expect(s.conversationsByDay).toHaveLength(7);
    expect(s.conversationsByDay.at(-1)).toEqual({ date: "2026-01-08", count: 2 });
    expect(s.conversationsByDay.reduce((n, d) => n + d.count, 0)).toBe(2);
  });

  it("aggregates and sorts tool usage across conversations", () => {
    const mk = (name: string) => ({ tool_calls: [{ function: { name } }] });
    const convs = [
      conv("c1", "b1", "2026-01-08T01:00:00.000Z", [
        mk("get_cart"),
        mk("search_products"),
      ]),
      conv("c2", "b1", "2026-01-08T02:00:00.000Z", [mk("get_cart")]),
    ];
    const s = computeStats([bot("b1", "Alpha")], convs, NOW);
    expect(s.toolUsage[0]).toEqual({ name: "get_cart", count: 2 });
    expect(s.toolUsage).toContainEqual({ name: "search_products", count: 1 });
  });

  it("ranks per-bot conversation counts", () => {
    const bots = [bot("b1", "Alpha"), bot("b2", "Beta")];
    const convs = [
      conv("c1", "b2", "2026-01-08T01:00:00.000Z", []),
      conv("c2", "b2", "2026-01-08T02:00:00.000Z", []),
      conv("c3", "b1", "2026-01-08T03:00:00.000Z", []),
    ];
    const s = computeStats(bots, convs, NOW);
    expect(s.perBot[0]).toEqual({ botId: "b2", name: "Beta", conversationCount: 2 });
    expect(s.perBot[1]).toEqual({ botId: "b1", name: "Alpha", conversationCount: 1 });
  });
});
