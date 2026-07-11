/**
 * GET /api/bots/[id]/config — public widget configuration.
 *
 * The embedded widget fetches this on load to theme itself. Returns ONLY safe,
 * public fields (resolved appearance). CORS-enabled and origin-checked against
 * the bot's allow-list, mirroring /api/chat/turn.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getBotForRuntime } from "@/lib/db/bots";
import { resolveAppearance } from "@/lib/bots/appearance";

export const runtime = "nodejs";

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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function OPTIONS(request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  const { id } = await params;

  const bot = await getBotForRuntime(id);
  if (!bot) {
    return NextResponse.json(
      { error: "Bot not found." },
      { status: 404, headers: corsHeaders(origin) }
    );
  }
  if (!originAllowed(origin, bot.allowed_origins)) {
    return NextResponse.json(
      { error: "Origin not allowed." },
      { status: 403, headers: corsHeaders(origin) }
    );
  }

  return NextResponse.json(
    { botId: bot.id, appearance: resolveAppearance(bot.appearance) },
    { status: 200, headers: corsHeaders(origin) }
  );
}
