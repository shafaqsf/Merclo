/**
 * Data access for `public.knowledge_sources`.
 *
 * Single-tenant, no-auth app: every helper runs through the service-role
 * client.
 */
import { createAdminSupabase } from "@/lib/supabase/admin";

export type KnowledgeKind = "faq" | "policy" | "note";

export interface KnowledgeSource {
  id: string;
  bot_id: string;
  title: string;
  content: string;
  kind: KnowledgeKind;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeSnippet {
  title: string;
  content: string;
  kind: KnowledgeKind;
}

const COLUMNS = "id, bot_id, title, content, kind, created_at, updated_at";

function normalizeKind(v: unknown): KnowledgeKind {
  return v === "faq" || v === "policy" ? v : "note";
}

function mapRow(row: Record<string, unknown>): KnowledgeSource {
  return {
    id: String(row.id),
    bot_id: String(row.bot_id),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    kind: normalizeKind(row.kind),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listKnowledge(botId: string): Promise<KnowledgeSource[]> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("knowledge_sources")
    .select(COLUMNS)
    .eq("bot_id", botId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Failed to list knowledge: ${error.message}`);
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function createKnowledge(input: {
  botId: string;
  title: string;
  content: string;
  kind?: KnowledgeKind;
}): Promise<KnowledgeSource> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("knowledge_sources")
    .insert({
      bot_id: input.botId,
      title: input.title,
      content: input.content,
      kind: input.kind ?? "note",
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`Failed to create knowledge: ${error.message}`);
  return mapRow(data as Record<string, unknown>);
}

export async function updateKnowledge(
  id: string,
  patch: { title?: string; content?: string; kind?: KnowledgeKind }
): Promise<KnowledgeSource> {
  const supabase = createAdminSupabase();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.content !== undefined) update.content = patch.content;
  if (patch.kind !== undefined) update.kind = patch.kind;
  const { data, error } = await supabase
    .from("knowledge_sources")
    .update(update)
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`Failed to update knowledge: ${error.message}`);
  return mapRow(data as Record<string, unknown>);
}

export async function deleteKnowledge(id: string): Promise<void> {
  const supabase = createAdminSupabase();
  const { error } = await supabase.from("knowledge_sources").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete knowledge: ${error.message}`);
}

/**
 * Full-text search over a bot's knowledge for the chat runtime. Uses
 * `websearch_to_tsquery` (tolerant of free-text) against the generated `tsv`
 * column and returns the top snippets. Runs with the admin client.
 */
export async function searchKnowledge(
  botId: string,
  query: string,
  limit = 4
): Promise<KnowledgeSnippet[]> {
  const q = query.trim();
  if (!q) return [];
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("knowledge_sources")
    .select("title, content, kind")
    .eq("bot_id", botId)
    .textSearch("tsv", q, { type: "websearch", config: "english" })
    .limit(limit);
  if (error) throw new Error(`Failed to search knowledge: ${error.message}`);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      title: String(row.title ?? ""),
      content: String(row.content ?? ""),
      kind: normalizeKind(row.kind),
    };
  });
}
