"use client";

import { use, useRef, useState } from "react";
import Link from "next/link";

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

type Role = "user" | "assistant" | "tool" | "error";

interface TranscriptItem {
  id: string;
  role: Role;
  content: string;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string per contract
}

interface ToolResultPayload {
  toolCallId: string;
  name: string;
  result: unknown;
}

type TurnResponse =
  | { type: "message"; conversationId: string; content: string }
  | { type: "tool_calls"; conversationId: string; toolCalls: ToolCall[] }
  | { error: string };

/* ------------------------------------------------------------------ *
 * Mock storefront cart + tools
 * ------------------------------------------------------------------ */

interface CartLine {
  variant_id: string;
  quantity: number;
}

interface MockCart {
  items: CartLine[];
  item_count: number;
  total_price: string;
}

function emptyCart(): MockCart {
  return { items: [], item_count: 0, total_price: "0.00" };
}

function recount(items: CartLine[]): MockCart {
  const item_count = items.reduce((n, i) => n + i.quantity, 0);
  // Flat mock unit price of 19.99 just to produce a plausible total.
  const total = (item_count * 19.99).toFixed(2);
  return { items, item_count, total_price: total };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 1): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Executes a mock tool against the given (mutable-by-copy) cart.
 * Returns the tool result plus the next cart state.
 */
function runMockTool(
  name: string,
  args: Record<string, unknown>,
  cart: MockCart
): { result: unknown; nextCart: MockCart } {
  switch (name) {
    case "get_page_context":
      return {
        result: {
          url: "https://demo-store.myshopify.com/products/demo-tee",
          pageType: "product",
          product: {
            title: "Demo Tee",
            price: "19.99",
            currency: "USD",
            variantId: "variant_123",
          },
        },
        nextCart: cart,
      };

    case "search_products":
      return {
        result: {
          products: [
            {
              title: "Demo Tee",
              handle: "demo-tee",
              price: "19.99",
              variants: [{ id: "variant_123" }],
            },
            {
              title: "Demo Mug",
              handle: "demo-mug",
              price: "9.99",
              variants: [{ id: "variant_456" }],
            },
          ],
        },
        nextCart: cart,
      };

    case "get_cart":
      return { result: cart, nextCart: cart };

    case "add_to_cart": {
      const variant_id = asString(args.variant_id ?? args.variantId, "variant_123");
      const quantity = asNumber(args.quantity, 1);
      const items = [...cart.items];
      const existing = items.find((i) => i.variant_id === variant_id);
      if (existing) {
        existing.quantity += quantity;
      } else {
        items.push({ variant_id, quantity });
      }
      const nextCart = recount(items);
      return { result: nextCart, nextCart };
    }

    case "update_cart": {
      const variant_id = asString(args.variant_id ?? args.variantId, "");
      const quantity = asNumber(args.quantity, 0);
      let items = cart.items.map((i) => ({ ...i }));
      if (quantity <= 0) {
        items = items.filter((i) => i.variant_id !== variant_id);
      } else {
        const line = items.find((i) => i.variant_id === variant_id);
        if (line) line.quantity = quantity;
        else items.push({ variant_id, quantity });
      }
      const nextCart = recount(items);
      return { result: nextCart, nextCart };
    }

    case "apply_discount_code":
      return {
        result: { applied: true, code: asString(args.code, "") },
        nextCart: cart,
      };

    case "navigate_to":
      return {
        result: { navigated: true, path: asString(args.path ?? args.url, "/") },
        nextCart: cart,
      };

    default:
      return { result: { error: "unknown tool" }, nextCart: cart };
  }
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

const MAX_ROUNDS = 8;

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `t${idCounter}_${Date.now()}`;
}

export default function PlaygroundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: botId } = use(params);

  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const cartRef = useRef<MockCart>(emptyCart());

  function push(role: Role, content: string) {
    setTranscript((prev) => [...prev, { id: nextId(), role, content }]);
  }

  async function postTurn(
    body:
      | { conversationId: string | null; botId: string; userMessage: string }
      | { conversationId: string; botId: string; toolResults: ToolResultPayload[] }
  ): Promise<TurnResponse> {
    const res = await fetch("/api/playground/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: unknown = await res.json().catch(() => ({
      error: `Request failed (${res.status}).`,
    }));
    if (!res.ok) {
      const rec = asRecord(data);
      return { error: asString(rec.error, `Request failed (${res.status}).`) };
    }
    return data as TurnResponse;
  }

  /** Given a tool_calls response, run mock tools and return the tool results. */
  function executeToolCalls(toolCalls: ToolCall[]): ToolResultPayload[] {
    const results: ToolResultPayload[] = [];
    for (const call of toolCalls) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        const raw: unknown = JSON.parse(call.arguments || "{}");
        parsedArgs = asRecord(raw);
      } catch {
        parsedArgs = {};
      }
      push("tool", `🔧 ${call.name}`);
      const { result, nextCart } = runMockTool(call.name, parsedArgs, cartRef.current);
      cartRef.current = nextCart;
      results.push({ toolCallId: call.id, name: call.name, result });
    }
    return results;
  }

  async function drive(initial: TurnResponse) {
    let response = initial;
    let round = 0;

    while (round < MAX_ROUNDS) {
      if ("error" in response) {
        push("error", response.error || "Something went wrong.");
        return;
      }

      if (response.type === "message") {
        conversationIdRef.current = response.conversationId;
        push("assistant", response.content);
        return;
      }

      // tool_calls
      conversationIdRef.current = response.conversationId;
      const toolResults = executeToolCalls(response.toolCalls);
      round += 1;
      response = await postTurn({
        conversationId: response.conversationId,
        botId,
        toolResults,
      });
    }

    push("error", `Stopped after ${MAX_ROUNDS} tool rounds.`);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || pending) return;

    setInput("");
    push("user", message);
    setPending(true);
    try {
      const response = await postTurn({
        conversationId: conversationIdRef.current,
        botId,
        userMessage: message,
      });
      await drive(response);
    } catch (err) {
      push(
        "error",
        err instanceof Error ? err.message : "Network error — please try again."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-2xl flex-col px-6 py-10">
      <Link
        href={`/dashboard/bots/${botId}`}
        className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-200"
      >
        &larr; Back to bot
      </Link>

      <div className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Playground
        </h1>
        <p className="mt-1 text-xs text-zinc-500">
          Playground uses mock storefront data — tools return fake
          products/cart.
        </p>
      </div>

      <div className="mt-6 flex flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {transcript.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-400">
              Send a message to test this bot.
            </p>
          )}

          {transcript.map((item) => {
            if (item.role === "tool") {
              return (
                <div
                  key={item.id}
                  className="font-mono text-xs text-zinc-400 dark:text-zinc-500"
                >
                  {item.content}
                </div>
              );
            }
            if (item.role === "error") {
              return (
                <div
                  key={item.id}
                  className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400"
                >
                  {item.content}
                </div>
              );
            }
            const isUser = item.role === "user";
            return (
              <div
                key={item.id}
                className={isUser ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm " +
                    (isUser
                      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100")
                  }
                >
                  {item.content}
                </div>
              </div>
            );
          })}

          {pending && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-zinc-100 px-3.5 py-2 text-sm text-zinc-500 dark:bg-zinc-800">
                typing…
              </div>
            </div>
          )}
        </div>

        <form
          onSubmit={handleSend}
          className="flex items-center gap-2 border-t border-zinc-200 px-3 py-3 dark:border-zinc-800"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            disabled={pending}
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="inline-flex h-9 shrink-0 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {pending ? "…" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
