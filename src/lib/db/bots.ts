/**
 * Data access for `public.bots`.
 *
 * The mutating/list/get helpers run through the cookie-bound server client, so
 * they are scoped to the signed-in merchant by RLS. `getBotForRuntime` uses the
 * service-role client for the public chat endpoint, where there is no user JWT.
 */
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export interface Bot {
  id: string;
  owner_id: string;
  name: string;
  persona: string;
  allowed_tools: string[];
  allowed_origins: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateBotInput {
  name: string;
  persona?: string;
  allowed_tools?: string[];
  allowed_origins?: string[];
}

export type UpdateBotPatch = Partial<CreateBotInput>;

const BOT_COLUMNS =
  "id, owner_id, name, persona, allowed_tools, allowed_origins, created_at, updated_at";

/**
 * Normalize a list of origins: trim whitespace, drop empties, lowercase the
 * host, strip trailing slashes, and de-duplicate. Pure — unit tested.
 */
export function normalizeOrigins(origins: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of origins) {
    const trimmed = raw.trim().replace(/\/+$/, "");
    if (trimmed === "") continue;
    const normalized = trimmed.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/** Map an untyped DB row into a strongly-typed `Bot`. Pure — unit tested. */
export function mapRowToBot(row: Record<string, unknown>): Bot {
  return {
    id: String(row.id),
    owner_id: String(row.owner_id),
    name: String(row.name),
    persona: typeof row.persona === "string" ? row.persona : "",
    allowed_tools: Array.isArray(row.allowed_tools)
      ? (row.allowed_tools as unknown[]).map(String)
      : [],
    allowed_origins: Array.isArray(row.allowed_origins)
      ? (row.allowed_origins as unknown[]).map(String)
      : [],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listBots(): Promise<Bot[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("bots")
    .select(BOT_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list bots: ${error.message}`);
  return (data ?? []).map((row) => mapRowToBot(row as Record<string, unknown>));
}

export async function getBot(id: string): Promise<Bot | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("bots")
    .select(BOT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load bot: ${error.message}`);
  return data ? mapRowToBot(data as Record<string, unknown>) : null;
}

export async function createBot(input: CreateBotInput): Promise<Bot> {
  const supabase = await createServerSupabase();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw new Error(`Failed to resolve user: ${userError.message}`);
  if (!user) throw new Error("Not authenticated.");

  const insert = {
    owner_id: user.id,
    name: input.name,
    persona: input.persona ?? "",
    allowed_tools: input.allowed_tools ?? [],
    allowed_origins: normalizeOrigins(input.allowed_origins ?? []),
  };

  const { data, error } = await supabase
    .from("bots")
    .insert(insert)
    .select(BOT_COLUMNS)
    .single();

  if (error) throw new Error(`Failed to create bot: ${error.message}`);
  return mapRowToBot(data as Record<string, unknown>);
}

export async function updateBot(id: string, patch: UpdateBotPatch): Promise<Bot> {
  const supabase = await createServerSupabase();

  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.persona !== undefined) update.persona = patch.persona;
  if (patch.allowed_tools !== undefined) update.allowed_tools = patch.allowed_tools;
  if (patch.allowed_origins !== undefined) {
    update.allowed_origins = normalizeOrigins(patch.allowed_origins);
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("bots")
    .update(update)
    .eq("id", id)
    .select(BOT_COLUMNS)
    .single();

  if (error) throw new Error(`Failed to update bot: ${error.message}`);
  return mapRowToBot(data as Record<string, unknown>);
}

export async function deleteBot(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("bots").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete bot: ${error.message}`);
}

/**
 * Read a bot by id using the service-role client. Used by the public chat
 * endpoint, which has no merchant JWT but still needs the bot's persona and
 * allow-lists to run the agent.
 */
export async function getBotForRuntime(id: string): Promise<Bot | null> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("bots")
    .select(BOT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load bot for runtime: ${error.message}`);
  return data ? mapRowToBot(data as Record<string, unknown>) : null;
}
