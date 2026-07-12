import { NextRequest, NextResponse } from "next/server";
import {
  deleteKnowledge,
  updateKnowledge,
  type KnowledgeKind,
} from "@/lib/db/knowledge";

type Params = { params: Promise<{ id: string }> };

function normalizeKind(v: unknown): KnowledgeKind | undefined {
  return v === "faq" || v === "policy" || v === "note" ? v : undefined;
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
  const patch: { title?: string; content?: string; kind?: KnowledgeKind } = {};

  if (typeof data.title === "string") {
    const title = data.title.trim();
    if (!title) {
      return NextResponse.json(
        { error: "Title cannot be empty." },
        { status: 400 }
      );
    }
    patch.title = title;
  }
  if (typeof data.content === "string") {
    const content = data.content.trim();
    if (!content) {
      return NextResponse.json(
        { error: "Content cannot be empty." },
        { status: 400 }
      );
    }
    patch.content = content;
  }
  const kind = normalizeKind(data.kind);
  if (kind) patch.kind = kind;

  const entry = await updateKnowledge(id, patch);
  return NextResponse.json(entry);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await deleteKnowledge(id);
  return NextResponse.json({ ok: true });
}
