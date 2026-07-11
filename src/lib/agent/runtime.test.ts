import { describe, it, expect } from "vitest";
import {
  runAgentStep,
  type LLM,
  type LLMCompletion,
  type ChatMessage,
} from "@/lib/agent/runtime";
import { buildOpenAITools } from "@/lib/agent/tools";
import type { Bot } from "@/lib/db/bots";
import type { ToolName } from "@/lib/tools/schema";

function makeBot(overrides: Partial<Bot> = {}): Bot {
  return {
    id: "bot_1",
    owner_id: "owner_1",
    name: "Test Bot",
    persona: "You are a friendly test assistant.",
    allowed_tools: ["get_page_context", "search_products", "add_to_cart"],
    allowed_origins: [],
    appearance: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Scripted LLM: returns queued completions in order, recording requests. */
function scriptedLLM(script: LLMCompletion[]): LLM & { calls: ChatMessage[][] } {
  const queue = [...script];
  const calls: ChatMessage[][] = [];
  return {
    calls,
    async complete(request) {
      calls.push(request.messages);
      const next = queue.shift();
      if (!next) throw new Error("scriptedLLM ran out of completions");
      return next;
    },
  };
}

describe("runAgentStep state machine", () => {
  it("active -> awaiting_tool: returns tool calls the browser must run", async () => {
    const llm = scriptedLLM([
      {
        content: null,
        toolCalls: [
          {
            id: "call_1",
            name: "search_products",
            arguments: JSON.stringify({ query: "socks" }),
          },
        ],
      },
    ]);

    const result = await runAgentStep({
      bot: makeBot(),
      priorMessages: [],
      turn: { kind: "user", userMessage: "find me socks" },
      llm,
    });

    expect(result.type).toBe("tool_calls");
    if (result.type !== "tool_calls") throw new Error("unreachable");
    expect(result.status).toBe("awaiting_tool");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      id: "call_1",
      name: "search_products",
    });

    // Persisted messages: the user turn + the assistant tool-call message.
    expect(result.newMessages).toHaveLength(2);
    expect(result.newMessages[0]).toMatchObject({
      role: "user",
      content: "find me socks",
    });
    const assistant = result.newMessages[1] as {
      role: string;
      tool_calls: { id: string }[];
    };
    expect(assistant.role).toBe("assistant");
    expect(assistant.tool_calls[0].id).toBe("call_1");

    // System prompt is prepended and includes persona text.
    const firstRequest = llm.calls[0];
    expect(firstRequest[0]).toMatchObject({ role: "system" });
    expect(String((firstRequest[0] as { content: string }).content)).toContain(
      "friendly test assistant"
    );
  });

  it("awaiting_tool -> active: resumes from tool results to a final message", async () => {
    const llm = scriptedLLM([
      { content: "I found 3 pairs of socks for you.", toolCalls: [] },
    ]);

    // Prior history: user asked, assistant requested a tool.
    const priorMessages: ChatMessage[] = [
      { role: "user", content: "find me socks" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "search_products",
              arguments: JSON.stringify({ query: "socks" }),
            },
          },
        ],
      },
    ];

    const result = await runAgentStep({
      bot: makeBot(),
      priorMessages,
      turn: {
        kind: "tool_results",
        toolResults: [
          {
            toolCallId: "call_1",
            name: "search_products",
            result: { products: [{ id: "1" }, { id: "2" }, { id: "3" }] },
          },
        ],
      },
      llm,
    });

    expect(result.type).toBe("message");
    if (result.type !== "message") throw new Error("unreachable");
    expect(result.status).toBe("active");
    expect(result.content).toBe("I found 3 pairs of socks for you.");

    // Persisted: the tool result message + the final assistant message.
    expect(result.newMessages).toHaveLength(2);
    expect(result.newMessages[0]).toMatchObject({
      role: "tool",
      tool_call_id: "call_1",
    });
    expect(result.newMessages[1]).toMatchObject({
      role: "assistant",
      content: "I found 3 pairs of socks for you.",
    });

    // The LLM saw system + prior (2) + tool result (1) = 4 messages.
    expect(llm.calls[0]).toHaveLength(4);
  });

  it("full active -> awaiting_tool -> active transition end to end", async () => {
    const llm = scriptedLLM([
      {
        content: null,
        toolCalls: [
          { id: "c1", name: "get_cart", arguments: "{}" },
        ],
      },
      { content: "Your cart has 2 items.", toolCalls: [] },
    ]);
    const bot = makeBot({ allowed_tools: ["get_cart"] });

    const step1 = await runAgentStep({
      bot,
      priorMessages: [],
      turn: { kind: "user", userMessage: "what's in my cart?" },
      llm,
    });
    expect(step1.type).toBe("tool_calls");
    expect(step1.status).toBe("awaiting_tool");

    // Simulate persistence: history grows by step1.newMessages.
    const history = [...step1.newMessages];

    const step2 = await runAgentStep({
      bot,
      priorMessages: history,
      turn: {
        kind: "tool_results",
        toolResults: [
          { toolCallId: "c1", name: "get_cart", result: { count: 2 } },
        ],
      },
      llm,
    });
    expect(step2.type).toBe("message");
    expect(step2.status).toBe("active");
    if (step2.type === "message") {
      expect(step2.content).toBe("Your cart has 2 items.");
    }
  });

  it("offers only the server-side search_knowledge tool when the bot allows none", async () => {
    const llm = scriptedLLM([{ content: "Hello!", toolCalls: [] }]);
    let seenNames: string[] = [];
    const spy: LLM = {
      async complete(req) {
        seenNames = req.tools.map((t) => t.function.name);
        return llm.complete(req);
      },
    };
    await runAgentStep({
      bot: makeBot({ allowed_tools: [] }),
      priorMessages: [],
      turn: { kind: "user", userMessage: "hi" },
      llm: spy,
    });
    // No storefront tools, but search_knowledge is always available.
    expect(seenNames).toEqual(["search_knowledge"]);
  });

  it("runs search_knowledge server-side and loops to a final answer", async () => {
    const llm = scriptedLLM([
      {
        content: null,
        toolCalls: [
          { id: "k1", name: "search_knowledge", arguments: JSON.stringify({ query: "returns" }) },
        ],
      },
      { content: "Our return window is 30 days.", toolCalls: [] },
    ]);
    let executed = 0;
    const result = await runAgentStep({
      bot: makeBot({ allowed_tools: [] }),
      priorMessages: [],
      turn: { kind: "user", userMessage: "what's your return policy?" },
      llm,
      serverTools: async () => {
        executed += 1;
        return { results: [{ title: "Returns", content: "30 days", kind: "policy" }] };
      },
    });
    // The server executed the knowledge tool inline (no client round-trip).
    expect(executed).toBe(1);
    expect(result.type).toBe("message");
    if (result.type !== "message") throw new Error("unreachable");
    expect(result.content).toBe("Our return window is 30 days.");
  });
});

describe("buildOpenAITools filtering", () => {
  it("includes only allowed tools in OpenAI format", () => {
    const tools = buildOpenAITools(["search_products", "add_to_cart"]);
    expect(tools.map((t) => t.function.name).sort()).toEqual([
      "add_to_cart",
      "search_products",
    ]);
    for (const t of tools) {
      expect(t.type).toBe("function");
      expect(t.function.parameters).toBeTypeOf("object");
    }
  });

  it("ignores unknown / mis-typed tool names and de-duplicates", () => {
    const allowed = [
      "search_products",
      "search_products",
      "not_a_real_tool",
    ] as unknown as ToolName[];
    const tools = buildOpenAITools(allowed);
    expect(tools.map((t) => t.function.name)).toEqual(["search_products"]);
  });

  it("returns an empty array for an empty allow-list", () => {
    expect(buildOpenAITools([])).toEqual([]);
  });
});
