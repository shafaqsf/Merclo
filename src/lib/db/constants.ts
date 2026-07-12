/**
 * Single-tenant fixed owner id.
 *
 * This app has no login/auth: every bot, conversation, and related row is
 * attributed to this one fixed UUID rather than a real `auth.users` row. All
 * data access goes through the service-role client (see
 * `src/lib/supabase/admin.ts`), so RLS no longer scopes anything by owner.
 */
export const DEFAULT_OWNER_ID = "00000000-0000-0000-0000-000000000001";
