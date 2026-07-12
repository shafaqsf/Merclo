/**
 * POST /api/playground/turn — same agent step as /api/chat/turn, but for the
 * in-dashboard test chat. Differences: the caller must be the authenticated
 * merchant who OWNS the bot (enforced via the cookie-bound client + RLS), and
 * there is no storefront origin allow-list check. Storefront tools are executed
 * by mock implementations in the playground UI, not a real Shopify page.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  createConversation,
  getConversation,
  appendMessages,
} from "@/lib/db/conversations";
import { getBot } from "@/lib/db/bots";
import { createServerSupabase } from "@/lib/supabase/server";
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
  botId: z.string().min(1),
  toolResults: z.array(toolResultSchema).min(1),
});

const bodySchema = z.union([userTurnSchema, toolResultsTurnSchema]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const body = parsed.data;

  // getBot uses the cookie-bound client, so RLS returns the bot only if the
  // signed-in merchant owns it — this is the authorization check.
  const bot = await getBot(body.botId);
  if (!bot) {
    return NextResponse.json({ error: "Bot not found." }, { status: 404 });
  }

  try {
    let conversationId: string;
    let priorMessages: ChatMessage[];
    let turn: AgentTurn;

    if ("userMessage" in body) {
      if (body.conversationId) {
        const conv = await getConversation(body.conversationId);
        if (!conv || conv.bot_id !== bot.id) {
          return NextResponse.json(
            { error: "Conversation not found." },
            { status: 404 }
          );
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
      if (!conv || conv.bot_id !== bot.id) {
        return NextResponse.json(
          { error: "Conversation not found." },
          { status: 404 }
        );
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
      return NextResponse.json({
        type: "tool_calls",
        conversationId,
        toolCalls: result.toolCalls,
      });
    }
    return NextResponse.json({
      type: "message",
      conversationId,
      content: result.content,
      ...(result.products ? { products: result.products } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
