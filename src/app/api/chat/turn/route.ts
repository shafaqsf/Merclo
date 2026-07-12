/**
 * POST /api/chat/turn — one step of the remote tool-execution chat loop.
 *
 * Called cross-origin from the merchant's storefront widget. See
 * `src/lib/agent/runtime.ts` for the state machine. This handler validates the
 * body, enforces the bot's origin allow-list, runs a single agent step, and
 * persists the resulting messages + status.
 *
 * Request body (one of):
 *   { conversationId?: string, botId: string, userMessage: string }  // user turn
 *   { conversationId: string, toolResults: ToolResult[] }            // tool results
 *
 * Response body (one of):
 *   { type: "message",    conversationId: string, content: string }
 *   { type: "tool_calls", conversationId: string, toolCalls: {id,name,arguments}[] }
 *   { error: string }                                                 // non-2xx
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  createConversation,
  getConversation,
  appendMessages,
} from "@/lib/db/conversations";
import { getBotForRuntime, type Bot } from "@/lib/db/bots";
import {
  runAgentStep,
  type ChatMessage,
  type AgentTurn,
} from "@/lib/agent/runtime";

export const runtime = "nodejs";

const toolResultSchema = z.object({
  toolCallId: z.string().min(1),
  name: z.string().min(1),
  result: z.unknown(),
});

const userTurnSchema = z.object({
  conversationId: z.string().min(1).nullish(),
  botId: z.string().min(1),
  userMessage: z.string().min(1),
});

const toolResultsTurnSchema = z.object({
  conversationId: z.string().min(1),
  toolResults: z.array(toolResultSchema).min(1),
});

const bodySchema = z.union([userTurnSchema, toolResultsTurnSchema]);

/** Normalize an origin string for comparison (lowercase, no trailing slash). */
function normalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * True if `origin` is permitted for `allowed`. An empty allow-list permits any
 * origin. Matches either the full normalized origin or its host.
 */
function originAllowed(origin: string | null, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  if (!origin) return false;
  const norm = normalizeOrigin(origin);
  if (allowed.includes(norm)) return true;
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  return allowed.some(
    (a) => a === host || a.replace(/^https?:\/\//, "").replace(/\/.*$/, "") === host
  );
}

/** Permissive-but-reflective CORS headers. Reflects the caller's Origin. */
function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(
  body: unknown,
  status: number,
  origin: string | null
): NextResponse {
  return NextResponse.json(body, { status, headers: corsHeaders(origin) });
}

export function OPTIONS(request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400, origin);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      { error: "Invalid request body.", details: parsed.error.flatten() },
      400,
      origin
    );
  }
  const body = parsed.data;

  try {
    // Resolve bot + conversation + prior messages, then the turn input.
    let bot: Bot | null;
    let conversationId: string;
    let priorMessages: ChatMessage[];
    let turn: AgentTurn;

    if ("userMessage" in body) {
      bot = await getBotForRuntime(body.botId);
      if (!bot) return json({ error: "Bot not found." }, 404, origin);
      if (!originAllowed(origin, bot.allowed_origins)) {
        return json({ error: "Origin not allowed." }, 403, origin);
      }

      if (body.conversationId) {
        const conv = await getConversation(body.conversationId);
        if (!conv) return json({ error: "Conversation not found." }, 404, origin);
        if (conv.bot_id !== bot.id) {
          return json({ error: "Conversation/bot mismatch." }, 400, origin);
        }
        conversationId = conv.id;
        priorMessages = conv.messages as ChatMessage[];
      } else {
        const conv = await createConversation(bot.id);
        conversationId = conv.id;
        priorMessages = [];
      }
      turn = { kind: "user", userMessage: body.userMessage };
    } else {
      const conv = await getConversation(body.conversationId);
      if (!conv) return json({ error: "Conversation not found." }, 404, origin);
      bot = await getBotForRuntime(conv.bot_id);
      if (!bot) return json({ error: "Bot not found." }, 404, origin);
      if (!originAllowed(origin, bot.allowed_origins)) {
        return json({ error: "Origin not allowed." }, 403, origin);
      }
      conversationId = conv.id;
      priorMessages = conv.messages as ChatMessage[];
      turn = {
        kind: "tool_results",
        toolResults: body.toolResults.map((r) => ({
          toolCallId: r.toolCallId,
          name: r.name,
          result: r.result,
        })),
      };
    }

    const result = await runAgentStep({ bot, priorMessages, turn });

    await appendMessages(conversationId, result.newMessages, result.status);

    if (result.type === "tool_calls") {
      return json(
        { type: "tool_calls", conversationId, toolCalls: result.toolCalls },
        200,
        origin
      );
    }
    return json(
      {
        type: "message",
        conversationId,
        content: result.content,
        ...(result.products ? { products: result.products } : {}),
      },
      200,
      origin
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error.";
    return json({ error: message }, 500, origin);
  }
}
