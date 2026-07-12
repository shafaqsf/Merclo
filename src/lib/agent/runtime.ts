/**
 * Core server-side agent runtime — a single step of the REMOTE tool-execution
 * loop.
 *
 * IMPLEMENTATION CHOICE: we use the raw `openai` SDK (`chat.completions`)
 * rather than `@openai/agents`. The Agents SDK is built around the runtime
 * executing tools locally within its own loop; our architecture executes tools
 * in the shopper's browser and hands control back to the client between the
 * model's tool request and the tool result. That "pause, return tool calls to
 * the caller, resume on the next HTTP request" shape maps directly onto
 * chat-completions tool-calling but fights the Agents SDK's run loop, so the
 * raw SDK keeps the state machine explicit and unit-testable.
 *
 * Conversation history is persisted as OpenAI chat message objects
 * (`ChatMessage`), which is what `ConversationMessage` (typed `unknown`) holds.
 */
import type OpenAI from "openai";
import type { Bot } from "@/lib/db/bots";
import type { ConversationStatus } from "@/lib/db/conversations";
import type { ToolName } from "@/lib/tools/schema";
import {
  buildOpenAITools,
  systemPrompt,
  SEARCH_KNOWLEDGE_TOOL,
  SERVER_TOOL_NAMES,
} from "@/lib/agent/tools";
import { createOpenRouterClient, getAgentModel } from "@/lib/agent/openrouter";
import { searchKnowledge } from "@/lib/db/knowledge";

export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** A product to render as a rich card in the widget, alongside the reply. */
export interface ProductCard {
  title: string;
  price?: string;
  image?: string;
  url?: string;
  variantId?: string;
}

/**
 * Executes a SERVER-side tool call (e.g. search_knowledge) and returns its
 * result. Injectable so the runtime stays unit-testable without a DB.
 */
export type ServerToolExecutor = (
  call: OutgoingToolCall
) => Promise<unknown>;

/** A tool call the server asks the browser to execute. */
export interface OutgoingToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** A tool result the browser POSTs back after executing a tool. */
export interface IncomingToolResult {
  toolCallId: string;
  name: string;
  /** Arbitrary JSON result produced by the browser-side tool. */
  result: unknown;
}

/** What the model produced this step. */
export type AgentStepResult =
  | {
      type: "message";
      content: string;
      /** Product cards to render with the reply (from search_products data). */
      products?: ProductCard[];
      /** Messages to append to the conversation history. */
      newMessages: ChatMessage[];
      status: Extract<ConversationStatus, "active">;
    }
  | {
      type: "tool_calls";
      toolCalls: OutgoingToolCall[];
      newMessages: ChatMessage[];
      status: Extract<ConversationStatus, "awaiting_tool">;
    };

/** The new input for this step: either a user message or tool results. */
export type AgentTurn =
  | { kind: "user"; userMessage: string }
  | { kind: "tool_results"; toolResults: IncomingToolResult[] };

/**
 * Normalized completion returned by the injectable {@link LLM}. Keeping this
 * minimal (not the full OpenAI response) is what lets tests inject a fake.
 */
export interface LLMCompletion {
  content: string | null;
  toolCalls: OutgoingToolCall[];
}

export interface LLMRequest {
  model: string;
  messages: ChatMessage[];
  tools: OpenAI.Chat.Completions.ChatCompletionTool[];
}

/** Small seam over the network LLM call so the runtime is unit-testable. */
export interface LLM {
  complete(request: LLMRequest): Promise<LLMCompletion>;
}

export interface RunAgentStepInput {
  bot: Bot;
  /** Prior conversation history (chat messages), oldest first. */
  priorMessages: ChatMessage[];
  turn: AgentTurn;
  /** Injected LLM; defaults to the live OpenRouter-backed client. */
  llm?: LLM;
  /** Injected server-tool executor; defaults to the live DB-backed one. */
  serverTools?: ServerToolExecutor;
}

/** Max inline server-tool rounds before we stop looping (safety bound). */
const MAX_SERVER_ROUNDS = 3;

/** Live server-tool executor: currently just `search_knowledge`. */
export function defaultServerTools(bot: Bot): ServerToolExecutor {
  return async (call) => {
    if (call.name === "search_knowledge") {
      let query = "";
      try {
        const args = JSON.parse(call.arguments || "{}");
        if (args && typeof args.query === "string") query = args.query;
      } catch {
        /* ignore malformed args */
      }
      const snippets = await searchKnowledge(bot.id, query);
      return snippets.length > 0
        ? { results: snippets }
        : { results: [], note: "No matching knowledge found." };
    }
    return { error: `Unknown server tool: ${call.name}` };
  };
}

/** Default LLM implementation backed by OpenRouter via the `openai` SDK. */
export const openRouterLLM: LLM = {
  async complete({ model, messages, tools }): Promise<LLMCompletion> {
    const client = createOpenRouterClient();
    const response = await client.chat.completions.create({
      model,
      messages,
      // Only pass `tools` when non-empty; some providers reject an empty array.
      ...(tools.length > 0 ? { tools } : {}),
    });
    const choice = response.choices[0];
    const message = choice?.message;
    const toolCalls: OutgoingToolCall[] = (message?.tool_calls ?? [])
      .filter(
        (tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall =>
          tc.type === "function"
      )
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));
    return { content: message?.content ?? null, toolCalls };
  },
};

/** Build the chat messages representing the new turn's input. */
function messagesForTurn(turn: AgentTurn): ChatMessage[] {
  if (turn.kind === "user") {
    return [{ role: "user", content: turn.userMessage }];
  }
  return turn.toolResults.map((r) => ({
    role: "tool",
    tool_call_id: r.toolCallId,
    content:
      typeof r.result === "string" ? r.result : JSON.stringify(r.result ?? null),
  }));
}

