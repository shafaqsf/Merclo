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
