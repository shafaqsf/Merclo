/**
 * Data access for `public.conversations`.
 *
 * Conversations have no anon RLS policy, so every helper here runs through the
 * service-role client and must only be called from server code (the chat
 * runtime / route handlers).
 */
import { createAdminSupabase } from "@/lib/supabase/admin";

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
