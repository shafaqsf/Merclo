/**
 * GET /api/search?q= — search for the dashboard command palette. Returns
 * matching bots and recent conversations (single-tenant: there is only one
 * owner, so no scoping is needed).
 */
import { NextResponse, type NextRequest } from "next/server";
import { listBots } from "@/lib/db/bots";
import { listConversationsForOwner } from "@/lib/db/conversations";

export const runtime = "nodejs";

export interface SearchResult {
  type: "bot" | "conversation";
  id: string;
  label: string;
  sublabel: string;
  href: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();

  const [bots, conversations] = await Promise.all([
    listBots(),
    listConversationsForOwner(),
  ]);
  const botName = new Map(bots.map((b) => [b.id, b.name]));

  const results: SearchResult[] = [];

  for (const b of bots) {
    if (!q || b.name.toLowerCase().includes(q)) {
      results.push({
        type: "bot",
        id: b.id,
        label: b.name,
        sublabel: "Bot",
        href: `/dashboard/bots/${b.id}`,
      });
    }
  }

  for (const c of conversations.slice(0, 50)) {
    const name = botName.get(c.bot_id) ?? "Conversation";
    if (!q || name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)) {
      results.push({
        type: "conversation",
        id: c.id,
        label: `${name} · ${c.message_count} msgs`,
        sublabel: c.status,
        href: `/dashboard/conversations/${c.id}`,
      });
    }
  }

  return NextResponse.json({ results: results.slice(0, 20) });
}
