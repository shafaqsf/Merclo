/**
 * Data access for `public.conversations`.
 *
 * Conversations have no anon RLS policy, so every helper here runs through the
 * service-role client and must only be called from server code (the chat
 * runtime / route handlers).
 */
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * A single item in a conversation's history. This is an OpenAI Agents SDK item
 * (message, tool call, tool result, ...); we keep it opaque here.
 */
export type ConversationMessage = unknown;

export type ConversationStatus = "active" | "awaiting_tool" | "closed";

export interface Conversation {
  id: string;
  bot_id: string;
  messages: ConversationMessage[];
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
}

const CONVERSATION_COLUMNS =
  "id, bot_id, messages, status, created_at, updated_at";

/** Map an untyped DB row into a strongly-typed `Conversation`. Pure. */
export function mapRowToConversation(
  row: Record<string, unknown>
): Conversation {
  const status = row.status;
  return {
    id: String(row.id),
    bot_id: String(row.bot_id),
    messages: Array.isArray(row.messages)
      ? (row.messages as ConversationMessage[])
      : [],
    status:
      status === "active" || status === "awaiting_tool" || status === "closed"
        ? status
        : "active",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** Lightweight conversation summary for list/analytics views (no messages). */
export interface ConversationSummary {
  id: string;
  bot_id: string;
  status: ConversationStatus;
  message_count: number;
  created_at: string;
  updated_at: string;
}

/** Count assistant tool-call requests within a message history. Pure. */
export function countToolCalls(messages: ConversationMessage[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const raw of messages) {
    if (!raw || typeof raw !== "object") continue;
    const msg = raw as { tool_calls?: unknown };
    if (!Array.isArray(msg.tool_calls)) continue;
    for (const call of msg.tool_calls) {
      const name =
        call && typeof call === "object"
          ? ((call as { function?: { name?: string } }).function?.name ??
            (call as { name?: string }).name)
          : undefined;
      if (typeof name === "string") counts[name] = (counts[name] ?? 0) + 1;
    }
  }
  return counts;
}

function toSummary(c: Conversation): ConversationSummary {
  return {
    id: c.id,
    bot_id: c.bot_id,
    status: c.status,
    message_count: c.messages.length,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

/**
 * List conversation summaries for every bot owned by the signed-in merchant.
 * Uses the cookie-bound client, so RLS scopes rows to the owner (see the
 * "owners read their bots' conversations" policy).
 */
export async function listConversationsForOwner(): Promise<ConversationSummary[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to list conversations: ${error.message}`);
  return (data ?? [])
    .map((row) => mapRowToConversation(row as Record<string, unknown>))
    .map(toSummary);
}

/** Full conversations (with messages) for the owner — for analytics scans. */
export async function listConversationsWithMessagesForOwner(): Promise<Conversation[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to list conversations: ${error.message}`);
  return (data ?? []).map((row) =>
    mapRowToConversation(row as Record<string, unknown>)
  );
}

/**
 * Load a single conversation the signed-in merchant owns (full transcript).
 * Returns null if it doesn't exist or isn't visible to this user (RLS).
 */
export async function getConversationForOwner(
  id: string
): Promise<Conversation | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load conversation: ${error.message}`);
  return data ? mapRowToConversation(data as Record<string, unknown>) : null;
}

export async function createConversation(botId: string): Promise<Conversation> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("conversations")
    .insert({ bot_id: botId, messages: [], status: "active" })
    .select(CONVERSATION_COLUMNS)
    .single();

  if (error) throw new Error(`Failed to create conversation: ${error.message}`);
  return mapRowToConversation(data as Record<string, unknown>);
}

export async function getConversation(
  id: string
): Promise<Conversation | null> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load conversation: ${error.message}`);
  return data ? mapRowToConversation(data as Record<string, unknown>) : null;
}

/**
 * Append messages to a conversation's history and optionally update its status.
 * Reads the current history, concatenates, and writes it back.
 */
export async function appendMessages(
  id: string,
  messages: ConversationMessage[],
  status?: ConversationStatus
): Promise<Conversation> {
  const supabase = createAdminSupabase();

  const existing = await getConversation(id);
  if (!existing) throw new Error(`Conversation not found: ${id}`);

  const update: Record<string, unknown> = {
    messages: [...existing.messages, ...messages],
    updated_at: new Date().toISOString(),
  };
  if (status !== undefined) update.status = status;

  const { data, error } = await supabase
    .from("conversations")
    .update(update)
    .eq("id", id)
    .select(CONVERSATION_COLUMNS)
    .single();

  if (error) throw new Error(`Failed to append messages: ${error.message}`);
  return mapRowToConversation(data as Record<string, unknown>);
}
