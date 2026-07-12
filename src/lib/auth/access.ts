/**
 * Dashboard auth switch.
 *
 * Setting `DASHBOARD_AUTH_DISABLED=true` in the environment bypasses the login
 * gate on the merchant dashboard, so the app can be opened locally without a
 * Supabase session. Any other value (or unset) keeps auth enforced.
 *
 * This is a dev-only convenience — never enable it in a deployed environment,
 * since it exposes the dashboard to anyone who can reach it.
 */

type Env = Record<string, string | undefined>;

export function isAuthDisabled(env: Env = process.env): boolean {
  return env.DASHBOARD_AUTH_DISABLED === "true";
}

/** Email shown in the UI when auth is disabled and there's no real session. */
export function devUserEmail(env: Env = process.env): string {
  return env.DASHBOARD_DEV_EMAIL || "dev@merclo.local";
}
