/**
 * Configured OpenAI SDK client pointed at OpenRouter's OpenAI-compatible API.
 *
 * We deliberately read the environment at call time (not module load) so that
 * env changes / test setup are honoured and the client is never constructed
 * with stale credentials. Callers should treat the returned client as
 * short-lived.
 */
import OpenAI from "openai";

export const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_AGENT_MODEL = "openai/gpt-4o-mini";

/** Resolve the model id the agent should use, honouring `AGENT_MODEL`. */
export function getAgentModel(): string {
  return process.env.AGENT_MODEL || DEFAULT_AGENT_MODEL;
}

/**
 * Build an `OpenAI` client configured for OpenRouter. Reads
 * `OPENROUTER_BASE_URL` (default {@link DEFAULT_OPENROUTER_BASE_URL}) and
 * `OPENROUTER_API_KEY` from the environment on every call.
 */
export function createOpenRouterClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set; cannot create OpenRouter client."
    );
  }
  const baseURL = process.env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL;

  // Optional attribution headers recommended by OpenRouter. Harmless if unset.
  const referer = process.env.OPENROUTER_SITE_URL;
  const title = process.env.OPENROUTER_APP_NAME;
  const defaultHeaders: Record<string, string> = {};
  if (referer) defaultHeaders["HTTP-Referer"] = referer;
  if (title) defaultHeaders["X-Title"] = title;

  return new OpenAI({ apiKey, baseURL, defaultHeaders });
}
