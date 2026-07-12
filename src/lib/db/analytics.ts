/**
 * Dashboard analytics. Aggregates bots and conversations in application code
 * (fine at scaffold scale). Single-tenant app: all reads go through the
 * service-role client.
 */
import { listBots, type Bot } from "@/lib/db/bots";
import {
  listConversationsWithMessagesForOwner,
  countToolCalls,
  type Conversation,
} from "@/lib/db/conversations";
import { createAdminSupabase } from "@/lib/supabase/admin";

export interface FeedbackTotals {
  up: number;
  down: number;
}

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
  /** Most common opening questions, most-frequent first. */
  topQuestions: { question: string; count: number }[];
  /** add_to_cart tool calls attributed to bots. */
  cartAdds: number;
  /** Thumbs up/down totals + score (up / (up+down)), 0..1 or null if no votes. */
  csat: { up: number; down: number; score: number | null };
  /** Previous-7-day totals for delta display. */
  prev: { conversationCount: number; messageCount: number };
}

/** Normalize a question string for counting (lowercase, collapse space, cap). */
function normalizeQuestion(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

/** First user message content of a conversation, if any. Pure. */
function firstUserQuestion(c: Conversation): string | null {
  for (const raw of c.messages) {
    if (raw && typeof raw === "object") {
      const m = raw as { role?: unknown; content?: unknown };
      if (m.role === "user" && typeof m.content === "string" && m.content.trim()) {
        return m.content;
      }
    }
  }
  return null;
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
  now: number,
  feedback: FeedbackTotals = { up: 0, down: 0 }
): DashboardStats {
  const botName = new Map(bots.map((b) => [b.id, b.name]));

  let messageCount = 0;
  let activeConversationCount = 0;
  let cartAdds = 0;
  let prevConversationCount = 0;
  let prevMessageCount = 0;
  const toolTotals: Record<string, number> = {};
  const perBotCounts: Record<string, number> = {};
  const questionCounts = new Map<string, { question: string; count: number }>();

  const sevenDaysAgo = now - 7 * 86_400_000;
  const fourteenDaysAgo = now - 14 * 86_400_000;

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

    const created = new Date(c.created_at).getTime();
    if (created >= fourteenDaysAgo && created < sevenDaysAgo) {
      prevConversationCount += 1;
      prevMessageCount += c.messages.length;
    }

    const calls = countToolCalls(c.messages);
    for (const [name, n] of Object.entries(calls)) {
      toolTotals[name] = (toolTotals[name] ?? 0) + n;
    }
    cartAdds += calls["add_to_cart"] ?? 0;

    const q = firstUserQuestion(c);
    if (q) {
      const norm = normalizeQuestion(q);
      const existing = questionCounts.get(norm);
      if (existing) existing.count += 1;
      else questionCounts.set(norm, { question: q.trim().slice(0, 120), count: 1 });
    }
  }

  const score =
    feedback.up + feedback.down > 0
      ? feedback.up / (feedback.up + feedback.down)
      : null;

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
    topQuestions: [...questionCounts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    cartAdds,
    csat: { up: feedback.up, down: feedback.down, score },
    prev: {
      conversationCount: prevConversationCount,
      messageCount: prevMessageCount,
    },
  };
}

/** Fetch thumbs up/down totals across all conversations. */
async function fetchFeedbackTotals(): Promise<FeedbackTotals> {
  try {
    const supabase = createAdminSupabase();
    const { data, error } = await supabase
      .from("message_feedback")
      .select("rating");
    if (error || !data) return { up: 0, down: 0 };
    let up = 0;
    let down = 0;
    for (const row of data) {
      if ((row as { rating?: unknown }).rating === "up") up += 1;
      else if ((row as { rating?: unknown }).rating === "down") down += 1;
    }
    return { up, down };
  } catch {
    return { up: 0, down: 0 };
  }
}

export async function getDashboardStats(now?: number): Promise<DashboardStats> {
  const [bots, conversations, feedback] = await Promise.all([
    listBots(),
    listConversationsWithMessagesForOwner(),
    fetchFeedbackTotals(),
  ]);
  // Read the clock here (data layer), not in the calling React component, so we
  // don't trip react-hooks/purity by invoking Date.now() during render.
  return computeStats(bots, conversations, now ?? Date.now(), feedback);
}
