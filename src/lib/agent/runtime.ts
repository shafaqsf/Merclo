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
import { buildOpenAITools, systemPrompt } from "@/lib/agent/tools";
import { createOpenRouterClient, getAgentModel } from "@/lib/agent/openrouter";

export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

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

  const allowed = bot.allowed_tools as ToolName[];
  const tools = buildOpenAITools(allowed);

  const turnMessages = messagesForTurn(turn);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(bot) },
    ...priorMessages,
    ...turnMessages,
  ];

  const completion = await llm.complete({
    model: getAgentModel(),
    messages,
    tools,
  });

  if (completion.toolCalls.length > 0) {
    const assistantMessage = assistantToolCallMessage(completion.toolCalls);
    return {
      type: "tool_calls",
      toolCalls: completion.toolCalls,
      newMessages: [...turnMessages, assistantMessage],
      status: "awaiting_tool",
    };
  }

  const content = completion.content ?? "";
  const assistantMessage: ChatMessage = { role: "assistant", content };
  return {
    type: "message",
    content,
    newMessages: [...turnMessages, assistantMessage],
    status: "active",
  };
}
