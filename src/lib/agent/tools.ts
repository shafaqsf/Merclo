/**
 * Mapping between the shared tool contract (`@/lib/tools/schema`) and the
 * OpenAI chat-completions tool-calling format, plus the system prompt builder.
 */
import type OpenAI from "openai";
import {
  TOOL_DEFINITIONS,
  ALL_TOOL_NAMES,
  type ToolName,
} from "@/lib/tools/schema";
import type { Bot } from "@/lib/db/bots";

type ChatTool = OpenAI.Chat.Completions.ChatCompletionTool;

/**
 * `search_knowledge` is a SERVER-executed tool (it queries our own DB), unlike
 * the storefront tools which execute in the shopper's browser. The runtime runs
 * it inline and loops, rather than returning it to the client. It is always
 * offered so the model can ground answers in merchant-provided content.
 */
export const SEARCH_KNOWLEDGE_TOOL: ChatTool = {
  type: "function",
  function: {
    name: "search_knowledge",
    description:
      "Search the store's knowledge base (merchant-provided FAQs, policies, and product info) for information to answer the shopper. Prefer answering from these results; use this before saying you don't know.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look up." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

/** Names of tools the SERVER executes inline (not delegated to the browser). */
export const SERVER_TOOL_NAMES: ReadonlySet<string> = new Set(["search_knowledge"]);

/** Narrow an arbitrary string to a known `ToolName`, or `null`. */
export function asToolName(name: string): ToolName | null {
  return (ALL_TOOL_NAMES as string[]).includes(name)
    ? (name as ToolName)
    : null;
}

/**
 * Build the OpenAI `tools` array from `TOOL_DEFINITIONS`, filtered to the
 * bot's allow-list. Unknown / mis-typed names in `allowed` are ignored, and
 * duplicates are collapsed, so the result only ever contains valid tools.
 */
export function buildOpenAITools(allowed: readonly ToolName[]): ChatTool[] {
  const seen = new Set<ToolName>();
  const tools: ChatTool[] = [];
  for (const raw of allowed) {
    const name = asToolName(raw);
    if (name === null || seen.has(name)) continue;
    seen.add(name);
    const def = TOOL_DEFINITIONS[name];
    tools.push({
      type: "function",
      function: {
        name: def.name,
        description: def.description,
        parameters: def.parameters,
      },
    });
  }
  return tools;
}

/**
 * Compose the system prompt from the bot's persona plus fixed guardrails.
 * The guardrails constrain the model to the storefront scope, its allowed
 * tools, and require confirmation before mutating the cart.
 */
export function systemPrompt(bot: Bot): string {
  const allowedNames = bot.allowed_tools
    .map(asToolName)
    .filter((n): n is ToolName => n !== null);

  const mutating = allowedNames.filter((n) => TOOL_DEFINITIONS[n].mutating);

  const persona =
    bot.persona.trim() ||
    "You are a helpful shopping assistant embedded on an online store.";

  const toolLine =
    allowedNames.length > 0
      ? `You may ONLY use these tools: ${allowedNames.join(", ")}. Never call, invent, or reference any other tool.`
      : "You have no tools available; answer using conversation context only.";

  const mutatingLine =
    mutating.length > 0
      ? `The following tools change the shopper's cart or navigate their browser: ${mutating.join(", ")}. Always explain what you are about to do and get the shopper's explicit confirmation BEFORE calling any of them.`
      : "You cannot modify the cart or navigate the browser.";

  return [
    persona,
    "",
    "Operating rules:",
    "- You operate strictly within the scope of this single online storefront. Do not help with anything unrelated to shopping on this store.",
    `- ${toolLine}`,
    "- Tools execute in the shopper's browser, so results may take a moment and can occasionally fail; handle missing or error results gracefully.",
    `- ${mutatingLine}`,
    "- Only make claims about products, prices, stock, or the cart that are backed by tool results. If you do not know, use a read-only tool or say you are not sure.",
    "- You can call search_knowledge at any time to look up the store's FAQs, policies, and product info the merchant provided. Prefer answering from those results, and use it before telling the shopper you don't know.",
    "- Be concise and friendly. Keep responses focused on helping the shopper complete their task.",
  ].join("\n");
}
