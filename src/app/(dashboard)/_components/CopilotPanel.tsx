"use client";

import { useState } from "react";
import { Sparkles, X, Send, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopilot } from "./CopilotProvider";

interface PendingApproval {
  approvalId: string;
  toolName: string;
  arguments: string;
}

/** Human-readable label for each action the copilot can ask to perform. */
const TOOL_LABELS: Record<string, string> = {
  create_bot: "create a new bot",
  update_bot: "update a bot",
  delete_bot: "delete a bot",
  add_knowledge: "add a knowledge entry",
  delete_knowledge: "delete a knowledge entry",
  delete_conversation: "delete a conversation",
};

/** Friendly labels for the argument keys shown on an approval card. */
const ARG_LABELS: Record<string, string> = {
  id: "ID",
  bot_id: "Bot",
  name: "Name",
  persona: "Persona",
  title: "Title",
  content: "Content",
  kind: "Type",
  allowed_tools: "Tools",
  allowed_origins: "Origins",
};

function describeTool(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ");
}

/** Parse a tool's JSON arguments into readable label/value rows. */
function formatArgs(raw: string): { label: string; value: string }[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  return Object.entries(parsed as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([key, v]) => ({
      label: ARG_LABELS[key] ?? key.replace(/_/g, " "),
      value: Array.isArray(v) ? v.join(", ") : String(v),
    }));
}
type Turn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | { role: "approvals"; pending: PendingApproval[] };

async function post(body: unknown) {
  const res = await fetch("/api/copilot/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function applyResponse(data: unknown, thread: Turn[]): Turn[] {
  if (data && typeof data === "object" && "type" in data) {
    const d = data as
      | { type: "message"; content: string }
      | { type: "approvals"; pending: PendingApproval[] };
    if (d.type === "message")
      return [...thread, { role: "assistant", text: d.content }];
    if (d.type === "approvals")
      return [...thread, { role: "approvals", pending: d.pending }];
  }
  return [
    ...thread,
    {
      role: "assistant",
      text: "Sorry — I couldn't complete that. Please try rephrasing or try again.",
    },
  ];
}

export default function CopilotPanel() {
  const { open, setOpen, mode, setMode } = useCopilot();
  const [thread, setThread] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open copilot"
        className="fixed bottom-6 right-6 z-40 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-colors hover:bg-primary/80"
      >
        <Sparkles className="h-5 w-5" />
      </button>
    );
  }

  const lastTurn = thread[thread.length - 1];
  const pendingApproval = lastTurn?.role === "approvals";

  async function send() {
    const text = input.trim();
    if (!text || busy || pendingApproval) return;
    setInput("");
    setThread((t) => [...t, { role: "user", text }]);
    setBusy(true);
    try {
      const data = await post({ kind: "message", text });
      setThread((t) => applyResponse(data, t));
    } finally {
      setBusy(false);
    }
  }

  async function decide(approvalId: string, approve: boolean) {
    setBusy(true);
    try {
      const data = await post({
        kind: "decision",
        decisions: [{ approvalId, approve }],
      });
      setThread((t) => applyResponse(data, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-80 shrink-0 flex-col border-l border-border bg-card text-card-foreground xl:flex">
      <header className="flex h-16 items-center justify-between border-b border-border px-4">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4" /> Copilot
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode(mode === "accept" ? "auto" : "accept")}
            title={
              mode === "accept"
                ? "Review mode: you approve each change before it runs. Click to switch to Auto."
                : "Auto mode: changes apply immediately. Click to switch to Review."
            }
            className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {mode === "accept" ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            {mode === "accept" ? "Review changes" : "Auto-apply"}
          </button>
          <button onClick={() => setOpen(false)} aria-label="Close copilot">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
        {thread.length === 0 && !busy && (
          <div className="space-y-3 text-muted-foreground">
            <p className="text-foreground">
              Hi — I&apos;m your dashboard copilot.
            </p>
            <p>
              I can manage your account for you: create and edit bots, add
              knowledge entries, review shopper conversations, and pull up
              analytics. I only ever touch your own data.
            </p>
            <p className="text-xs">Try asking:</p>
            <ul className="space-y-1 text-xs">
              <li>· &ldquo;List my bots&rdquo;</li>
              <li>· &ldquo;How many conversations did I get this week?&rdquo;</li>
              <li>· &ldquo;Add a return-policy note to my store bot&rdquo;</li>
            </ul>
          </div>
        )}
        {thread.map((turn, i) => {
          if (turn.role === "approvals") {
            return (
              <div key={i} className="space-y-2">
                {turn.pending.map((p) => {
                  const rows = formatArgs(p.arguments);
                  return (
                    <div
                      key={p.approvalId}
                      className="rounded-lg border border-border p-3"
                    >
                      <p className="mb-2 text-foreground">
                        The copilot wants to{" "}
                        <span className="font-medium">
                          {describeTool(p.toolName)}
                        </span>
                        .
                      </p>
                      {rows.length > 0 && (
                        <dl className="mb-3 space-y-1 text-xs">
                          {rows.map((r) => (
                            <div key={r.label} className="flex gap-2">
                              <dt className="shrink-0 text-muted-foreground">
                                {r.label}:
                              </dt>
                              <dd className="min-w-0 break-words text-foreground">
                                {r.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      <div className="flex gap-2">
                        <Button
                          onClick={() => decide(p.approvalId, true)}
                          disabled={busy}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => decide(p.approvalId, false)}
                          disabled={busy}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }
          return (
            <div
              key={i}
              className={
                turn.role === "user" ? "text-foreground" : "text-muted-foreground"
              }
            >
              {turn.text}
            </div>
          );
        })}
        {busy && <div className="text-muted-foreground">Working on it…</div>}
      </div>

      <div className="border-t border-border p-3">
        {pendingApproval && (
          <p className="mb-2 text-xs text-muted-foreground">
            Approve or cancel the pending action before sending a new message.
          </p>
        )}
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
            placeholder="Ask the copilot to do something…"
            disabled={pendingApproval}
            className="min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          />
          <Button
            onClick={() => void send()}
            disabled={busy || pendingApproval}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {mode === "accept" ? (
            <>
              <ShieldCheck className="h-3 w-3 shrink-0" />
              Review mode · you approve each change before it runs.
            </>
          ) : (
            <>
              <Zap className="h-3 w-3 shrink-0" />
              Auto mode · changes apply immediately.
            </>
          )}
        </p>
      </div>
    </aside>
  );
}
