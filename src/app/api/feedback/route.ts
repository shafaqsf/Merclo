/**
 * POST /api/feedback — record a thumbs up/down on an assistant message.
 *
 * Called from the widget (public storefront) and the playground. Validates the
 * conversation exists and (for the widget) checks the bot's origin allow-list.
 * Writes via the service-role client.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getConversation } from "@/lib/db/conversations";
import { getBotForRuntime } from "@/lib/db/bots";
import { recordFeedback } from "@/lib/db/feedback";

export const runtime = "nodejs";

const bodySchema = z.object({
  conversationId: z.string().min(1),
  messageIndex: z.number().int().min(0),
  rating: z.enum(["up", "down"]),
});

function normalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, "");
}

function originAllowed(origin: string | null, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  if (!origin) return false;
  const norm = normalizeOrigin(origin);
  if (allowed.includes(norm)) return true;
  try {
    const host = new URL(origin).host.toLowerCase();
    return allowed.some(
      (a) =>
        a === host ||
        a.replace(/^https?:\/\//, "").replace(/\/.*$/, "") === host
    );
  } catch {
    return false;
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function OPTIONS(request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  const h = corsHeaders(origin);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400, headers: h });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400, headers: h });
  }
  const { conversationId, messageIndex, rating } = parsed.data;

  const conv = await getConversation(conversationId);
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404, headers: h });
  }
  // Enforce the owning bot's origin allow-list (widget calls are cross-origin).
  const bot = await getBotForRuntime(conv.bot_id);
  if (bot && !originAllowed(origin, bot.allowed_origins)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403, headers: h });
  }

  try {
    await recordFeedback({ conversationId, messageIndex, rating });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error.";
    return NextResponse.json({ error: message }, { status: 500, headers: h });
  }
  return NextResponse.json({ ok: true }, { status: 200, headers: h });
}
