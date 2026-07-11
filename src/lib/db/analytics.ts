/**
 * Dashboard analytics. Aggregates the signed-in merchant's bots and
 * conversations in application code (fine at scaffold scale). All reads go
 * through the cookie-bound client, so RLS scopes everything to the owner.
 */
import { listBots, type Bot } from "@/lib/db/bots";
import {
  listConversationsWithMessagesForOwner,
  countToolCalls,
  type Conversation,
} from "@/lib/db/conversations";

export interface DashboardStats {
  botCount: number;
  conversationCount: number;
  activeConversationCount: number;
  messageCount: number;
  /** Conversations started per day for the last 7 days (oldest first). */
  conversationsByDay: { date: string; count: number }[];
  /** Tool-call counts across all conversations, most-used first. */
  toolUsage: { name: string; count: number }[];
  /** Conversation count per bot, most-active first. */
  perBot: { botId: string; name: string; conversationCount: number }[];
}

/** UTC date key (YYYY-MM-DD) for a timestamp. Pure. */
function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Pure aggregation core — separated from IO so it can be unit-tested.
 * `now` is injected (ms epoch) to keep the 7-day window deterministic.
 */
export function computeStats(
  bots: Bot[],
  conversations: Conversation[],
  now: number
): DashboardStats {
  const botName = new Map(bots.map((b) => [b.id, b.name]));

  let messageCount = 0;
  let activeConversationCount = 0;
  const toolTotals: Record<string, number> = {};
  const perBotCounts: Record<string, number> = {};

  // Build the 7-day window (oldest → newest).
  const byDay = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    byDay.set(d, 0);
  }

  for (const c of conversations) {
    messageCount += c.messages.length;
    if (c.status !== "closed") activeConversationCount += 1;
    perBotCounts[c.bot_id] = (perBotCounts[c.bot_id] ?? 0) + 1;

    const key = dayKey(c.created_at);
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);

    const calls = countToolCalls(c.messages);
    for (const [name, n] of Object.entries(calls)) {
      toolTotals[name] = (toolTotals[name] ?? 0) + n;
    }
  }

  return {
    botCount: bots.length,
    conversationCount: conversations.length,
    activeConversationCount,
    messageCount,
    conversationsByDay: [...byDay.entries()].map(([date, count]) => ({
      date,
      count,
    })),
    toolUsage: Object.entries(toolTotals)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    perBot: bots
      .map((b) => ({
        botId: b.id,
        name: botName.get(b.id) ?? b.name,
        conversationCount: perBotCounts[b.id] ?? 0,
      }))
      .sort((a, b) => b.conversationCount - a.conversationCount),
  };
}

export async function getDashboardStats(now?: number): Promise<DashboardStats> {
  const [bots, conversations] = await Promise.all([
    listBots(),
    listConversationsWithMessagesForOwner(),
  ]);
  // Read the clock here (data layer), not in the calling React component, so we
  // don't trip react-hooks/purity by invoking Date.now() during render.
  return computeStats(bots, conversations, now ?? Date.now());
}
