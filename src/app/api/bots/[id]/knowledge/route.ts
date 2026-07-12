import { NextRequest, NextResponse } from "next/server";
import {
  createKnowledge,
  listKnowledge,
  type KnowledgeKind,
} from "@/lib/db/knowledge";

type Params = { params: Promise<{ id: string }> };

function normalizeKind(v: unknown): KnowledgeKind | undefined {
  return v === "faq" || v === "policy" || v === "note" ? v : undefined;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const entries = await listKnowledge(id);
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const content = typeof data.content === "string" ? data.content.trim() : "";

  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: "Content is required." }, { status: 400 });
  }

  const entry = await createKnowledge({
    botId: id,
    title,
    content,
    kind: normalizeKind(data.kind),
  });

  return NextResponse.json(entry, { status: 201 });
}
