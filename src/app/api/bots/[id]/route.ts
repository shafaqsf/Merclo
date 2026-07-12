import { NextRequest, NextResponse } from "next/server";
import { deleteBot, getBot, updateBot } from "@/lib/db/bots";
import { resolveAppearance } from "@/lib/bots/appearance";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const bot = await getBot(id);
  if (!bot) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json(bot);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const patch: {
    name?: string;
    persona?: string;
    allowed_tools?: string[];
    allowed_origins?: string[];
    appearance?: Record<string, unknown>;
  } = {};

  if (typeof data.name === "string") {
    const name = data.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
    }
    patch.name = name;
  }
  if (typeof data.persona === "string") patch.persona = data.persona;
  if (Array.isArray(data.allowed_tools)) {
    patch.allowed_tools = data.allowed_tools as string[];
  }
  if (Array.isArray(data.allowed_origins)) {
    patch.allowed_origins = data.allowed_origins as string[];
  }
  if (data.appearance && typeof data.appearance === "object") {
    patch.appearance = resolveAppearance(data.appearance) as unknown as Record<string, unknown>;
  }

  const bot = await updateBot(id, patch);
  return NextResponse.json(bot);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await deleteBot(id);
  return NextResponse.json({ ok: true });
}
