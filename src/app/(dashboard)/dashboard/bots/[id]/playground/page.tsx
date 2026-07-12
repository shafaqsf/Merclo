"use client";

import { use, useRef, useState } from "react";
import { Wrench, ThumbsUp, ThumbsDown, ShoppingBag } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

type Role = "user" | "assistant" | "tool" | "error";

interface Product {
  title: string;
  price?: string;
  image?: string;
  url?: string;
  variantId?: string;
}

interface TranscriptItem {
  id: string;
  role: Role;
  content: string;
  products?: Product[];
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
  | {
      type: "message";
      conversationId: string;
      content: string;
      products?: Product[];
    }
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

function optString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Narrow an unknown value into a Product[]; drops anything without a title. */
function parseProducts(value: unknown): Product[] {
  if (!Array.isArray(value)) return [];
  const out: Product[] = [];
  for (const raw of value) {
    const r = asRecord(raw);
    const title = optString(r.title);
    if (!title) continue;
    out.push({
      title,
      price: optString(r.price),
      image: optString(r.image),
      url: optString(r.url),
      variantId: optString(r.variantId),
    });
  }
  return out;
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
  // Feedback keyed by the transcript index of the assistant message.
  const [feedback, setFeedback] = useState<Record<number, "up" | "down">>({});

  function push(role: Role, content: string, products?: Product[]) {
    setTranscript((prev) => [
      ...prev,
      { id: nextId(), role, content, products },
    ]);
  }

  async function sendFeedback(messageIndex: number, rating: "up" | "down") {
    const conversationId = conversationIdRef.current;
    if (!conversationId) return;
    setFeedback((prev) => ({ ...prev, [messageIndex]: rating }));
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, messageIndex, rating }),
      });
    } catch {
      // Optimistic — leave the selection; a failed POST is non-critical here.
    }
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
      push("tool", call.name);
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
        push("assistant", response.content, parseProducts(response.products));
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
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Playground
          </h1>
          <p className="mt-1.5 text-xs text-muted">
            Uses mock storefront data — tools return fake products &amp; cart.
          </p>
        </div>
        <ButtonLink
          href={`/dashboard/bots/${botId}`}
          variant="ghost"
          size="sm"
        >
          &larr; Back to bot
        </ButtonLink>
      </header>

      <Card className="mt-6 flex flex-1 flex-col overflow-hidden shadow-[var(--shadow-md)]">
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-6">
          {transcript.length === 0 && !pending && (
            <p className="py-12 text-center text-sm text-faint">
              Send a message to test this bot.
            </p>
          )}

          {transcript.map((item, messageIndex) => {
            if (item.role === "tool") {
              return (
                <div key={item.id} className="flex justify-center">
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-[11px] font-medium text-faint">
                    <Wrench className="h-3 w-3" aria-hidden />
                    {item.content}
                  </span>
                </div>
              );
            }
            if (item.role === "error") {
              return (
                <div key={item.id} className="flex justify-center">
                  <div className="rounded-xl bg-accent-soft px-4 py-2 text-sm text-danger">
                    {item.content}
                  </div>
                </div>
              );
            }
            const isUser = item.role === "user";
            const vote = feedback[messageIndex];
            return (
              <div
                key={item.id}
                className={cn(
                  "flex flex-col gap-2",
                  isUser ? "items-end" : "items-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-[var(--shadow-sm)]",
                    isUser
                      ? "bg-accent text-accent-ink"
                      : "bg-surface-2 text-ink"
                  )}
                >
                  {item.content}
                </div>

                {!isUser && item.products && item.products.length > 0 && (
                  <div className="grid w-full max-w-[80%] grid-cols-1 gap-2 sm:grid-cols-2">
                    {item.products.map((p, i) => (
                      <ProductCard key={`${item.id}-p${i}`} product={p} />
                    ))}
                  </div>
                )}

                {item.role === "assistant" && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Helpful"
                      aria-pressed={vote === "up"}
                      onClick={() => sendFeedback(messageIndex, "up")}
                      className={cn(
                        "grid h-7 w-7 place-items-center rounded-full text-sm transition-colors",
                        vote === "up"
                          ? "bg-accent-soft text-accent"
                          : "text-faint hover:bg-surface-2 hover:text-muted"
                      )}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label="Not helpful"
                      aria-pressed={vote === "down"}
                      onClick={() => sendFeedback(messageIndex, "down")}
                      className={cn(
                        "grid h-7 w-7 place-items-center rounded-full text-sm transition-colors",
                        vote === "down"
                          ? "bg-danger-soft text-danger"
                          : "text-faint hover:bg-surface-2 hover:text-muted"
                      )}
                    >
                      <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {pending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-2xl bg-surface-2 px-4 py-3.5 shadow-[var(--shadow-sm)]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-faint [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-faint [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-faint [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>

        <form
          onSubmit={handleSend}
          className="flex items-center gap-2.5 border-t border-hairline px-4 py-4"
        >
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            disabled={pending}
            className="flex-1 rounded-full disabled:opacity-60"
          />
          <Button
            type="submit"
            size="md"
            disabled={pending || !input.trim()}
            className="shrink-0"
          >
            {pending ? "…" : "Send"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Product card
 * ------------------------------------------------------------------ */

function ProductCard({ product }: { product: Product }) {
  const body = (
    <div className="flex gap-3 overflow-hidden rounded-xl border border-hairline bg-surface p-2.5 shadow-[var(--shadow-sm)] transition-colors hover:bg-surface-2">
      {product.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image}
          alt={product.title}
          className="h-14 w-14 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-surface-2 text-faint">
          <ShoppingBag className="h-5 w-5" aria-hidden />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{product.title}</p>
        {product.price && (
          <p className="mt-0.5 text-sm text-muted">{product.price}</p>
        )}
      </div>
    </div>
  );

  if (product.url) {
    return (
      <a href={product.url} target="_blank" rel="noopener noreferrer">
        {body}
      </a>
    );
  }
  return body;
}