/** Convert outgoing tool calls into the assistant message that requested them. */
function assistantToolCallMessage(toolCalls: OutgoingToolCall[]): ChatMessage {
  return {
    role: "assistant",
    content: null,
    tool_calls: toolCalls.map((tc) => ({
      id: tc.id,
      type: "function",
      function: { name: tc.name, arguments: tc.arguments },
    })),
  };
}

/**
 * Extract product cards from the most recent `search_products` tool result in
 * the message history. Deterministic: if the model answered after a product
 * search, we surface those products as cards. Tolerant of shape variations.
 */
export function extractProducts(messages: ChatMessage[]): ProductCard[] {
  // Map tool_call_id -> tool name from assistant messages.
  const idToName = new Map<string, string>();
  for (const m of messages) {
    if (m.role === "assistant" && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc.type === "function") idToName.set(tc.id, tc.function.name);
      }
    }
  }
  // Find the last tool message whose call was search_products.
  let raw: string | null = null;
  for (const m of messages) {
    if (
      m.role === "tool" &&
      typeof m.tool_call_id === "string" &&
      idToName.get(m.tool_call_id) === "search_products"
    ) {
      raw = typeof m.content === "string" ? m.content : null;
    }
  }
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { products?: unknown }).products)
      ? (parsed as { products: unknown[] }).products
      : [];

  const cards: ProductCard[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const title = typeof p.title === "string" ? p.title : undefined;
    if (!title) continue;
    const handle = typeof p.handle === "string" ? p.handle : undefined;
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const firstVariant = variants[0] as Record<string, unknown> | undefined;
    cards.push({
      title,
      price: typeof p.price === "string" ? p.price : undefined,
      image: typeof p.image === "string" ? p.image : undefined,
      url: handle ? `/products/${handle}` : undefined,
      variantId: firstVariant && firstVariant.id != null
        ? String(firstVariant.id)
        : undefined,
    });
    if (cards.length >= 6) break;
  }
  return cards;
}

/**
 * Run exactly one step of the agent state machine.
 *
 * - `active -> awaiting_tool`: the model asked for storefront tools; we return
 *   them for the browser to execute and persist the assistant tool-call
 *   message so the follow-up tool results line up.
 * - `active/awaiting_tool -> active`: the model produced a final text reply.
 *
 * The returned `newMessages` are exactly what the caller should append to the
 * conversation history (input messages for this turn + the assistant message).
 */
export async function runAgentStep(
  input: RunAgentStepInput
): Promise<AgentStepResult> {
  const { bot, priorMessages, turn } = input;
  const llm = input.llm ?? openRouterLLM;
  const serverTools = input.serverTools ?? defaultServerTools(bot);

  const allowed = bot.allowed_tools as ToolName[];
  const tools = [...buildOpenAITools(allowed), SEARCH_KNOWLEDGE_TOOL];

  const turnMessages = messagesForTurn(turn);

  // Full running message list sent to the model.
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(bot) },
    ...priorMessages,
    ...turnMessages,
  ];
  // Messages to persist to conversation history (excludes the system prompt).
  const newMessages: ChatMessage[] = [...turnMessages];
  const model = getAgentModel();

  // Loop while the model requests SERVER-executed tools, running them inline.
  // Break out to return client (storefront) tool calls to the browser, or to
  // return the final assistant text.
  for (let round = 0; round < MAX_SERVER_ROUNDS; round++) {
    const completion = await llm.complete({ model, messages, tools });

    if (completion.toolCalls.length === 0) {
      const content = completion.content ?? "";
      const assistantMessage: ChatMessage = { role: "assistant", content };
      newMessages.push(assistantMessage);
      const products = extractProducts([...priorMessages, ...newMessages]);
      return {
        type: "message",
        content,
        ...(products.length > 0 ? { products } : {}),
        newMessages,
        status: "active",
      };
    }

    const serverCalls = completion.toolCalls.filter((c) =>
      SERVER_TOOL_NAMES.has(c.name)
    );
    const clientCalls = completion.toolCalls.filter(
      (c) => !SERVER_TOOL_NAMES.has(c.name)
    );

    // Client tool calls must be executed in the browser: return them. If the
    // model also requested server tools in the same batch, we defer them —
    // persisting only the client tool-call message keeps OpenAI's per-call
    // result ordering valid; the model re-requests knowledge next round.
    if (clientCalls.length > 0) {
      const assistantMessage = assistantToolCallMessage(clientCalls);
      newMessages.push(assistantMessage);
      return {
        type: "tool_calls",
        toolCalls: clientCalls,
        newMessages,
        status: "awaiting_tool",
      };
    }

    // Only server tools: execute them inline, append results, and loop.
    const assistantMessage = assistantToolCallMessage(serverCalls);
    messages.push(assistantMessage);
    newMessages.push(assistantMessage);
    for (const call of serverCalls) {
      const result = await serverTools(call);
      const toolMessage: ChatMessage = {
        role: "tool",
        tool_call_id: call.id,
        content: typeof result === "string" ? result : JSON.stringify(result ?? null),
      };
      messages.push(toolMessage);
      newMessages.push(toolMessage);
    }
  }

  // Exhausted server rounds without a final answer — ask the model once more
  // with no tools so it must produce text.
  const finalCompletion = await llm.complete({ model, messages, tools: [] });
  const content = finalCompletion.content ?? "";
  const assistantMessage: ChatMessage = { role: "assistant", content };
  newMessages.push(assistantMessage);
  const products = extractProducts([...priorMessages, ...newMessages]);
  return {
    type: "message",
    content,
    ...(products.length > 0 ? { products } : {}),
    newMessages,
    status: "active",
  };
}
