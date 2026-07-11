import { NextRequest, NextResponse } from "next/server";
import { createBot, listBots } from "@/lib/db/bots";

export async function GET() {
  const bots = await listBots();
  return NextResponse.json(bots);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const bot = await createBot({
    name,
    persona: typeof data.persona === "string" ? data.persona : undefined,
    allowed_tools: Array.isArray(data.allowed_tools)
      ? (data.allowed_tools as string[])
      : undefined,
    allowed_origins: Array.isArray(data.allowed_origins)
      ? (data.allowed_origins as string[])
      : undefined,
  });

  return NextResponse.json(bot, { status: 201 });
}
