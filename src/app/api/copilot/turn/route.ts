/**
 * Dashboard copilot endpoint. Cookie-bound (RLS-scoped to the logged-in user)
 * and NOT CORS-exposed — this is a first-party dashboard API, unlike the public
 * /api/chat/turn storefront endpoint.
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getOrCreateCopilotThread,
  saveCopilotThread,
  setCopilotMode,
  type CopilotMode,
} from "@/lib/db/copilot-conversations";
import { runCopilotTurn } from "@/lib/copilot/runtime";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const kind = (body as { kind?: string }).kind;

  try {
    if (kind === "set_mode") {
      const mode = (body as { mode?: string }).mode;
      if (mode !== "accept" && mode !== "auto") {
        return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
      }
      const thread = await setCopilotMode(mode as CopilotMode);
      return NextResponse.json({ type: "mode", mode: thread.mode });
    }

    const thread = await getOrCreateCopilotThread();

    if (kind === "message") {
      const text = (body as { text?: string }).text;
      if (typeof text !== "string" || text.trim() === "") {
        return NextResponse.json({ error: "Empty message" }, { status: 400 });
      }
      const result = await runCopilotTurn({
        mode: thread.mode,
        priorItems: thread.items,
        pendingState: thread.pending_state,
        turn: { kind: "message", text },
      });
      await saveCopilotThread({
        items: result.items,
        pending_state: result.pendingState,
      });
      return NextResponse.json(result.output);
    }

    if (kind === "decision") {
      const decisions = (body as { decisions?: unknown }).decisions;
      if (!Array.isArray(decisions)) {
        return NextResponse.json({ error: "Missing decisions" }, { status: 400 });
      }
      if (!thread.pending_state) {
        return NextResponse.json(
          { error: "No pending approval" },
          { status: 409 }
        );
      }
      const result = await runCopilotTurn({
        mode: thread.mode,
        priorItems: thread.items,
        pendingState: thread.pending_state,
        turn: {
          kind: "decision",
          decisions: decisions as { approvalId: string; approve: boolean }[],
        },
      });
      await saveCopilotThread({
        items: result.items,
        pending_state: result.pendingState,
      });
      return NextResponse.json(result.output);
    }

    return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Copilot error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
