/**
 * Service-role Supabase client. Bypasses Row Level Security, so it must only
 * ever run on the server (never shipped to or executed in the browser).
 *
 * Used by the public chat runtime to read bot config and to read/write
 * conversations, which have no anon RLS policy.
 */
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export function createAdminSupabase(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "createAdminSupabase() must not be called in the browser: it uses the service-role key."
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
